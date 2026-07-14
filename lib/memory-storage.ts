import {
  BlobNotFoundError,
  del,
  get,
  head,
  issueSignedToken,
  presignUrl,
  put,
} from "@vercel/blob";
import sharp from "sharp";
import {
  getMemoryPreviewPathname,
  MEMORY_PREVIEW_WIDTHS,
  type MemoryPreviewWidth,
} from "@/lib/memory-preview";

type MemoryKind = "image" | "video";

function safePathSegment(value: string, fallback: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);

  return cleaned || fallback;
}

function googleItemPathSegment(itemId: string) {
  return Buffer.from(itemId).toString("base64url").slice(0, 220);
}

const browserExtensionByMimeType: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

function cleanMimeType(value: string) {
  return value.split(";", 1)[0].trim().toLowerCase();
}

export function normalizeGoogleMediaMimeType(mimeType: string) {
  const normalized = cleanMimeType(mimeType);
  return normalized === "image/heic" || normalized === "image/heif"
    ? "image/jpeg"
    : normalized;
}

export function normalizeGoogleMediaFilename(
  filename: string,
  mimeType: string,
) {
  const extension = browserExtensionByMimeType[cleanMimeType(mimeType)];
  if (!extension) return filename;

  if (/\.(?:heic|heif)$/i.test(filename)) {
    return filename.replace(/\.(?:heic|heif)$/i, extension);
  }

  return filename;
}

export function getGoogleMemoryDirectory(familyId: string, itemId: string) {
  return `families/${familyId}/google-photos/${googleItemPathSegment(itemId)}/`;
}

export function getGoogleMemoryPathname(
  familyId: string,
  itemId: string,
  filename: string,
) {
  const safeFilename = safePathSegment(filename, "google-memory");
  return `${getGoogleMemoryDirectory(familyId, itemId)}${safeFilename}`;
}

export function isAllowedGoogleMediaUrl(url: URL) {
  return (
    url.protocol === "https:" &&
    (url.hostname === "lh3.googleusercontent.com" ||
      url.hostname.endsWith(".googleusercontent.com"))
  );
}

export async function copyGoogleMediaToPrivateBlob({
  accessToken,
  abortSignal,
  baseUrl,
  kind,
  mimeType,
  pathname,
}: {
  accessToken: string;
  abortSignal: AbortSignal;
  baseUrl: string;
  kind: MemoryKind;
  mimeType: string;
  pathname: string;
}) {
  const googleUrl = new URL(baseUrl);
  if (!isAllowedGoogleMediaUrl(googleUrl)) {
    throw new Error("Google returned an unsupported media URL.");
  }

  const downloadUrl = `${googleUrl.toString()}${kind === "video" ? "=dv" : "=d"}`;
  const upstream = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: abortSignal,
  });

  if (!upstream.ok || !upstream.body) {
    throw new Error(`Google media download failed with status ${upstream.status}.`);
  }

  const upstreamMimeType = cleanMimeType(
    upstream.headers.get("content-type") || mimeType,
  );
  if (!upstreamMimeType.startsWith(`${kind}/`)) {
    throw new Error("Google returned media in an unexpected format.");
  }

  const storedPathname = normalizeGoogleMediaFilename(
    pathname,
    upstreamMimeType,
  );

  const contentLength = Number(upstream.headers.get("content-length"));
  const useMultipart =
    kind === "video" ||
    (Number.isFinite(contentLength) && contentLength > 100 * 1024 * 1024);

  return put(storedPathname, upstream.body, {
    access: "private",
    abortSignal,
    allowOverwrite: false,
    cacheControlMaxAge: 30 * 24 * 60 * 60,
    contentType: upstreamMimeType,
    multipart: useMultipart,
  });
}

export async function deletePrivateMemoryBlob(pathname: string) {
  const previewPathnames = MEMORY_PREVIEW_WIDTHS.map((width) =>
    getMemoryPreviewPathname(pathname, width),
  );
  await del([pathname, ...previewPathnames]);

  for (const cachedPathname of [pathname, ...previewPathnames]) {
    privateMemoryUrlCache.delete(cachedPathname);
    privateMemoryPreviewPaths.delete(cachedPathname);
    privateMemoryPreviewFailures.delete(cachedPathname);
  }
}

export type PrivateMemoryAccess = { expiresAt: number; url: string };

const PRIVATE_MEMORY_URL_SAFETY_MS = 30_000;
const MAX_CACHED_PRIVATE_MEMORY_URLS = 500;
const MAX_CACHED_PREVIEW_PATHS = 500;
const MAX_CACHED_PREVIEW_FAILURES = 500;
const MAX_CONCURRENT_PREVIEW_GENERATIONS = 2;
const MAX_PREVIEW_SOURCE_BYTES = 40 * 1024 * 1024;
const MAX_PREVIEW_SOURCE_PIXELS = 64_000_000;
const PREVIEW_FAILURE_RETRY_MS = 60 * 60 * 1_000;

const privateMemoryUrlCache = new Map<string, PrivateMemoryAccess>();
const privateMemoryUrlRequests = new Map<
  string,
  Promise<PrivateMemoryAccess>
>();
const privateMemoryPreviewPaths = new Set<string>();
const privateMemoryPreviewFailures = new Map<string, number>();
const privateMemoryPreviewRequests = new Map<string, Promise<string>>();
const previewGenerationWaiters: Array<() => void> = [];
let activePreviewGenerations = 0;

function rememberPrivateMemoryPreview(pathname: string) {
  privateMemoryPreviewFailures.delete(pathname);
  privateMemoryPreviewPaths.add(pathname);
  while (privateMemoryPreviewPaths.size > MAX_CACHED_PREVIEW_PATHS) {
    const oldestPathname = privateMemoryPreviewPaths.values().next().value;
    if (!oldestPathname) break;
    privateMemoryPreviewPaths.delete(oldestPathname);
  }
}

function rememberPrivateMemoryPreviewFailure(pathname: string) {
  const now = Date.now();
  privateMemoryPreviewFailures.delete(pathname);
  privateMemoryPreviewFailures.set(pathname, now + PREVIEW_FAILURE_RETRY_MS);

  for (const [cachedPathname, retryAt] of privateMemoryPreviewFailures) {
    if (retryAt <= now) privateMemoryPreviewFailures.delete(cachedPathname);
  }
  while (privateMemoryPreviewFailures.size > MAX_CACHED_PREVIEW_FAILURES) {
    const oldestPathname = privateMemoryPreviewFailures.keys().next().value;
    if (!oldestPathname) break;
    privateMemoryPreviewFailures.delete(oldestPathname);
  }
}

function isPrivateMemoryPreviewCoolingDown(pathname: string) {
  const retryAt = privateMemoryPreviewFailures.get(pathname);
  if (!retryAt) return false;
  if (retryAt > Date.now()) return true;
  privateMemoryPreviewFailures.delete(pathname);
  return false;
}

async function withPreviewGenerationSlot<T>(task: () => Promise<T>) {
  if (activePreviewGenerations >= MAX_CONCURRENT_PREVIEW_GENERATIONS) {
    await new Promise<void>((resolve) => previewGenerationWaiters.push(resolve));
  }

  activePreviewGenerations += 1;
  try {
    return await task();
  } finally {
    activePreviewGenerations -= 1;
    previewGenerationWaiters.shift()?.();
  }
}

async function ensurePrivateMemoryPreview(
  pathname: string,
  width: MemoryPreviewWidth,
) {
  const previewPathname = getMemoryPreviewPathname(pathname, width);
  if (privateMemoryPreviewPaths.has(previewPathname)) return previewPathname;
  if (isPrivateMemoryPreviewCoolingDown(previewPathname)) {
    throw new Error("The private memory preview is cooling down after a failure.");
  }

  const pending = privateMemoryPreviewRequests.get(previewPathname);
  if (pending) return pending;

  const request = (async () => {
    try {
      await head(previewPathname);
      rememberPrivateMemoryPreview(previewPathname);
      return previewPathname;
    } catch (error) {
      if (!(error instanceof BlobNotFoundError)) throw error;
    }

    return withPreviewGenerationSlot(async () => {
      const original = await get(pathname, { access: "private" });
      if (!original?.stream) {
        throw new Error("The original private memory could not be read.");
      }
      if (original.blob.size > MAX_PREVIEW_SOURCE_BYTES) {
        throw new Error("The original private memory is too large to preview.");
      }

      const originalBytes = Buffer.from(
        await new Response(original.stream).arrayBuffer(),
      );
      const previewBytes = await sharp(originalBytes, {
        failOn: "none",
        limitInputPixels: MAX_PREVIEW_SOURCE_PIXELS,
      })
        .rotate()
        .resize(width, width, {
          fit: "cover",
          position: "centre",
          withoutEnlargement: true,
        })
        .webp({ effort: 3, quality: 76, smartSubsample: true })
        .toBuffer();

      await put(previewPathname, previewBytes, {
        access: "private",
        allowOverwrite: true,
        cacheControlMaxAge: 30 * 24 * 60 * 60,
        contentType: "image/webp",
      });
      rememberPrivateMemoryPreview(previewPathname);
      return previewPathname;
    });
  })()
    .catch((error) => {
      rememberPrivateMemoryPreviewFailure(previewPathname);
      throw error;
    })
    .finally(() => {
      privateMemoryPreviewRequests.delete(previewPathname);
    });

  privateMemoryPreviewRequests.set(previewPathname, request);
  return request;
}

export async function getPrivateMemoryAccess(
  pathname: string,
): Promise<PrivateMemoryAccess> {
  const now = Date.now();
  const cached = privateMemoryUrlCache.get(pathname);
  if (cached && cached.expiresAt - PRIVATE_MEMORY_URL_SAFETY_MS > now) {
    return cached;
  }

  const pending = privateMemoryUrlRequests.get(pathname);
  if (pending) return pending;

  const validUntil = Date.now() + 5 * 60 * 1000;
  const request = (async () => {
    const signedToken = await issueSignedToken({
      pathname,
      operations: ["get"],
      validUntil,
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      access: "private",
      operation: "get",
      pathname,
      validUntil,
    });

    // Reuse duplicate thumbnail/card requests while leaving a safety margin
    // before the underlying five-minute signature expires.
    const access = {
      expiresAt: validUntil,
      url: presignedUrl,
    };
    privateMemoryUrlCache.set(pathname, access);
    if (privateMemoryUrlCache.size > MAX_CACHED_PRIVATE_MEMORY_URLS) {
      for (const [key, value] of privateMemoryUrlCache) {
        if (
          value.expiresAt - PRIVATE_MEMORY_URL_SAFETY_MS <=
          Date.now()
        ) {
          privateMemoryUrlCache.delete(key);
        }
      }
      while (privateMemoryUrlCache.size > MAX_CACHED_PRIVATE_MEMORY_URLS) {
        const oldestKey = privateMemoryUrlCache.keys().next().value;
        if (!oldestKey) break;
        privateMemoryUrlCache.delete(oldestKey);
      }
    }

    return access;
  })().finally(() => {
    privateMemoryUrlRequests.delete(pathname);
  });

  privateMemoryUrlRequests.set(pathname, request);
  return request;
}

export async function getPrivateMemoryUrl(pathname: string) {
  return (await getPrivateMemoryAccess(pathname)).url;
}

export async function getPrivateMemoryPreviewAccess(
  pathname: string,
  width: MemoryPreviewWidth,
) {
  const previewPathname = await ensurePrivateMemoryPreview(pathname, width);
  return getPrivateMemoryAccess(previewPathname);
}

export async function getPrivateMemoryPreviewUrl(
  pathname: string,
  width: MemoryPreviewWidth,
) {
  return (await getPrivateMemoryPreviewAccess(pathname, width)).url;
}
