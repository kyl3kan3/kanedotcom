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
  getGoogleMemoryDirectory,
  getGoogleMemoryPathname,
  normalizeGoogleMediaFilename,
  normalizeGoogleMediaMimeType,
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

async function listPickedItems(sessionId: string, accessToken: string) {
  const items: GooglePickedMediaItem[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://photospicker.googleapis.com/v1/mediaItems");
    url.searchParams.set("sessionId", sessionId);
    url.searchParams.set("pageSize", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const page = await fetchGooglePhotos<MediaItemsResponse>(
      url.toString(),
      accessToken,
      { headers: { "Content-Type": "application/json" } },
    );
    items.push(...(page.mediaItems ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken && items.length < 50);

  return {
    items: items.slice(0, 50),
    hasMore: Boolean(pageToken) || items.length > 50,
  };
}

async function deleteSession(sessionId: string, accessToken: string) {
  await fetch(`https://photospicker.googleapis.com/v1/sessions/${sessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
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

async function importCandidate(
  item: ImportCandidate,
  accessToken: string,
  member: Awaited<ReturnType<typeof requireGooglePhotosAdmin>>,
) {
  const db = getDb();
  const [stored] = await db
    .select({
      id: memories.id,
      kind: memories.kind,
      mimeType: memories.mimeType,
      name: memories.originalName,
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
          `${getGoogleMemoryDirectory(member.familyId, item.googleId)}%`,
        ),
        eq(memories.status, "ready"),
        isNull(memories.deletedAt),
      ),
    )
    .limit(1);

  if (stored) {
    await db
      .update(memories)
      .set({
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
    await deletePrivateMemoryBlob(blob.pathname).catch(() => undefined);
    throw error;
  }
}

async function importInBatches(
  candidates: ImportCandidate[],
  accessToken: string,
  member: Awaited<ReturnType<typeof requireGooglePhotosAdmin>>,
) {
  const successes: Array<{ memory: ImportedMemory; saved: boolean }> = [];
  const failures: string[] = [];

  for (let index = 0; index < candidates.length; index += 3) {
    const batch = candidates.slice(index, index + 3);
    const results = await Promise.allSettled(
      batch.map((item) => importCandidate(item, accessToken, member)),
    );

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        successes.push(result.value);
      } else {
        failures.push(
          result.reason instanceof Error
            ? result.reason.message
            : "A selected Google memory could not be saved.",
        );
      }
    });
  }

  return { successes, failures };
}

export async function GET(
  _request: Request,
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

  try {
    const session = await fetchGooglePhotos<GooglePhotosSession>(
      `https://photospicker.googleapis.com/v1/sessions/${sessionId}`,
      accessToken,
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

    console.info("[google-photos-import] selection ready", {
      session: sessionId.slice(0, 8),
    });

    const { items: pickedItems, hasMore } = await listPickedItems(
      sessionId,
      accessToken,
    );
    console.info("[google-photos-import] selected items listed", {
      session: sessionId.slice(0, 8),
      count: pickedItems.length,
      hasMore,
    });
    if (hasMore) {
      await deleteSession(sessionId, accessToken).catch(() => undefined);
      throw new Error(
        "Choose 50 or fewer Google Photos at a time so every memory can be copied safely.",
      );
    }

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
          pathname: getGoogleMemoryPathname(member.familyId, item.id, name),
          capturedAt: parseGoogleCaptureTime(item.createTime),
          width: positiveInteger(metadata?.width),
          height: positiveInteger(metadata?.height),
          cameraMake: cleanMetadataText(metadata?.cameraMake),
          cameraModel: cleanMetadataText(metadata?.cameraModel),
          sourceMetadata: buildGoogleSourceMetadata(file),
        },
      ];
    });

    const { successes, failures } = await importInBatches(
      candidates,
      accessToken,
      member,
    );

    await deleteSession(sessionId, accessToken).catch(() => undefined);

    if (successes.length === 0 && failures.length > 0) {
      throw new Error(`No memories were saved. ${failures[0]}`);
    }

    const saved = successes.filter((result) => result.saved).length;
    if (saved > 0) revalidatePath("/");

    console.info("[google-photos-import] import complete", {
      session: sessionId.slice(0, 8),
      imported: successes.length,
      saved,
      failed: failures.length,
    });

    return NextResponse.json({
      ready: true,
      imported: successes.map((result) => result.memory),
      saved,
      failed: failures.length,
    });
  } catch (error) {
    console.error("[google-photos-import] import failed", {
      session: sessionId.slice(0, 8),
      error: error instanceof Error ? error.message : String(error),
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
