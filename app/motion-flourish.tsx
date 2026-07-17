"use client";

import { useEffect, useRef } from "react";

const CONFETTI_COLORS = [
  "#ef6a5b",
  "#ffd166",
  "#3a86ff",
  "#4faf83",
  "#dccff6",
  "#fff7e8",
];

type CelebrateDetail = {
  intensity?: "small" | "big";
};

export function celebrate(intensity: "small" | "big" = "big") {
  window.dispatchEvent(
    new CustomEvent<CelebrateDetail>("family-celebrate", {
      detail: { intensity },
    }),
  );
}

export function MotionFlourish() {
  const confettiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    // Ambient scenes (suitcase, ticker, map trail) only animate while they
    // are actually on screen — off screen they hold perfectly still.
    const ambientElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-ambient]"),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("motion-playing", entry.isIntersecting);
        });
      },
      { threshold: 0.15 },
    );
    ambientElements.forEach((element) => observer.observe(element));

    const spawnConfetti = (event: Event) => {
      const stage = confettiRef.current;
      if (!stage) return;
      const detail = (event as CustomEvent<CelebrateDetail>).detail;
      const pieces = detail?.intensity === "small" ? 14 : 32;

      for (let index = 0; index < pieces; index += 1) {
        const piece = document.createElement("i");
        piece.style.setProperty("--x", `${(Math.random() * 92 + 4).toFixed(1)}vw`);
        piece.style.setProperty(
          "--dx",
          `${((Math.random() - 0.5) * 34).toFixed(1)}vw`,
        );
        piece.style.setProperty(
          "--t",
          `${(Math.random() * 0.9 + 1.1).toFixed(2)}s`,
        );
        piece.style.setProperty(
          "--r",
          `${Math.round(Math.random() * 360)}deg`,
        );
        piece.style.setProperty(
          "--c",
          CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        );
        piece.addEventListener("animationend", () => piece.remove());
        stage.appendChild(piece);
      }
    };
    window.addEventListener("family-celebrate", spawnConfetti);

    return () => {
      observer.disconnect();
      window.removeEventListener("family-celebrate", spawnConfetti);
      ambientElements.forEach((element) =>
        element.classList.remove("motion-playing"),
      );
    };
  }, []);

  return <div ref={confettiRef} className="motion-confetti" aria-hidden="true" />;
}
