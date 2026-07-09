import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireFamilyContext } from "@/lib/family";

export const GOOGLE_PHOTOS_SCOPE =
  "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

export const GOOGLE_PHOTOS_STATE_COOKIE = "family_google_photos_state";
export const GOOGLE_PHOTOS_TOKEN_COOKIE = "family_google_photos_token";

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
  };
};

export async function requireGooglePhotosAdmin() {
  const { member } = await requireFamilyContext();
  if (member.role !== "owner") {
    throw new Error("Only the family admin can import from Google Photos.");
  }
  return member;
}

export function getGooglePhotosConfig(request: Request) {
  const clientId = process.env.GOOGLE_PHOTOS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_PHOTOS_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_PHOTOS_REDIRECT_URI ??
    new URL("/api/photos/google/callback", request.url).toString();

  if (!clientId || !clientSecret) {
    throw new Error("Google Photos OAuth environment variables are missing.");
  }

  return { clientId, clientSecret, redirectUri };
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
    const detail = await response.text();
    throw new Error(`Google Photos request failed: ${response.status} ${detail}`);
  }

  return (await response.json()) as T;
}
