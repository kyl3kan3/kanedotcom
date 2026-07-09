import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  GOOGLE_PHOTOS_SCOPE,
  GOOGLE_PHOTOS_STATE_COOKIE,
  getCookieOptions,
  getGooglePhotosConfig,
  requireGooglePhotosAdmin,
} from "@/lib/google-photos";

export async function GET(request: Request) {
  await requireGooglePhotosAdmin();

  const { clientId, redirectUri } = getGooglePhotosConfig(request);
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_PHOTOS_STATE_COOKIE, state, getCookieOptions(10 * 60));

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_PHOTOS_SCOPE);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "online");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authUrl);
}
