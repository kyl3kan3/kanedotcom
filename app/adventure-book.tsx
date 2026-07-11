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
import { useRouter } from "next/navigation";
import { MessageResponse } from "@/components/ai-elements/message";
import { NEXT_ADVENTURE_OPTIONS } from "@/lib/next-adventure";
import {
  completeTripQuiz,
  saveMemoryMetadata,
  voteNextAdventure,
} from "./actions";

type GeneratedMemory = {
  id: string;
  kind: "image" | "video";
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

type GallerySource = {
  id: string;
  kind: "image" | "video";
  url: string;
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

function familyMemoryAlt(chapterTitle?: string) {
  return chapterTitle
    ? `Family memory from ${chapterTitle}`
    : "Private family memory";
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

const voteOptions = NEXT_ADVENTURE_OPTIONS;

const DIALOG_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function manageDialogFocus(dialog: HTMLElement | null) {
  if (!dialog) return;

  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const focusables = () =>
    Array.from(dialog.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR));
  window.requestAnimationFrame(() => {
    focusables()[0]?.focus({ preventScroll: true });
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const items = focusables();
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", onKeyDown);

  return () => {
    document.removeEventListener("keydown", onKeyDown);
    document.body.style.overflow = previousOverflow;
    previouslyFocused?.focus({ preventScroll: true });
  };
}

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
  const router = useRouter();
  const [activeTripId, setActiveTripId] = useState<string | null>(
    generatedTrips[0]?.id ?? null,
  );
  const [photoIndex, setPhotoIndex] = useState(0);
  const [bookOpen, setBookOpen] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [stampedTrips, setStampedTrips] = useState(initialStampedTrips);
  const [gallery, setGallery] = useState<GalleryState>();
  const [importOpen, setImportOpen] = useState(false);
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
  const [googleProgress, setGoogleProgress] = useState<{
    processed: number;
    ready: number;
    failed: number;
    skipped: number;
  } | null>(null);
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
  const [tickerPaused, setTickerPaused] = useState(false);
  const [savedMetadataCount, setSavedMetadataCount] =
    useState(savedMemoryCount);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileNavRef = useRef<HTMLDetailsElement>(null);
  const importDialogRef = useRef<HTMLDivElement>(null);
  const organizerDialogRef = useRef<HTMLDivElement>(null);
  const featuredHeadingRef = useRef<HTMLHeadingElement>(null);
  const galleryDialogRef = useRef<HTMLDivElement>(null);
  const galleryCloseRef = useRef<HTMLButtonElement>(null);
  const galleryReturnFocusRef = useRef<HTMLElement | null>(null);
  const galleryPointerStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const googlePollTimerRef = useRef<number | null>(null);
  const googlePollExpiryTimerRef = useRef<number | null>(null);
  const googlePollActiveSessionRef = useRef<string | null>(null);
  const googlePollRequestInFlightRef = useRef(false);
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
  const shelfPhotos = importedMedia.filter(
    (memory) => memory.kind === "image",
  );
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
        chapterTitle: "Ready for a chapter",
      })),
  ];

  const openGallery = (
    sources: GallerySource[],
    selectedId: string,
    label: string,
  ) => {
    const images = sources.filter((source) => source.kind === "image");
    const items = images.map((source, imageIndex) => ({
      id: source.id,
      src: source.url,
      alt: `${
        label === "Our family memory shelf"
          ? familyMemoryAlt()
          : familyMemoryAlt(label)
      } (photo ${imageIndex + 1} of ${images.length})`,
    }));
    if (items.length === 0) return;

    const selectedIndex = items.findIndex((item) => item.id === selectedId);
    galleryReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setGallery({
      items,
      index: selectedIndex >= 0 ? selectedIndex : 0,
      label,
    });
  };

  const stepGallery = (direction: -1 | 1) => {
    setGallery((current) => {
      if (!current || current.items.length < 2) return current;
      return {
        ...current,
        index:
          (current.index + direction + current.items.length) %
          current.items.length,
      };
    });
  };

  const closeGallery = () => {
    setGallery(undefined);
    window.requestAnimationFrame(() => {
      galleryReturnFocusRef.current?.focus({ preventScroll: true });
    });
  };

  const galleryIsOpen = Boolean(gallery);
  const shelfPreviewCount = importedMedia.filter(
    (media) => media.source === "device",
  ).length;
  const shelfSavedCount = importedMedia.length - shelfPreviewCount;

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
    if (!galleryIsOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => galleryCloseRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [galleryIsOpen]);

  useEffect(() => {
    if (!importOpen) return;
    return manageDialogFocus(importDialogRef.current);
  }, [importOpen]);

  useEffect(() => {
    if (!organizerOpen) return;
    return manageDialogFocus(organizerDialogRef.current);
  }, [organizerOpen]);

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
    if (!gallery && !importOpen && !organizerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (gallery) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          setGallery((current) => {
            if (!current || current.items.length < 2) return current;
            return {
              ...current,
              index:
                (current.index + direction + current.items.length) %
                current.items.length,
            };
          });
          return;
        }

        if (event.key === "Tab") {
          const focusable = Array.from(
            galleryDialogRef.current?.querySelectorAll<HTMLElement>(
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
      }

      if (event.key === "Escape") {
        if (gallery) {
          event.preventDefault();
          setGallery(undefined);
          window.requestAnimationFrame(() => {
            galleryReturnFocusRef.current?.focus({ preventScroll: true });
          });
          return;
        }
        setImportOpen(false);
        setOrganizerOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [gallery, importOpen, organizerOpen]);

  const closeMobileNav = () => {
    mobileNavRef.current?.removeAttribute("open");
  };

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

  const surpriseMe = () => {
    if (bookTrips.length === 0) return;
    const currentId = activeTrip?.id ?? "family";
    const chapterSeed = Array.from(currentId).reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    );
    const offset =
      bookTrips.length > 1 ? 1 + (chapterSeed % (bookTrips.length - 1)) : 0;
    const nextTrip = bookTrips[(activeTripIndex + offset) % bookTrips.length];
    selectTrip(nextTrip.id);
  };

  const openBook = () => {
    setBookOpen(true);
    window.setTimeout(() => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      document
        .getElementById(
          bookTrips.length === 0 && importedMedia.length > 0
            ? "memory-shelf"
            : "adventure-map",
        )
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
      setTripDrafts([]);
      setOrganizerRunId(null);
      router.refresh();
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
    setGoogleProgress(null);
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
          setGoogleProgress({
            processed: accumulatedProgress.processed,
            ready: accumulatedProgress.imported.length,
            failed: accumulatedProgress.failed,
            skipped: accumulatedProgress.skipped,
          });

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
          setGoogleProgress({
            processed: accumulatedProgress.processed,
            ready: accumulatedProgress.imported.length,
            failed: accumulatedProgress.failed,
            skipped: accumulatedProgress.skipped,
          });
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
          setImportedMedia((current) => {
            const incomingIds = new Set(media.map((item) => item.id));
            return [...media, ...current.filter((item) => !incomingIds.has(item.id))];
          });
          setSavedMetadataCount((current) => current + newlySaved);
          setSyncMessage(`${processed} Google memor${processed === 1 ? "y" : "ies"} processed privately`);
          setGoogleMessage(
            `${processed} Google Photos memor${processed === 1 ? "y was" : "ies were"} processed, with ${media.length} permanently available in the book.${failed > 0 ? ` ${failed} could not be copied; try those again.` : ""}${skipped > 0 ? ` ${skipped} unsupported ${skipped === 1 ? "item was" : "items were"} skipped.` : ""}${finalizeWarning}`,
          );
          setImportView("choose");
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
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to the book
      </a>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Our family adventure book home">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <span>Our Family</span>
          <small>ADVENTURE BOOK</small>
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#adventure-map">Trip map</a>
          {activeTrip && <a href="#featured-trip">Stories</a>}
          {importedMedia.length > 0 && <a href="#memory-shelf">Memory shelf</a>}
          {activeTrip && activeTrip.memories.length > 0 && (
            <a href="#challenge">Memory game</a>
          )}
        </nav>
        <div className="topbar-actions">
          <span className="sync-status" aria-live="polite">● {syncMessage}</span>
          <Link
            className="account-pill"
            href="/account/settings"
            aria-label={`Open family account settings for ${memberName}`}
            title="Open family account settings"
          >
            <span aria-hidden="true">{memberName.charAt(0).toUpperCase()}</span>
            <b>{memberName}<small>{memberRole}</small></b>
          </Link>
          <button className="add-memory-button" onClick={() => setImportOpen(true)}>
            <span aria-hidden="true">＋</span> Add memories
          </button>
          <details className="mobile-nav" ref={mobileNavRef}>
            <summary aria-label="Open the section menu">
              <span aria-hidden="true">☰</span>
            </summary>
            <nav className="mobile-nav-panel" aria-label="Sections">
              <a href="#adventure-map" onClick={closeMobileNav}>Trip map</a>
              {activeTrip && (
                <a href="#featured-trip" onClick={closeMobileNav}>Stories</a>
              )}
              {importedMedia.length > 0 && (
                <a href="#memory-shelf" onClick={closeMobileNav}>Memory shelf</a>
              )}
              {activeTrip && activeTrip.memories.length > 0 && (
                <a href="#challenge" onClick={closeMobileNav}>Memory game</a>
              )}
              <Link href="/account/settings" onClick={closeMobileNav}>
                Account settings
              </Link>
            </nav>
          </details>
        </div>
      </header>

      <main id="main-content">
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

        <div className="suitcase-scene">
          <p className="visually-hidden">
            A scrapbook collage of family adventures.
          </p>
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
                <img src={photo.url} alt={familyMemoryAlt(photo.chapterTitle)} />
                <figcaption>{shortenTitle(photo.chapterTitle, 19).toUpperCase()}</figcaption>
              </figure>
            ))}
          </div>
          <div className="paper-plane" aria-hidden="true">➤</div>
        </div>
      </section>

      <div className={`ticker ${tickerPaused ? "ticker-paused" : ""}`}>
        <div aria-hidden="true">
          <span>★</span> {bookTrips.length} REAL CHAPTERS <span>★</span> {photoCount} PHOTOS <span>★</span> {videoCount} VIDEOS <span>★</span> ENDLESS SNACKS
          <span>★</span> {bookTrips.length} REAL CHAPTERS <span>★</span> {photoCount} PHOTOS <span>★</span> {videoCount} VIDEOS <span>★</span> ENDLESS SNACKS
        </div>
        <button
          type="button"
          className="ticker-pause"
          onClick={() => setTickerPaused((paused) => !paused)}
          aria-pressed={tickerPaused}
          aria-label={
            tickerPaused ? "Resume the stats ticker" : "Pause the stats ticker"
          }
        >
          <span aria-hidden="true">{tickerPaused ? "▶" : "❚❚"}</span>
        </button>
      </div>

      {importedMedia.length > 0 && (
        <section className="memory-shelf-section" id="memory-shelf">
          <div className="memory-shelf-heading">
            <div>
              <span className="handwritten-label">fresh from the camera roll</span>
              <h2>Our family memory shelf</h2>
              <p>
                {shelfSavedCount > 0
                  ? `${shelfSavedCount} private memor${shelfSavedCount === 1 ? "y" : "ies"} safely tucked into the family book.`
                  : ""}
                {shelfPreviewCount > 0
                  ? `${shelfSavedCount > 0 ? " " : ""}${shelfPreviewCount} device preview${shelfPreviewCount === 1 ? "" : "s"} — visible here until this page closes, not uploaded yet.`
                  : ""}
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
                  <button
                    type="button"
                    className="memory-preview-button"
                    onClick={() =>
                      openGallery(
                        shelfPhotos,
                        media.id,
                        "Our family memory shelf",
                      )
                    }
                    aria-label={`Open photo ${shelfPhotos.findIndex((photo) => photo.id === media.id) + 1} of ${shelfPhotos.length} from the family memory shelf`}
                  >
                    <img src={media.url} alt="" loading="lazy" />
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
                    playsInline
                    preload="metadata"
                  />
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
            <div className="generated-trips-heading-copy">
              <p>
                Capture dates and known calendar holidays label these chapters.
                Every chapter here was reviewed by a family admin before it
                joined the book.
              </p>
              <button
                type="button"
                className="surprise-chapter-button"
                onClick={surpriseMe}
                aria-controls="featured-trip"
                aria-label="Surprise me with a family chapter"
              >
                <span aria-hidden="true">✦</span> Surprise me
              </button>
            </div>
          </div>
          <div className="generated-trip-grid">
            {bookTrips.map((trip, tripIndex) => (
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
                        <button
                          type="button"
                          className="chapter-preview-button"
                          onClick={() =>
                            openGallery(trip.photos, memory.id, trip.title)
                          }
                          aria-label={`Open photo ${trip.photos.findIndex((photo) => photo.id === memory.id) + 1} of ${trip.photos.length} from ${trip.title}`}
                        >
                          <img
                            src={memory.url}
                            alt=""
                            loading="lazy"
                          />
                          <span className="photo-open-badge" aria-hidden="true">
                            ↗
                          </span>
                        </button>
                      ) : (
                        <video
                          src={memory.url}
                          aria-label={`Family video from ${trip.title}`}
                          controls
                          playsInline
                          preload="metadata"
                        />
                      )}
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
              <button className="primary-button" onClick={() => setImportOpen(true)}>
                Add the first memories <span aria-hidden="true">→</span>
              </button>
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
                              ? openGallery(
                                  activeTrip.photos,
                                  photo.id,
                                  activeTrip.title,
                                )
                              : setPhotoIndex(index)
                          }
                          aria-label={
                            relative === 0
                              ? `View a family photo from ${activeTrip.title} full size`
                              : `Show photo ${index + 1} from ${activeTrip.title}`
                          }
                          aria-hidden={relative !== 0}
                          tabIndex={relative === 0 ? 0 : -1}
                        >
                          <img
                            src={photo.url}
                            alt={
                              relative === 0
                                ? familyMemoryAlt(activeTrip.title)
                                : ""
                            }
                          />
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
                    Showing photo {photoIndex + 1} of {activeTrip.photos.length}
                    from {activeTrip.title}.
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
              <div
                className="trip-stats"
                role="group"
                aria-label="Chapter media counts"
              >
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
      </main>

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

      {gallery && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={closeGallery}
        >
          <div
            ref={galleryDialogRef}
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
              Use the previous and next buttons, arrow keys, or a horizontal
              swipe to browse these family photos.
            </p>
            <button
              ref={galleryCloseRef}
              type="button"
              className="dialog-close"
              onClick={closeGallery}
              aria-label="Close photo gallery"
            >
              ×
            </button>
            <div
              className="lightbox-stage"
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest("button")) return;
                galleryPointerStartRef.current = {
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={(event) => {
                const start = galleryPointerStartRef.current;
                galleryPointerStartRef.current = null;
                if (!start || start.pointerId !== event.pointerId) return;

                const horizontalDistance = event.clientX - start.x;
                const verticalDistance = event.clientY - start.y;
                if (
                  Math.abs(horizontalDistance) < 48 ||
                  Math.abs(horizontalDistance) <= Math.abs(verticalDistance)
                ) {
                  return;
                }
                stepGallery(horizontalDistance > 0 ? -1 : 1);
              }}
              onPointerCancel={() => {
                galleryPointerStartRef.current = null;
              }}
            >
              <img
                key={gallery.items[gallery.index].id}
                src={gallery.items[gallery.index].src}
                alt={gallery.items[gallery.index].alt}
                draggable={false}
              />
              {gallery.items.length > 1 && (
                <>
                  <button
                    type="button"
                    className="lightbox-nav previous"
                    onClick={() => stepGallery(-1)}
                    aria-label="Previous photo"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="lightbox-nav next"
                    onClick={() => stepGallery(1)}
                    aria-label="Next photo"
                  >
                    →
                  </button>
                </>
              )}
              <span className="lightbox-counter" aria-hidden="true">
                Photo {gallery.index + 1} / {gallery.items.length}
              </span>
              <span className="visually-hidden" role="status" aria-live="polite">
                Photo {gallery.index + 1} of {gallery.items.length} from {gallery.label}
              </span>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setImportOpen(false)}>
          <div ref={importDialogRef} className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setImportOpen(false)} aria-label="Close memory importer">×</button>
            <span className="handwritten-label">make it yours</span>
            <h2 id="import-title">Add family memories</h2>
            <p className="import-lede">Choose photos and videos from the device in your hand, or let selected Google Photos media stream server-to-server into private permanent copies. {savedMetadataCount} selections are already recorded for this family.</p>

            {importView === "choose" ? (
              <>
                {googleStatus === "done" && (
                  <div className="import-success" role="status">
                    <b>Memories unpacked!</b>
                    <span>{googleMessage}</span>
                    {isAdmin && (
                      <button
                        type="button"
                        className="ai-organize-button"
                        onClick={() => {
                          setImportOpen(false);
                          void generateTripDrafts();
                        }}
                      >
                        <span aria-hidden="true">✨</span> Organize these into
                        chapters
                      </button>
                    )}
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
                {importedMedia.length > 0 && (
                  <div className="import-preview">
                    <div><b>Your family memory shelf</b><button onClick={clearImportedMedia} title="Imported memories stay saved in the book">Hide the shelf</button></div>
                    {shelfPreviewCount > 0 && (
                      <p className="import-preview-note">
                        Device photos are previews for now — they stay on this
                        device and are not uploaded yet.
                      </p>
                    )}
                    <div className="import-grid">
                      {importedMedia.slice(0, 60).map((media) => media.kind === "image" ? (
                        <figure key={media.id}><img src={media.url} alt="Imported family memory" loading="lazy" /></figure>
                      ) : (
                        <figure key={media.id}><video src={media.url} aria-label="Imported family video" controls playsInline preload="metadata" /></figure>
                      ))}
                    </div>
                    {importedMedia.length > 60 && (
                      <p><b>{importedMedia.length - 60} more memories</b> are safely stored in the family book.</p>
                    )}
                    <p>This shelf keeps things quick by showing up to 60 previews at a time; the full saved count stays on the book cover.</p>
                    <p>Selected Google Photos media streams server-to-server into private Vercel Blob storage and reloads with the book. Device-only previews remain in this browser session.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="google-setup">
                <button className="back-button" onClick={() => setImportView("choose")}>← Back</button>
                <div className="google-badge"><span /><span /><span /><span /></div>
                <h3>{isAdmin ? "Pick from Google Photos" : "Admin Google Photos"}</h3>
                <p role={googleStatus === "error" ? "alert" : "status"}>
                  {googleMessage}
                </p>
                {(googleStatus === "importing" || googleStatus === "polling") && (
                  <div className="import-progress">
                    <span className="import-progress-bar" aria-hidden="true"><i /></span>
                    {googleProgress && (
                      <small role="status">
                        {googleProgress.processed} processed · {googleProgress.ready} ready
                        {googleProgress.failed > 0 ? ` · ${googleProgress.failed} failed` : ""}
                        {googleProgress.skipped > 0 ? ` · ${googleProgress.skipped} skipped` : ""}
                      </small>
                    )}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        stopGooglePhotosPolling();
                        googlePollActiveSessionRef.current = null;
                        setGooglePickerUrl(null);
                        setGoogleStatus("ready");
                        setGoogleMessage(
                          "Import paused. Everything copied so far is saved — start the picker again to bring in the rest.",
                        );
                      }}
                    >
                      Pause importing
                    </button>
                  </div>
                )}
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
      )}

      {organizerOpen && (
        <div
          className="dialog-backdrop organizer-backdrop"
          role="presentation"
          onMouseDown={() => setOrganizerOpen(false)}
        >
          <div
            ref={organizerDialogRef}
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
                <p className="organizer-working-note" role="status">
                  {organizerState === "saving"
                    ? "Creating the approved chapters..."
                    : "Working — this usually takes under a minute. Here is what happens:"}
                </p>
                <ul>
                  <li>
                    <span aria-hidden="true">✓</span>
                    <div><b>Read safe metadata</b><small>Capture dates, known holidays, dimensions, and file details</small></div>
                  </li>
                  <li>
                    <span aria-hidden="true">✓</span>
                    <div><b>Compare small previews</b><small>512px working images, never public Blob links</small></div>
                  </li>
                  <li>
                    <span aria-hidden="true">✓</span>
                    <div><b>{organizerState === "saving" ? "Create approved chapters" : "Write review drafts"}</b><small>Nothing appears until the admin approves it</small></div>
                  </li>
                </ul>
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
    </div>
  );
}
