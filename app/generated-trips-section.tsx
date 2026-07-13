"use client";

/* eslint-disable @next/next/no-img-element */

import { memo } from "react";
import type { PhotoGallerySource } from "./photo-gallery-dialog";

type GeneratedTripMemory = PhotoGallerySource & {
  durationMs: number | null;
};

export type GeneratedTripCard = {
  id: string;
  title: string;
  summary: string;
  dateLabel: string;
  memories: GeneratedTripMemory[];
  photos: GeneratedTripMemory[];
};

type GeneratedTripsSectionProps = {
  trips: GeneratedTripCard[];
  onOpenGallery: (
    sources: readonly PhotoGallerySource[],
    selectedId: string,
    label: string,
  ) => void;
  onSelectTrip: (tripId: string) => void;
  onSurprise: () => void;
};

const CHAPTER_PREVIEW_SCAN_LIMIT = 6;
const CHAPTER_PREVIEW_IMAGE_LIMIT = 3;

function chapterPreviewMemories(memories: GeneratedTripMemory[]) {
  let imageCount = 0;
  return memories.slice(0, CHAPTER_PREVIEW_SCAN_LIMIT).filter((memory) => {
    if (memory.kind === "video") return true;
    imageCount += 1;
    return imageCount <= CHAPTER_PREVIEW_IMAGE_LIMIT;
  });
}

export const GeneratedTripsSection = memo(function GeneratedTripsSection({
  trips,
  onOpenGallery,
  onSelectTrip,
  onSurprise,
}: GeneratedTripsSectionProps) {
  if (trips.length === 0) return null;

  return (
    <section className="generated-trips-section" id="family-trip-chapters">
      <div className="generated-trips-heading">
        <div>
          <span className="handwritten-label">approved by the family admin</span>
          <h2>Our real family chapter shelf</h2>
        </div>
        <div className="generated-trips-heading-copy">
          <p>
            Capture dates and known calendar holidays label these chapters.
            Every chapter here was reviewed by a family admin before it joined
            the book.
          </p>
          <button
            type="button"
            className="surprise-chapter-button"
            onClick={onSurprise}
            aria-controls="featured-trip"
            aria-label="Surprise me with a family chapter"
          >
            <span aria-hidden="true">✦</span> Surprise me
          </button>
        </div>
      </div>
      <div className="generated-trip-grid">
        {trips.map((trip, tripIndex) => (
          <article className="generated-trip-card" key={trip.id}>
            <div className="generated-trip-card-topline">
              <span>CHAPTER {String(tripIndex + 1).padStart(2, "0")}</span>
              <time>{trip.dateLabel}</time>
            </div>
            <h3 className="generated-trip-title">{trip.title}</h3>
            <p className="generated-trip-summary">{trip.summary}</p>
            <div className="generated-trip-media">
              {chapterPreviewMemories(trip.memories).map((memory) => (
                <figure key={memory.id}>
                  {memory.kind === "image" ? (
                    <button
                      type="button"
                      className="chapter-preview-button"
                      onClick={() =>
                        onOpenGallery(trip.photos, memory.id, trip.title)
                      }
                      aria-label={`Open photo ${trip.photos.findIndex((photo) => photo.id === memory.id) + 1} of ${trip.photos.length} from ${trip.title}`}
                    >
                      <img
                        src={memory.url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                      />
                      <span className="photo-open-badge" aria-hidden="true">
                        ↗
                      </span>
                    </button>
                  ) : (
                    <video
                      src={memory.url}
                      aria-label={`Family video from ${trip.title}`}
                      controls
                      preload="none"
                    />
                  )}
                </figure>
              ))}
            </div>
            <button
              className="open-chapter-button"
              onClick={() => onSelectTrip(trip.id)}
              aria-controls="featured-trip"
            >
              Open this chapter <span aria-hidden="true">→</span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
});
