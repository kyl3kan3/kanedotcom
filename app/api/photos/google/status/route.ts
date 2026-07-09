import { NextResponse } from "next/server";
import {
  getGooglePhotosConfigStatus,
  requireGooglePhotosAdmin,
} from "@/lib/google-photos";

export async function GET(request: Request) {
  try {
    await requireGooglePhotosAdmin();
  } catch {
    return NextResponse.json(
      { error: "Only the family admin can connect Google Photos." },
      { status: 403 },
    );
  }

  const status = getGooglePhotosConfigStatus(request);
  return NextResponse.json(status, {
    status: status.configured ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}
