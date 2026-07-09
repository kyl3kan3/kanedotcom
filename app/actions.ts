"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import {
  familyMembers,
  memories,
  tripStamps,
  tripVotes,
  trips,
} from "@/db/schema";
import { getAuth } from "@/lib/auth/server";
import { requireFamilyContext } from "@/lib/family";

const correctAnswers: Record<string, number> = {
  yellowstone: 0,
  beach: 0,
  chicago: 0,
  farm: 0,
};

const voteOptions = new Set([
  "lake-michigan",
  "smoky-mountains",
  "backyard-campout",
]);

export async function completeTripQuiz(tripSlug: string, answer: number) {
  const { member } = await requireFamilyContext();
  const expected = correctAnswers[tripSlug];
  if (expected === undefined || !Number.isInteger(answer)) {
    throw new Error("Invalid memory-game answer.");
  }

  const db = getDb();
  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.familyId, member.familyId), eq(trips.slug, tripSlug)))
    .limit(1);

  if (!trip) throw new Error("Trip not found.");

  const correct = answer === expected;
  await db
    .insert(tripStamps)
    .values({
      memberId: member.id,
      tripId: trip.id,
      attempts: 1,
      lastAnswer: answer,
      completedAt: correct ? new Date() : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tripStamps.memberId, tripStamps.tripId],
      set: {
        attempts: sql`${tripStamps.attempts} + 1`,
        lastAnswer: answer,
        completedAt: correct
          ? sql`coalesce(${tripStamps.completedAt}, now())`
          : sql`${tripStamps.completedAt}`,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/");
  return { correct };
}

export async function voteNextAdventure(optionSlug: string) {
  const { member } = await requireFamilyContext();
  if (!voteOptions.has(optionSlug)) throw new Error("Invalid vote option.");

  const db = getDb();
  await db
    .insert(tripVotes)
    .values({
      memberId: member.id,
      roundSlug: "next-adventure",
      optionSlug,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tripVotes.memberId, tripVotes.roundSlug],
      set: { optionSlug, updatedAt: new Date() },
    });

  const rows = await db
    .select({ optionSlug: tripVotes.optionSlug, total: count() })
    .from(tripVotes)
    .innerJoin(familyMembers, eq(tripVotes.memberId, familyMembers.id))
    .where(
      and(
        eq(tripVotes.roundSlug, "next-adventure"),
        eq(familyMembers.familyId, member.familyId),
      ),
    )
    .groupBy(tripVotes.optionSlug);

  revalidatePath("/");
  return {
    selected: optionSlug,
    counts: Object.fromEntries(rows.map((row) => [row.optionSlug, row.total])),
  };
}

export async function saveMemoryMetadata(
  items: Array<{ name: string; mimeType: string; kind: "image" | "video" }>,
) {
  const { member } = await requireFamilyContext();
  const safeItems = items.slice(0, 50).flatMap((item) => {
    const name = item.name.trim().slice(0, 240);
    const mimeType = item.mimeType.trim().slice(0, 120);
    if (
      !name ||
      !mimeType ||
      !["image", "video"].includes(item.kind) ||
      !mimeType.startsWith(`${item.kind}/`)
    ) {
      return [];
    }
    return [{ name, mimeType, kind: item.kind }];
  });

  if (safeItems.length === 0) return { saved: 0 };

  const db = getDb();
  await db.insert(memories).values(
    safeItems.map((item) => ({
      familyId: member.familyId,
      uploadedByMemberId: member.id,
      kind: item.kind,
      source: "device" as const,
      originalName: item.name,
      mimeType: item.mimeType,
      status: "selected" as const,
    })),
  );

  revalidatePath("/");
  return { saved: safeItems.length };
}

export async function signOutAction() {
  await getAuth().signOut();
  redirect("/auth/sign-in");
}
