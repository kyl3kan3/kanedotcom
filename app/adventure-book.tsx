"use client";

/* eslint-disable @next/next/no-img-element */

import {
  type ChangeEvent,
  type CSSProperties,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { MessageResponse } from "@/components/ai-elements/message";
import { NEXT_ADVENTURE_OPTIONS } from "@/lib/next-adventure";
import {
  completeTripQuiz,
  saveMemoryMetadata,
  voteNextAdventure,
} from "./actions";

type GeneratedMemory = {
  id: string;
  name: string;
  kind: "image" | "video";
  caption: string;
  url: string;
  capturedAt: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
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
  icon: string;
  photos: GeneratedMemory[];
  videos: GeneratedMemory[];
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

function formatTripDateRange(startAt: string | null, endAt: string | null) {
  if (!startAt) return "Date still being remembered";
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Date still being remembered";
  }
  const startLabel = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: FAMILY_TIME_ZONE,
  });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: FAMILY_TIME_ZONE,
  });
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function tripYear(startAt: string | null) {
  if (!startAt) return "DATE OPEN";
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return "DATE OPEN";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: FAMILY_TIME_ZONE,
  }).format(date);
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

function memoryCountAnswers(total: number, chapterIndex: number) {
  const candidates = [
    total,
    Math.max(1, total - (total > 3 ? 2 : 1)),
    total + (total > 8 ? 3 : 2),
  ];
  const answers = Array.from(new Set(candidates));
  for (let next = total + 1; answers.length < 3; next += 1) {
    if (!answers.includes(next)) answers.push(next);
  }
  const offset = chapterIndex % answers.length;
  return [...answers.slice(offset), ...answers.slice(0, offset)];
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
    caption: string;
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
  pollAfterMs?: number;
  timeoutAfterMs?: number;
  needsAuth?: boolean;
  authUrl?: string;
  imported?: ImportedMedia[];
  saved?: number;
  failed?: number;
  error?: string;
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

const voteOptions = NEXT_ADVENTURE_OPTIONS;

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
  const [photoIndex, setPhotoIndex] = useState(0);
  const [bookOpen, setBookOpen] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [stampedTrips, setStampedTrips] = useState(initialStampedTrips);
  const [lightbox, setLightbox] = useState<
    { src: string; alt: string; caption: string } | undefined
  >();
  const [importOpen, setImportOpen] = useState(false);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [organizerState, setOrganizerState] = useState<
    "idle" | "loading" | "analyzing" | "review" | "saving" | "done" | "error"
  >("idle");
  const [organizerMessage, setOrganizerMessage] = useState(
    "AI can turn capture dates and visual clues into trip chapter drafts.",
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
  const [googleStatus, setGoogleStatus] = useState<
    | "idle"
    | "ready"
    | "unconfigured"
    | "starting"
    | "picking"
    | "polling"
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
  const [votes, setVotes] = useState(() =>
    voteOptions.map((option) => initialVoteCounts[option.slug] ?? 0),
  );
  const [currentVote, setCurrentVote] = useState(initialCurrentVote);
  const [syncMessage, setSyncMessage] = useState("Neon synced");
  const [savedMetadataCount, setSavedMetadataCount] =
    useState(savedMemoryCount);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const featuredHeadingRef = useRef<HTMLHeadingElement>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const googlePollTimerRef = useRef<number | null>(null);
  const googlePollExpiryTimerRef = useRef<number | null>(null);
  const googlePollActiveSessionRef = useRef<string | null>(null);
  const bookTrips: BookTrip[] = generatedTrips.map((trip, index) => {
    const theme = tripThemes[index % tripThemes.length];
    return {
      ...trip,
      ...theme,
      photos: trip.memories.filter((memory) => memory.kind === "image"),
      videos: trip.memories.filter((memory) => memory.kind === "video"),
    };
  });
  const activeTrip =
    bookTrips.find((trip) => trip.id === activeTripId) ?? bookTrips[0] ?? null;
  const activeTripIndex = activeTrip
    ? Math.max(0, bookTrips.findIndex((trip) => trip.id === activeTrip.id))
    : 0;
  const quizAnswers = activeTrip
    ? memoryCountAnswers(activeTrip.memories.length, activeTripIndex)
    : [];
  const quizCorrect = Boolean(
    activeTrip && quizAnswer === activeTrip.memories.length,
  );
  const statisticMemories =
    importedMedia.length > 0 ? importedMedia : initialMemories;
  const photoCount = statisticMemories.filter(
    (memory) => memory.kind === "image",
  ).length;
  const videoCount = statisticMemories.length - photoCount;
  const chapterHeroPhotos = bookTrips.flatMap((trip) =>
    trip.photos.map((photo) => ({ ...photo, chapterTitle: trip.title })),
  );
  const chapterHeroPhotoIds = new Set(
    chapterHeroPhotos.map((photo) => photo.id),
  );
  const heroPhotos = [
    ...chapterHeroPhotos,
    ...statisticMemories
      .filter(
        (memory) =>
          memory.kind === "image" && !chapterHeroPhotoIds.has(memory.id),
      )
      .map((memory) => ({
        ...memory,
        caption: memory.name,
        chapterTitle: "Ready for a chapter",
      })),
  ];

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
      !importOpen ||
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
            "Google Photos is configured. Connect the admin account and choose up to 50 memories.",
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
  }, [googleStatus, importOpen, importView, isAdmin]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googlePhotos = params.get("googlePhotos");
    if (!googlePhotos) return;

    window.setTimeout(() => {
      setImportOpen(true);
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
    if (!lightbox && !importOpen && !organizerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightbox(undefined);
        setImportOpen(false);
        setOrganizerOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [lightbox, importOpen, organizerOpen]);

  const selectTrip = (tripId: string) => {
    setActiveTripId(tripId);
    setPhotoIndex(0);
    setQuizAnswer(null);
    requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      document.getElementById("featured-trip")?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
      featuredHeadingRef.current?.focus({ preventScroll: true });
    });
  };

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

  const answerQuiz = async (answer: number) => {
    if (!activeTrip) return;
    setQuizAnswer(answer);
    if (answer === activeTrip.memories.length) {
      const next = Array.from(new Set([...stampedTrips, activeTrip.id]));
      setStampedTrips(next);
    }

    setSyncMessage("Saving memory stamp…");
    try {
      const result = await completeTripQuiz(activeTrip.id, answer);
      if (result.correct) {
        setStampedTrips((current) =>
          Array.from(new Set([...current, activeTrip.id])),
        );
      }
      setSyncMessage("Memory stamp saved to Neon");
    } catch {
      setSyncMessage("Could not sync this stamp — please try again");
    }
  };

  const chooseFiles = () => fileInputRef.current?.click();

  const showOrganizerReview = (result: OrganizerResponse) => {
    const drafts = result.drafts ?? [];
    setTripDrafts(drafts);
    setOrganizerRunId(result.runId ?? null);
    setUnassignedMemoryCount(result.unassignedCount ?? 0);
    setApprovedDraftIds(new Set(drafts.map((draft) => draft.id)));
    if (drafts.length > 0) {
      setOrganizerState("review");
      setOrganizerMessage(
        `${drafts.length} trip draft${drafts.length === 1 ? " is" : "s are"} ready. Review them before adding anything to the book.`,
      );
    } else {
      setOrganizerState("idle");
      setOrganizerMessage(
        (result.unassignedCount ?? 0) > 0
          ? "Ready to read capture dates and visual clues from the unorganized memories."
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
      "Reading capture dates, comparing scenes, and writing private chapter drafts...",
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
    setPendingGoogleSession(null);
  };

  const pollGooglePhotosSession = (
    sessionId: string,
    delayMs = 3000,
    timeoutAfterMs?: number,
  ) => {
    const safeDelay = Math.min(30_000, Math.max(1000, delayMs));
    googlePollActiveSessionRef.current = sessionId;

    if (timeoutAfterMs && googlePollExpiryTimerRef.current === null) {
      googlePollExpiryTimerRef.current = window.setTimeout(() => {
        if (googlePollActiveSessionRef.current !== sessionId) return;
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
          "The Google Photos picker timed out. Start a new picker when you are ready.",
        );
      }, Math.max(1000, timeoutAfterMs));
    }

    if (googlePollTimerRef.current !== null) {
      window.clearTimeout(googlePollTimerRef.current);
    }

    googlePollTimerRef.current = window.setTimeout(async () => {
      googlePollTimerRef.current = null;
      try {
        const response = await fetch(
          `/api/photos/google/sessions/${encodeURIComponent(sessionId)}`,
        );
        const result = await readJsonResponse<GoogleImportResponse>(response);
        if (googlePollActiveSessionRef.current !== sessionId) return;

        if (response.status === 401 && result.authUrl) {
          stopGooglePhotosPolling();
          setGooglePickerUrl(null);
          window.location.href = result.authUrl;
          return;
        }

        if (!response.ok) {
          throw new Error(result.error ?? "Google Photos import failed.");
        }

        if (!result.ready) {
          setGoogleStatus("polling");
          setGoogleMessage("Waiting for Google Photos and preparing permanent private copies...");
          pollGooglePhotosSession(
            sessionId,
            result.pollAfterMs ?? 3000,
            result.timeoutAfterMs,
          );
          return;
        }

        const media = result.imported ?? [];
        const newlySaved = result.saved ?? media.length;
        const failed = result.failed ?? 0;
        if (media.length > 0) {
          setImportedMedia((current) => {
            const incomingIds = new Set(media.map((item) => item.id));
            return [...media, ...current.filter((item) => !incomingIds.has(item.id))];
          });
          setSavedMetadataCount((current) => current + newlySaved);
          setSyncMessage(`${media.length} Google memor${media.length === 1 ? "y" : "ies"} stored privately`);
          setGoogleMessage(
            `${media.length} Google Photos memor${media.length === 1 ? "y is" : "ies are"} permanently in the book.${failed > 0 ? ` ${failed} could not be copied; try those again.` : ""}`,
          );
          setImportView("choose");
          if (newlySaved > 0) {
            setImportOpen(false);
            void generateTripDrafts();
          }
        } else {
          setGoogleMessage("Google Photos finished, but no usable photos or videos were selected.");
        }
        stopGooglePhotosPolling();
        setGooglePickerUrl(null);
        setGoogleStatus("done");
      } catch (error) {
        if (googlePollActiveSessionRef.current !== sessionId) return;
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
      setGoogleMessage("Google Photos opened in a new tab. Pick the memories; the book will make private permanent copies.");
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
    const files = Array.from(event.target.files ?? []).filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/"),
    );
    event.target.value = "";
    if (files.length === 0) return;

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
    setImportedMedia((current) => [...media, ...current]);

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

  const castVote = async (slug: string) => {
    const previousVote = currentVote;
    const previousVotes = votes;

    setCurrentVote(slug);
    if (previousVote !== slug) {
      setVotes((current) =>
        current.map((vote, voteIndex) => {
          const optionSlug = voteOptions[voteIndex].slug;
          if (optionSlug === slug) return vote + 1;
          if (optionSlug === previousVote) return Math.max(0, vote - 1);
          return vote;
        }),
      );
    }

    setSyncMessage("Saving your family vote…");
    try {
      const result = await voteNextAdventure(slug);
      setCurrentVote(result.selected);
      setVotes(
        voteOptions.map(
          (option) => result.counts[option.slug] ?? 0,
        ),
      );
      setSyncMessage("Your vote is saved in Neon");
    } catch {
      setCurrentVote(previousVote);
      setVotes(previousVotes);
      setSyncMessage("Could not sync your vote — please try again");
    }
  };

  const clearImportedMedia = () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
    setImportedMedia([]);
  };

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
          <button className="add-memory-button" onClick={() => setImportOpen(true)}>
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
            <button className="text-button" onClick={() => setImportOpen(true)}>
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
              <b>{bookTrips[0] ? tripYear(bookTrips[0].startAt) : "READY"}</b>
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
                <img src={photo.url} alt={photo.caption} />
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
                  setImportOpen(true);
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
                  <img src={media.url} alt={media.name} loading="lazy" />
                  <figcaption>{media.name}</figcaption>
                </figure>
              ) : (
                <figure key={media.id}>
                  <video src={media.url} controls preload="metadata" />
                  <figcaption>{media.name}</figcaption>
                </figure>
              ),
            )}
          </div>
        </section>
      )}

      {generatedTrips.length > 0 && (
        <section className="generated-trips-section" id="family-trip-chapters">
          <div className="generated-trips-heading">
            <div>
              <span className="handwritten-label">approved by the family admin</span>
                <h2>Our real family chapter shelf</h2>
            </div>
            <p>
              Capture dates helped sort the moments. Every chapter here was
              reviewed by a family admin before it joined the book.
            </p>
          </div>
          <div className="generated-trip-grid">
            {generatedTrips.map((trip, tripIndex) => (
              <article className="generated-trip-card" key={trip.id}>
                <div className="generated-trip-card-topline">
                  <span>CHAPTER {String(tripIndex + 1).padStart(2, "0")}</span>
                  <time>{formatTripDateRange(trip.startAt, trip.endAt)}</time>
                </div>
                <MessageResponse className="generated-trip-title">
                  {trip.title}
                </MessageResponse>
                <MessageResponse className="generated-trip-summary">
                  {trip.summary}
                </MessageResponse>
                <div className="generated-trip-media">
                  {trip.memories.slice(0, 6).map((memory) => (
                    <figure key={memory.id}>
                      {memory.kind === "image" ? (
                        <img
                          src={memory.url}
                          alt={memory.caption}
                          loading="lazy"
                        />
                      ) : (
                        <video src={memory.url} controls preload="metadata" />
                      )}
                      <figcaption>
                        <MessageResponse>{memory.caption}</MessageResponse>
                      </figcaption>
                    </figure>
                  ))}
                </div>
                <button
                  className="open-chapter-button"
                  onClick={() => selectTrip(trip.id)}
                  aria-controls="featured-trip"
                >
                  Open this chapter <span aria-hidden="true">→</span>
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="map-section" id="adventure-map">
        <div className="section-heading map-heading">
          <div>
            <span className="handwritten-label">follow the dotted line</span>
            <h2>Our real<br />memory trail</h2>
          </div>
          <p>
            Every stop opens a chapter made from your family’s own photos. The
            trail follows when the memories happened—not pretend GPS coordinates.
          </p>
        </div>

        <div className="adventure-map">
          <span className="map-word word-west" aria-hidden="true">THEN</span>
          <span className="map-word word-home" aria-hidden="true">NOW</span>
          {bookTrips.length > 0 ? (
            <ol className="memory-trail" aria-label="Published family chapters">
              {bookTrips.map((trip, index) => {
                const cover = trip.photos[0];
                const active = activeTrip?.id === trip.id;
                return (
                  <li className={index % 2 === 0 ? "trail-high" : "trail-low"} key={trip.id}>
                    <button
                      className={`memory-stop ${active ? "active" : ""}`}
                      style={{ "--pin-color": trip.accent } as CSSProperties}
                      onClick={() => selectTrip(trip.id)}
                      aria-label={`Open ${trip.title}, ${trip.memories.length} memories from ${formatTripDateRange(trip.startAt, trip.endAt)}`}
                      aria-current={active ? "step" : undefined}
                      aria-controls="featured-trip"
                    >
                      <span className="memory-stop-number">STOP {String(index + 1).padStart(2, "0")}</span>
                      {cover ? (
                        <img className="memory-stop-cover" src={cover.url} alt="" />
                      ) : (
                        <span className="memory-stop-cover memory-stop-placeholder" aria-hidden="true">{trip.icon}</span>
                      )}
                      <span className="memory-stop-copy">
                        <small>{formatTripDateRange(trip.startAt, trip.endAt)} · {trip.memories.length} memories</small>
                        <b>{trip.title}</b>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="map-empty-state">
              <span aria-hidden="true">✦</span>
              <h3>The first stop is waiting for your family.</h3>
              <p>Add a few photos, then the admin can turn them into a real chapter.</p>
              {isAdmin && (
                <button className="primary-button" onClick={() => setImportOpen(true)}>
                  Add the first memories <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          )}
        </div>
      </section>

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
              <small>{tripYear(activeTrip.startAt)}</small>
            </div>
            <div>
              <div className="chapter-kicker">
                REAL CHAPTER {activeTripIndex + 1} · {formatTripDateRange(activeTrip.startAt, activeTrip.endAt)}
              </div>
              <h2 ref={featuredHeadingRef} tabIndex={-1}>{activeTrip.title}</h2>
              <MessageResponse className="trip-intro-story">
                {activeTrip.summary}
              </MessageResponse>
              <div className="chapter-facts">
                ✦ {activeTrip.memories.length} real memor{activeTrip.memories.length === 1 ? "y" : "ies"} · reviewed by the family admin
              </div>
            </div>
          </div>

          <div className="chapter-grid">
            <div className="photo-stack-wrap">
              {activeTrip.photos.length > 0 ? (
                <>
                  <div className="photo-stack">
                    {activeTrip.photos.map((photo, index) => {
                      const relative =
                        (index - photoIndex + activeTrip.photos.length) %
                        activeTrip.photos.length;
                      const positionClass =
                        relative <= 2
                          ? `stack-position-${relative}`
                          : "stack-position-hidden";
                      return (
                        <button
                          key={photo.id}
                          className={`stack-photo ${positionClass}`}
                          onClick={() =>
                            relative === 0
                              ? setLightbox({
                                  src: photo.url,
                                  alt: photo.caption,
                                  caption: photo.caption,
                                })
                              : setPhotoIndex(index)
                          }
                          aria-label={
                            relative === 0
                              ? `View full size: ${photo.caption}`
                              : `Show photo ${index + 1}: ${photo.caption}`
                          }
                          aria-hidden={relative !== 0}
                          tabIndex={relative === 0 ? 0 : -1}
                        >
                          <img
                            src={photo.url}
                            alt={relative === 0 ? photo.caption : ""}
                          />
                          <span>{photo.caption}</span>
                        </button>
                      );
                    })}
                  </div>
                  {activeTrip.photos.length > 1 && (
                    <div className="photo-controls">
                      <button
                        onClick={() =>
                          setPhotoIndex(
                            (photoIndex - 1 + activeTrip.photos.length) %
                              activeTrip.photos.length,
                          )
                        }
                        aria-label="Previous trip photo"
                      >
                        ←
                      </button>
                      <span>
                        PHOTO {photoIndex + 1} / {activeTrip.photos.length}
                      </span>
                      <button
                        onClick={() =>
                          setPhotoIndex(
                            (photoIndex + 1) % activeTrip.photos.length,
                          )
                        }
                        aria-label="Next trip photo"
                      >
                        →
                      </button>
                    </div>
                  )}
                  <p className="photo-live-status" role="status">
                    Showing photo {photoIndex + 1} of {activeTrip.photos.length}:{" "}
                    {activeTrip.photos[photoIndex]?.caption}
                  </p>
                </>
              ) : (
                <div className="chapter-media-empty">
                  <span aria-hidden="true">✦</span>
                  <p>This chapter has its story, but no still photos yet.</p>
                </div>
              )}
            </div>

            <div className="chapter-side">
              <div className="chapter-note-card">
                <span className="chapter-note-label">favorite details</span>
                <ul>
                  {activeTrip.memories.slice(0, 3).map((memory) => (
                    <li key={memory.id}>{memory.caption}</li>
                  ))}
                </ul>
              </div>
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
                    preload="metadata"
                    poster={activeTrip.photos[0]?.url}
                    aria-label={`${activeTrip.title} video memory`}
                    src={activeTrip.videos[0].url}
                  >
                    Your browser does not support this family video.
                  </video>
                  <p>
                    {activeTrip.videos[0].caption}
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
          <div className={`quiz-card ${quizCorrect ? "correct" : ""}`}>
            <div className="quiz-topline">
              <span>MEMORY NO. {activeTripIndex + 1}</span>
              <b>{activeTrip.icon} {shortenTitle(activeTrip.title, 28)}</b>
            </div>
            <h3>How many real memories are tucked into this chapter?</h3>
            <div className="quiz-answers" aria-describedby="quiz-result">
              {quizAnswers.map((answer, index) => (
                <button
                  key={answer}
                  onClick={() => answerQuiz(answer)}
                  className={
                    quizAnswer === answer ? (quizCorrect ? "right" : "wrong") : ""
                  }
                  disabled={quizCorrect}
                >
                  <span>{String.fromCharCode(65 + index)}</span>
                  {answer} memor{answer === 1 ? "y" : "ies"}
                </button>
              ))}
            </div>
            <div className="quiz-result" id="quiz-result" role="status">
              {quizAnswer === null
                ? "Count the photos and clips in this chapter."
                : quizCorrect
                  ? "✓ You counted every little moment. Stamp earned!"
                  : "Good guess—try one more count!"}
            </div>
            <small className="database-note">{syncMessage}</small>
            {quizCorrect && (
              <div className="earned-stamp" aria-hidden="true">
                MEMORY<br /><b>VERIFIED</b>
              </div>
            )}
          </div>
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
      <section className="next-adventure">
        <div className="postmark" aria-hidden="true">FAMILY MAIL<br /><b>NEXT</b></div>
        <div className="next-copy">
          <span className="handwritten-label">the next chapter...</span>
          <h2>Where to next?</h2>
          <p>Every signed-in family explorer gets one real vote. Changing your mind updates the same ballot.</p>
        </div>
        <div className="vote-options">
          {voteOptions.map((option, index) => (
            <button
              key={option.slug}
              className={currentVote === option.slug ? "selected" : ""}
              onClick={() => castVote(option.slug)}
              aria-pressed={currentVote === option.slug}
            >
              <span aria-hidden="true">{option.emoji}</span>
              <b>{option.place}</b>
              <small>{votes[index]} family vote{votes[index] === 1 ? "" : "s"}</small>
              <i>{currentVote === option.slug ? "✓" : "＋"}</i>
            </button>
          ))}
        </div>
      </section>

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

      {lightbox && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setLightbox(undefined)}>
          <div className="lightbox" role="dialog" aria-modal="true" aria-label="Trip photo" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setLightbox(undefined)} aria-label="Close photo">×</button>
            <img src={lightbox.src} alt={lightbox.alt} />
            <p>{lightbox.caption}</p>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setImportOpen(false)}>
          <div className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setImportOpen(false)} aria-label="Close memory importer">×</button>
            <span className="handwritten-label">make it yours</span>
            <h2 id="import-title">Add family memories</h2>
            <p className="import-lede">Choose photos and videos from the device in your hand, or connect Google Photos for private permanent copies. {savedMetadataCount} selections are already recorded for this family.</p>

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
                    <small>{isAdmin ? "Admins pick exactly which Google Photos items to share." : "Google Photos importing is admin-only for now."}</small>
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
                {importedMedia.length > 0 && (
                  <div className="import-preview">
                    <div><b>Your family memory shelf</b><button onClick={clearImportedMedia}>Hide previews</button></div>
                    <div className="import-grid">
                      {importedMedia.map((media) => media.kind === "image" ? (
                        <figure key={media.id}><img src={media.url} alt={media.name} loading="lazy" /><figcaption>{media.name}</figcaption></figure>
                      ) : (
                        <figure key={media.id}><video src={media.url} controls preload="metadata" /><figcaption>{media.name}</figcaption></figure>
                      ))}
                    </div>
                    <p>Google Photos memories are stored permanently in private Vercel Blob storage and reload with the book. Device-only previews remain in this browser session.</p>
                  </div>
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
                  <li><span>2</span><div><b>Choose memories in Google Photos</b><small>Pick up to 50 at a time. The secure picker closes when selection is done.</small></div></li>
                  <li><span>3</span><div><b>Selected items join the book</b><small>Private Vercel Blob copies hold the files; Neon keeps their family records.</small></div></li>
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
                        googleStatus === "polling"
                      }
                    >
                      {googleStatus === "idle"
                        ? "Checking Google setup..."
                        : googleStatus === "unconfigured"
                          ? "Google setup needed"
                          : googleStatus === "starting" || googleStatus === "picking" || googleStatus === "polling"
                            ? "Waiting for Google Photos..."
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
      )}

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
                    <div><b>Read safe metadata</b><small>Capture dates, dimensions, and file details</small></div>
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
                  The AI can suggest dates, titles, groupings, and kid-friendly
                  captions. It does not publish or identify anyone.
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
                              <img key={memory.id} src={memory.url} alt="" loading="lazy" />
                            ) : (
                              <span key={memory.id}>▶</span>
                            ),
                          )}
                        </div>
                        <div className="trip-draft-meta">
                          <span>{draft.memories.length} memories</span>
                          <time>{formatTripDateRange(draft.startAt, draft.endAt)}</time>
                        </div>
                        <MessageResponse className="trip-draft-title">
                          {draft.title}
                        </MessageResponse>
                        <MessageResponse className="trip-draft-summary">
                          {draft.summary}
                        </MessageResponse>
                        <div className="trip-draft-caption-samples">
                          {draft.memories.slice(0, 2).map((memory) => (
                            <MessageResponse key={memory.id}>
                              {memory.caption}
                            </MessageResponse>
                          ))}
                        </div>
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
