"use client";

/* eslint-disable @next/next/no-img-element */

import {
  type ChangeEvent,
  type CSSProperties,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { FeaturedPhotoStack } from "./featured-photo-stack";
import { GeneratedTripsSection } from "./generated-trips-section";
import {
  ImportDialogGate,
  type ImportDialogGateHandle,
} from "./import-dialog-gate";
import { ImportPreviewGrid } from "./import-preview-grid";
import { MemoryTrailSection } from "./memory-trail-section";
import { NextAdventureVote } from "./next-adventure-vote";
import {
  PhotoGalleryDialog,
  type PhotoGalleryDialogHandle,
  type PhotoGallerySource,
} from "./photo-gallery-dialog";
import { TripQuizCard } from "./trip-quiz-card";
import { saveMemoryMetadata } from "./actions";

type GeneratedMemory = {
  id: string;
  kind: "image" | "video";
  url: string;
  durationMs: number | null;
};

type GeneratedTrip = {
  id: string;
  title: string;
  summary: string;
  startAt: string | null;
  endAt: string | null;
  memories: GeneratedMemory[];
};

type BookTrip = GeneratedTrip & {
  accent: string;
  accentSoft: string;
  dateLabel: string;
  icon: string;
  photos: GeneratedMemory[];
  videos: GeneratedMemory[];
  yearLabel: string;
};

type FamilyCrewMember = {
  id: string;
  displayName: string;
  role: "owner" | "adult" | "child";
  memoryCount: number;
  stampCount: number;
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("application/json")) {
    if (response.redirected || response.url.includes("/auth/")) {
      throw new Error(
        "Your family session expired. Refresh the page and sign in again.",
      );
    }

    throw new Error(
      "The family server returned an unexpected response. Please try again.",
    );
  }

  return (await response.json()) as T;
}

const FAMILY_TIME_ZONE = "America/Chicago";
const TRIP_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: FAMILY_TIME_ZONE,
});
const TRIP_YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  timeZone: FAMILY_TIME_ZONE,
});

function formatTripDateRange(startAt: string | null, endAt: string | null) {
  if (!startAt) return "Date still being remembered";
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Date still being remembered";
  }
  const startLabel = TRIP_DATE_FORMATTER.format(start);
  const endLabel = TRIP_DATE_FORMATTER.format(end);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function tripYear(startAt: string | null) {
  if (!startAt) return "DATE OPEN";
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return "DATE OPEN";
  return TRIP_YEAR_FORMATTER.format(date);
}

function shortenTitle(title: string, maximum = 28) {
  const clean = title.trim();
  return clean.length <= maximum
    ? clean
    : `${clean.slice(0, maximum - 1).trimEnd()}…`;
}

function formatDuration(durationMs: number | null) {
  if (!durationMs || durationMs < 1_000) return "short clip";
  const totalSeconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function familyMemoryAlt(chapterTitle?: string) {
  return chapterTitle
    ? `Family memory from ${chapterTitle}`
    : "Private family memory";
}

function crewPresentation(member: FamilyCrewMember, index: number) {
  const colors = ["coral", "blue", "green"] as const;
  const roleDetails = {
    owner: { title: "Adventure Book Keeper", icon: "✦" },
    adult: { title: "Family Memory Maker", icon: "📷" },
    child: { title: "Junior Explorer", icon: "🧭" },
  } as const;
  return {
    color: colors[index % colors.length],
    ...roleDetails[member.role],
  };
}

const tripThemes = [
  { accent: "#ef6a5b", accentSoft: "#ffe1d9", icon: "✦" },
  { accent: "#ffd166", accentSoft: "#fff0bd", icon: "☀" },
  { accent: "#4faf83", accentSoft: "#dceee2", icon: "★" },
  { accent: "#3a86ff", accentSoft: "#dceafb", icon: "➤" },
] as const;

type ImportedMedia = {
  id: string;
  name: string;
  url: string;
  kind: "image" | "video";
  mimeType: string;
  source?: "device" | "google_photos";
};

type GoogleSessionResponse = {
  id?: string;
  pickerUri?: string;
  pollAfterMs?: number;
  timeoutAfterMs?: number;
  needsAuth?: boolean;
  authUrl?: string;
  configured?: boolean;
  missing?: string[];
  issues?: string[];
  redirectUri?: string;
  error?: string;
};

type TripDraft = {
  id: string;
  runId: string;
  title: string;
  summary: string;
  startAt: string | null;
  endAt: string | null;
  memories: Array<{
    id: string;
    kind: "image" | "video";
    url: string;
  }>;
};

type OrganizerResponse = {
  runId?: string | null;
  drafts?: TripDraft[];
  unassignedCount?: number;
  error?: string;
};

type OrganizerApplyResponse = {
  created?: number;
  tripIds?: string[];
  error?: string;
};

type GoogleImportResponse = {
  ready?: boolean;
  importing?: boolean;
  final?: boolean;
  finalized?: boolean;
  pollAfterMs?: number;
  timeoutAfterMs?: number;
  needsAuth?: boolean;
  authUrl?: string;
  imported?: ImportedMedia[];
  saved?: number;
  failed?: number;
  skipped?: number;
  processed?: number;
  nextPageToken?: string | null;
  retryable?: boolean;
  retryAfterMs?: number;
  error?: string;
};

type GoogleImportProgress = {
  pageToken?: string;
  imported: ImportedMedia[];
  saved: number;
  failed: number;
  skipped: number;
  processed: number;
  retryCount: number;
};

type AdventureBookProps = {
  memberName: string;
  memberRole: string;
  isAdmin: boolean;
  initialStampedTrips: string[];
  initialVoteCounts: Record<string, number>;
  initialCurrentVote: string | null;
  initialMemories: ImportedMedia[];
  generatedTrips: GeneratedTrip[];
  familyCrew: FamilyCrewMember[];
  savedMemoryCount: number;
};

const DEVICE_IMPORT_LIMIT = 50;

export default function AdventureBook({
  memberName,
  memberRole,
  isAdmin,
  initialStampedTrips,
  initialVoteCounts,
  initialCurrentVote,
  initialMemories,
  generatedTrips,
  familyCrew,
  savedMemoryCount,
}: AdventureBookProps) {
  const [activeTripId, setActiveTripId] = useState<string | null>(
    generatedTrips[0]?.id ?? null,
  );
  const [bookOpen, setBookOpen] = useState(false);
  const [stampedTrips, setStampedTrips] = useState(initialStampedTrips);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [organizerState, setOrganizerState] = useState<
    "idle" | "loading" | "analyzing" | "review" | "saving" | "done" | "error"
  >("idle");
  const [organizerMessage, setOrganizerMessage] = useState(
    "AI can group capture dates while the family calendar supplies exact holiday context.",
  );
  const [tripDrafts, setTripDrafts] = useState<TripDraft[]>([]);
  const [organizerRunId, setOrganizerRunId] = useState<string | null>(null);
  const [unassignedMemoryCount, setUnassignedMemoryCount] = useState(
    initialMemories.length,
  );
  const [approvedDraftIds, setApprovedDraftIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [importView, setImportView] = useState<"choose" | "google">("choose");
  const [importedMedia, setImportedMedia] =
    useState<ImportedMedia[]>(initialMemories);
  const [deviceImportMessage, setDeviceImportMessage] = useState("");
  const [googleStatus, setGoogleStatus] = useState<
    | "idle"
    | "ready"
    | "unconfigured"
    | "starting"
    | "picking"
    | "polling"
    | "importing"
    | "done"
    | "error"
  >("idle");
  const [googleMessage, setGoogleMessage] = useState(
    "Connect your private Google Photos picker to choose memories.",
  );
  const [googlePickerUrl, setGooglePickerUrl] = useState<string | null>(null);
  const [pendingGoogleSession, setPendingGoogleSession] = useState<{
    id: string;
    pollAfterMs: number;
    timeoutAfterMs: number;
  } | null>(null);
  const [syncMessage, setSyncMessage] = useState("Neon synced");
  const [savedMetadataCount, setSavedMetadataCount] =
    useState(savedMemoryCount);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const featuredHeadingRef = useRef<HTMLHeadingElement>(null);
  const activeTripIdRef = useRef(activeTripId);
  const importDialogRef = useRef<ImportDialogGateHandle>(null);
  const photoGalleryRef = useRef<PhotoGalleryDialogHandle>(null);
  const openPhotoGallery = useCallback(
    (
      sources: readonly PhotoGallerySource[],
      selectedId: string,
      label: string,
    ) => photoGalleryRef.current?.open(sources, selectedId, label),
    [],
  );
  const objectUrlsRef = useRef<string[]>([]);
  const googlePollTimerRef = useRef<number | null>(null);
  const googlePollExpiryTimerRef = useRef<number | null>(null);
  const googlePollActiveSessionRef = useRef<string | null>(null);
  const googlePollRequestInFlightRef = useRef(false);

  const bookTrips: BookTrip[] = useMemo(
    () =>
      generatedTrips.map((trip, index) => {
        const theme = tripThemes[index % tripThemes.length];
        return {
          ...trip,
          ...theme,
          dateLabel: formatTripDateRange(trip.startAt, trip.endAt),
          photos: trip.memories.filter((memory) => memory.kind === "image"),
          videos: trip.memories.filter((memory) => memory.kind === "video"),
          yearLabel: tripYear(trip.startAt),
        };
      }),
    [generatedTrips],
  );
  const activeTrip = useMemo(
    () =>
      bookTrips.find((trip) => trip.id === activeTripId) ??
      bookTrips[0] ??
      null,
    [activeTripId, bookTrips],
  );
  const activeTripIndex = activeTrip
    ? Math.max(0, bookTrips.findIndex((trip) => trip.id === activeTrip.id))
    : 0;
  const { photoCount, videoCount, shelfPhotos, heroPhotos } = useMemo(() => {
    const statisticMemories =
      importedMedia.length > 0 ? importedMedia : initialMemories;
    const nextPhotoCount = statisticMemories.filter(
      (memory) => memory.kind === "image",
    ).length;
    const nextShelfPhotos = importedMedia.filter(
      (memory) => memory.kind === "image",
    );
    const chapterHeroPhotos = bookTrips.flatMap((trip) =>
      trip.photos.map((photo) => ({ ...photo, chapterTitle: trip.title })),
    );
    const chapterHeroPhotoIds = new Set(
      chapterHeroPhotos.map((photo) => photo.id),
    );

    return {
      photoCount: nextPhotoCount,
      videoCount: statisticMemories.length - nextPhotoCount,
      shelfPhotos: nextShelfPhotos,
      heroPhotos: [
        ...chapterHeroPhotos,
        ...statisticMemories
          .filter(
            (memory) =>
              memory.kind === "image" &&
              !chapterHeroPhotoIds.has(memory.id),
          )
          .map((memory) => ({
            ...memory,
            chapterTitle: "Ready for a chapter",
          })),
      ],
    };
  }, [bookTrips, importedMedia, initialMemories]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      if (googlePollTimerRef.current !== null) {
        window.clearTimeout(googlePollTimerRef.current);
      }
      if (googlePollExpiryTimerRef.current !== null) {
        window.clearTimeout(googlePollExpiryTimerRef.current);
      }
      googlePollActiveSessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      importView !== "google" ||
      !isAdmin ||
      googleStatus !== "idle"
    ) {
      return;
    }

    let cancelled = false;
    void fetch("/api/photos/google/status", { cache: "no-store" })
      .then(async (response) => {
        const result = await readJsonResponse<GoogleSessionResponse>(response);
        if (cancelled) return;

        if (response.ok && result.configured) {
          setGoogleStatus("ready");
          setGoogleMessage(
            "Google Photos is configured. Connect the admin account and choose up to 500 memories.",
          );
          return;
        }

        const details = [...(result.missing ?? []), ...(result.issues ?? [])];
        setGoogleStatus("unconfigured");
        setGoogleMessage(
          details.length > 0
            ? `Setup needed in Vercel: ${details.join(", ")}`
            : result.error ?? "Google Photos still needs its Google Cloud OAuth setup.",
        );
      })
      .catch(() => {
        if (cancelled) return;
        setGoogleStatus("error");
        setGoogleMessage("Could not check the Google Photos connection.");
      });

    return () => {
      cancelled = true;
    };
  }, [googleStatus, importView, isAdmin]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googlePhotos = params.get("googlePhotos");
    if (!googlePhotos) return;

    window.setTimeout(() => {
      setDeviceImportMessage("");
      importDialogRef.current?.open();
      setImportView("google");
      if (googlePhotos === "ready") {
        setGoogleStatus("ready");
        setGoogleMessage("Google Photos is connected. Start the picker to choose trip memories.");
      } else if (googlePhotos === "setup") {
        setGoogleStatus("unconfigured");
        setGoogleMessage(
          "Google Photos needs a Web OAuth client and callback URL configured in Vercel.",
        );
      } else {
        setGoogleStatus("error");
        setGoogleMessage("Google Photos did not connect. Try again from the admin account.");
      }
    }, 0);

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.hash}`,
    );
  }, []);

  useEffect(() => {
    if (!organizerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.querySelector("[data-photo-gallery-open]")) return;
        setOrganizerOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [organizerOpen]);

  const selectTrip = useCallback((tripId: string) => {
    activeTripIdRef.current = tripId;
    setActiveTripId(tripId);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        document.getElementById("featured-trip")?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start",
        });
        featuredHeadingRef.current?.focus({ preventScroll: true });
      });
    });
  }, []);

  const surpriseMe = useCallback(() => {
    if (bookTrips.length === 0) return;
    const currentId = activeTripIdRef.current ?? bookTrips[0]?.id ?? "family";
    const currentIndex = Math.max(
      0,
      bookTrips.findIndex((trip) => trip.id === currentId),
    );
    const chapterSeed = Array.from(currentId).reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    );
    const offset =
      bookTrips.length > 1 ? 1 + (chapterSeed % (bookTrips.length - 1)) : 0;
    const nextTrip = bookTrips[(currentIndex + offset) % bookTrips.length];
    selectTrip(nextTrip.id);
  }, [bookTrips, selectTrip]);

  const openBook = () => {
    setBookOpen(true);
    window.setTimeout(() => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      document
        .getElementById(bookTrips.length > 0 ? "adventure-map" : "memory-shelf")
        ?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start",
        });
    }, 480);
  };

  const recordTripStamp = useCallback((tripId: string) => {
    setStampedTrips((current) =>
      current.includes(tripId) ? current : [...current, tripId],
    );
  }, []);

  const chooseFiles = () => fileInputRef.current?.click();

  const openMemoryImporter = useCallback(() => {
    importDialogRef.current?.open();
  }, []);

  const showOrganizerReview = (result: OrganizerResponse) => {
    const drafts = result.drafts ?? [];
    const draftedMemoryCount = drafts.reduce(
      (total, draft) => total + draft.memories.length,
      0,
    );
    const queuedForLater = Math.max(
      0,
      (result.unassignedCount ?? 0) - draftedMemoryCount,
    );
    setTripDrafts(drafts);
    setOrganizerRunId(result.runId ?? null);
    setUnassignedMemoryCount(result.unassignedCount ?? 0);
    setApprovedDraftIds(new Set(drafts.map((draft) => draft.id)));
    if (drafts.length > 0) {
      setOrganizerState("review");
      setOrganizerMessage(
        `${drafts.length} trip draft${drafts.length === 1 ? " is" : "s are"} ready from ${draftedMemoryCount} memor${draftedMemoryCount === 1 ? "y" : "ies"}. Review them before adding anything to the book.${queuedForLater > 0 ? ` ${queuedForLater} more will stay safely queued for the next AI review after you approve this batch.` : ""}`,
      );
    } else {
      setOrganizerState("idle");
      setOrganizerMessage(
        (result.unassignedCount ?? 0) > 0
          ? "Ready to group the unorganized memories by capture date and known holiday context."
          : "Every permanent memory is already in a trip chapter.",
      );
    }
  };

  const openOrganizer = async () => {
    if (!isAdmin) return;
    setOrganizerOpen(true);
    setOrganizerState("loading");
    setOrganizerMessage("Checking for saved trip drafts...");
    try {
      const response = await fetch("/api/memories/organize", {
        cache: "no-store",
      });
      const result = await readJsonResponse<OrganizerResponse>(response);
      if (!response.ok) throw new Error(result.error ?? "Could not open the organizer.");
      showOrganizerReview(result);
    } catch (error) {
      setOrganizerState("error");
      setOrganizerMessage(
        error instanceof Error ? error.message : "Could not open the organizer.",
      );
    }
  };

  const generateTripDrafts = async () => {
    if (!isAdmin) return;
    setOrganizerOpen(true);
    setOrganizerState("analyzing");
    setOrganizerMessage(
      "Reading capture dates, checking the family holiday calendar, and preparing private chapter groups...",
    );
    try {
      const response = await fetch("/api/memories/organize", { method: "POST" });
      const result = await readJsonResponse<OrganizerResponse>(response);
      if (!response.ok) {
        throw new Error(result.error ?? "The AI organizer could not finish.");
      }
      showOrganizerReview(result);
    } catch (error) {
      setOrganizerState("error");
      setOrganizerMessage(
        error instanceof Error
          ? error.message
          : "The AI organizer could not finish. Nothing was published.",
      );
    }
  };

  const toggleDraftApproval = (draftId: string) => {
    setApprovedDraftIds((current) => {
      const next = new Set(current);
      if (next.has(draftId)) next.delete(draftId);
      else next.add(draftId);
      return next;
    });
  };

  const applyTripDrafts = async () => {
    if (!organizerRunId || approvedDraftIds.size === 0) return;
    setOrganizerState("saving");
    setOrganizerMessage(
      `Creating ${approvedDraftIds.size} approved trip chapter${approvedDraftIds.size === 1 ? "" : "s"}...`,
    );
    try {
      const response = await fetch("/api/memories/organize/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: organizerRunId,
          approvedDraftIds: [...approvedDraftIds],
        }),
      });
      const result = await readJsonResponse<OrganizerApplyResponse>(response);
      if (!response.ok) {
        throw new Error(result.error ?? "The approved trips could not be created.");
      }
      setOrganizerState("done");
      setOrganizerMessage(
        `${result.created ?? approvedDraftIds.size} new trip chapter${(result.created ?? approvedDraftIds.size) === 1 ? " is" : "s are"} now in the family book.`,
      );
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      setOrganizerState("error");
      setOrganizerMessage(
        error instanceof Error
          ? error.message
          : "The approved trips could not be created.",
      );
    }
  };

  const stopGooglePhotosPolling = () => {
    if (googlePollTimerRef.current !== null) {
      window.clearTimeout(googlePollTimerRef.current);
    }
    if (googlePollExpiryTimerRef.current !== null) {
      window.clearTimeout(googlePollExpiryTimerRef.current);
    }
    googlePollTimerRef.current = null;
    googlePollExpiryTimerRef.current = null;
    googlePollActiveSessionRef.current = null;
    googlePollRequestInFlightRef.current = false;
    setPendingGoogleSession(null);
  };

  const googlePhotosRetryDelay = (
    retryCount: number,
    suggestedDelayMs = 0,
  ) =>
    Math.min(
      8000,
      Math.max(suggestedDelayMs, 1000 * 2 ** retryCount),
    );

  const finalizeGooglePhotosSession = async (sessionId: string) => {
    for (let attempt = 0; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(
          `/api/photos/google/sessions/${encodeURIComponent(sessionId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ finalize: true }),
          },
        );
        const result = await readJsonResponse<GoogleImportResponse>(response);
        if (response.ok && result.finalized) return true;
        if (response.ok) return false;
        if (response.status < 500 && response.status !== 429) return false;
      } catch {
        // A short retry can finish cleanup after a transient network failure.
      }

      if (attempt < 3) {
        await new Promise<void>((resolve) => {
          window.setTimeout(
            resolve,
            googlePhotosRetryDelay(attempt),
          );
        });
      }
    }

    return false;
  };

  const pollGooglePhotosSession = (
    sessionId: string,
    delayMs = 3000,
    timeoutAfterMs?: number,
    progress: GoogleImportProgress = {
      imported: [],
      saved: 0,
      failed: 0,
      skipped: 0,
      processed: 0,
      retryCount: 0,
    },
  ) => {
    const safeDelay =
      progress.retryCount > 0
        ? Math.min(8000, Math.max(500, delayMs))
        : progress.pageToken
          ? Math.min(1000, Math.max(100, delayMs))
          : Math.min(30_000, Math.max(1000, delayMs));
    googlePollActiveSessionRef.current = sessionId;

    const retryCurrentPage = (
      reason: string,
      suggestedDelayMs = 0,
      nextProgress: GoogleImportProgress = progress,
    ) => {
      if (progress.retryCount >= 3) return false;
      const retryCount = progress.retryCount + 1;
      const retryDelayMs = googlePhotosRetryDelay(
        progress.retryCount,
        suggestedDelayMs,
      );
      setGoogleStatus(
        nextProgress.processed > 0 || nextProgress.imported.length > 0
          ? "importing"
          : "polling",
      );
      setGoogleMessage(
        `${reason} Retrying this batch (${retryCount}/3)...`,
      );
      pollGooglePhotosSession(
        sessionId,
        retryDelayMs,
        timeoutAfterMs,
        { ...nextProgress, retryCount },
      );
      return true;
    };

    if (timeoutAfterMs && googlePollExpiryTimerRef.current === null) {
      const expireGooglePhotosSession = () => {
        if (googlePollActiveSessionRef.current !== sessionId) return;
        if (googlePollRequestInFlightRef.current) {
          googlePollExpiryTimerRef.current = window.setTimeout(
            expireGooglePhotosSession,
            5 * 60 * 1000,
          );
          return;
        }
        if (googlePollTimerRef.current !== null) {
          window.clearTimeout(googlePollTimerRef.current);
        }
        googlePollTimerRef.current = null;
        googlePollExpiryTimerRef.current = null;
        googlePollActiveSessionRef.current = null;
        setPendingGoogleSession(null);
        setGooglePickerUrl(null);
        setGoogleStatus("error");
        setGoogleMessage(
          progress.processed > 0
            ? `The Google Photos import paused after ${progress.processed} selected memories. The copies already saved are safe; start a new picker to continue.`
            : "The Google Photos picker timed out. Start a new picker when you are ready.",
        );
      };
      googlePollExpiryTimerRef.current = window.setTimeout(
        expireGooglePhotosSession,
        Math.max(1000, timeoutAfterMs),
      );
    }

    if (googlePollTimerRef.current !== null) {
      window.clearTimeout(googlePollTimerRef.current);
    }

    googlePollTimerRef.current = window.setTimeout(async () => {
      googlePollTimerRef.current = null;
      googlePollRequestInFlightRef.current = true;
      try {
        const response = await fetch(
          `/api/photos/google/sessions/${encodeURIComponent(sessionId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pageToken: progress.pageToken ?? null }),
          },
        );
        const result = await readJsonResponse<GoogleImportResponse>(response);
        googlePollRequestInFlightRef.current = false;
        if (googlePollActiveSessionRef.current !== sessionId) return;

        if (response.status === 401 && result.authUrl) {
          stopGooglePhotosPolling();
          setGooglePickerUrl(null);
          window.location.href = result.authUrl;
          return;
        }

        if (!response.ok) {
          const retryAfterSeconds = Number(
            response.headers.get("Retry-After"),
          );
          const retryAfterMs =
            result.retryAfterMs ??
            (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
              ? retryAfterSeconds * 1000
              : 0);
          const canRetry =
            result.retryable ||
            response.status === 408 ||
            response.status === 429 ||
            response.status >= 500;
          const partialMedia = result.imported ?? [];
          const retryMedia = [...progress.imported];
          const retryIds = new Set(retryMedia.map((item) => item.id));
          for (const item of partialMedia) {
            if (retryIds.has(item.id)) continue;
            retryIds.add(item.id);
            retryMedia.push(item);
          }
          const retryProgress = {
            ...progress,
            imported: retryMedia,
            saved: progress.saved + (result.saved ?? 0),
          };
          if (
            canRetry &&
            retryCurrentPage(
              result.error ?? "Google Photos paused this batch.",
              retryAfterMs,
              retryProgress,
            )
          ) {
            return;
          }

          stopGooglePhotosPolling();
          setGooglePickerUrl(null);
          setGoogleStatus("error");
          setGoogleMessage(result.error ?? "Google Photos import failed.");
          return;
        }

        if (!result.ready) {
          setGoogleStatus("polling");
          setGoogleMessage("Waiting for Google Photos and preparing permanent private copies...");
          pollGooglePhotosSession(
            sessionId,
            result.pollAfterMs ?? 3000,
            result.timeoutAfterMs,
            { ...progress, retryCount: 0 },
          );
          return;
        }

        const batchMedia = result.imported ?? [];
        const accumulatedMedia = [...progress.imported];
        const accumulatedIds = new Set(
          accumulatedMedia.map((item) => item.id),
        );
        for (const item of batchMedia) {
          if (accumulatedIds.has(item.id)) continue;
          accumulatedIds.add(item.id);
          accumulatedMedia.push(item);
        }

        const batchSaved = result.saved ?? batchMedia.length;
        const batchFailed = result.failed ?? 0;
        const batchSkipped = result.skipped ?? 0;
        const accumulatedProgress: GoogleImportProgress = {
          pageToken: result.nextPageToken ?? undefined,
          imported: accumulatedMedia,
          saved: progress.saved + batchSaved,
          failed: progress.failed + batchFailed,
          skipped: progress.skipped + batchSkipped,
          processed:
            progress.processed +
            (result.processed ??
              batchMedia.length + batchFailed + batchSkipped),
          retryCount: 0,
        };

        if (result.nextPageToken) {
          setGoogleStatus("importing");
          setGoogleMessage(
            `Selected Google media is streaming server-to-server into private permanent copies... ${accumulatedProgress.processed} processed, ${accumulatedProgress.imported.length} ready for the book${accumulatedProgress.skipped > 0 ? `, ${accumulatedProgress.skipped} skipped` : ""}.`,
          );

          if (googlePollExpiryTimerRef.current !== null) {
            window.clearTimeout(googlePollExpiryTimerRef.current);
            googlePollExpiryTimerRef.current = null;
          }
          pollGooglePhotosSession(
            sessionId,
            150,
            Math.max(result.timeoutAfterMs ?? 0, 30 * 60 * 1000),
            accumulatedProgress,
          );
          return;
        }

        let finalized = true;
        if (result.final) {
          setGoogleStatus("importing");
          setGoogleMessage(
            `Finishing the private import... ${accumulatedProgress.processed} selected memories processed.`,
          );
          finalized = await finalizeGooglePhotosSession(sessionId);
          if (googlePollActiveSessionRef.current !== sessionId) return;
        }
        const finalizeWarning = finalized
          ? ""
          : " Google’s temporary picker session could not be closed immediately and will expire automatically.";

        const media = accumulatedProgress.imported;
        const newlySaved = accumulatedProgress.saved;
        const failed = accumulatedProgress.failed;
        const skipped = accumulatedProgress.skipped;
        const processed = accumulatedProgress.processed;
        if (media.length > 0) {
          startTransition(() => {
            setImportedMedia((current) => {
              const incomingIds = new Set(media.map((item) => item.id));
              return [
                ...media,
                ...current.filter((item) => !incomingIds.has(item.id)),
              ];
            });
            setSavedMetadataCount((current) => current + newlySaved);
          });
          setSyncMessage(`${processed} Google memor${processed === 1 ? "y" : "ies"} processed privately`);
          setGoogleMessage(
            `${processed} Google Photos memor${processed === 1 ? "y was" : "ies were"} processed, with ${media.length} permanently available in the book.${failed > 0 ? ` ${failed} could not be copied; try those again.` : ""}${skipped > 0 ? ` ${skipped} unsupported ${skipped === 1 ? "item was" : "items were"} skipped.` : ""}${finalizeWarning}`,
          );
          setImportView("choose");
          importDialogRef.current?.close();
          void generateTripDrafts();
        } else {
          setGoogleMessage(
            processed > 0
              ? `Google Photos finished, but none of the ${processed} selected items could be added.${skipped > 0 ? ` ${skipped} unsupported ${skipped === 1 ? "item was" : "items were"} skipped.` : " Try those items again."}${finalizeWarning}`
              : `Google Photos finished, but no usable photos or videos were selected.${finalizeWarning}`,
          );
        }
        stopGooglePhotosPolling();
        setGooglePickerUrl(null);
        setGoogleStatus("done");
      } catch (error) {
        googlePollRequestInFlightRef.current = false;
        if (googlePollActiveSessionRef.current !== sessionId) return;
        if (
          retryCurrentPage(
            "The connection to Google Photos was interrupted.",
          )
        ) {
          return;
        }
        stopGooglePhotosPolling();
        setGooglePickerUrl(null);
        setGoogleStatus("error");
        setGoogleMessage(error instanceof Error ? error.message : "Google Photos import failed.");
      }
    }, safeDelay);
  };

  const startGooglePhotosImport = async () => {
    if (!isAdmin) return;

    const pickerWindow = window.open(
      "about:blank",
      "family-google-photos",
      "popup,width=980,height=760",
    );

    setGooglePickerUrl(null);
    setPendingGoogleSession(null);
    setGoogleStatus("starting");
    setGoogleMessage("Starting a private Google Photos picker session...");

    try {
      const response = await fetch("/api/photos/google/session", {
        method: "POST",
      });
      const result = await readJsonResponse<GoogleSessionResponse>(response);

      if (response.status === 401 && result.authUrl) {
        pickerWindow?.close();
        window.location.href = result.authUrl;
        return;
      }

      if (!response.ok || !result.id || !result.pickerUri) {
        pickerWindow?.close();
        throw new Error(result.error ?? "Could not start Google Photos.");
      }

      setGoogleStatus("picking");
      setGoogleMessage("Google Photos opened in a new tab. Pick up to 500 memories; selected media will stream server-to-server into private permanent copies.");
      if (pickerWindow && !pickerWindow.closed) {
        pickerWindow.location.href = result.pickerUri;
        googlePollExpiryTimerRef.current = null;
        googlePollActiveSessionRef.current = null;
        pollGooglePhotosSession(
          result.id,
          result.pollAfterMs ?? 3000,
          result.timeoutAfterMs ?? 10 * 60 * 1000,
        );
      } else {
        setGooglePickerUrl(result.pickerUri);
        setPendingGoogleSession({
          id: result.id,
          pollAfterMs: result.pollAfterMs ?? 3000,
          timeoutAfterMs: result.timeoutAfterMs ?? 10 * 60 * 1000,
        });
        setGoogleMessage(
          "Your browser blocked the popup. Use the manual button below, then finish choosing in Google Photos.",
        );
      }
    } catch (error) {
      pickerWindow?.close();
      stopGooglePhotosPolling();
      setGooglePickerUrl(null);
      setGoogleStatus("error");
      setGoogleMessage(error instanceof Error ? error.message : "Could not start Google Photos.");
    }
  };

  const onFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files: File[] = [];
    let supportedFileCount = 0;
    for (const file of event.target.files ?? []) {
      if (
        !file.type.startsWith("image/") &&
        !file.type.startsWith("video/")
      ) {
        continue;
      }
      supportedFileCount += 1;
      if (files.length < DEVICE_IMPORT_LIMIT) files.push(file);
    }
    event.target.value = "";
    if (files.length === 0) {
      setDeviceImportMessage("No supported photos or videos were selected.");
      return;
    }

    const skippedCount = supportedFileCount - files.length;
    setDeviceImportMessage(
      skippedCount > 0
        ? `${files.length} memories selected. ${skippedCount} extra ${skippedCount === 1 ? "file was" : "files were"} skipped to keep importing responsive.`
        : `${files.length} ${files.length === 1 ? "memory is" : "memories are"} ready to preview.`,
    );

    const media: ImportedMedia[] = files.map((file, index) => {
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.push(url);
      return {
        id: `${file.name}-${file.lastModified}-${index}`,
        name: file.name,
        url,
        kind: file.type.startsWith("video/") ? "video" : "image",
        mimeType: file.type,
        source: "device",
      };
    });
    startTransition(() => {
      setImportedMedia((current) => [...media, ...current]);
    });

    setSyncMessage("Recording selected memories…");
    try {
      const result = await saveMemoryMetadata(
        media.map(({ name, mimeType, kind }) => ({ name, mimeType, kind })),
      );
      setSavedMetadataCount((current) => current + result.saved);
      setSyncMessage(`${result.saved} memor${result.saved === 1 ? "y" : "ies"} recorded in Neon`);
    } catch {
      setSyncMessage("Previews are ready, but their details did not sync");
    }
  };

  const clearImportedMedia = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
    setImportedMedia([]);
  }, []);

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Our family adventure book home">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <span>Our Family</span>
          <small>ADVENTURE BOOK</small>
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#adventure-map">Trip map</a>
          <a href="#featured-trip">Stories</a>
          {importedMedia.length > 0 && <a href="#memory-shelf">Memory shelf</a>}
          <a href="#challenge">Memory game</a>
        </nav>
        <div className="topbar-actions">
          <span className="sync-status" aria-live="polite">● {syncMessage}</span>
          <Link className="account-pill" href="/account/settings" title="Open family account settings">
            <span aria-hidden="true">{memberName.charAt(0).toUpperCase()}</span>
            <b>{memberName}<small>{memberRole}</small></b>
          </Link>
          <button className="add-memory-button" onClick={openMemoryImporter}>
            <span aria-hidden="true">＋</span> Add memories
          </button>
        </div>
      </header>

      <section className={`hero ${bookOpen ? "book-is-open" : ""}`} id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span>EST. FOREVER</span><i />
            {savedMetadataCount} REAL MEMORIES
          </div>
          <h1>Our great big<br /><em>adventure book</em></h1>
          <p>
            Places we went. Things we tried. Stories we never want to forget.
            Open the suitcase and follow the real chapters we have made together.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={openBook}
              aria-expanded={bookOpen}
            >
              {bookOpen ? "The adventure is open" : "Open our adventure"}
              <span aria-hidden="true">↗</span>
            </button>
            <button className="text-button" onClick={openMemoryImporter}>
              Add your photos <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="hero-note" aria-hidden="true">
            <span>↳</span> best explored together
          </div>
        </div>

        <div className="suitcase-scene" aria-label="A scrapbook collage of family adventures">
          <div className="sun-doodle" aria-hidden="true">☀</div>
          <div className="suitcase-lid">
            <span className="sticker sticker-one">
              {bookTrips[0] ? shortenTitle(bookTrips[0].title, 18).toUpperCase() : "FIRST CHAPTER"}
              <br />
              <b>{bookTrips[0]?.yearLabel ?? "READY"}</b>
            </span>
            <span className="sticker sticker-two">REAL<br />MEMORIES</span>
            <span className="sticker sticker-three">★</span>
          </div>
          <div className="suitcase-base">
            <div className="suitcase-handle" />
            <div className="suitcase-clasp left" />
            <div className="suitcase-clasp right" />
            <span className="suitcase-label">FAMILY<br />CARRY-ON</span>
          </div>
          <div className="photo-fan" aria-hidden={!bookOpen}>
            {heroPhotos.slice(0, 3).map((photo, index) => (
              <figure
                className={`fan-photo ${["fan-one", "fan-two", "fan-three"][index]}`}
                key={photo.id}
              >
                <img
                  src={photo.url}
                  alt={familyMemoryAlt(photo.chapterTitle)}
                  decoding="async"
                />
                <figcaption>{shortenTitle(photo.chapterTitle, 19).toUpperCase()}</figcaption>
              </figure>
            ))}
          </div>
          <div className="paper-plane" aria-hidden="true">➤</div>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div>
          <span>★</span> {bookTrips.length} REAL CHAPTERS <span>★</span> {photoCount} PHOTOS <span>★</span> {videoCount} VIDEOS <span>★</span> ENDLESS SNACKS
          <span>★</span> {bookTrips.length} REAL CHAPTERS <span>★</span> {photoCount} PHOTOS <span>★</span> {videoCount} VIDEOS <span>★</span> ENDLESS SNACKS
        </div>
      </div>

      {importedMedia.length > 0 && (
        <section className="memory-shelf-section" id="memory-shelf">
          <div className="memory-shelf-heading">
            <div>
              <span className="handwritten-label">fresh from the camera roll</span>
              <h2>Our family memory shelf</h2>
              <p>
                {importedMedia.length} private memor{importedMedia.length === 1 ? "y" : "ies"} safely tucked into the family book.
              </p>
            </div>
            <div className="memory-shelf-actions">
              {isAdmin && (
                <button
                  className="ai-organize-button"
                  data-testid="organize-memories"
                  onClick={openOrganizer}
                >
                  <span aria-hidden="true">✨</span> Organize with AI
                </button>
              )}
              <button
                className="text-button"
                onClick={() => {
                  setImportView("choose");
                  openMemoryImporter();
                }}
              >
                Open all memories <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
          <div className="memory-shelf-grid">
            {importedMedia.slice(0, 8).map((media) =>
              media.kind === "image" ? (
                <figure key={media.id}>
                  <button
                    type="button"
                    className="memory-preview-button"
                    onClick={() =>
                      photoGalleryRef.current?.open(
                        shelfPhotos,
                        media.id,
                        "Our family memory shelf",
                      )
                    }
                    aria-label={`Open photo ${shelfPhotos.findIndex((photo) => photo.id === media.id) + 1} of ${shelfPhotos.length} from the family memory shelf`}
                  >
                    <img
                      src={media.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                    />
                    <span className="photo-open-badge" aria-hidden="true">
                      ↗
                    </span>
                  </button>
                </figure>
              ) : (
                <figure key={media.id}>
                  <video
                    src={media.url}
                    aria-label="Private family video"
                    controls
                    preload="none"
                  />
                </figure>
              ),
            )}
          </div>
        </section>
      )}

      <GeneratedTripsSection
        trips={bookTrips}
        onOpenGallery={openPhotoGallery}
        onSelectTrip={selectTrip}
        onSurprise={surpriseMe}
      />

      <MemoryTrailSection
        activeTripId={activeTrip?.id ?? null}
        isAdmin={isAdmin}
        onOpenImporter={openMemoryImporter}
        onSelectTrip={selectTrip}
        trips={bookTrips}
      />

      {activeTrip && (
        <section
          className="featured-trip"
          id="featured-trip"
          style={{
            "--trip-accent": activeTrip.accent,
            "--trip-soft": activeTrip.accentSoft,
          } as CSSProperties}
        >
          <div className="trip-number" aria-hidden="true">
            {String(activeTripIndex + 1).padStart(2, "0")}
          </div>
          <div className="trip-intro">
            <div className="passport-stamp">
              <span aria-hidden="true">{activeTrip.icon}</span>
              <b>{shortenTitle(activeTrip.title, 22)}</b>
              <small>{activeTrip.yearLabel}</small>
            </div>
            <div>
              <div className="chapter-kicker">
                REAL CHAPTER {activeTripIndex + 1} · {activeTrip.dateLabel}
              </div>
              <h2 ref={featuredHeadingRef} tabIndex={-1}>{activeTrip.title}</h2>
              <p className="trip-intro-story">{activeTrip.summary}</p>
              <div className="chapter-facts">
                ✦ {activeTrip.memories.length} real memor{activeTrip.memories.length === 1 ? "y" : "ies"} · reviewed by the family admin
              </div>
            </div>
          </div>

          <div className="chapter-grid">
            <FeaturedPhotoStack
              key={activeTrip.id}
              chapterTitle={activeTrip.title}
              photos={activeTrip.photos}
              onOpenGallery={openPhotoGallery}
            />

            <div className="chapter-side">
              <div className="trip-stats" aria-label="Chapter media counts">
                <div>
                  <span aria-hidden="true">✦</span>
                  <b>{activeTrip.memories.length}</b>
                  <small>MEMORIES</small>
                </div>
                <div>
                  <span aria-hidden="true">▣</span>
                  <b>{activeTrip.photos.length}</b>
                  <small>PHOTOS</small>
                </div>
                <div>
                  <span aria-hidden="true">▶</span>
                  <b>{activeTrip.videos.length}</b>
                  <small>VIDEOS</small>
                </div>
              </div>
              {activeTrip.videos[0] && (
                <div className="video-postcard">
                  <div className="video-label"><span>▶</span> REAL MOVING MEMORY</div>
                  <video
                    key={activeTrip.videos[0].id}
                    controls
                    playsInline
                    preload="none"
                    poster={activeTrip.photos[0]?.url}
                    aria-label={`${activeTrip.title} video memory`}
                    src={activeTrip.videos[0].url}
                  >
                    Your browser does not support this family video.
                  </video>
                  <p>
                    <span>{formatDuration(activeTrip.videos[0].durationMs)}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      {activeTrip && activeTrip.memories.length > 0 && (
        <section className="challenge-section" id="challenge">
          <div className="challenge-copy">
            <span className="handwritten-label">passport check!</span>
            <h2>Think you<br />remember?</h2>
            <p>
              Earn a real stamp for every chapter you count correctly. Progress
              is saved for your family profile.
            </p>
            <ol
              className="passport-progress"
              aria-label={`${stampedTrips.length} of ${bookTrips.length} memory stamps earned`}
            >
              {bookTrips.map((trip) => {
                const earned = stampedTrips.includes(trip.id);
                return (
                  <li
                    key={trip.id}
                    className={earned ? "earned" : ""}
                    aria-label={`${trip.title}: stamp ${earned ? "earned" : "not earned"}`}
                  >
                    <span aria-hidden="true">{earned ? trip.icon : "?"}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <TripQuizCard
            key={activeTrip.id}
            tripId={activeTrip.id}
            chapterTitle={activeTrip.title}
            chapterIcon={activeTrip.icon}
            chapterIndex={activeTripIndex}
            memoryCount={activeTrip.memories.length}
            onStampEarned={recordTripStamp}
          />
        </section>
      )}
      <section className="tour-guides" id="family-crew">
        <div className="section-heading">
          <div>
            <span className="handwritten-label">meet the real crew</span>
            <h2>Our family<br />explorers</h2>
          </div>
          <p>
            These badges belong to the active people in your private family
            book. Their memory and passport totals come straight from Neon.
          </p>
        </div>
        <div className="guide-grid">
          {familyCrew.map((member, index) => {
            const presentation = crewPresentation(member, index);
            return (
              <article
                className={`guide-card ${presentation.color}`}
                key={member.id}
              >
                <div className="guide-number">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="guide-avatar">
                  <span>{member.displayName.charAt(0).toUpperCase()}</span>
                  <i aria-hidden="true">{presentation.icon}</i>
                </div>
                <h3>{member.displayName}</h3>
                <p>{presentation.title}</p>
                <dl className="guide-stats">
                  <div>
                    <dt>Memories</dt>
                    <dd>{member.memoryCount}</dd>
                  </div>
                  <div>
                    <dt>Stamps</dt>
                    <dd>{member.stampCount}</dd>
                  </div>
                </dl>
                <Link href="/account/settings">
                  {isAdmin ? "Manage family" : "View my account"} <span>↗</span>
                </Link>
              </article>
            );
          })}
        </div>
      </section>
      <NextAdventureVote
        initialVoteCounts={initialVoteCounts}
        initialCurrentVote={initialCurrentVote}
      />

      <footer className="site-footer">
        <div className="footer-plane" aria-hidden="true">➤</div>
        <p>
          Dear future us: {bookTrips.length} chapter{bookTrips.length === 1 ? "" : "s"}, {savedMetadataCount} little moment{savedMetadataCount === 1 ? "" : "s"},<br />and one family story still growing.
        </p>
        <div>
          <span>Made for the people we love most.</span>
          <button
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "auto"
                  : "smooth",
              })
            }
          >
            BACK TO THE COVER ↑
          </button>
        </div>
      </footer>

      <PhotoGalleryDialog ref={photoGalleryRef} />

      <ImportDialogGate ref={importDialogRef}>
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={() => importDialogRef.current?.close()}
        >
          <div className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => importDialogRef.current?.close()} aria-label="Close memory importer">×</button>
            <span className="handwritten-label">make it yours</span>
            <h2 id="import-title">Add family memories</h2>
            <p className="import-lede">Choose photos and videos from the device in your hand, or let selected Google Photos media stream server-to-server into private permanent copies. {savedMetadataCount} selections are already recorded for this family.</p>

            {importView === "choose" ? (
              <>
                {googleStatus === "done" && (
                  <div className="import-success" role="status">
                    <b>Memories unpacked!</b>
                    <span>{googleMessage}</span>
                  </div>
                )}
                <div className="import-options">
                  <button onClick={chooseFiles}>
                    <span className="import-icon apple-icon" aria-hidden="true">♥</span>
                    <b>Apple Photos / device</b>
                    <small>Opens the secure photo chooser on iPhone, iPad, Mac, Android, or PC.</small>
                    <i>Choose media →</i>
                  </button>
                  <button
                    onClick={() => setImportView("google")}
                    disabled={!isAdmin}
                    aria-disabled={!isAdmin}
                  >
                    <span className="import-icon google-icon" aria-hidden="true"><i /><i /><i /><i /></span>
                    <b>Google Photos</b>
                    <small>{isAdmin ? "Admins can pick up to 500 Google Photos items at once." : "Google Photos importing is admin-only for now."}</small>
                    <i>{isAdmin ? "Open picker →" : "Admin only"}</i>
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={onFilesSelected}
                />
                {deviceImportMessage && (
                  <p className="device-import-status" role="status">
                    {deviceImportMessage}
                  </p>
                )}
                {importedMedia.length > 0 && (
                  <ImportPreviewGrid
                    key={importedMedia[0]?.id}
                    media={importedMedia}
                    onClear={clearImportedMedia}
                  />
                )}
              </>
            ) : (
              <div className="google-setup">
                <button className="back-button" onClick={() => setImportView("choose")}>← Back</button>
                <div className="google-badge"><span /><span /><span /><span /></div>
                <h3>{isAdmin ? "Pick from Google Photos" : "Admin Google Photos"}</h3>
                <p>{googleMessage}</p>
                <ol>
                  <li><span>1</span><div><b>Admin connects Google</b><small>OAuth asks only for the Photos Picker permission.</small></div></li>
                  <li><span>2</span><div><b>Choose memories in Google Photos</b><small>Pick up to 500 at a time. The secure picker closes when selection is done.</small></div></li>
                  <li><span>3</span><div><b>Selected items join the book</b><small>Selected media streams server-to-server into private permanent Vercel Blob copies; Neon keeps the family records.</small></div></li>
                </ol>
                {isAdmin ? (
                  <div className="google-picker-actions">
                    <button
                      className="primary-button"
                      onClick={startGooglePhotosImport}
                      disabled={
                        googleStatus === "idle" ||
                        googleStatus === "unconfigured" ||
                        googleStatus === "starting" ||
                        googleStatus === "picking" ||
                        googleStatus === "polling" ||
                        googleStatus === "importing"
                      }
                    >
                      {googleStatus === "idle"
                        ? "Checking Google setup..."
                        : googleStatus === "unconfigured"
                          ? "Google setup needed"
                          : googleStatus === "starting" || googleStatus === "picking" || googleStatus === "polling" || googleStatus === "importing"
                            ? googleStatus === "importing"
                              ? "Importing Google Photos..."
                              : "Waiting for Google Photos..."
                            : googleStatus === "ready"
                              ? "Open Google Photos picker"
                              : "Connect and pick memories"}
                      <span aria-hidden="true">→</span>
                    </button>
                    {googlePickerUrl && (
                      <a
                        className="primary-button google-picker-fallback"
                        href={googlePickerUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          if (!pendingGoogleSession) return;
                          setGooglePickerUrl(null);
                          setPendingGoogleSession(null);
                          setGoogleStatus("polling");
                          setGoogleMessage(
                            "Waiting for your Google Photos selection and preparing private copies...",
                          );
                          pollGooglePhotosSession(
                            pendingGoogleSession.id,
                            pendingGoogleSession.pollAfterMs,
                            pendingGoogleSession.timeoutAfterMs,
                          );
                        }}
                      >
                        Open picker manually <span aria-hidden="true">↗</span>
                      </a>
                    )}
                  </div>
                ) : (
                  <button className="primary-button" onClick={chooseFiles}>Use this device instead <span>→</span></button>
                )}
              </div>
            )}
          </div>
        </div>
      </ImportDialogGate>

      {organizerOpen && (
        <div
          className="dialog-backdrop organizer-backdrop"
          role="presentation"
          onMouseDown={() => setOrganizerOpen(false)}
        >
          <div
            className="organizer-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="organizer-title"
            aria-busy={
              organizerState === "loading" ||
              organizerState === "analyzing" ||
              organizerState === "saving"
            }
            data-testid="memory-organizer"
            data-state={organizerState}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="dialog-close"
              onClick={() => setOrganizerOpen(false)}
              aria-label="Close AI memory organizer"
            >
              ×
            </button>
            <span className="handwritten-label">admin memory workshop</span>
            <div className="organizer-heading">
              <div>
                <h2 id="organizer-title">Turn photos into trip chapters</h2>
                <p
                  data-testid="organizer-status"
                  role={organizerState === "error" ? "alert" : "status"}
                >
                  {organizerMessage}
                </p>
              </div>
              <span className="organizer-privacy-seal">
                PRIVATE
                <small>ADMIN REVIEW</small>
              </span>
            </div>

            {(organizerState === "loading" ||
              organizerState === "analyzing" ||
              organizerState === "saving") && (
              <div className="organizer-working">
                <div className="organizer-spark" aria-hidden="true">✦</div>
                <ol>
                  <li className={organizerState === "analyzing" ? "active" : ""}>
                    <span>1</span>
                    <div><b>Read safe metadata</b><small>Capture dates, known holidays, dimensions, and file details</small></div>
                  </li>
                  <li className={organizerState === "analyzing" ? "active" : ""}>
                    <span>2</span>
                    <div><b>Compare small previews</b><small>512px working images, never public Blob links</small></div>
                  </li>
                  <li className={organizerState === "saving" ? "active" : ""}>
                    <span>3</span>
                    <div><b>{organizerState === "saving" ? "Create approved chapters" : "Write review drafts"}</b><small>Nothing appears until the admin approves it</small></div>
                  </li>
                </ol>
              </div>
            )}

            {organizerState === "idle" && (
              <div className="organizer-empty">
                <span aria-hidden="true">🗂️</span>
                <h3>
                  {unassignedMemoryCount > 0
                    ? `${unassignedMemoryCount} memories are ready to sort`
                    : "The shelf is already organized"}
                </h3>
                <p>
                  The organizer uses capture dates, exact holiday dates, and
                  small previews to suggest neutral chapter groupings. It does
                  not write a description for every photo, publish, or identify
                  anyone.
                </p>
                <button
                  className="primary-button"
                  onClick={generateTripDrafts}
                  disabled={unassignedMemoryCount === 0}
                >
                  Make private trip drafts <span aria-hidden="true">→</span>
                </button>
              </div>
            )}

            {organizerState === "review" && (
              <>
                <div className="trip-draft-grid">
                  {tripDrafts.map((draft) => {
                    const approved = approvedDraftIds.has(draft.id);
                    return (
                      <article
                        className={`trip-draft-card ${approved ? "approved" : "skipped"}`}
                        key={draft.id}
                        data-testid="trip-suggestion"
                        data-suggestion-id={draft.id}
                        data-review-state={approved ? "approved" : "skipped"}
                      >
                        <div className="trip-draft-collage" aria-hidden="true">
                          {draft.memories.slice(0, 3).map((memory) =>
                            memory.kind === "image" ? (
                              <img key={memory.id} src={memory.url} alt="" loading="lazy" decoding="async" />
                            ) : (
                              <span key={memory.id}>▶</span>
                            ),
                          )}
                        </div>
                        <div className="trip-draft-meta">
                          <span>{draft.memories.length} memories</span>
                          <time>{formatTripDateRange(draft.startAt, draft.endAt)}</time>
                        </div>
                        <h3 className="trip-draft-title">{draft.title}</h3>
                        <p className="trip-draft-summary">{draft.summary}</p>
                        <button
                          className="draft-review-button"
                          onClick={() => toggleDraftApproval(draft.id)}
                          aria-pressed={approved}
                        >
                          {approved ? "✓ Approved for the book" : "Skipped — undo"}
                        </button>
                      </article>
                    );
                  })}
                </div>
                <div className="organizer-review-actions">
                  <button className="text-button" onClick={generateTripDrafts}>
                    Regenerate drafts
                  </button>
                  <button
                    className="primary-button"
                    data-testid="create-approved-trips"
                    onClick={applyTripDrafts}
                    disabled={approvedDraftIds.size === 0}
                  >
                    Create {approvedDraftIds.size || "no"} approved trip
                    {approvedDraftIds.size === 1 ? "" : "s"}
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </>
            )}

            {organizerState === "error" && (
              <div className="organizer-error">
                <span aria-hidden="true">✎</span>
                <p>All original memories are safe and unchanged.</p>
                <button className="primary-button" onClick={generateTripDrafts}>
                  Try the organizer again <span aria-hidden="true">→</span>
                </button>
              </div>
            )}

            {organizerState === "done" && (
              <div className="organizer-done">
                <span aria-hidden="true">★</span>
                <h3>Fresh chapters added!</h3>
                <p>The book is reopening with the approved trips now.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
