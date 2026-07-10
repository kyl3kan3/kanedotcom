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
  ] = await Promise.all([
    db
      .select({ slug: trips.slug })
      .from(tripStamps)
      .innerJoin(trips, eq(tripStamps.tripId, trips.id))
      .where(
        and(
          eq(tripStamps.memberId, member.id),
          isNotNull(tripStamps.completedAt),
        ),
      ),
    db
      .select({ optionSlug: tripVotes.optionSlug, total: count() })
      .from(tripVotes)
      .innerJoin(familyMembers, eq(tripVotes.memberId, familyMembers.id))
      .where(
        and(
          eq(tripVotes.roundSlug, "next-adventure"),
          eq(familyMembers.familyId, member.familyId),
        ),
      )
      .groupBy(tripVotes.optionSlug),
    db
      .select({ optionSlug: tripVotes.optionSlug })
      .from(tripVotes)
      .where(
        and(
          eq(tripVotes.memberId, member.id),
          eq(tripVotes.roundSlug, "next-adventure"),
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
      .orderBy(desc(trips.createdAt), asc(memories.capturedAt)),
  ]);

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
      });
    }
    generatedTrips.set(row.tripId, trip);
  }

  return (
    <AdventureBook
      memberName={member.displayName || user.name || "Family explorer"}
      memberRole={member.role}
      isAdmin={member.role === "owner"}
      initialStampedTrips={stampRows.map((row) => row.slug)}
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
