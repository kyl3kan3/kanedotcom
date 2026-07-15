"use client";

/* eslint-disable @next/next/no-img-element */

import { memo, useState } from "react";
import { memoryPreviewUrl } from "@/lib/memory-preview";

const IMPORT_PREVIEW_BATCH = 12;

export type ImportPreviewMedia = {
  id: string;
  kind: "image" | "video";
  url: string;
  previewUrl?: string;
};

type ImportPreviewGridProps = {
  media: ImportPreviewMedia[];
  onClear: () => void;
};

export const ImportPreviewGrid = memo(function ImportPreviewGrid({
  media,
  onClear,
}: ImportPreviewGridProps) {
  const [previewLimit, setPreviewLimit] = useState(IMPORT_PREVIEW_BATCH);
  const visibleMedia = media.slice(0, previewLimit);
  const remainingCount = Math.max(0, media.length - visibleMedia.length);

  return (
    <div className="import-preview">
      <div>
        <b>Your family memory shelf</b>
        <button onClick={onClear}>Hide previews</button>
      </div>
      <div className="import-grid" id="import-preview-grid">
        {visibleMedia.map((item) =>
          item.kind === "image" ? (
            <figure key={item.id}>
              <img
                src={item.previewUrl ?? memoryPreviewUrl(item.url, 480)}
                alt="Imported family memory"
                loading="lazy"
                decoding="async"
              />
            </figure>
          ) : (
            <figure key={item.id}>
              <video
                src={item.url}
                aria-label="Imported family video"
                controls
                preload="none"
              />
            </figure>
          ),
        )}
      </div>
      {remainingCount > 0 && (
        <button
          type="button"
          className="import-preview-more"
          aria-controls="import-preview-grid"
          onClick={() =>
            setPreviewLimit((current) =>
              Math.min(current + IMPORT_PREVIEW_BATCH, media.length),
            )
          }
        >
          Show {Math.min(IMPORT_PREVIEW_BATCH, remainingCount)} more memories
          <span> ({remainingCount} remaining)</span>
        </button>
      )}
      <p>
        Showing {visibleMedia.length} of {media.length} previews. The full saved
        count stays on the book cover.
      </p>
      <p>
        Selected Google Photos media streams server-to-server into private
        Vercel Blob storage and reloads with the book. Device-only previews
        remain in this browser session.
      </p>
    </div>
  );
});
