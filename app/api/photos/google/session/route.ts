import { NextResponse } from "next/server";
import {
  GooglePhotosApiError,
  type GooglePhotosSession,
  clearGoogleAccessToken,
  fetchGooglePhotos,
  getGoogleAccessToken,
  getGooglePhotosConfigStatus,
  googleDurationToMilliseconds,
  googlePhotosError,
  requireGooglePhotosAdmin,
} from "@/lib/google-photos";

export async function POST(request: Request) {
  try {
    await requireGooglePhotosAdmin();
  } catch {
    return googlePhotosError(
      "Only the family admin can connect Google Photos.",
      403,
    );
  }

  const configuration = getGooglePhotosConfigStatus(request);
  if (!configuration.configured) {
    return NextResponse.json(
      {
        configured: false,
        missing: configuration.missing,
        issues: configuration.issues,
        redirectUri: configuration.redirectUri,
        error: "Google Photos needs its Google Cloud OAuth credentials in Vercel.",
      },
      { status: 503 },
    );
  }

  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { needsAuth: true, authUrl: "/api/photos/google/start" },
      { status: 401 },
    );
  }

  try {
    const session = await fetchGooglePhotos<GooglePhotosSession>(
      "https://photospicker.googleapis.com/v1/sessions",
      accessToken,
      { method: "POST", body: "{}" },
    );

    return NextResponse.json({
      id: session.id,
      pickerUri: `${session.pickerUri}/autoclose`,
      pollAfterMs: googleDurationToMilliseconds(
        session.pollingConfig?.pollInterval,
        3000,
        1000,
        30_000,
      ),
      timeoutAfterMs: googleDurationToMilliseconds(
        session.pollingConfig?.timeoutIn,
        10 * 60 * 1000,
        60_000,
        30 * 60 * 1000,
      ),
    });
  } catch (error) {
    if (error instanceof GooglePhotosApiError && error.status === 401) {
      await clearGoogleAccessToken();
      return NextResponse.json(
        { needsAuth: true, authUrl: "/api/photos/google/start" },
        { status: 401 },
      );
    }

    return googlePhotosError(
      error instanceof Error ? error.message : "Could not start Google Photos.",
      error instanceof GooglePhotosApiError && error.status === 403 ? 403 : 502,
    );
  }
}
