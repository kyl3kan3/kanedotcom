import exifr from "exifr";
import sharp from "sharp";
import { getPrivateMemoryUrl } from "@/lib/memory-storage";

const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const QUICKTIME_EPOCH_OFFSET_SECONDS = 2_082_844_800;
const UNIX_EPOCH_SENTINEL_WINDOW_MS = 24 * 60 * 60 * 1000;
const { parse: parseExif } = exifr;

export type MemoryAnalysisInput = {
  id: string;
  familyId: string;
  originalName: string;
  kind: "image" | "video";
  mimeType: string;
  storageKey: string;
  capturedAt: Date | null;
  captureTimeSource: "google" | "exif" | "file" | "import" | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  sourceMediaId: string | null;
  sourceMetadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type MemoryMetadataUpdate = {
  capturedAt: Date | null;
  captureTimeSource: "google" | "exif" | "file" | "import" | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  sourceMediaId: string | null;
  metadataStatus: "ready" | "unavailable";
};

export type PreparedMemory = {
  memory: MemoryAnalysisInput;
  metadata: MemoryMetadataUpdate;
  thumbnail?: Buffer;
  thumbnailMediaType?: "image/jpeg";
};

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 160)
    : null;
}

function plausibleCaptureDate(value: unknown) {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  if (Math.abs(date.getTime()) <= UNIX_EPOCH_SENTINEL_WINDOW_MS) return null;

  const year = date.getUTCFullYear();
  const nextYear = new Date().getUTCFullYear() + 1;
  return year >= 1970 && year <= nextYear ? date : null;
}

function decodeGoogleSourceMediaId(storageKey: string) {
  const match = storageKey.match(/\/google-photos\/([^/]+)\//);
  if (!match) return null;

  try {
    const decoded = Buffer.from(match[1], "base64url").toString("utf8").trim();
    return decoded && !decoded.includes("\uFFFD") ? decoded.slice(0, 500) : null;
  } catch {
    return null;
  }
}

function parseMp4MovieHeader(buffer: Buffer) {
  const marker = Buffer.from("mvhd");
  let markerOffset = buffer.indexOf(marker);

  while (markerOffset >= 4) {
    const boxOffset = markerOffset - 4;
    const size = buffer.readUInt32BE(boxOffset);
    const contentOffset = markerOffset + 4;
    if (size >= 32 && boxOffset + size <= buffer.length) {
      const version = buffer[contentOffset];
      try {
        const creationSeconds =
          version === 1
            ? Number(buffer.readBigUInt64BE(contentOffset + 4))
            : buffer.readUInt32BE(contentOffset + 4);
        const timescaleOffset = contentOffset + (version === 1 ? 20 : 12);
        const durationOffset = contentOffset + (version === 1 ? 24 : 16);
        const timescale = buffer.readUInt32BE(timescaleOffset);
        const durationUnits =
          version === 1
            ? Number(buffer.readBigUInt64BE(durationOffset))
            : buffer.readUInt32BE(durationOffset);
        const durationMs =
          timescale > 0 && Number.isFinite(durationUnits)
            ? Math.min(
                2_147_483_647,
                Math.max(0, Math.round((durationUnits / timescale) * 1000)),
              )
            : null;
        const unixSeconds = creationSeconds - QUICKTIME_EPOCH_OFFSET_SECONDS;
        const capturedAt = plausibleCaptureDate(unixSeconds * 1000);
        return { durationMs, capturedAt };
      } catch {
        return { durationMs: null, capturedAt: null };
      }
    }
    markerOffset = buffer.indexOf(marker, markerOffset + marker.length);
  }

  return { durationMs: null, capturedAt: null };
}

async function fetchPrivateMemory(memory: MemoryAnalysisInput) {
  const url = await getPrivateMemoryUrl(memory.storageKey);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Private memory could not be read (${response.status}).`);
  }

  const maximumBytes =
    memory.kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error("Memory is too large for safe AI preparation.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maximumBytes) {
    throw new Error("Memory is too large for safe AI preparation.");
  }
  return buffer;
}

export async function prepareMemoryForAi(
  memory: MemoryAnalysisInput,
): Promise<PreparedMemory> {
  const sourceMediaId =
    memory.sourceMediaId ?? decodeGoogleSourceMediaId(memory.storageKey);

  if (memory.kind === "video") {
    const buffer = await fetchPrivateMemory(memory);
    const mp4 = memory.mimeType === "video/mp4"
      ? parseMp4MovieHeader(buffer)
      : { durationMs: null, capturedAt: null };
    const capturedAt = memory.capturedAt ?? mp4.capturedAt;

    return {
      memory,
      metadata: {
        capturedAt,
        captureTimeSource:
          memory.captureTimeSource ?? (mp4.capturedAt ? "file" : null),
        width: memory.width,
        height: memory.height,
        durationMs: memory.durationMs ?? mp4.durationMs,
        cameraMake: memory.cameraMake,
        cameraModel: memory.cameraModel,
        sourceMediaId,
        metadataStatus:
          capturedAt || memory.width || memory.height || memory.durationMs || mp4.durationMs
            ? "ready"
            : "unavailable",
      },
    };
  }

  const buffer = await fetchPrivateMemory(memory);
  const [exif, imageMetadata, thumbnail] = await Promise.all([
    parseExif(buffer, [
      "DateTimeOriginal",
      "CreateDate",
      "ModifyDate",
      "Make",
      "Model",
      "ExifImageWidth",
      "ExifImageHeight",
      "ImageWidth",
      "ImageHeight",
      "PixelXDimension",
      "PixelYDimension",
    ]).catch(() => null),
    sharp(buffer).metadata(),
    sharp(buffer)
      .rotate()
      .resize({
        width: 512,
        height: 512,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 68, mozjpeg: true })
      .toBuffer(),
  ]);

  const capturedAt =
    memory.capturedAt ??
    plausibleCaptureDate(exif?.DateTimeOriginal) ??
    plausibleCaptureDate(exif?.CreateDate) ??
    plausibleCaptureDate(exif?.ModifyDate);
  const width =
    memory.width ??
    positiveInteger(exif?.ExifImageWidth) ??
    positiveInteger(exif?.PixelXDimension) ??
    positiveInteger(exif?.ImageWidth) ??
    positiveInteger(imageMetadata.width);
  const height =
    memory.height ??
    positiveInteger(exif?.ExifImageHeight) ??
    positiveInteger(exif?.PixelYDimension) ??
    positiveInteger(exif?.ImageHeight) ??
    positiveInteger(imageMetadata.height);

  return {
    memory,
    metadata: {
      capturedAt,
      captureTimeSource:
        memory.captureTimeSource ?? (capturedAt ? "exif" : null),
      width,
      height,
      durationMs: memory.durationMs,
      cameraMake: memory.cameraMake ?? cleanText(exif?.Make),
      cameraModel: memory.cameraModel ?? cleanText(exif?.Model),
      sourceMediaId,
      metadataStatus:
        capturedAt || width || height || memory.cameraMake || memory.cameraModel
          ? "ready"
          : "unavailable",
    },
    thumbnail,
    thumbnailMediaType: "image/jpeg",
  };
}
