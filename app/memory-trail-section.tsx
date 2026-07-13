"use client";

/* eslint-disable @next/next/no-img-element */

import {
  type CSSProperties,
  memo,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

type TrailPhoto = {
  id: string;
  url: string;
};

export type MemoryTrailTrip = {
  id: string;
  title: string;
  accent: string;
  dateLabel: string;
  icon: string;
  memories: Array<{ id: string }>;
  photos: TrailPhoto[];
};

type MemoryTrailControlsProps = {
  mapRef: RefObject<HTMLDivElement | null>;
  tripCount: number;
};

const MemoryTrailControls = memo(function MemoryTrailControls({
  mapRef,
  tripCount,
}: MemoryTrailControlsProps) {
  const maximumScrollRef = useRef(0);
  const [scrollState, setScrollState] = useState({
    progress: 0,
    canGoEarlier: false,
    canGoLater: false,
    hasOverflow: false,
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map || tripCount === 0) return;

    const updateScrollState = () => {
      const maximumScroll = Math.max(0, map.scrollWidth - map.clientWidth);
      maximumScrollRef.current = maximumScroll;
      const progress =
        maximumScroll > 1
          ? Math.round(
              Math.min(
                100,
                Math.max(0, (map.scrollLeft / maximumScroll) * 100),
              ),
            )
          : 0;
      const nextState = {
        progress,
        canGoEarlier: map.scrollLeft > 2,
        canGoLater: map.scrollLeft < maximumScroll - 2,
        hasOverflow: maximumScroll > 2,
      };

      setScrollState((current) =>
        current.progress === nextState.progress &&
        current.canGoEarlier === nextState.canGoEarlier &&
        current.canGoLater === nextState.canGoLater &&
        current.hasOverflow === nextState.hasOverflow
          ? current
          : nextState,
      );
    };

    let animationFrame = 0;
    const requestScrollUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updateScrollState();
      });
    };

    requestScrollUpdate();
    map.addEventListener("scroll", requestScrollUpdate, { passive: true });
    window.addEventListener("resize", requestScrollUpdate);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(requestScrollUpdate);
    resizeObserver?.observe(map);
    const trail = map.querySelector(".memory-trail");
    if (trail) resizeObserver?.observe(trail);

    return () => {
      map.removeEventListener("scroll", requestScrollUpdate);
      window.removeEventListener("resize", requestScrollUpdate);
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [mapRef, tripCount]);

  if (tripCount === 0) return null;

  const visibleStop =
    tripCount <= 1
      ? tripCount
      : Math.min(
          tripCount,
          Math.round((scrollState.progress / 100) * (tripCount - 1)) + 1,
        );

  const scrollToStop = (direction: -1 | 1) => {
    const map = mapRef.current;
    if (!map || tripCount <= 1) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const targetStop = Math.min(
      tripCount,
      Math.max(1, visibleStop + direction),
    );
    const targetProgress = ((targetStop - 1) / (tripCount - 1)) * 100;
    map.scrollTo({
      left: (targetProgress / 100) * maximumScrollRef.current,
      behavior: reducedMotion ? "auto" : "smooth",
    });
    setScrollState((current) =>
      current.progress === targetProgress
        ? current
        : { ...current, progress: targetProgress },
    );
  };

  const setProgress = (progress: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.scrollLeft = (progress / 100) * maximumScrollRef.current;
    setScrollState((current) =>
      current.progress === progress ? current : { ...current, progress },
    );
  };

  return (
    <div
      className="map-route-controls"
      role="group"
      aria-label="Memory trail navigation"
    >
      <button
        type="button"
        className="map-route-step map-route-earlier"
        onClick={() => scrollToStop(-1)}
        disabled={!scrollState.canGoEarlier}
        aria-label="Show earlier stops on the memory trail"
      >
        <span aria-hidden="true">←</span>
        <small>Earlier</small>
      </button>

      <div className="map-route-slider">
        <div className="map-route-meta" aria-hidden="true">
          <span>THEN</span>
          <b>
            {scrollState.hasOverflow
              ? `STOP ${String(visibleStop).padStart(2, "0")} OF ${String(tripCount).padStart(2, "0")}`
              : "WHOLE TRAIL IN VIEW"}
          </b>
          <span>NOW</span>
        </div>
        <div className="map-route-track">
          <div className="map-route-ticks" aria-hidden="true">
            {Array.from({ length: tripCount }, (_, index) => (
              <i
                className={
                  index < visibleStop - 1
                    ? "passed"
                    : index === visibleStop - 1
                      ? "current"
                      : ""
                }
                key={index}
              />
            ))}
          </div>
          <input
            className="map-route-range"
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(scrollState.progress)}
            onChange={(event) =>
              setProgress(Number(event.currentTarget.value))
            }
            disabled={!scrollState.hasOverflow}
            aria-label="Move along the family memory trail"
            aria-valuetext={
              scrollState.hasOverflow
                ? `Viewing stop ${visibleStop} of ${tripCount}`
                : `All ${tripCount} stops are visible`
            }
            style={
              { "--route-progress": `${scrollState.progress}%` } as CSSProperties
            }
          />
        </div>
        <span className="map-route-note" aria-hidden="true">
          drag the trail or use the arrows
        </span>
      </div>

      <button
        type="button"
        className="map-route-step map-route-later"
        onClick={() => scrollToStop(1)}
        disabled={!scrollState.canGoLater}
        aria-label="Show later stops on the memory trail"
      >
        <span aria-hidden="true">→</span>
        <small>Later</small>
      </button>
    </div>
  );
});

type MemoryTrailSectionProps = {
  activeTripId: string | null;
  isAdmin: boolean;
  onOpenImporter: () => void;
  onSelectTrip: (tripId: string) => void;
  trips: MemoryTrailTrip[];
};

export const MemoryTrailSection = memo(function MemoryTrailSection({
  activeTripId,
  isAdmin,
  onOpenImporter,
  onSelectTrip,
  trips,
}: MemoryTrailSectionProps) {
  const mapRef = useRef<HTMLDivElement>(null);

  return (
    <section className="map-section" id="adventure-map">
      <div className="section-heading map-heading">
        <div>
          <span className="handwritten-label">follow the dotted line</span>
          <h2>
            Our real<br />memory trail
          </h2>
        </div>
        <p>
          Every stop opens a chapter made from your family’s own photos. The
          trail follows when the memories happened—not pretend GPS coordinates.
        </p>
      </div>

      <div
        className="adventure-map"
        ref={mapRef}
        role="region"
        aria-label="Scrollable family memory trail"
      >
        <span className="map-word word-west" aria-hidden="true">THEN</span>
        <span className="map-word word-home" aria-hidden="true">NOW</span>
        {trips.length > 0 ? (
          <ol className="memory-trail" aria-label="Published family chapters">
            {trips.map((trip, index) => {
              const cover = trip.photos[0];
              const active = activeTripId === trip.id;
              return (
                <li
                  className={index % 2 === 0 ? "trail-high" : "trail-low"}
                  key={trip.id}
                >
                  <button
                    className={`memory-stop ${active ? "active" : ""}`}
                    style={{ "--pin-color": trip.accent } as CSSProperties}
                    onClick={() => onSelectTrip(trip.id)}
                    aria-label={`Open ${trip.title}, ${trip.memories.length} memories from ${trip.dateLabel}`}
                    aria-current={active ? "step" : undefined}
                    aria-controls="featured-trip"
                  >
                    <span className="memory-stop-number">
                      STOP {String(index + 1).padStart(2, "0")}
                    </span>
                    {cover ? (
                      <img
                        className="memory-stop-cover"
                        src={cover.url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                      />
                    ) : (
                      <span
                        className="memory-stop-cover memory-stop-placeholder"
                        aria-hidden="true"
                      >
                        {trip.icon}
                      </span>
                    )}
                    <span className="memory-stop-copy">
                      <small>
                        {trip.dateLabel} · {trip.memories.length} memories
                      </small>
                      <b>{trip.title}</b>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="map-empty-state">
            <span aria-hidden="true">✦</span>
            <h3>The first stop is waiting for your family.</h3>
            <p>Add a few photos, then the admin can turn them into a real chapter.</p>
            {isAdmin && (
              <button className="primary-button" onClick={onOpenImporter}>
                Add the first memories <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        )}
      </div>
      <MemoryTrailControls mapRef={mapRef} tripCount={trips.length} />
    </section>
  );
});
