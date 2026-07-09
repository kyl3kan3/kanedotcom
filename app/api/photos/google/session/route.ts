import { NextResponse } from "next/server";
import {
  type GooglePhotosSession,
  fetchGooglePhotos,
  getGoogleAccessToken,
  googlePhotosError,
  requireGooglePhotosAdmin,
} from "@/lib/google-photos";

export async function POST() {
  await requireGooglePhotosAdmin();

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
      pollAfterMs: 3000,
    });
  } catch (error) {
    return googlePhotosError(
      error instanceof Error ? error.message : "Could not start Google Photos.",
      502,
    );
  }
}
