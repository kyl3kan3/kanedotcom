"use client";

/* eslint-disable @next/next/no-img-element */

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type PhotoGallerySource = {
  id: string;
  kind: "image" | "video";
  url: string;
};

export type PhotoGalleryDialogHandle = {
  open: (
    sources: readonly PhotoGallerySource[],
    selectedId: string,
    label: string,
  ) => void;
};

type GalleryState = {
  items: Array<{
    id: string;
    src: string;
    alt: string;
  }>;
  index: number;
  label: string;
};

function familyMemoryAlt(chapterTitle?: string) {
  return chapterTitle
    ? `Family memory from ${chapterTitle}`
    : "Private family memory";
}

export const PhotoGalleryDialog = memo(
  forwardRef<PhotoGalleryDialogHandle>(function PhotoGalleryDialog(_props, ref) {
    const [gallery, setGallery] = useState<GalleryState>();
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const preloadedUrlsRef = useRef(new Set<string>());
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const returnFocusFrameRef = useRef<number | null>(null);
    const pointerStartRef = useRef<{
      pointerId: number;
      x: number;
      y: number;
    } | null>(null);

    const open = useCallback(
      (
        sources: readonly PhotoGallerySource[],
        selectedId: string,
        label: string,
      ) => {
        const items = sources
          .filter((source) => source.kind === "image")
          .map((source) => ({
            id: source.id,
            src: source.url,
            alt:
              label === "Our family memory shelf"
                ? familyMemoryAlt()
                : familyMemoryAlt(label),
          }));
        if (items.length === 0) return;

        const selectedIndex = items.findIndex((item) => item.id === selectedId);
        returnFocusRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setGallery({
          items,
          index: selectedIndex >= 0 ? selectedIndex : 0,
          label,
        });
      },
      [],
    );

    const step = useCallback((direction: -1 | 1) => {
      setGallery((current) => {
        if (!current || current.items.length < 2) return current;
        return {
          ...current,
          index:
            (current.index + direction + current.items.length) %
            current.items.length,
        };
      });
    }, []);

    const close = useCallback(() => {
      setGallery(undefined);
      if (returnFocusFrameRef.current !== null) {
        window.cancelAnimationFrame(returnFocusFrameRef.current);
      }
      returnFocusFrameRef.current = window.requestAnimationFrame(() => {
        returnFocusFrameRef.current = null;
        returnFocusRef.current?.focus({ preventScroll: true });
      });
    }, []);

    useImperativeHandle(ref, () => ({ open }), [open]);

    const isOpen = Boolean(gallery);

    useEffect(() => {
      if (!isOpen) return;

      const previousOverflow = document.body.style.overflow;
      const focusFrame = window.requestAnimationFrame(() =>
        closeRef.current?.focus(),
      );
      document.body.style.overflow = "hidden";

      return () => {
        window.cancelAnimationFrame(focusFrame);
        document.body.style.overflow = previousOverflow;
      };
    }, [isOpen]);

    useEffect(() => {
      return () => {
        if (returnFocusFrameRef.current !== null) {
          window.cancelAnimationFrame(returnFocusFrameRef.current);
        }
      };
    }, []);

    useEffect(() => {
      if (!isOpen) return;

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          step(event.key === "ArrowLeft" ? -1 : 1);
          return;
        }

        if (event.key === "Tab") {
          const focusable = Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
            ) ?? [],
          );
          const first = focusable[0];
          const last = focusable.at(-1);
          if (!first || !last) return;

          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      };

      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }, [close, isOpen, step]);

    useEffect(() => {
      if (!gallery || gallery.items.length < 2) return;

      const adjacentIndexes = [
        (gallery.index - 1 + gallery.items.length) % gallery.items.length,
        (gallery.index + 1) % gallery.items.length,
      ];

      for (const index of new Set(adjacentIndexes)) {
        const url = gallery.items[index].src;
        if (preloadedUrlsRef.current.has(url)) continue;
        preloadedUrlsRef.current.add(url);
        const preload = new window.Image();
        preload.decoding = "async";
        preload.src = url;
      }
    }, [gallery]);

    if (!gallery) return null;

    const activeItem = gallery.items[gallery.index];

    return (
      <div
        className="dialog-backdrop"
        role="presentation"
        data-photo-gallery-open
        onMouseDown={close}
      >
        <div
          ref={dialogRef}
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gallery-title"
          aria-describedby="gallery-instructions"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <h2 id="gallery-title" className="visually-hidden">
            {gallery.label}
          </h2>
          <p id="gallery-instructions" className="visually-hidden">
            Use the previous and next buttons, arrow keys, or a horizontal swipe
            to browse these family photos.
          </p>
          <button
            ref={closeRef}
            type="button"
            className="dialog-close"
            onClick={close}
            aria-label="Close photo gallery"
          >
            &times;
          </button>
          <div
            className="lightbox-stage"
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              pointerStartRef.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => {
              const start = pointerStartRef.current;
              pointerStartRef.current = null;
              if (!start || start.pointerId !== event.pointerId) return;

              const horizontalDistance = event.clientX - start.x;
              const verticalDistance = event.clientY - start.y;
              if (
                Math.abs(horizontalDistance) < 48 ||
                Math.abs(horizontalDistance) <= Math.abs(verticalDistance)
              ) {
                return;
              }
              step(horizontalDistance > 0 ? -1 : 1);
            }}
            onPointerCancel={() => {
              pointerStartRef.current = null;
            }}
          >
            <img
              src={activeItem.src}
              alt={activeItem.alt}
              decoding="async"
              draggable={false}
            />
            {gallery.items.length > 1 && (
              <>
                <button
                  type="button"
                  className="lightbox-nav previous"
                  onClick={() => step(-1)}
                  aria-label="Previous photo"
                >
                  &larr;
                </button>
                <button
                  type="button"
                  className="lightbox-nav next"
                  onClick={() => step(1)}
                  aria-label="Next photo"
                >
                  &rarr;
                </button>
              </>
            )}
            <span className="lightbox-counter" aria-hidden="true">
              Photo {gallery.index + 1} / {gallery.items.length}
            </span>
            <span className="visually-hidden" role="status" aria-live="polite">
              Photo {gallery.index + 1} of {gallery.items.length} from{" "}
              {gallery.label}
            </span>
          </div>
        </div>
      </div>
    );
  }),
);

PhotoGalleryDialog.displayName = "PhotoGalleryDialog";
