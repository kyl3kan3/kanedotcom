"use client";

import { memo, startTransition, useState } from "react";
import { completeTripQuiz } from "./actions";
import { celebrate } from "./motion-flourish";

function memoryCountAnswers(total: number, chapterIndex: number) {
  const candidates = [
    total,
    Math.max(1, total - (total > 3 ? 2 : 1)),
    total + (total > 8 ? 3 : 2),
  ];
  const answers = Array.from(new Set(candidates));
  for (let next = total + 1; answers.length < 3; next += 1) {
    if (!answers.includes(next)) answers.push(next);
  }
  const offset = chapterIndex % answers.length;
  return [...answers.slice(offset), ...answers.slice(0, offset)];
}

function shortenTitle(title: string, maximum = 28) {
  const clean = title.trim();
  return clean.length <= maximum
    ? clean
    : `${clean.slice(0, maximum - 1).trimEnd()}…`;
}

type TripQuizCardProps = {
  tripId: string;
  chapterTitle: string;
  chapterIcon: string;
  chapterIndex: number;
  memoryCount: number;
  onStampEarned: (tripId: string) => void;
};

export const TripQuizCard = memo(function TripQuizCard({
  tripId,
  chapterTitle,
  chapterIcon,
  chapterIndex,
  memoryCount,
  onStampEarned,
}: TripQuizCardProps) {
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [syncMessage, setSyncMessage] = useState("Neon synced");
  const quizCorrect = quizAnswer === memoryCount;
  const quizAnswers = memoryCountAnswers(memoryCount, chapterIndex);

  const answerQuiz = async (answer: number) => {
    setQuizAnswer(answer);
    if (answer === memoryCount) {
      celebrate("big");
      startTransition(() => onStampEarned(tripId));
    }

    setSyncMessage("Saving memory stamp…");
    try {
      const result = await completeTripQuiz(tripId, answer);
      if (result.correct) {
        startTransition(() => onStampEarned(tripId));
      }
      setSyncMessage("Memory stamp saved to Neon");
    } catch {
      setSyncMessage("Could not sync this stamp — please try again");
    }
  };

  return (
    <div className={`quiz-card ${quizCorrect ? "correct" : ""}`}>
      <div className="quiz-topline">
        <span>MEMORY NO. {chapterIndex + 1}</span>
        <b>
          {chapterIcon} {shortenTitle(chapterTitle, 28)}
        </b>
      </div>
      <h3>How many real memories are tucked into this chapter?</h3>
      <div className="quiz-answers" aria-describedby="quiz-result">
        {quizAnswers.map((answer, index) => (
          <button
            key={answer}
            onClick={() => void answerQuiz(answer)}
            className={
              quizAnswer === answer ? (quizCorrect ? "right" : "wrong") : ""
            }
            disabled={quizCorrect}
          >
            <span>{String.fromCharCode(65 + index)}</span>
            {answer} memor{answer === 1 ? "y" : "ies"}
          </button>
        ))}
      </div>
      <div className="quiz-result" id="quiz-result" role="status">
        {quizAnswer === null
          ? "Count the photos and clips in this chapter."
          : quizCorrect
            ? "✓ You counted every little moment. Stamp earned!"
            : "Good guess—try one more count!"}
      </div>
      <small className="database-note">{syncMessage}</small>
      {quizCorrect && (
        <div className="earned-stamp" aria-hidden="true">
          MEMORY<br />
          <b>VERIFIED</b>
        </div>
      )}
    </div>
  );
});
