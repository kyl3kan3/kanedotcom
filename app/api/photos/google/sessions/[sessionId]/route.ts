import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { memories } from "@/db/schema";
import {
  type GooglePhotosSession,
  type GooglePickedMediaItem,
  fetchGooglePhotos,
  getGoogleAccessToken,
  googlePhotosError,
  requireGooglePhotosAdmin,
} from "@/lib/google-photos";
import {
  copyGoogleMediaToPrivateBlob,
  deletePrivateMemoryBlob,
  getGoogleMemoryPathname,
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
};

type ImportedMemory = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "video";
  source: "google_photos";
  url: string;
};

function pollAfterMs(session: GooglePhotosSession) {
  const interval = session.pollingConfig?.pollInterval;
  const seconds = interval?.endsWith("s") ? Number(interval.slice(0, -1)) : NaN;
  return Number.isFinite(seconds) ? Math.max(1000, seconds * 1000) : 3000;
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

  return items.slice(0, 50);
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
    .select({ id: memories.id })
    .from(memories)
    .where(
      and(
        eq(memories.familyId, member.familyId),
        eq(memories.storageKey, item.pathname),
        eq(memories.status, "ready"),
        isNull(memories.deletedAt),
      ),
    )
    .limit(1);

  if (stored) {
    return { memory: toImportedMemory(stored.id, item), saved: false };
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

  try {
    const [saved] = legacy
      ? await db
          .update(memories)
          .set({
            originalName: item.name,
            mimeType: item.mimeType,
            kind: item.kind,
            storageKey: blob.pathname,
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
            originalName: item.name,
            mimeType: item.mimeType,
            storageKey: blob.pathname,
            status: "ready",
          })
          .returning({ id: memories.id });

    if (!saved) throw new Error("The permanent memory record was not created.");
    return { memory: toImportedMemory(saved.id, item), saved: true };
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
  const member = await requireGooglePhotosAdmin();
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
      });
    }

    const pickedItems = await listPickedItems(sessionId, accessToken);
    const candidates = pickedItems.flatMap((item) => {
      const file = item.mediaFile;
      if (!file?.baseUrl || !file.mimeType) return [];

      const kind: "image" | "video" =
        item.type === "VIDEO" || file.mimeType.startsWith("video/")
          ? "video"
          : "image";
      if (!file.mimeType.startsWith(`${kind}/`)) return [];

      const name = (file.filename || `google-photo-${item.id}`).slice(0, 240);
      return [
        {
          googleId: item.id,
          baseUrl: file.baseUrl,
          name,
          mimeType: file.mimeType.slice(0, 120),
          kind,
          pathname: getGoogleMemoryPathname(member.familyId, item.id, name),
        },
      ];
    });

    const { successes, failures } = await importInBatches(
      candidates,
      accessToken,
      member,
    );

    if (successes.length === 0 && failures.length > 0) {
      throw new Error(`No memories were saved. ${failures[0]}`);
    }

    if (failures.length === 0) {
      await deleteSession(sessionId, accessToken);
    }

    const saved = successes.filter((result) => result.saved).length;
    if (saved > 0) revalidatePath("/");

    return NextResponse.json({
      ready: true,
      imported: successes.map((result) => result.memory),
      saved,
      failed: failures.length,
    });
  } catch (error) {
    return googlePhotosError(
      error instanceof Error
        ? error.message
        : "Could not permanently import Google Photos.",
      502,
    );
  }
}
