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
import {
  completeTripQuiz,
  saveMemoryMetadata,
  voteNextAdventure,
} from "./actions";

type Trip = {
  id: string;
  place: string;
  shortPlace: string;
  year: string;
  kicker: string;
  title: string;
  story: string;
  quote: string;
  quoteBy: string;
  accent: string;
  accentSoft: string;
  icon: string;
  coordinates: string;
  photos: { src: string; alt: string; caption: string }[];
  video: string;
  videoPoster: string;
  quiz: {
    question: string;
    answers: string[];
    correct: number;
    celebration: string;
  };
  stats: { label: string; value: string; icon: string }[];
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

const trips: Trip[] = [
  {
    id: "yellowstone",
    place: "Yellowstone, Wyoming",
    shortPlace: "Yellowstone",
    year: "SUMMER 2025",
    kicker: "The Great Geyser Quest",
    title: "Cloud factories, campfire toast & one very clever squirrel",
    story:
      "We followed the boardwalk past bubbling paint pots, counted bison from the car, and stayed up late enough to see more stars than anyone thought could fit in one sky.",
    quote: "I think geysers are how the clouds get made.",
    quoteBy: "A tiny tour guide, age 7",
    accent: "#ef6a5b",
    accentSoft: "#ffe1d9",
    icon: "🌋",
    coordinates: "44.4280° N · 110.5885° W",
    photos: [
      {
        src: "https://images.unsplash.com/photo-1754962987501-2b0be5c0b145?auto=format&fit=crop&w=1400&q=86",
        alt: "A geyser erupting beneath a bright blue sky in Yellowstone",
        caption: "Old Faithful, right on time — unlike the rest of us.",
      },
      {
        src: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=86",
        alt: "A family campsite glowing in warm evening light",
        caption: "The night of the heroic three-marshmallow s’more.",
      },
      {
        src: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1400&q=86",
        alt: "A wide road curving through a dramatic mountain landscape",
        caption: "The scenic shortcut that added only two hours.",
      },
    ],
    video:
      "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    videoPoster:
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1400&q=86",
    quiz: {
      question: "Who figured out how to unzip the snack backpack?",
      answers: ["A squirrel", "A raven", "Dad"],
      correct: 0,
      celebration: "Exactly! That squirrel earned the Snack Bandit badge.",
    },
    stats: [
      { label: "Bison spotted", value: "23", icon: "🦬" },
      { label: "S’mores built", value: "18", icon: "🔥" },
      { label: "Wrong turns", value: "2½", icon: "🧭" },
    ],
  },
  {
    id: "beach",
    place: "Gulf Shores, Alabama",
    shortPlace: "Beach Week",
    year: "SPRING 2024",
    kicker: "Operation Sandy Toes",
    title: "Sunrise shells, cannonball contests & the leaning sandcastle",
    story:
      "Every morning started with a shell hunt and every afternoon ended with someone still wearing goggles at dinner. The castle lasted eleven glorious minutes.",
    quote: "The ocean keeps trying to take our fort.",
    quoteBy: "Chief sand architect, age 9",
    accent: "#287f8f",
    accentSoft: "#d9f2f2",
    icon: "🏖️",
    coordinates: "30.2460° N · 87.7008° W",
    photos: [
      {
        src: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1400&q=86",
        alt: "Turquoise waves rolling onto a bright sandy beach",
        caption: "First one in the water wins. No one defined ‘in.’",
      },
      {
        src: "https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=1400&q=86",
        alt: "A sandcastle on a sunny beach near the water",
        caption: "Fort Awesome, moments before the tide’s surprise attack.",
      },
      {
        src: "https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1400&q=86",
        alt: "Palm trees beside a calm tropical shoreline",
        caption: "The walk where we found the almost-perfect shell.",
      },
    ],
    video:
      "https://videos.pexels.com/video-files/3571264/3571264-hd_1920_1080_30fps.mp4",
    videoPoster:
      "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1400&q=86",
    quiz: {
      question: "What did we name the lopsided sandcastle?",
      answers: ["Fort Awesome", "Castle Crunch", "Sandy Manor"],
      correct: 0,
      celebration: "You remembered! Long live Fort Awesome.",
    },
    stats: [
      { label: "Shells adopted", value: "41", icon: "🐚" },
      { label: "Cannonballs", value: "16", icon: "💦" },
      { label: "Sandy snacks", value: "4", icon: "🍉" },
    ],
  },
  {
    id: "chicago",
    place: "Chicago, Illinois",
    shortPlace: "Chicago",
    year: "WINTER 2024",
    kicker: "The Snow-Day Expedition",
    title: "Big buildings, tiny snowflakes & pizza taller than our mittens",
    story:
      "We raced the ‘L’ around the Loop, made faces in the Bean, and discovered that a windy city hot chocolate tastes at least twice as good.",
    quote: "That pizza is wearing another pizza as a hat.",
    quoteBy: "Deep-dish critic, age 6",
    accent: "#4e62a7",
    accentSoft: "#e3e6f8",
    icon: "🏙️",
    coordinates: "41.8781° N · 87.6298° W",
    photos: [
      {
        src: "https://images.unsplash.com/photo-1494522358652-f30e61a60313?auto=format&fit=crop&w=1400&q=86",
        alt: "Chicago skyline beside Lake Michigan",
        caption: "A skyline so tall it made everyone whisper for a minute.",
      },
      {
        src: "https://images.unsplash.com/photo-1515859005217-8a1f08870f59?auto=format&fit=crop&w=1400&q=86",
        alt: "Chicago city streets lit in the evening",
        caption: "Following the train rumble to our next snack stop.",
      },
      {
        src: "https://images.unsplash.com/photo-1764255908839-bd8bed71364a?auto=format&fit=crop&w=1400&q=86",
        alt: "A snowy city park in winter",
        caption: "The five-minute walk that became a snowball tournament.",
      },
    ],
    video:
      "https://videos.pexels.com/video-files/2887463/2887463-hd_1920_1080_25fps.mp4",
    videoPoster:
      "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1400&q=86",
    quiz: {
      question: "What warmed everybody up after the windy walk?",
      answers: ["Hot chocolate", "Lemonade", "Ice cream"],
      correct: 0,
      celebration: "Correct — extra marshmallows and all.",
    },
    stats: [
      { label: "Train rides", value: "7", icon: "🚇" },
      { label: "Snowballs", value: "∞", icon: "❄️" },
      { label: "Pizza layers", value: "5", icon: "🍕" },
    ],
  },
  {
    id: "farm",
    place: "Grandma’s Farm",
    shortPlace: "The Farm",
    year: "FALL 2023",
    kicker: "The Mud-Boot Weekend",
    title: "Tractor rides, secret recipes & a chicken named Pickles",
    story:
      "We woke up with the rooster, picked apples for the pie, and learned that the fastest way to make a new friend is carrying a pocket full of chicken feed.",
    quote: "Pickles is the boss chicken. You can tell by the walk.",
    quoteBy: "Junior farmhand, age 8",
    accent: "#56895d",
    accentSoft: "#dfefdc",
    icon: "🚜",
    coordinates: "Somewhere past the red barn",
    photos: [
      {
        src: "https://images.unsplash.com/photo-1500076656116-558758c991c1?auto=format&fit=crop&w=1400&q=86",
        alt: "A red barn and green fields under a wide sky",
        caption: "Home base for the weekend’s very serious expeditions.",
      },
      {
        src: "https://images.unsplash.com/photo-1498579397066-22750a3cb424?auto=format&fit=crop&w=1400&q=86",
        alt: "Fresh apples hanging from a tree in an orchard",
        caption: "Pie ingredients, minus the three that disappeared.",
      },
      {
        src: "https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?auto=format&fit=crop&w=1400&q=86",
        alt: "A curious chicken standing in a farmyard",
        caption: "Pickles, head of security and crumb inspection.",
      },
    ],
    video:
      "https://videos.pexels.com/video-files/856980/856980-hd_1920_1080_25fps.mp4",
    videoPoster:
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1400&q=86",
    quiz: {
      question: "What was the boss chicken’s name?",
      answers: ["Pickles", "Pancake", "Pepper"],
      correct: 0,
      celebration: "That’s right! Pickles approves.",
    },
    stats: [
      { label: "Apples picked", value: "29", icon: "🍎" },
      { label: "Tractor laps", value: "6", icon: "🚜" },
      { label: "Muddy boots", value: "8", icon: "🥾" },
    ],
  },
];

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
  savedMemoryCount: number;
};

const voteOptions = [
  { slug: "lake-michigan", place: "Lake Michigan", emoji: "⛵" },
  { slug: "smoky-mountains", place: "Smoky Mountains", emoji: "⛰️" },
  { slug: "backyard-campout", place: "Backyard campout", emoji: "⛺" },
] as const;

const baseVotes = [4, 7, 3];

export default function AdventureBook({
  memberName,
  memberRole,
  isAdmin,
  initialStampedTrips,
  initialVoteCounts,
  initialCurrentVote,
  initialMemories,
  savedMemoryCount,
}: AdventureBookProps) {
  const [activeTripIndex, setActiveTripIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [bookOpen, setBookOpen] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [stampedTrips, setStampedTrips] = useState(initialStampedTrips);
  const [lightbox, setLightbox] = useState<
    { src: string; alt: string; caption: string } | undefined
  >();
  const [importOpen, setImportOpen] = useState(false);
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
    baseVotes.map(
      (base, index) => base + (initialVoteCounts[voteOptions[index].slug] ?? 0),
    ),
  );
  const [currentVote, setCurrentVote] = useState(initialCurrentVote);
  const [syncMessage, setSyncMessage] = useState("Neon synced");
  const [savedMetadataCount, setSavedMetadataCount] =
    useState(savedMemoryCount);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const googlePollTimerRef = useRef<number | null>(null);
  const googlePollExpiryTimerRef = useRef<number | null>(null);
  const googlePollActiveSessionRef = useRef<string | null>(null);
  const activeTrip = trips[activeTripIndex];
  const quizCorrect = quizAnswer === activeTrip.quiz.correct;

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
    if (!lightbox && !importOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightbox(undefined);
        setImportOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [lightbox, importOpen]);

  const selectTrip = (index: number) => {
    setActiveTripIndex(index);
    setPhotoIndex(0);
    setQuizAnswer(null);
    requestAnimationFrame(() => {
      document
        .getElementById("featured-trip")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openBook = () => {
    setBookOpen(true);
    window.setTimeout(() => {
      document
        .getElementById("adventure-map")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 480);
  };

  const answerQuiz = async (index: number) => {
    setQuizAnswer(index);
    if (index === activeTrip.quiz.correct) {
      const next = Array.from(new Set([...stampedTrips, activeTrip.id]));
      setStampedTrips(next);
    }

    setSyncMessage("Saving memory stamp…");
    try {
      const result = await completeTripQuiz(activeTrip.id, index);
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
          if (optionSlug === previousVote) return Math.max(baseVotes[voteIndex], vote - 1);
          return vote;
        }),
      );
    }

    setSyncMessage("Saving your family vote…");
    try {
      const result = await voteNextAdventure(slug);
      setCurrentVote(result.selected);
      setVotes(
        baseVotes.map(
          (base, voteIndex) =>
            base + (result.counts[voteOptions[voteIndex].slug] ?? 0),
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
          <div className="eyebrow"><span>EST. FOREVER</span><i />148 LITTLE MOMENTS</div>
          <h1>Our great big<br /><em>adventure book</em></h1>
          <p>
            Places we went. Things we tried. Stories we never want to forget.
            Open the suitcase and come wander with us.
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
            <span className="sticker sticker-one">YELLOWSTONE<br /><b>2025</b></span>
            <span className="sticker sticker-two">LET’S<br />WANDER</span>
            <span className="sticker sticker-three">★</span>
          </div>
          <div className="suitcase-base">
            <div className="suitcase-handle" />
            <div className="suitcase-clasp left" />
            <div className="suitcase-clasp right" />
            <span className="suitcase-label">FAMILY<br />CARRY-ON</span>
          </div>
          <div className="photo-fan" aria-hidden={!bookOpen}>
            <figure className="fan-photo fan-one">
              <img src={trips[1].photos[0].src} alt="Waves rolling toward a sunny beach" />
              <figcaption>BEACH WEEK ’24</figcaption>
            </figure>
            <figure className="fan-photo fan-two">
              <img src={trips[0].photos[0].src} alt="A Yellowstone geyser under a blue sky" />
              <figcaption>GEYSER DAY!</figcaption>
            </figure>
            <figure className="fan-photo fan-three">
              <img src={trips[3].photos[2].src} alt="A curious chicken in a farmyard" />
              <figcaption>MEET PICKLES</figcaption>
            </figure>
          </div>
          <div className="paper-plane" aria-hidden="true">➤</div>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div>
          <span>★</span> 12 ADVENTURES <span>★</span> 4 STATES <span>★</span> 1,842 “ARE WE THERE YETS?” <span>★</span> ENDLESS SNACKS
          <span>★</span> 12 ADVENTURES <span>★</span> 4 STATES <span>★</span> 1,842 “ARE WE THERE YETS?” <span>★</span> ENDLESS SNACKS
        </div>
      </div>

      <section className="map-section" id="adventure-map">
        <div className="section-heading map-heading">
          <div>
            <span className="handwritten-label">choose a pin</span>
            <h2>Where should we<br />go first?</h2>
          </div>
          <p>
            Every pin opens a chapter. The best ones include a wrong turn,
            something delicious, and at least one story that gets funnier each year.
          </p>
        </div>

        <div className="adventure-map">
          <div className="route route-one" />
          <div className="route route-two" />
          <div className="route route-three" />
          <span className="map-word word-west" aria-hidden="true">WEST</span>
          <span className="map-word word-home" aria-hidden="true">HOME</span>
          {trips.map((trip, index) => (
            <button
              key={trip.id}
              className={`map-pin pin-${index + 1} ${activeTripIndex === index ? "active" : ""}`}
              style={{ "--pin-color": trip.accent } as CSSProperties}
              onClick={() => selectTrip(index)}
              aria-label={`Open ${trip.shortPlace} trip from ${trip.year}`}
              aria-pressed={activeTripIndex === index}
            >
              <span className="pin-icon" aria-hidden="true">{trip.icon}</span>
              <span className="pin-copy">
                <small>{trip.year}</small>
                <b>{trip.shortPlace}</b>
              </span>
            </button>
          ))}
          <div className="compass" aria-hidden="true"><b>N</b><span>✦</span><small>S</small></div>
        </div>
      </section>

      <section
        className="featured-trip"
        id="featured-trip"
        style={{
          "--trip-accent": activeTrip.accent,
          "--trip-soft": activeTrip.accentSoft,
        } as CSSProperties}
      >
        <div className="trip-number" aria-hidden="true">0{activeTripIndex + 1}</div>
        <div className="trip-intro">
          <div className="passport-stamp">
            <span>{activeTrip.icon}</span>
            <b>{activeTrip.shortPlace}</b>
            <small>{activeTrip.year}</small>
          </div>
          <div>
            <div className="chapter-kicker">CHAPTER {activeTripIndex + 1} · {activeTrip.kicker}</div>
            <h2>{activeTrip.title}</h2>
            <p>{activeTrip.story}</p>
            <div className="coordinates">⌖ {activeTrip.coordinates}</div>
          </div>
        </div>

        <div className="chapter-grid">
          <div className="photo-stack-wrap">
            <div className="photo-stack" aria-live="polite">
              {activeTrip.photos.map((photo, index) => {
                const relative = (index - photoIndex + activeTrip.photos.length) % activeTrip.photos.length;
                return (
                  <button
                    key={photo.src}
                    className={`stack-photo stack-position-${relative}`}
                    onClick={() => relative === 0 ? setLightbox(photo) : setPhotoIndex(index)}
                    aria-label={relative === 0 ? `View full size: ${photo.caption}` : `Show photo ${index + 1}: ${photo.caption}`}
                    tabIndex={relative > 1 ? -1 : 0}
                  >
                    <img src={photo.src} alt={relative === 0 ? photo.alt : ""} />
                    <span>{photo.caption}</span>
                  </button>
                );
              })}
            </div>
            <div className="photo-controls">
              <button
                onClick={() => setPhotoIndex((photoIndex - 1 + activeTrip.photos.length) % activeTrip.photos.length)}
                aria-label="Previous trip photo"
              >←</button>
              <span>PHOTO {photoIndex + 1} / {activeTrip.photos.length}</span>
              <button
                onClick={() => setPhotoIndex((photoIndex + 1) % activeTrip.photos.length)}
                aria-label="Next trip photo"
              >→</button>
            </div>
          </div>

          <div className="chapter-side">
            <blockquote>
              <span aria-hidden="true">“</span>
              {activeTrip.quote}
              <footer>— {activeTrip.quoteBy}</footer>
            </blockquote>
            <div className="trip-stats">
              {activeTrip.stats.map((stat) => (
                <div key={stat.label}>
                  <span aria-hidden="true">{stat.icon}</span>
                  <b>{stat.value}</b>
                  <small>{stat.label}</small>
                </div>
              ))}
            </div>
            <div className="video-postcard">
              <div className="video-label"><span>▶</span> MOVING MEMORIES</div>
              <video
                key={activeTrip.id}
                controls
                playsInline
                preload="metadata"
                poster={activeTrip.videoPoster}
                aria-label={`${activeTrip.shortPlace} trip video postcard`}
              >
                <source src={activeTrip.video} type="video/mp4" />
                Your browser does not support this trip video.
              </video>
              <p>A little postcard from the road <span>00:24</span></p>
            </div>
          </div>
        </div>
      </section>

      <section className="challenge-section" id="challenge">
        <div className="challenge-copy">
          <span className="handwritten-label">passport check!</span>
          <h2>Think you<br />remember?</h2>
          <p>Earn a stamp for every chapter you remember. No pressure — family legends are allowed to get a little fuzzy.</p>
          <div className="passport-progress" aria-label={`${stampedTrips.length} of ${trips.length} memory stamps earned`}>
            {trips.map((trip) => (
              <span key={trip.id} className={stampedTrips.includes(trip.id) ? "earned" : ""} title={trip.shortPlace}>
                {stampedTrips.includes(trip.id) ? trip.icon : "?"}
              </span>
            ))}
          </div>
        </div>
        <div className={`quiz-card ${quizCorrect ? "correct" : ""}`}>
          <div className="quiz-topline">
            <span>MEMORY NO. {activeTripIndex + 1}</span>
            <b>{activeTrip.icon} {activeTrip.shortPlace}</b>
          </div>
          <h3>{activeTrip.quiz.question}</h3>
          <div className="quiz-answers">
            {activeTrip.quiz.answers.map((answer, index) => (
              <button
                key={answer}
                onClick={() => answerQuiz(index)}
                className={quizAnswer === index ? (quizCorrect ? "right" : "wrong") : ""}
                aria-pressed={quizAnswer === index}
              >
                <span>{String.fromCharCode(65 + index)}</span>{answer}
              </button>
            ))}
          </div>
          <div className="quiz-result" aria-live="polite">
            {quizAnswer === null
              ? "Pick the answer your family would shout first."
              : quizCorrect
                ? `✓ ${activeTrip.quiz.celebration}`
                : "Good guess — try another family theory!"}
          </div>
          <small className="database-note">{syncMessage}</small>
          {quizCorrect && <div className="earned-stamp" aria-hidden="true">MEMORY<br /><b>VERIFIED</b></div>}
        </div>
      </section>

      <section className="tour-guides">
        <div className="section-heading">
          <div>
            <span className="handwritten-label">meet the crew</span>
            <h2>Our tiny<br />tour guides</h2>
          </div>
          <p>Every great expedition needs specialists. These example badges are ready for your kids’ names, portraits, favorite jobs, and most legendary trip stats.</p>
        </div>
        <div className="guide-grid">
          {[
            { initials: "E", color: "coral", title: "Chief Cloud Spotter", stat: "17 rocks collected", icon: "☁️" },
            { initials: "M", color: "blue", title: "Official Snack Inspector", stat: "9 brave bites", icon: "🥨" },
            { initials: "J", color: "green", title: "Wildlife Detective", stat: "31 creatures found", icon: "🔎" },
          ].map((guide, index) => (
            <article className={`guide-card ${guide.color}`} key={guide.title}>
              <div className="guide-number">0{index + 1}</div>
              <div className="guide-avatar"><span>{guide.initials}</span><i aria-hidden="true">{guide.icon}</i></div>
              <h3>{guide.title}</h3>
              <p>{guide.stat}</p>
              <button onClick={() => setImportOpen(true)}>Add real explorer <span>↗</span></button>
            </article>
          ))}
        </div>
      </section>

      <section className="next-adventure">
        <div className="postmark" aria-hidden="true">FAMILY MAIL<br /><b>2026</b></div>
        <div className="next-copy">
          <span className="handwritten-label">the next chapter...</span>
          <h2>Where to next?</h2>
          <p>Everyone gets one vote. Lobbying with cookies is technically allowed.</p>
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
              <small>{votes[index]} family votes</small>
              <i>{currentVote === option.slug ? "✓" : "＋"}</i>
            </button>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-plane" aria-hidden="true">➤</div>
        <p>Dear future us: remember the rain, the wrong turn,<br />and the pancakes at midnight.</p>
        <div>
          <span>Made for the people we love most.</span>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>BACK TO THE COVER ↑</button>
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
                        <figure key={media.id}><img src={media.url} alt={media.name} /><figcaption>{media.name}</figcaption></figure>
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
    </main>
  );
}
