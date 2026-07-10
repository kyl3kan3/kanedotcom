import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireFamilyAdmin } from "@/lib/family";

export const GOOGLE_PHOTOS_SCOPE =
  "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

export const GOOGLE_PHOTOS_STATE_COOKIE = "family_google_photos_state";
export const GOOGLE_PHOTOS_TOKEN_COOKIE = "family_google_photos_token";

const GOOGLE_PHOTOS_CALLBACK_PATH = "/api/photos/google/callback";
const GOOGLE_PHOTOS_PRODUCTION_ORIGIN = "https://kanedotcom.com";

export class GooglePhotosApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GooglePhotosApiError";
  }
}

export type GooglePhotosSession = {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  pollingConfig?: {
    pollInterval?: string;
    timeoutIn?: string;
  };
};

export type GooglePickedMediaItem = {
  id: string;
  createTime?: string;
  type?: "PHOTO" | "VIDEO" | "TYPE_UNSPECIFIED";
  mediaFile?: {
    baseUrl?: string;
    mimeType?: string;
    filename?: string;
    mediaFileMetadata?: {
      width?: number;
      height?: number;
      cameraMake?: string;
      cameraModel?: string;
      photoMetadata?: {
        focalLength?: number;
        apertureFNumber?: number;
        isoEquivalent?: number;
        exposureTime?: string;
      };
      videoMetadata?: {
        fps?: number;
        processingStatus?: "UNSPECIFIED" | "PROCESSING" | "READY" | "FAILED";
      };
    };
  };
};

export async function requireGooglePhotosAdmin() {
  const { member } = await requireFamilyAdmin();
  return member;
}

function readEnvironmentValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function getGooglePhotosConfigStatus(request: Request) {
  const clientId = readEnvironmentValue("GOOGLE_PHOTOS_CLIENT_ID");
  const clientSecret = readEnvironmentValue("GOOGLE_PHOTOS_CLIENT_SECRET");
  const blobToken = readEnvironmentValue("BLOB_READ_WRITE_TOKEN");
  const configuredRedirectUri = readEnvironmentValue(
    "GOOGLE_PHOTOS_REDIRECT_URI",
  );
  const requestRedirectUri = new URL(GOOGLE_PHOTOS_CALLBACK_PATH, request.url).toString();
  const redirectUri = configuredRedirectUri || requestRedirectUri;
  const missing: string[] = [];
  const issues: string[] = [];

  if (!clientId) missing.push("GOOGLE_PHOTOS_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_PHOTOS_CLIENT_SECRET");
  if (!blobToken) missing.push("BLOB_READ_WRITE_TOKEN");
  if (!configuredRedirectUri && process.env.NODE_ENV === "production") {
    missing.push("GOOGLE_PHOTOS_REDIRECT_URI");
  }

  if (clientId && !clientId.endsWith(".apps.googleusercontent.com")) {
    issues.push("GOOGLE_PHOTOS_CLIENT_ID is not a Google Web OAuth client ID.");
  }

  try {
    const parsedRedirect = new URL(redirectUri);
    const requestOrigin = new URL(request.url).origin;
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(
      parsedRedirect.hostname,
    );
    if (process.env.NODE_ENV === "production") {
      if (parsedRedirect.protocol !== "https:") {
        issues.push("GOOGLE_PHOTOS_REDIRECT_URI must use HTTPS in production.");
      }
      if (parsedRedirect.origin !== GOOGLE_PHOTOS_PRODUCTION_ORIGIN) {
        issues.push(
          `GOOGLE_PHOTOS_REDIRECT_URI must use ${GOOGLE_PHOTOS_PRODUCTION_ORIGIN} in production.`,
        );
      }
      if (requestOrigin !== GOOGLE_PHOTOS_PRODUCTION_ORIGIN) {
        issues.push(
          `Open the production book at ${GOOGLE_PHOTOS_PRODUCTION_ORIGIN} before connecting Google Photos.`,
        );
      }
    } else {
      if (parsedRedirect.protocol !== "https:" && !isLocal) {
        issues.push(
          "GOOGLE_PHOTOS_REDIRECT_URI must use HTTPS outside local development.",
        );
      }
      if (parsedRedirect.origin !== requestOrigin) {
        issues.push(
          "GOOGLE_PHOTOS_REDIRECT_URI must use the same origin as the current local site.",
        );
      }
    }
    if (parsedRedirect.pathname !== GOOGLE_PHOTOS_CALLBACK_PATH) {
      issues.push(
        `GOOGLE_PHOTOS_REDIRECT_URI must end with ${GOOGLE_PHOTOS_CALLBACK_PATH}.`,
      );
    }
  } catch {
    issues.push("GOOGLE_PHOTOS_REDIRECT_URI is not a valid URL.");
  }

  return {
    configured: missing.length === 0 && issues.length === 0,
    missing,
    issues,
    redirectUri,
  };
}

export function getGooglePhotosConfig(request: Request) {
  const clientId = readEnvironmentValue("GOOGLE_PHOTOS_CLIENT_ID");
  const clientSecret = readEnvironmentValue("GOOGLE_PHOTOS_CLIENT_SECRET");
  const status = getGooglePhotosConfigStatus(request);

  if (!status.configured) {
    const details = [...status.missing, ...status.issues].join(", ");
    throw new Error(
      `Google Photos is not configured${details ? `: ${details}` : "."}`,
    );
  }

  return { clientId, clientSecret, redirectUri: status.redirectUri };
}

export function googleDurationToMilliseconds(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const match = value?.match(/^(\d+(?:\.\d+)?)s$/);
  const milliseconds = match ? Number(match[1]) * 1000 : fallback;
  if (!Number.isFinite(milliseconds)) return fallback;
  return Math.min(maximum, Math.max(minimum, milliseconds));
}

export function getCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function getGoogleAccessToken() {
  const cookieStore = await cookies();
  return cookieStore.get(GOOGLE_PHOTOS_TOKEN_COOKIE)?.value ?? null;
}

export async function clearGoogleAccessToken() {
  const cookieStore = await cookies();
  cookieStore.delete(GOOGLE_PHOTOS_TOKEN_COOKIE);
}

export function googlePhotosError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function fetchGooglePhotos<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new GooglePhotosApiError(
      response.status,
      `Google Photos request failed (${response.status})${detail ? `: ${detail}` : "."}`,
    );
  }

  return (await response.json()) as T;
}
