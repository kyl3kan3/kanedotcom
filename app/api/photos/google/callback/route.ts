import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  GOOGLE_PHOTOS_STATE_COOKIE,
  GOOGLE_PHOTOS_TOKEN_COOKIE,
  getCookieOptions,
  getGooglePhotosConfig,
  requireGooglePhotosAdmin,
} from "@/lib/google-photos";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

function redirectHome(request: Request, status: "ready" | "error" | "setup") {
  const url = new URL("/", request.url);
  url.searchParams.set("googlePhotos", status);
  url.hash = "top";
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  try {
    await requireGooglePhotosAdmin();
  } catch {
    return redirectHome(request, "error");
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.has("error")) {
    return redirectHome(request, "error");
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const storedState = cookieStore.get(GOOGLE_PHOTOS_STATE_COOKIE)?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return redirectHome(request, "error");
  }

  let configuration: ReturnType<typeof getGooglePhotosConfig>;
  try {
    configuration = getGooglePhotosConfig(request);
  } catch {
    return redirectHome(request, "setup");
  }

  const { clientId, clientSecret, redirectUri } = configuration;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  let token: GoogleTokenResponse;
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    token = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenResponse.ok || !token.access_token) {
      cookieStore.delete(GOOGLE_PHOTOS_STATE_COOKIE);
      return redirectHome(request, "error");
    }
  } catch {
    cookieStore.delete(GOOGLE_PHOTOS_STATE_COOKIE);
    return redirectHome(request, "error");
  }

  cookieStore.delete(GOOGLE_PHOTOS_STATE_COOKIE);
  cookieStore.set(
    GOOGLE_PHOTOS_TOKEN_COOKIE,
    token.access_token,
    getCookieOptions(Math.max(60, Math.min((token.expires_in ?? 3600) - 60, 3300))),
  );

  return redirectHome(request, "ready");
}
