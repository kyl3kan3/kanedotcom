"use client";

import { useEffect } from "react";

const REVEAL_GROUPS = [
  ".memory-shelf-heading",
  ".section-heading",
  ".trip-intro",
  ".challenge-copy",
  ".next-copy",
  ".site-footer > p",
];

const REVEAL_ITEMS = [
  ".memory-stop",
  ".chapter-grid > *",
  ".passport-progress li",
  ".guide-card",
  ".vote-options button",
  ".generated-trip-card",
];

const TILT_SELECTOR = [
  ".guide-card",
  ".quiz-card",
  ".generated-trip-card",
  ".next-adventure",
].join(",");

type MotionElement = HTMLElement & {
  style: CSSStyleDeclaration;
};

export function MotionAtmosphere() {
  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    if (reducedMotion.matches) return;

    const root = document.documentElement;
    const revealElements = Array.from(
      document.querySelectorAll<MotionElement>(
        [...REVEAL_GROUPS, ...REVEAL_ITEMS].join(","),
      ),
    );

    revealElements.forEach((element, index) => {
      element.classList.add("motion-reveal");
      element.style.setProperty("--reveal-order", String(index % 4));
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("motion-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -9%", threshold: 0.08 },
    );
    revealElements.forEach((element) => observer.observe(element));

    let animationFrame = 0;
    const updateScrollMotion = () => {
      animationFrame = 0;
      const viewport = Math.max(window.innerHeight, 1);
      const heroProgress = Math.min(1, Math.max(0, window.scrollY / viewport));
      root.style.setProperty("--hero-scroll", heroProgress.toFixed(3));
      root.style.setProperty(
        "--page-scroll",
        Math.min(
          1,
          window.scrollY /
            Math.max(document.documentElement.scrollHeight - viewport, 1),
        ).toFixed(3),
      );
    };
    const requestScrollMotion = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateScrollMotion);
    };
    updateScrollMotion();
    window.addEventListener("scroll", requestScrollMotion, { passive: true });
    window.addEventListener("resize", requestScrollMotion);

    let activeTilt: MotionElement | null = null;
    let tiltFrame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerTarget: MotionElement | null = null;
    const resetTilt = (element: MotionElement | null) => {
      if (!element) return;
      element.style.setProperty("--tilt-x", "0deg");
      element.style.setProperty("--tilt-y", "0deg");
      element.style.setProperty("--tilt-glow-x", "50%");
      element.style.setProperty("--tilt-glow-y", "50%");
      element.classList.remove("motion-tilting");
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointerTarget = (event.target as Element | null)?.closest<MotionElement>(
        TILT_SELECTOR,
      ) ?? null;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (tiltFrame) return;
      tiltFrame = window.requestAnimationFrame(() => {
        tiltFrame = 0;
        const target = pointerTarget;
        if (!target) {
          resetTilt(activeTilt);
          activeTilt = null;
          return;
        }
        if (activeTilt !== target) resetTilt(activeTilt);
        activeTilt = target;
        const bounds = target.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (pointerX - bounds.left) / bounds.width));
        const y = Math.min(1, Math.max(0, (pointerY - bounds.top) / bounds.height));
        target.style.setProperty("--tilt-x", `${((0.5 - y) * 7).toFixed(2)}deg`);
        target.style.setProperty("--tilt-y", `${((x - 0.5) * 9).toFixed(2)}deg`);
        target.style.setProperty("--tilt-glow-x", `${(x * 100).toFixed(1)}%`);
        target.style.setProperty("--tilt-glow-y", `${(y * 100).toFixed(1)}%`);
        target.classList.add("motion-tilting");
      });
    };
    const handlePointerLeave = () => {
      window.cancelAnimationFrame(tiltFrame);
      tiltFrame = 0;
      pointerTarget = null;
      resetTilt(activeTilt);
      activeTilt = null;
    };
    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
      window.cancelAnimationFrame(tiltFrame);
      window.removeEventListener("scroll", requestScrollMotion);
      window.removeEventListener("resize", requestScrollMotion);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
      resetTilt(activeTilt);
      root.style.removeProperty("--hero-scroll");
      root.style.removeProperty("--page-scroll");
    };
  }, []);

  return <div className="motion-progress" aria-hidden="true" />;
}
