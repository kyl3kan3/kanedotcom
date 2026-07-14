"use client";

/* eslint-disable @next/next/no-img-element */

import { memo, useState } from "react";
import { memoryPreviewUrl } from "@/lib/memory-preview";

export type FeaturedPhoto = {
  id: string;
  kind: "image" | "video";
  url: string;
  durationMs: number | null;
};

type FeaturedPhotoStackProps = {
  chapterTitle: string;
  photos: FeaturedPhoto[];
  onOpenGallery: (
    photos: FeaturedPhoto[],
    selectedId: string,
    label: string,
  ) => void;
};

export const FeaturedPhotoStack = memo(function FeaturedPhotoStack({
  chapterTitle,
  photos,
  onOpenGallery,
}: FeaturedPhotoStackProps) {
  const [photoIndex, setPhotoIndex] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="photo-stack-wrap">
        <div className="chapter-media-empty">
          <span aria-hidden="true">✦</span>
          <p>This chapter has its story, but no still photos yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="photo-stack-wrap">
      <div className="photo-stack">
        {Array.from(
          { length: Math.min(3, photos.length) },
          (_, relative) => {
            const index = (photoIndex + relative) % photos.length;
            const photo = photos[index];

            return (
              <button
                key={photo.id}
                className={`stack-photo stack-position-${relative}`}
                onClick={() =>
                  relative === 0
                    ? onOpenGallery(photos, photo.id, chapterTitle)
                    : setPhotoIndex(index)
                }
                aria-label={
                  relative === 0
                    ? `View a family photo from ${chapterTitle} full size`
                    : `Show photo ${index + 1} from ${chapterTitle}`
                }
                aria-hidden={relative !== 0}
                tabIndex={relative === 0 ? 0 : -1}
              >
                <img
                  src={memoryPreviewUrl(photo.url, 480)}
                  loading="lazy"
                  decoding="async"
                  fetchPriority={relative === 0 ? "auto" : "low"}
                  alt={
                    relative === 0
                      ? `Family memory from ${chapterTitle}`
                      : ""
                  }
                />
              </button>
            );
          },
        )}
      </div>
      {photos.length > 1 && (
        <div className="photo-controls">
          <button
            onClick={() =>
              setPhotoIndex(
                (current) => (current - 1 + photos.length) % photos.length,
              )
            }
            aria-label="Previous trip photo"
          >
            ←
          </button>
          <span>
            PHOTO {photoIndex + 1} / {photos.length}
          </span>
          <button
            onClick={() =>
              setPhotoIndex((current) => (current + 1) % photos.length)
            }
            aria-label="Next trip photo"
          >
            →
          </button>
        </div>
      )}
      <p className="photo-live-status" role="status">
        Showing photo {photoIndex + 1} of {photos.length} from {chapterTitle}.
      </p>
    </div>
  );
});
