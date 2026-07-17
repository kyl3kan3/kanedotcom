import { config } from "dotenv";
import exifr from "exifr";
import { neon } from "@neondatabase/serverless";
import { issueSignedToken, presignUrl } from "@vercel/blob";
import sharp from "sharp";

config({ path: ".env.local" });

const apply = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL);
const quickTimeEpochOffsetSeconds = 2_082_844_800;
const unixEpochSentinelWindowMs = 24 * 60 * 60 * 1000;
const { parse: parseExif } = exifr;

function plausibleDate(value) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  if (Math.abs(date.getTime()) <= unixEpochSentinelWindowMs) return null;
  const year = date.getUTCFullYear();
  return year >= 1970 && year <= new Date().getUTCFullYear() + 1 ? date : null;
}

// Mirrors lib/memory-intelligence.ts: EXIF capture times are zone-less wall
// clocks, so interpret them as family-local (America/Chicago) time — or with
// the camera's explicit UTC offset when recorded — never the server zone.
const familyTimeZone = "America/Chicago";
const familyClockParts = new Intl.DateTimeFormat("en-US", {
  timeZone: familyTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function familyTimeZoneOffsetMs(instant) {
  const parts = Object.fromEntries(
    familyClockParts
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const reprojected = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour % 24,
    parts.minute,
    parts.second,
  );
  return reprojected - instant.getTime();
}

function exifCaptureInstant(value, utcOffset) {
  if (typeof value !== "string") return null;
  const wall = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(
    value.trim(),
  );
  if (!wall) return null;

  const [, year, month, day, hour, minute, second] = wall.map(Number);
  const offset =
    typeof utcOffset === "string"
      ? /^([+-])(\d{2}):?(\d{2})$/.exec(utcOffset.trim())
      : null;
  if (offset) {
    const offsetMs =
      (offset[1] === "-" ? -1 : 1) *
      (Number(offset[2]) * 60 + Number(offset[3])) *
      60_000;
    return plausibleDate(
      Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs,
    );
  }

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = asUtc - familyTimeZoneOffsetMs(new Date(asUtc));
  instant = asUtc - familyTimeZoneOffsetMs(new Date(instant));
  return plausibleDate(instant);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function sourceMediaIdFromPath(storageKey) {
  const segment = storageKey.match(/\/google-photos\/([^/]+)\//)?.[1];
  if (!segment) return null;
  try {
    const value = Buffer.from(segment, "base64url").toString("utf8").trim();
    return value && !value.includes("\uFFFD") ? value.slice(0, 500) : null;
  } catch {
    return null;
  }
}

function parseMp4(buffer) {
  const mvhd = buffer.indexOf(Buffer.from("mvhd"));
  let durationMs = null;
  let capturedAt = null;
  if (mvhd >= 4) {
    const offset = mvhd - 4;
    const size = buffer.readUInt32BE(offset);
    const content = mvhd + 4;
    if (size >= 32 && offset + size <= buffer.length) {
      const version = buffer[content];
      try {
        const creation = version === 1
          ? Number(buffer.readBigUInt64BE(content + 4))
          : buffer.readUInt32BE(content + 4);
        const timescale = buffer.readUInt32BE(content + (version === 1 ? 20 : 12));
        const duration = version === 1
          ? Number(buffer.readBigUInt64BE(content + 24))
          : buffer.readUInt32BE(content + 16);
        durationMs = timescale > 0
          ? Math.min(2_147_483_647, Math.round((duration / timescale) * 1000))
          : null;
        capturedAt = plausibleDate(
          (creation - quickTimeEpochOffsetSeconds) * 1000,
        );
      } catch {
        durationMs = null;
        capturedAt = null;
      }
    }
  }

  const tkhd = buffer.indexOf(Buffer.from("tkhd"));
  let width = null;
  let height = null;
  if (tkhd >= 4) {
    const offset = tkhd - 4;
    const size = buffer.readUInt32BE(offset);
    if (size >= 20 && offset + size <= buffer.length) {
      width = positiveInteger(Math.round(buffer.readUInt32BE(offset + size - 8) / 65_536));
      height = positiveInteger(Math.round(buffer.readUInt32BE(offset + size - 4) / 65_536));
    }
  }
  return { capturedAt, durationMs, width, height };
}

async function readPrivateBlob(pathname) {
  const validUntil = Date.now() + 5 * 60 * 1000;
  const token = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(token, {
    access: "private",
    operation: "get",
    pathname,
    validUntil,
  });
  const response = await fetch(presignedUrl);
  if (!response.ok) throw new Error(`Blob read failed (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

async function inspect(row) {
  const buffer = await readPrivateBlob(row.storage_key);
  const sourceMediaId = sourceMediaIdFromPath(row.storage_key);

  if (row.kind === "video") {
    return { sourceMediaId, ...parseMp4(buffer), captureTimeSource: "file" };
  }

  const [exif, image] = await Promise.all([
    parseExif(buffer, {
      pick: [
        "DateTimeOriginal",
        "CreateDate",
        "ModifyDate",
        "OffsetTimeOriginal",
        "OffsetTimeDigitized",
        "OffsetTime",
        "ExifImageWidth",
        "ExifImageHeight",
        "ImageWidth",
        "ImageHeight",
        "PixelXDimension",
        "PixelYDimension",
      ],
      reviveValues: false,
    }).catch(() => null),
    sharp(buffer).metadata(),
  ]);
  return {
    sourceMediaId,
    capturedAt:
      exifCaptureInstant(exif?.DateTimeOriginal, exif?.OffsetTimeOriginal) ??
      exifCaptureInstant(exif?.CreateDate, exif?.OffsetTimeDigitized) ??
      exifCaptureInstant(exif?.ModifyDate, exif?.OffsetTime),
    captureTimeSource: "exif",
    width:
      positiveInteger(exif?.ExifImageWidth) ??
      positiveInteger(exif?.PixelXDimension) ??
      positiveInteger(exif?.ImageWidth) ??
      positiveInteger(image.width),
    height:
      positiveInteger(exif?.ExifImageHeight) ??
      positiveInteger(exif?.PixelYDimension) ??
      positiveInteger(exif?.ImageHeight) ??
      positiveInteger(image.height),
    durationMs: null,
  };
}

const rows = await sql.query(
  "select id, kind, storage_key from memories where source = $1 and status = $2 and deleted_at is null and storage_key is not null order by created_at",
  ["google_photos", "ready"],
);
const totals = {
  scanned: rows.length,
  prepared: 0,
  captured: 0,
  dimensions: 0,
  durations: 0,
  sourceIds: 0,
  failed: 0,
  updated: 0,
};

for (const row of rows) {
  try {
    const metadata = await inspect(row);
    totals.prepared += 1;
    if (metadata.capturedAt) totals.captured += 1;
    if (metadata.width && metadata.height) totals.dimensions += 1;
    if (metadata.durationMs) totals.durations += 1;
    if (metadata.sourceMediaId) totals.sourceIds += 1;

    if (apply) {
      await sql.query(
        `update memories
         set source_media_id = coalesce(source_media_id, $1),
             captured_at = coalesce(captured_at, $2),
             capture_time_source = case
               when captured_at is null and $2::timestamptz is not null then $3
               else capture_time_source
             end,
             width = coalesce(width, $4),
             height = coalesce(height, $5),
             duration_ms = coalesce(duration_ms, $6),
             metadata_status = case
               when $2::timestamptz is not null or $4::int is not null or $5::int is not null or $6::int is not null
                 then 'ready'
               else 'unavailable'
             end
         where id = $7 and storage_key = $8`,
        [
          metadata.sourceMediaId,
          metadata.capturedAt?.toISOString() ?? null,
          metadata.capturedAt ? metadata.captureTimeSource : null,
          metadata.width,
          metadata.height,
          metadata.durationMs,
          row.id,
          row.storage_key,
        ],
      );
      totals.updated += 1;
    }
  } catch {
    totals.failed += 1;
  }
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...totals }));
if (!apply) console.log("Dry run only. Re-run with --apply to save these fields.");
