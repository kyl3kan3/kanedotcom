import { and, count, eq, isNotNull } from "drizzle-orm";
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
  const [stampRows, voteRows, currentVoteRows, memoryRows] = await Promise.all([
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
          eq(memories.status, "selected"),
        ),
      ),
  ]);

  return (
    <AdventureBook
      memberName={member.displayName || user.name || "Family explorer"}
      memberRole={member.role}
      initialStampedTrips={stampRows.map((row) => row.slug)}
      initialVoteCounts={Object.fromEntries(
        voteRows.map((row) => [row.optionSlug, row.total]),
      )}
      initialCurrentVote={currentVoteRows[0]?.optionSlug ?? null}
      savedMemoryCount={memoryRows[0]?.total ?? 0}
    />
  );
}
