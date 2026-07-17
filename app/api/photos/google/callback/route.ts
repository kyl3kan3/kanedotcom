import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  GOOGLE_PHOTOS_COOKIE_PATH,
  GOOGLE_PHOTOS_STATE_COOKIE,
  GOOGLE_PHOTOS_TOKEN_COOKIE,
  getCookieOptions,
  getGooglePhotosConfig,
} from "@/lib/google-photos";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

function redirectThroughSameSite(
  request: Request,
  status: "ready" | "error" | "setup",
) {
  const url = new URL("/auth/google-photos-return", request.url);
  url.searchParams.set("status", status);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.has("error")) {
    return redirectThroughSameSite(request, "error");
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const storedState = cookieStore.get(GOOGLE_PHOTOS_STATE_COOKIE)?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return redirectThroughSameSite(request, "error");
  }

  let configuration: ReturnType<typeof getGooglePhotosConfig>;
  try {
    configuration = getGooglePhotosConfig(request);
  } catch {
    return redirectThroughSameSite(request, "setup");
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
      cookieStore.delete({
        name: GOOGLE_PHOTOS_STATE_COOKIE,
        path: GOOGLE_PHOTOS_COOKIE_PATH,
      });
      return redirectThroughSameSite(request, "error");
    }
  } catch {
    cookieStore.delete({
      name: GOOGLE_PHOTOS_STATE_COOKIE,
      path: GOOGLE_PHOTOS_COOKIE_PATH,
    });
    return redirectThroughSameSite(request, "error");
  }

  cookieStore.delete({
    name: GOOGLE_PHOTOS_STATE_COOKIE,
    path: GOOGLE_PHOTOS_COOKIE_PATH,
  });
  cookieStore.set(
    GOOGLE_PHOTOS_TOKEN_COOKIE,
    token.access_token,
    getCookieOptions(Math.max(60, Math.min((token.expires_in ?? 3600) - 60, 3300))),
  );

  return redirectThroughSameSite(request, "ready");
}
