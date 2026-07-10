import {
  and,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  memories,
  tripDraftMemories,
  tripDrafts,
  trips,
} from "@/db/schema";
import { requireFamilyAdmin } from "@/lib/family";
import { normalizeFamilyTripPresentation } from "@/lib/family-holidays";

const applySchema = z.object({
  runId: z.string().uuid(),
  approvedDraftIds: z.array(z.string().uuid()).min(1).max(8),
});

function slugify(value: string, suffix: string) {
  const base = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "family-trip"}-${suffix}`;
}

export async function POST(request: Request) {
  let context: Awaited<ReturnType<typeof requireFamilyAdmin>>;
  try {
    context = await requireFamilyAdmin();
  } catch {
    return NextResponse.json(
      { error: "Only the family admin can approve AI trip drafts." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose at least one valid trip draft to create." },
      { status: 400 },
    );
  }

  const approvedDraftIds = [...new Set(parsed.data.approvedDraftIds)];
  const db = getDb();
  const selectedDrafts = await db
    .select({
      id: tripDrafts.id,
      status: tripDrafts.status,
      approvedTripId: tripDrafts.approvedTripId,
    })
    .from(tripDrafts)
    .where(
      and(
        eq(tripDrafts.familyId, context.member.familyId),
        eq(tripDrafts.runId, parsed.data.runId),
        inArray(tripDrafts.id, approvedDraftIds),
      ),
    );

  if (selectedDrafts.length !== approvedDraftIds.length) {
    return NextResponse.json(
      { error: "One or more trip drafts no longer belong to this review." },
      { status: 409 },
    );
  }

  if (selectedDrafts.every((draft) => draft.status === "approved")) {
    return NextResponse.json({
      created: 0,
      tripIds: selectedDrafts
        .map((draft) => draft.approvedTripId)
        .filter((id): id is string => Boolean(id)),
      alreadyApplied: true,
    });
  }

  if (selectedDrafts.some((draft) => draft.status !== "draft")) {
    return NextResponse.json(
      { error: "This trip review has already been closed." },
      { status: 409 },
    );
  }

  const memoryRows = await db
    .select({
      draftId: tripDrafts.id,
      memoryId: memories.id,
      memoryKind: memories.kind,
      memoryCapturedAt: memories.capturedAt,
      existingTripId: memories.tripId,
    })
    .from(tripDrafts)
    .innerJoin(
      tripDraftMemories,
      eq(tripDraftMemories.draftId, tripDrafts.id),
    )
    .innerJoin(memories, eq(memories.id, tripDraftMemories.memoryId))
    .where(
      and(
        eq(tripDrafts.familyId, context.member.familyId),
        eq(tripDrafts.runId, parsed.data.runId),
        inArray(tripDrafts.id, approvedDraftIds),
        eq(memories.familyId, context.member.familyId),
        isNull(memories.deletedAt),
      ),
    );

  if (
    memoryRows.length === 0 ||
    memoryRows.some((memory) => memory.existingTripId !== null)
  ) {
    return NextResponse.json(
      { error: "Some memories were already organized. Refresh and try again." },
      { status: 409 },
    );
  }

  const [{ nextSortOrder }] = await db
    .select({
      nextSortOrder: sql<number>`coalesce(max(${trips.sortOrder}), 0) + 1`,
    })
    .from(trips)
    .where(eq(trips.familyId, context.member.familyId));

  const tripRows = selectedDrafts.map((draft, index) => {
    const presentation = normalizeFamilyTripPresentation(
      memoryRows
        .filter((memory) => memory.draftId === draft.id)
        .map((memory) => ({
          kind: memory.memoryKind,
          capturedAt: memory.memoryCapturedAt,
        })),
    );
    return {
      id: crypto.randomUUID(),
      familyId: context.member.familyId,
      slug: slugify(presentation.title, draft.id.slice(0, 8)),
      title: presentation.title,
      summary: presentation.summary,
      source: "ai" as const,
      startAt: presentation.startAt,
      endAt: presentation.endAt,
      sortOrder: Number(nextSortOrder) + index,
    };
  });
  const tripIdByDraft = new Map(
    selectedDrafts.map((draft, index) => [draft.id, tripRows[index].id]),
  );
  const assignments = memoryRows.map((memory) => ({
    memoryId: memory.memoryId,
    tripId: tripIdByDraft.get(memory.draftId)!,
    caption: "",
  }));
  const approvals = selectedDrafts.map((draft) => ({
    draftId: draft.id,
    tripId: tripIdByDraft.get(draft.id)!,
  }));
  const now = new Date();

  await db.batch([
    db.insert(trips).values(tripRows),
    db.execute(sql`
      with assignments as (
        select *
        from jsonb_to_recordset(${JSON.stringify(assignments)}::jsonb)
          as x("memoryId" uuid, "tripId" uuid, caption text)
      )
      update memories as memory
      set trip_id = assignments."tripId",
          caption = assignments.caption
      from assignments
      where memory.id = assignments."memoryId"
        and memory.family_id = ${context.member.familyId}
        and memory.trip_id is null
        and memory.deleted_at is null
    `),
    db.execute(sql`
      with approvals as (
        select *
        from jsonb_to_recordset(${JSON.stringify(approvals)}::jsonb)
          as x("draftId" uuid, "tripId" uuid)
      )
      update trip_drafts as draft
      set status = 'approved',
          approved_trip_id = approvals."tripId",
          reviewed_at = ${now}
      from approvals
      where draft.id = approvals."draftId"
        and draft.family_id = ${context.member.familyId}
        and draft.run_id = ${parsed.data.runId}
        and draft.status = 'draft'
    `),
    db
      .update(tripDrafts)
      .set({ status: "rejected", reviewedAt: now })
      .where(
        and(
          eq(tripDrafts.familyId, context.member.familyId),
          eq(tripDrafts.runId, parsed.data.runId),
          eq(tripDrafts.status, "draft"),
          notInArray(tripDrafts.id, approvedDraftIds),
        ),
      ),
  ]);

  revalidatePath("/");
  console.info("[memory-organizer] drafts approved", {
    family: context.member.familyId.slice(0, 8),
    created: tripRows.length,
    memories: assignments.length,
  });

  return NextResponse.json({
    created: tripRows.length,
    tripIds: tripRows.map((trip) => trip.id),
    alreadyApplied: false,
  });
}
