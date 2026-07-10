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
import { NEXT_ADVENTURE_ROUND_SLUG } from "@/lib/next-adventure";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { user, member, verificationRequired } = await getFamilyContext();

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
      .limit(50),
    db
      .select({
        tripId: trips.id,
        title: trips.title,
        summary: trips.summary,
        startAt: trips.startAt,
        endAt: trips.endAt,
        memoryId: memories.id,
        memoryName: memories.originalName,
        memoryKind: memories.kind,
        memoryCaption: memories.caption,
        memoryCapturedAt: memories.capturedAt,
        memoryDurationMs: memories.durationMs,
        memoryWidth: memories.width,
        memoryHeight: memories.height,
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
      title: string;
      summary: string;
      startAt: string | null;
      endAt: string | null;
      memories: Array<{
        id: string;
        name: string;
        kind: "image" | "video";
        caption: string;
        url: string;
        capturedAt: string | null;
        durationMs: number | null;
        width: number | null;
        height: number | null;
      }>;
    }
  >();

  for (const row of generatedTripRows) {
    const trip = generatedTrips.get(row.tripId) ?? {
      id: row.tripId,
      title: row.title,
      summary: row.summary ?? "A new family chapter.",
      startAt: row.startAt?.toISOString() ?? null,
      endAt: row.endAt?.toISOString() ?? null,
      memories: [],
    };
    if (row.memoryId && row.memoryName && row.memoryKind) {
      trip.memories.push({
        id: row.memoryId,
        name: row.memoryName,
        kind: row.memoryKind,
        caption: row.memoryCaption ?? "A family memory.",
        url: `/api/memories/${row.memoryId}`,
        capturedAt: row.memoryCapturedAt?.toISOString() ?? null,
        durationMs: row.memoryDurationMs,
        width: row.memoryWidth,
        height: row.memoryHeight,
      });
    }
    generatedTrips.set(row.tripId, trip);
  }

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
      }))}
      generatedTrips={[...generatedTrips.values()]}
      savedMemoryCount={memoryCountRows[0]?.total ?? 0}
    />
  );
}
