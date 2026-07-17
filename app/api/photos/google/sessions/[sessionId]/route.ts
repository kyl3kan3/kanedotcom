import { randomUUID } from "node:crypto";
import { and, eq, isNull, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { memories } from "@/db/schema";
import {
  GooglePhotosApiError,
  type GooglePhotosSession,
  type GooglePickedMediaItem,
  clearGoogleAccessToken,
  fetchGooglePhotos,
  getGoogleAccessToken,
  googleDurationToMilliseconds,
  googlePhotosError,
  requireGooglePhotosAdmin,
} from "@/lib/google-photos";
import {
  copyGoogleMediaToPrivateBlob,
  deletePrivateMemoryBlob,
  escapeLikePattern,
  getGoogleMemoryDirectory,
  getGoogleMemoryPathname,
  normalizeGoogleMediaFilename,
  normalizeGoogleMediaMimeType,
  PermanentMemoryImportError,
} from "@/lib/memory-storage";

export const maxDuration = 300;

type MediaItemsResponse = {
  mediaItems?: GooglePickedMediaItem[];
  nextPageToken?: string;
};

type ImportCandidate = {
  googleId: string;
  baseUrl: string;
  name: string;
  mimeType: string;
  kind: "image" | "video";
  pathname: string;
  capturedAt: Date | null;
  width: number | null;
  height: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  sourceMetadata: Record<string, unknown> | null;
};

type ImportedMemory = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "video";
  source: "google_photos";
  url: string;
};

const MAX_PAGE_TOKEN_LENGTH = 4096;

function parseGoogleCaptureTime(value: string | undefined) {
  if (!value) return null;
  const capturedAt = new Date(value);
  return Number.isNaN(capturedAt.getTime()) ? null : capturedAt;
}

function positiveInteger(value: number | undefined) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : null;
}

function cleanMetadataText(value: string | undefined) {
  const cleaned = value?.trim().slice(0, 160);
  return cleaned || null;
}

function buildGoogleSourceMetadata(
  file: NonNullable<GooglePickedMediaItem["mediaFile"]>,
) {
  const metadata = file.mediaFileMetadata;
  if (!metadata) return null;

  const photo = metadata.photoMetadata;
  const video = metadata.videoMetadata;
  const sourceMetadata: Record<string, unknown> = {};

  if (photo) {
    sourceMetadata.photo = {
      focalLength: Number.isFinite(photo.focalLength) ? photo.focalLength : null,
      apertureFNumber: Number.isFinite(photo.apertureFNumber)
        ? photo.apertureFNumber
        : null,
      isoEquivalent: positiveInteger(photo.isoEquivalent),
      exposureTime: cleanMetadataText(photo.exposureTime),
    };
  }

  if (video) {
    sourceMetadata.video = {
      fps: Number.isFinite(video.fps) && (video.fps ?? 0) > 0 ? video.fps : null,
      processingStatus: video.processingStatus ?? null,
    };
  }

  return Object.keys(sourceMetadata).length > 0 ? sourceMetadata : null;
}

function pollAfterMs(session: GooglePhotosSession) {
  return googleDurationToMilliseconds(
    session.pollingConfig?.pollInterval,
    3000,
    1000,
    30_000,
  );
}

async function readImportRequest(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { valid: false as const };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false as const };
  }

  const payload = body as Record<string, unknown>;
  const keys = Object.keys(payload);
  if (
    keys.length === 1 &&
    keys[0] === "finalize" &&
    payload.finalize === true
  ) {
    return { valid: true as const, finalize: true as const };
  }

  if (keys.length !== 1 || keys[0] !== "pageToken") {
    return { valid: false as const };
  }

  const pageToken = payload.pageToken;
  if (pageToken === null) {
    return {
      valid: true as const,
      finalize: false as const,
      pageToken: undefined,
    };
  }

  if (
    typeof pageToken !== "string" ||
    pageToken.length === 0 ||
    pageToken.length > MAX_PAGE_TOKEN_LENGTH
  ) {
    return { valid: false as const };
  }

  return { valid: true as const, finalize: false as const, pageToken };
}

async function listPickedItems(
  sessionId: string,
  accessToken: string,
  abortSignal: AbortSignal,
  pageToken?: string,
) {
  const url = new URL("https://photospicker.googleapis.com/v1/mediaItems");
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("pageSize", "10");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const page = await fetchGooglePhotos<MediaItemsResponse>(
    url.toString(),
    accessToken,
    {
      headers: { "Content-Type": "application/json" },
      signal: abortSignal,
    },
  );

  return {
    items: page.mediaItems ?? [],
    nextPageToken: page.nextPageToken || null,
  };
}

async function deleteSession(sessionId: string, accessToken: string) {
  const response = await fetch(
    `https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new GooglePhotosApiError(
      response.status,
      `Google Photos session cleanup failed (${response.status}).`,
    );
  }
}

function toImportedMemory(
  id: string,
  item: Pick<ImportCandidate, "name" | "mimeType" | "kind">,
): ImportedMemory {
  return {
    id,
    name: item.name,
    mimeType: item.mimeType,
    kind: item.kind,
    source: "google_photos",
    url: `/api/memories/${id}`,
  };
}

async function findReadyGoogleMemoryBySourceId(
  familyId: string,
  googleId: string,
) {
  const db = getDb();
  const [stored] = await db
    .select({
      id: memories.id,
      kind: memories.kind,
      mimeType: memories.mimeType,
      name: memories.originalName,
      storageKey: memories.storageKey,
      capturedAt: memories.capturedAt,
      captureTimeSource: memories.captureTimeSource,
      width: memories.width,
      height: memories.height,
      cameraMake: memories.cameraMake,
      cameraModel: memories.cameraModel,
      sourceMetadata: memories.sourceMetadata,
    })
    .from(memories)
    .where(
      and(
        eq(memories.familyId, familyId),
        eq(memories.source, "google_photos"),
        eq(memories.sourceMediaId, googleId),
        eq(memories.status, "ready"),
        isNull(memories.deletedAt),
      ),
    )
    .limit(1);

  return stored;
}

async function importCandidate(
  item: ImportCandidate,
  accessToken: string,
  abortSignal: AbortSignal,
  member: Awaited<ReturnType<typeof requireGooglePhotosAdmin>>,
) {
  const db = getDb();
  let stored = await findReadyGoogleMemoryBySourceId(
    member.familyId,
    item.googleId,
  );

  if (!stored) {
    [stored] = await db
      .select({
        id: memories.id,
        kind: memories.kind,
        mimeType: memories.mimeType,
        name: memories.originalName,
        storageKey: memories.storageKey,
        capturedAt: memories.capturedAt,
        captureTimeSource: memories.captureTimeSource,
        width: memories.width,
        height: memories.height,
        cameraMake: memories.cameraMake,
        cameraModel: memories.cameraModel,
        sourceMetadata: memories.sourceMetadata,
      })
      .from(memories)
      .where(
        and(
          eq(memories.familyId, member.familyId),
          like(
            memories.storageKey,
            `${escapeLikePattern(getGoogleMemoryDirectory(member.familyId, item.googleId))}%`,
          ),
          eq(memories.status, "ready"),
          isNull(memories.deletedAt),
        ),
      )
      .limit(1);
  }

  if (stored) {
    await db
      .update(memories)
      .set({
        source: "google_photos",
        sourceMediaId: item.googleId,
        capturedAt: item.capturedAt ?? stored.capturedAt,
        captureTimeSource: item.capturedAt
          ? "google"
          : stored.captureTimeSource,
        width: item.width ?? stored.width,
        height: item.height ?? stored.height,
        cameraMake: item.cameraMake ?? stored.cameraMake,
        cameraModel: item.cameraModel ?? stored.cameraModel,
        sourceMetadata: item.sourceMetadata ?? stored.sourceMetadata,
        metadataStatus:
          item.capturedAt ||
          stored.capturedAt ||
          item.width ||
          stored.width ||
          item.height ||
          stored.height
            ? "ready"
            : "pending",
      })
      .where(
        and(
          eq(memories.id, stored.id),
          eq(memories.familyId, member.familyId),
        ),
      );
    return {
      memory: toImportedMemory(stored.id, {
        kind: stored.kind,
        mimeType: stored.mimeType,
        name: stored.name,
      }),
      saved: false,
    };
  }

  const legacyStorageKey = `google_photos:${item.googleId}`;
  const [legacy] = await db
    .select({ id: memories.id })
    .from(memories)
    .where(
      and(
        eq(memories.familyId, member.familyId),
        eq(memories.storageKey, legacyStorageKey),
        isNull(memories.deletedAt),
      ),
    )
    .limit(1);

  const blob = await copyGoogleMediaToPrivateBlob({
    accessToken,
    abortSignal,
    baseUrl: item.baseUrl,
    kind: item.kind,
    mimeType: item.mimeType,
    pathname: item.pathname,
  });
  const storedMimeType = blob.contentType;
  const storedName = normalizeGoogleMediaFilename(item.name, storedMimeType);
  const storedItem = {
    ...item,
    mimeType: storedMimeType,
    name: storedName,
  };

  try {
    const [saved] = legacy
      ? await db
          .update(memories)
          .set({
            source: "google_photos",
            originalName: storedName,
            mimeType: storedMimeType,
            kind: item.kind,
            sourceMediaId: item.googleId,
            storageKey: blob.pathname,
            capturedAt: item.capturedAt,
            captureTimeSource: item.capturedAt ? "google" : null,
            width: item.width,
            height: item.height,
            cameraMake: item.cameraMake,
            cameraModel: item.cameraModel,
            sourceMetadata: item.sourceMetadata,
            metadataStatus:
              item.capturedAt || item.width || item.height ? "ready" : "pending",
            status: "ready",
          })
          .where(
            and(
              eq(memories.id, legacy.id),
              eq(memories.familyId, member.familyId),
              eq(memories.storageKey, legacyStorageKey),
            ),
          )
          .returning({ id: memories.id })
      : await db
          .insert(memories)
          .values({
            familyId: member.familyId,
            uploadedByMemberId: member.id,
            kind: item.kind,
            source: "google_photos",
            originalName: storedName,
            mimeType: storedMimeType,
            sourceMediaId: item.googleId,
            storageKey: blob.pathname,
            capturedAt: item.capturedAt,
            captureTimeSource: item.capturedAt ? "google" : null,
            width: item.width,
            height: item.height,
            cameraMake: item.cameraMake,
            cameraModel: item.cameraModel,
            sourceMetadata: item.sourceMetadata,
            metadataStatus:
              item.capturedAt || item.width || item.height ? "ready" : "pending",
            status: "ready",
          })
          .returning({ id: memories.id });

    if (!saved) throw new Error("The permanent memory record was not created.");
    return { memory: toImportedMemory(saved.id, storedItem), saved: true };
  } catch (error) {
    let concurrentlySaved: Awaited<
      ReturnType<typeof findReadyGoogleMemoryBySourceId>
    >;
    try {
      concurrentlySaved = await findReadyGoogleMemoryBySourceId(
        member.familyId,
        item.googleId,
      );
    } catch {
      // The write may have committed even if its response was interrupted. If we
      // cannot verify the row, keep this attempt's Blob rather than risk data loss.
      throw error;
    }

    if (concurrentlySaved) {
      if (concurrentlySaved.storageKey !== blob.pathname) {
        await deletePrivateMemoryBlob(blob.pathname).catch(() => undefined);
      }
      return {
        memory: toImportedMemory(concurrentlySaved.id, concurrentlySaved),
        saved: false,
      };
    }

    await deletePrivateMemoryBlob(blob.pathname).catch(() => undefined);
    throw error;
  }
}

async function importInBatches(
  candidates: ImportCandidate[],
  accessToken: string,
  abortSignal: AbortSignal,
  member: Awaited<ReturnType<typeof requireGooglePhotosAdmin>>,
) {
  const successes: Array<{ memory: ImportedMemory; saved: boolean }> = [];
  const failures: string[] = [];
  const permanentFailures: string[] = [];

  for (let index = 0; index < candidates.length; index += 3) {
    const batch = candidates.slice(index, index + 3);
    const results = await Promise.allSettled(
      batch.map((item) =>
        importCandidate(item, accessToken, abortSignal, member),
      ),
    );

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        successes.push(result.value);
      } else if (result.reason instanceof PermanentMemoryImportError) {
        // Retrying the page cannot fix these items; report them as skipped so
        // one bad selection does not block the rest of the import.
        permanentFailures.push(result.reason.message);
      } else {
        failures.push(
          result.reason instanceof Error
            ? result.reason.message
            : "A selected Google memory could not be saved.",
        );
      }
    });
  }

  return { successes, failures, permanentFailures };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  let member: Awaited<ReturnType<typeof requireGooglePhotosAdmin>>;
  try {
    member = await requireGooglePhotosAdmin();
  } catch {
    return googlePhotosError(
      "Only the family admin can import from Google Photos.",
      403,
    );
  }

  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { needsAuth: true, authUrl: "/api/photos/google/start" },
      { status: 401 },
    );
  }

  const { sessionId } = await params;
  const importRequest = await readImportRequest(request);
  if (!importRequest.valid) {
    return googlePhotosError("Invalid Google Photos import request.", 400);
  }

  try {
    if (importRequest.finalize) {
      await deleteSession(sessionId, accessToken);
      return NextResponse.json({ ready: true, finalized: true });
    }

    // One deadline covers session lookup, listing, and every stream in this
    // page. Reusing it prevents a later batch from starting a fresh 240-second
    // clock and running past Vercel's 300-second function limit.
    const importAbortSignal = AbortSignal.timeout(240_000);

    const session = await fetchGooglePhotos<GooglePhotosSession>(
      `https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`,
      accessToken,
      { signal: importAbortSignal },
    );

    if (!session.mediaItemsSet) {
      return NextResponse.json({
        ready: false,
        pollAfterMs: pollAfterMs(session),
        timeoutAfterMs: googleDurationToMilliseconds(
          session.pollingConfig?.timeoutIn,
          10 * 60 * 1000,
          60_000,
          30 * 60 * 1000,
        ),
      });
    }

    console.info("[google-photos-import] selection ready");

    const { items: pickedItems, nextPageToken } = await listPickedItems(
      sessionId,
      accessToken,
      importAbortSignal,
      importRequest.pageToken,
    );
    console.info("[google-photos-import] selected items listed", {
      count: pickedItems.length,
      hasMore: Boolean(nextPageToken),
    });

    const candidates = pickedItems.flatMap((item) => {
      const file = item.mediaFile;
      if (!file?.baseUrl || !file.mimeType) return [];

      const kind: "image" | "video" =
        item.type === "VIDEO" || file.mimeType.startsWith("video/")
          ? "video"
          : "image";
      if (!file.mimeType.startsWith(`${kind}/`)) return [];

      const metadata = file.mediaFileMetadata;
      if (
        kind === "video" &&
        metadata?.videoMetadata?.processingStatus &&
        metadata.videoMetadata.processingStatus !== "READY"
      ) {
        return [];
      }

      const mimeType = normalizeGoogleMediaMimeType(file.mimeType).slice(0, 120);
      const name = normalizeGoogleMediaFilename(
        (file.filename || `google-photo-${item.id}`).slice(0, 240),
        mimeType,
      );
      return [
        {
          googleId: item.id,
          baseUrl: file.baseUrl,
          name,
          mimeType,
          kind,
          pathname: getGoogleMemoryPathname(
            member.familyId,
            item.id,
            `${randomUUID()}-${name.slice(-100)}`,
          ),
          capturedAt: parseGoogleCaptureTime(item.createTime),
          width: positiveInteger(metadata?.width),
          height: positiveInteger(metadata?.height),
          cameraMake: cleanMetadataText(metadata?.cameraMake),
          cameraModel: cleanMetadataText(metadata?.cameraModel),
          sourceMetadata: buildGoogleSourceMetadata(file),
        },
      ];
    });

    const { successes, failures, permanentFailures } = await importInBatches(
      candidates,
      accessToken,
      importAbortSignal,
      member,
    );

    const saved = successes.filter((result) => result.saved).length;
    const skipped =
      pickedItems.length - candidates.length + permanentFailures.length;
    if (saved > 0) revalidatePath("/");

    if (permanentFailures.length > 0) {
      console.warn("[google-photos-import] unsupported items skipped", {
        skippedPermanently: permanentFailures.length,
      });
    }

    if (failures.length > 0) {
      console.warn("[google-photos-import] import page will retry", {
        imported: successes.length,
        saved,
        failed: failures.length,
        skipped,
        processed: pickedItems.length,
      });

      return NextResponse.json(
        {
          ready: true,
          importing: true,
          final: false,
          retryable: true,
          retryAfterMs: 2000,
          nextPageToken: null,
          imported: successes.map((result) => result.memory),
          saved,
          failed: failures.length,
          skipped,
          processed: pickedItems.length,
          error: "Some Google Photos could not be copied yet. Retrying this page is safe.",
        },
        { status: 503, headers: { "Retry-After": "2" } },
      );
    }

    console.info("[google-photos-import] import page complete", {
      imported: successes.length,
      saved,
      failed: 0,
      skipped,
      processed: pickedItems.length,
      hasMore: Boolean(nextPageToken),
    });

    return NextResponse.json({
      ready: true,
      importing: Boolean(nextPageToken),
      final: !nextPageToken,
      nextPageToken,
      imported: successes.map((result) => result.memory),
      saved,
      failed: 0,
      skipped,
      processed: pickedItems.length,
    });
  } catch (error) {
    console.error("[google-photos-import] import failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
      status: error instanceof GooglePhotosApiError ? error.status : undefined,
    });

    if (error instanceof GooglePhotosApiError && error.status === 401) {
      await clearGoogleAccessToken();
      return NextResponse.json(
        { needsAuth: true, authUrl: "/api/photos/google/start" },
        { status: 401 },
      );
    }

    return googlePhotosError(
      error instanceof Error
        ? error.message
        : "Could not permanently import Google Photos.",
      error instanceof GooglePhotosApiError && error.status === 403 ? 403 : 502,
    );
  }
}
