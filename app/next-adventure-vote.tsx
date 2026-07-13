"use client";

import { memo, useRef, useState } from "react";
import { NEXT_ADVENTURE_OPTIONS } from "@/lib/next-adventure";
import { voteNextAdventure } from "./actions";

type NextAdventureVoteProps = {
  initialVoteCounts: Record<string, number>;
  initialCurrentVote: string | null;
};

export const NextAdventureVote = memo(function NextAdventureVote({
  initialVoteCounts,
  initialCurrentVote,
}: NextAdventureVoteProps) {
  const initialVotes = NEXT_ADVENTURE_OPTIONS.map(
    (option) => initialVoteCounts[option.slug] ?? 0,
  );
  const [votes, setVotes] = useState(() =>
    NEXT_ADVENTURE_OPTIONS.map(
      (option) => initialVoteCounts[option.slug] ?? 0,
    ),
  );
  const [currentVote, setCurrentVote] = useState(initialCurrentVote);
  const [status, setStatus] = useState("Neon synced");
  const confirmedVoteRef = useRef(initialCurrentVote);
  const confirmedVotesRef = useRef(initialVotes);
  const desiredVoteRef = useRef(initialCurrentVote);
  const requestInFlightRef = useRef(false);

  const persistLatestVote = async () => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    try {
      while (
        desiredVoteRef.current &&
        desiredVoteRef.current !== confirmedVoteRef.current
      ) {
        const requestedVote = desiredVoteRef.current;
        try {
          const result = await voteNextAdventure(requestedVote);
          confirmedVoteRef.current = result.selected;
          confirmedVotesRef.current = NEXT_ADVENTURE_OPTIONS.map(
            (option) => result.counts[option.slug] ?? 0,
          );

          if (desiredVoteRef.current === requestedVote) {
            setCurrentVote(result.selected);
            setVotes(confirmedVotesRef.current);
            setStatus("Your vote is saved in Neon");
          }
        } catch {
          if (desiredVoteRef.current !== requestedVote) continue;

          desiredVoteRef.current = confirmedVoteRef.current;
          setCurrentVote(confirmedVoteRef.current);
          setVotes(confirmedVotesRef.current);
          setStatus("Could not sync your vote — please try again");
          return;
        }
      }
    } finally {
      requestInFlightRef.current = false;
      if (desiredVoteRef.current !== confirmedVoteRef.current) {
        void persistLatestVote();
      }
    }
  };

  const castVote = (slug: string) => {
    const previousVote = desiredVoteRef.current;
    desiredVoteRef.current = slug;

    setCurrentVote(slug);
    if (previousVote !== slug) {
      setVotes((current) =>
        current.map((vote, voteIndex) => {
          const optionSlug = NEXT_ADVENTURE_OPTIONS[voteIndex].slug;
          if (optionSlug === slug) return vote + 1;
          if (optionSlug === previousVote) return Math.max(0, vote - 1);
          return vote;
        }),
      );
    }

    if (!requestInFlightRef.current && slug === confirmedVoteRef.current) {
      setStatus("Your vote is saved in Neon");
      return;
    }

    setStatus("Saving your family vote…");
    void persistLatestVote();
  };

  return (
    <section className="next-adventure">
      <div className="postmark" aria-hidden="true">
        FAMILY MAIL<br />
        <b>NEXT</b>
      </div>
      <div className="next-copy">
        <span className="handwritten-label">the next chapter...</span>
        <h2>Where to next?</h2>
        <p>
          Every signed-in family explorer gets one real vote. Changing your mind
          updates the same ballot.
        </p>
      </div>
      <div className="vote-options">
        {NEXT_ADVENTURE_OPTIONS.map((option, index) => (
          <button
            key={option.slug}
            className={currentVote === option.slug ? "selected" : ""}
            onClick={() => void castVote(option.slug)}
            aria-pressed={currentVote === option.slug}
          >
            <span aria-hidden="true">{option.emoji}</span>
            <b>{option.place}</b>
            <small>
              {votes[index]} family vote{votes[index] === 1 ? "" : "s"}
            </small>
            <i>{currentVote === option.slug ? "✓" : "＋"}</i>
          </button>
        ))}
      </div>
      <span className="visually-hidden" role="status">
        {status}
      </span>
    </section>
  );
});
