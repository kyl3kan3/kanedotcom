export const MEMORY_PREVIEW_WIDTHS = [480] as const;

export type MemoryPreviewWidth = (typeof MEMORY_PREVIEW_WIDTHS)[number];

const SIGNED_URL_SAFETY_MS = 30_000;
const MAX_REDIRECT_CACHE_SECONDS = 240;

export function parseMemoryPreviewWidth(
  value: string | null,
): MemoryPreviewWidth | null {
  if (!value) return null;
  const width = Number(value);
  return MEMORY_PREVIEW_WIDTHS.find((candidate) => candidate === width) ?? null;
}

export function getMemoryPreviewPathname(
  pathname: string,
  width: MemoryPreviewWidth,
) {
  return `${pathname}.preview-${width}.webp`;
}

export function memoryPreviewUrl(url: string, width: MemoryPreviewWidth) {
  if (!url.startsWith("/api/memories/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}width=${width}`;
}

export function memoryRedirectCacheSeconds(
  expiresAt: number,
  now = Date.now(),
) {
  return Math.max(
    0,
    Math.min(
      MAX_REDIRECT_CACHE_SECONDS,
      Math.floor((expiresAt - now - SIGNED_URL_SAFETY_MS) / 1_000),
    ),
  );
}
