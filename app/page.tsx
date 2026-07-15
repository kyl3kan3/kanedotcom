import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import AdventureBook from "./adventure-book";
import { signOutAction } from "./actions";
import { getDb } from "@/db";
import {
  familyMembers,
  memories,
  tripStamps,
  tripVotes,
  trips,
} from "@/db/schema";
import { getFamilyContext } from "@/lib/family";
import { normalizeFamilyTripPresentation } from "@/lib/family-holidays";
import { getPrivateMemoryPreviewUrl } from "@/lib/memory-storage";
import { NEXT_ADVENTURE_ROUND_SLUG } from "@/lib/next-adventure";

export const dynamic = "force-dynamic";

const INITIAL_MEMORY_SHELF_PREVIEWS = 8;
const INITIAL_VISIBLE_TRIPS = 4;
const CHAPTER_PREVIEW_LIMIT = 3;

type PreviewCandidate = {
  id: string;
  kind: "image" | "video";
  storageKey: string | null;
};

function runtimeNow() {
  return Date.now();
}

async function resolveCriticalPreviewUrls(candidates: PreviewCandidate[]) {
  const uniqueCandidates = new Map(
    candidates.flatMap((candidate) =>
      candidate.kind === "image" && candidate.storageKey
        ? [[candidate.id, candidate.storageKey] as const]
        : [],
    ),
  );
  const previewUrls = new Map<string, string>();
  const queue = [...uniqueCandidates];
  let cursor = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(6, queue.length) },
      async () => {
        while (cursor < queue.length) {
          const [id, storageKey] = queue[cursor++];
          try {
            previewUrls.set(
              id,
              await getPrivateMemoryPreviewUrl(storageKey, 480),
            );
          } catch {
            // The authenticated per-memory route remains the safe fallback.
          }
        }
      },
    ),
  );

  return previewUrls;
}

export default async function Home() {
  const startedAt = runtimeNow();
  const { user, member, verificationRequired } = await getFamilyContext();
  const authMs = runtimeNow() - startedAt;

  if (!user) redirect("/auth/sign-in");

  if (!member) {
    const needsVerification = verificationRequired;
    return (
      <main className="access-shell">
        <section className="access-card">
          <span className="access-stamp" aria-hidden="true">PRIVATE<br />FAMILY<br />ALBUM</span>
          <p className="access-kicker">
            {needsVerification ? "ONE SAFE STEP LEFT" : "SIGNED IN, INVITATION NEEDED"}
          </p>
          <h1>
            {needsVerification
              ? "Verify your email to open the book."
              : "This adventure book belongs to one family."}
          </h1>
          <p>
            {needsVerification ? (
              <>
                The invitation for <b>{user.email}</b> is ready. Neon needs to
                confirm you own this address before it can attach the family
                profile. Follow the verification message, then sign in again.
              </>
            ) : (
              <>
                <b>{user.email}</b> is signed in, but this address is not on the
                family invitation list. Ask the family owner to invite this
                exact email address.
              </>
            )}
          </p>
          <form action={signOutAction}>
            <button type="submit">Use a different account</button>
          </form>
        </section>
      </main>
    );
  }

  const db = getDb();
  const dataStartedAt = runtimeNow();
  const [
    stampRows,
    voteRows,
    currentVoteRows,
    memoryCountRows,
    readyMemoryRows,
    generatedTripRows,
    crewRows,
    crewMemoryRows,
    crewStampRows,
  ] = await Promise.all([
    db
      .select({ id: trips.id })
      .from(tripStamps)
      .innerJoin(trips, eq(tripStamps.tripId, trips.id))
      .where(
        and(
          eq(tripStamps.memberId, member.id),
          eq(trips.familyId, member.familyId),
          isNotNull(tripStamps.completedAt),
        ),
      ),
    db
      .select({ optionSlug: tripVotes.optionSlug, total: count() })
      .from(tripVotes)
      .innerJoin(familyMembers, eq(tripVotes.memberId, familyMembers.id))
      .where(
        and(
          eq(tripVotes.roundSlug, NEXT_ADVENTURE_ROUND_SLUG),
          eq(familyMembers.familyId, member.familyId),
          eq(familyMembers.isActive, 1),
        ),
      )
      .groupBy(tripVotes.optionSlug),
    db
      .select({ optionSlug: tripVotes.optionSlug })
      .from(tripVotes)
      .where(
        and(
          eq(tripVotes.memberId, member.id),
          eq(tripVotes.roundSlug, NEXT_ADVENTURE_ROUND_SLUG),
        ),
      )
      .limit(1),
    db
      .select({ total: count() })
      .from(memories)
      .where(
        and(
          eq(memories.familyId, member.familyId),
          inArray(memories.status, ["selected", "ready"]),
          isNull(memories.deletedAt),
        ),
      ),
    db
      .select({
        id: memories.id,
        name: memories.originalName,
        kind: memories.kind,
        mimeType: memories.mimeType,
        storageKey: memories.storageKey,
      })
      .from(memories)
      .where(
        and(
          eq(memories.familyId, member.familyId),
          eq(memories.source, "google_photos"),
          eq(memories.status, "ready"),
          isNull(memories.deletedAt),
        ),
      )
      .orderBy(desc(memories.createdAt))
      .limit(60),
    db
      .select({
        tripId: trips.id,
        memoryId: memories.id,
        memoryKind: memories.kind,
        memoryStorageKey: memories.storageKey,
        memoryCapturedAt: memories.capturedAt,
        memoryDurationMs: memories.durationMs,
      })
      .from(trips)
      .leftJoin(
        memories,
        and(
          eq(memories.tripId, trips.id),
          eq(memories.status, "ready"),
          isNull(memories.deletedAt),
        ),
      )
      .where(
        and(eq(trips.familyId, member.familyId), eq(trips.source, "ai")),
      )
      .orderBy(
        asc(trips.startAt),
        asc(trips.sortOrder),
        asc(memories.capturedAt),
      ),
    db
      .select({
        id: familyMembers.id,
        displayName: familyMembers.displayName,
        role: familyMembers.role,
      })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.familyId, member.familyId),
          eq(familyMembers.isActive, 1),
        ),
      )
      .orderBy(asc(familyMembers.createdAt)),
    db
      .select({
        memberId: memories.uploadedByMemberId,
        total: count(),
      })
      .from(memories)
      .innerJoin(
        familyMembers,
        eq(memories.uploadedByMemberId, familyMembers.id),
      )
      .where(
        and(
          eq(memories.familyId, member.familyId),
          eq(memories.status, "ready"),
          isNull(memories.deletedAt),
          eq(familyMembers.familyId, member.familyId),
          eq(familyMembers.isActive, 1),
        ),
      )
      .groupBy(memories.uploadedByMemberId),
    db
      .select({
        memberId: tripStamps.memberId,
        total: count(),
      })
      .from(tripStamps)
      .innerJoin(
        familyMembers,
        eq(tripStamps.memberId, familyMembers.id),
      )
      .innerJoin(trips, eq(tripStamps.tripId, trips.id))
      .where(
        and(
          eq(familyMembers.familyId, member.familyId),
          eq(familyMembers.isActive, 1),
          eq(trips.familyId, member.familyId),
          isNotNull(tripStamps.completedAt),
        ),
      )
      .groupBy(tripStamps.memberId),
  ]);
  const dataMs = runtimeNow() - dataStartedAt;

  const memoryCountsByMember = new Map(
    crewMemoryRows.flatMap((row) =>
      row.memberId ? [[row.memberId, row.total] as const] : [],
    ),
  );
  const stampCountsByMember = new Map(
    crewStampRows.map((row) => [row.memberId, row.total] as const),
  );

  const generatedTrips = new Map<
    string,
    {
      id: string;
      memories: Array<{
        id: string;
        kind: "image" | "video";
        url: string;
        storageKey: string | null;
        capturedAt: string | null;
        durationMs: number | null;
      }>;
    }
  >();

  for (const row of generatedTripRows) {
    const trip = generatedTrips.get(row.tripId) ?? {
      id: row.tripId,
      memories: [],
    };
    if (row.memoryId && row.memoryKind) {
      trip.memories.push({
        id: row.memoryId,
        kind: row.memoryKind,
        url: `/api/memories/${row.memoryId}`,
        storageKey: row.memoryStorageKey,
        capturedAt: row.memoryCapturedAt?.toISOString() ?? null,
        durationMs: row.memoryDurationMs,
      });
    }
    generatedTrips.set(row.tripId, trip);
  }

  const generatedTripList = [...generatedTrips.values()];
  const criticalCandidates: PreviewCandidate[] = readyMemoryRows.slice(
    0,
    INITIAL_MEMORY_SHELF_PREVIEWS,
  );

  generatedTripList.forEach((trip, tripIndex) => {
    if (tripIndex < INITIAL_VISIBLE_TRIPS) {
      criticalCandidates.push(
        ...trip.memories.slice(0, CHAPTER_PREVIEW_LIMIT),
      );
    }

    const photos = trip.memories.filter((memory) => memory.kind === "image");
    if (photos[0]) criticalCandidates.push(photos[0]);
    if (tripIndex === 0) {
      criticalCandidates.push(...photos.slice(0, 3));
    }
  });

  const previewStartedAt = runtimeNow();
  const criticalPreviewUrls = await resolveCriticalPreviewUrls(
    criticalCandidates,
  );
  const previewMs = runtimeNow() - previewStartedAt;

  const approvedTrips = generatedTripList.map((trip) => {
    const presentation = normalizeFamilyTripPresentation(
      trip.memories.map((memory) => ({
        kind: memory.kind,
        capturedAt: memory.capturedAt,
      })),
    );
    return {
      id: trip.id,
      title: presentation.title,
      summary: presentation.summary,
      startAt: presentation.startAt?.toISOString() ?? null,
      endAt: presentation.endAt?.toISOString() ?? null,
      memories: trip.memories.map((memory) => ({
        id: memory.id,
        kind: memory.kind,
        url: memory.url,
        previewUrl: criticalPreviewUrls.get(memory.id),
        durationMs: memory.durationMs,
      })),
    };
  });

  console.info(
    JSON.stringify({
      level: "info",
      message: "home render ready",
      route: "/",
      authMs,
      dataMs,
      previewMs,
      totalMs: runtimeNow() - startedAt,
      criticalPreviewCount: criticalPreviewUrls.size,
      memoryPayloadCount: readyMemoryRows.length,
      tripCount: approvedTrips.length,
    }),
  );

  return (
    <AdventureBook
      memberName={member.displayName || user.name || "Family explorer"}
      memberRole={member.role}
      isAdmin={member.role === "owner"}
      initialStampedTrips={stampRows.map((row) => row.id)}
      familyCrew={crewRows.map((crewMember) => ({
        ...crewMember,
        memoryCount: memoryCountsByMember.get(crewMember.id) ?? 0,
        stampCount: stampCountsByMember.get(crewMember.id) ?? 0,
      }))}
      initialVoteCounts={Object.fromEntries(
        voteRows.map((row) => [row.optionSlug, row.total]),
      )}
      initialCurrentVote={currentVoteRows[0]?.optionSlug ?? null}
      initialMemories={readyMemoryRows.map((memory) => ({
        ...memory,
        source: "google_photos" as const,
        url: `/api/memories/${memory.id}`,
        previewUrl: criticalPreviewUrls.get(memory.id),
      }))}
      generatedTrips={approvedTrips}
      savedMemoryCount={memoryCountRows[0]?.total ?? 0}
    />
  );
}
