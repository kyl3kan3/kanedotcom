import { openai } from "@ai-sdk/openai";
import {
  Output,
  generateText,
  type ImagePart,
  type TextPart,
} from "ai";
import {
  and,
  asc,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  memories,
  tripDraftMemories,
  tripDrafts,
} from "@/db/schema";
import { requireFamilyAdmin } from "@/lib/family";
import {
  buildFactualFamilyChapter,
  familyHolidayForCaptureDate,
  FAMILY_TIME_ZONE,
  normalizeFamilyTripPresentation,
} from "@/lib/family-holidays";
import {
  prepareMemoryForAi,
  type MemoryAnalysisInput,
  type PreparedMemory,
} from "@/lib/memory-intelligence";

export const maxDuration = 300;

const DEFAULT_MODEL = "gpt-5.4";

const proposalSchema = z.object({
  trips: z
    .array(
      z.object({
        confidence: z.enum(["high", "medium", "low"]),
        memories: z
          .array(
            z.object({
              alias: z.string().min(2).max(8),
            }),
          )
          .min(1),
      }),
    )
    .min(1)
    .max(8),
});

type Proposal = z.infer<typeof proposalSchema>;

type DraftResponse = {
  id: string;
  runId: string;
  title: string;
  summary: string;
  startAt: string | null;
  endAt: string | null;
  memories: Array<{
    id: string;
    kind: "image" | "video";
    caption: string;
    url: string;
  }>;
};

function validateAndCompleteProposal(
  proposal: Proposal,
  prepared: PreparedMemory[],
) {
  const byAlias = new Map(
    prepared.map((item, index) => [
      `M${String(index + 1).padStart(2, "0")}`,
      item,
    ]),
  );
  const used = new Set<string>();

  const groups = proposal.trips.map((trip) => {
    const assigned = trip.memories.map((entry) => {
      const alias = entry.alias.toUpperCase();
      const item = byAlias.get(alias);
      if (!item) throw new Error("AI returned an unknown memory reference.");
      if (used.has(alias)) throw new Error("AI assigned one memory more than once.");
      used.add(alias);
      return {
        alias,
        item,
      };
    });

    return {
      confidence: trip.confidence,
      assigned,
    };
  });

  const omitted = [...byAlias.entries()]
    .filter(([alias]) => !used.has(alias))
    .map(([alias, item]) => ({
      alias,
      item,
    }));

  if (omitted.length > 0) {
    groups.push({
      confidence: "low" as const,
      assigned: omitted,
    });
  }

  return groups.filter((group) => group.assigned.length > 0);
}

async function loadLatestDrafts(familyId: string) {
  const db = getDb();
  const [latest] = await db
    .select({ runId: tripDrafts.runId })
    .from(tripDrafts)
    .where(
      and(eq(tripDrafts.familyId, familyId), eq(tripDrafts.status, "draft")),
    )
    .orderBy(desc(tripDrafts.createdAt))
    .limit(1);

  const [unassigned] = await db
    .select({ total: count() })
    .from(memories)
    .where(
      and(
        eq(memories.familyId, familyId),
        eq(memories.status, "ready"),
        isNotNull(memories.storageKey),
        isNull(memories.tripId),
        isNull(memories.deletedAt),
      ),
    );

  if (!latest) {
    return {
      runId: null,
      drafts: [] as DraftResponse[],
      unassignedCount: unassigned?.total ?? 0,
    };
  }

  const rows = await db
    .select({
      id: tripDrafts.id,
      runId: tripDrafts.runId,
      title: tripDrafts.title,
      summary: tripDrafts.summary,
      startAt: tripDrafts.startAt,
      endAt: tripDrafts.endAt,
      memoryId: memories.id,
      memoryKind: memories.kind,
      memoryCapturedAt: memories.capturedAt,
      caption: tripDraftMemories.caption,
      sortOrder: tripDraftMemories.sortOrder,
    })
    .from(tripDrafts)
    .innerJoin(
      tripDraftMemories,
      eq(tripDraftMemories.draftId, tripDrafts.id),
    )
    .innerJoin(memories, eq(memories.id, tripDraftMemories.memoryId))
    .where(
      and(
        eq(tripDrafts.familyId, familyId),
        eq(tripDrafts.runId, latest.runId),
        eq(tripDrafts.status, "draft"),
        eq(memories.familyId, familyId),
        isNull(memories.deletedAt),
      ),
    )
    .orderBy(asc(tripDrafts.createdAt), asc(tripDraftMemories.sortOrder));

  const grouped = new Map<
    string,
    Omit<DraftResponse, "memories"> & {
      memories: Array<DraftResponse["memories"][number] & { capturedAt: Date | null }>;
    }
  >();
  for (const row of rows) {
    const draft = grouped.get(row.id) ?? {
      id: row.id,
      runId: row.runId,
      title: row.title,
      summary: row.summary,
      startAt: row.startAt?.toISOString() ?? null,
      endAt: row.endAt?.toISOString() ?? null,
      memories: [],
    };
    draft.memories.push({
      id: row.memoryId,
      kind: row.memoryKind,
      caption: row.caption,
      url: `/api/memories/${row.memoryId}`,
      capturedAt: row.memoryCapturedAt,
    });
    grouped.set(row.id, draft);
  }

  const drafts = [...grouped.values()].map((draft) => {
    const presentation = normalizeFamilyTripPresentation(draft.memories);
    return {
      ...draft,
      title: presentation.title,
      summary: presentation.summary,
      startAt: presentation.startAt?.toISOString() ?? null,
      endAt: presentation.endAt?.toISOString() ?? null,
      memories: draft.memories.map((memory) => ({
        id: memory.id,
        kind: memory.kind,
        caption: "",
        url: memory.url,
      })),
    } satisfies DraftResponse;
  });

  return {
    runId: latest.runId,
    drafts,
    unassignedCount: unassigned?.total ?? 0,
  };
}

async function prepareMemories(items: MemoryAnalysisInput[]) {
  const db = getDb();
  const prepared: PreparedMemory[] = [];

  for (let index = 0; index < items.length; index += 3) {
    const batch = items.slice(index, index + 3);
    const results = await Promise.allSettled(batch.map(prepareMemoryForAi));

    for (let offset = 0; offset < results.length; offset += 1) {
      const result = results[offset];
      const memory = batch[offset];

      if (result.status === "fulfilled") {
        prepared.push(result.value);
        await db
          .update(memories)
          .set(result.value.metadata)
          .where(
            and(
              eq(memories.id, memory.id),
              eq(memories.familyId, memory.familyId),
              isNull(memories.deletedAt),
            ),
          );
      } else {
        console.warn("[memory-organizer] metadata preparation skipped", {
          memory: memory.id.slice(0, 8),
        });
        await db
          .update(memories)
          .set({ metadataStatus: "failed" })
          .where(
            and(
              eq(memories.id, memory.id),
              eq(memories.familyId, memory.familyId),
              isNull(memories.deletedAt),
            ),
          );
        prepared.push({
          memory,
          metadata: {
            capturedAt: memory.capturedAt,
            captureTimeSource: memory.captureTimeSource,
            width: memory.width,
            height: memory.height,
            durationMs: memory.durationMs,
            cameraMake: memory.cameraMake,
            cameraModel: memory.cameraModel,
            sourceMediaId: memory.sourceMediaId,
            metadataStatus: "unavailable",
          },
        });
      }
    }
  }

  return prepared;
}

function buildModelContent(prepared: PreparedMemory[]) {
  const aliases = prepared.map((item, index) => {
    const alias = `M${String(index + 1).padStart(2, "0")}`;
    const captured = item.metadata.capturedAt?.toISOString() ?? "unknown";
    const dimensions =
      item.metadata.width && item.metadata.height
        ? `${item.metadata.width}x${item.metadata.height}`
        : "unknown";
    const duration = item.metadata.durationMs
      ? `${Math.round(item.metadata.durationMs / 1000)} seconds`
      : "not applicable or unknown";
    const holiday = familyHolidayForCaptureDate(item.metadata.capturedAt);
    return `${alias}: ${item.memory.kind}; captured ${captured}; ${FAMILY_TIME_ZONE} calendar context ${holiday ? `${holiday.name} (${holiday.matchKind})` : "none"}; dimensions ${dimensions}; duration ${duration}; visual ${item.thumbnail ? "attached below" : "not available"}.`;
  });

  const content: Array<TextPart | ImagePart> = [
    {
      type: "text",
      text: [
        "Organize every listed family memory exactly once into date-based chapter groups.",
        "Use capture-time gaps as the strongest grouping signal and visible scene similarity as supporting evidence.",
        "Prefer one group for memories sharing the same supplied holiday or holiday-weekend calendar context, even when the visible scene changes.",
        "Return 1 to 8 groups. Keep uncertain items together rather than inventing facts.",
        "Return only the alias membership and grouping confidence. Do not write titles, summaries, captions, descriptions, locations, activities, or holiday claims.",
        `Holiday labels in the inventory are deterministic calendar matches in ${FAMILY_TIME_ZONE}; never infer a holiday from visual appearance.`,
        "Memory inventory:",
        ...aliases,
      ].join("\n"),
    },
  ];

  prepared.forEach((item, index) => {
    if (!item.thumbnail) return;
    const alias = `M${String(index + 1).padStart(2, "0")}`;
    content.push({ type: "text", text: `Low-resolution visual for ${alias}:` });
    content.push({
      type: "image",
      image: item.thumbnail,
      mediaType: item.thumbnailMediaType,
      providerOptions: { openai: { imageDetail: "low" } },
    });
  });

  return content;
}

async function requireAdminOrResponse() {
  try {
    return { context: await requireFamilyAdmin(), response: null };
  } catch {
    return {
      context: null,
      response: NextResponse.json(
        { error: "Only the family admin can organize memories with AI." },
        { status: 403 },
      ),
    };
  }
}

export async function GET() {
  const { context, response } = await requireAdminOrResponse();
  if (response || !context) return response;
  return NextResponse.json(await loadLatestDrafts(context.member.familyId));
}

export async function POST() {
  const { context, response } = await requireAdminOrResponse();
  if (response || !context) return response;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "OpenAI is not configured for this deployment." },
      { status: 503 },
    );
  }

  const db = getDb();
  const rows = await db
    .select({
      id: memories.id,
      familyId: memories.familyId,
      originalName: memories.originalName,
      kind: memories.kind,
      mimeType: memories.mimeType,
      storageKey: memories.storageKey,
      capturedAt: memories.capturedAt,
      captureTimeSource: memories.captureTimeSource,
      width: memories.width,
      height: memories.height,
      durationMs: memories.durationMs,
      cameraMake: memories.cameraMake,
      cameraModel: memories.cameraModel,
      sourceMediaId: memories.sourceMediaId,
      sourceMetadata: memories.sourceMetadata,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(
      and(
        eq(memories.familyId, context.member.familyId),
        eq(memories.status, "ready"),
        isNotNull(memories.storageKey),
        isNull(memories.tripId),
        isNull(memories.deletedAt),
      ),
    )
    .orderBy(asc(sql`coalesce(${memories.capturedAt}, ${memories.createdAt})`))
    .limit(50);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "There are no unorganized permanent memories yet." },
      { status: 400 },
    );
  }

  const inputs = rows.map((row) => ({
    ...row,
    storageKey: row.storageKey!,
  })) satisfies MemoryAnalysisInput[];

  try {
    console.info("[memory-organizer] generation started", {
      family: context.member.familyId.slice(0, 8),
      count: inputs.length,
    });

    const prepared = await prepareMemories(inputs);
    const model = process.env.AI_ORGANIZER_MODEL?.trim() || DEFAULT_MODEL;
    const { output } = await generateText({
      model: openai(model),
      system: [
        "You organize private family photos into reviewable scrapbook chapter groups.",
        "Do not identify people, infer sensitive traits, invent names, invent quotes, or claim a location unless an unmistakable public landmark is visible.",
        "Capture dates and explicitly supplied calendar labels are factual metadata.",
        "Never infer a holiday from decorations, clothing, food, people, or any other image appearance.",
        "Do not generate prose about the media; the server creates titles and summaries only from dates, media counts, and exact calendar matches.",
        "Every supplied memory alias must appear exactly once across the groups.",
      ].join(" "),
      messages: [{ role: "user", content: buildModelContent(prepared) }],
      output: Output.object({
        name: "family_trip_drafts",
        description: "Reviewable family scrapbook trip drafts",
        schema: proposalSchema,
      }),
      maxOutputTokens: 6_000,
      timeout: { totalMs: 180_000 },
      providerOptions: { openai: { store: false } },
    });

    const groups = validateAndCompleteProposal(output, prepared);
    const runId = crypto.randomUUID();
    const draftRows = groups.map((group) => {
      const presentation = buildFactualFamilyChapter(
        group.assigned.map(({ item }) => ({
          kind: item.memory.kind,
          capturedAt: item.metadata.capturedAt,
        })),
      );
      return {
        id: crypto.randomUUID(),
        runId,
        familyId: context.member.familyId,
        createdByMemberId: context.member.id,
        title: presentation.title,
        summary: presentation.summary,
        startAt: presentation.startAt,
        endAt: presentation.endAt,
        aiModel: model,
      };
    });
    const draftMemoryRows = draftRows.flatMap((draft, draftIndex) =>
      groups[draftIndex].assigned.map((assignment, memoryIndex) => ({
        draftId: draft.id,
        memoryId: assignment.item.memory.id,
        sortOrder: memoryIndex,
        caption: "",
      })),
    );

    await db.batch([
      db
        .update(tripDrafts)
        .set({ status: "rejected", reviewedAt: new Date() })
        .where(
          and(
            eq(tripDrafts.familyId, context.member.familyId),
            eq(tripDrafts.status, "draft"),
          ),
        ),
      db.insert(tripDrafts).values(draftRows),
      db.insert(tripDraftMemories).values(draftMemoryRows),
    ]);

    console.info("[memory-organizer] generation complete", {
      family: context.member.familyId.slice(0, 8),
      memories: inputs.length,
      drafts: draftRows.length,
      model,
    });

    return NextResponse.json(await loadLatestDrafts(context.member.familyId));
  } catch (error) {
    console.error("[memory-organizer] generation failed", {
      family: context.member.familyId.slice(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error:
          "The AI could not finish organizing these memories. Nothing was published; please try again.",
      },
      { status: 502 },
    );
  }
}
