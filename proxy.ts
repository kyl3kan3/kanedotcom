import { type NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/server";

const productionHost = "kanedotcom.com";

export async function proxy(request: NextRequest) {
  if (
    process.env.VERCEL_ENV === "production" &&
    request.nextUrl.hostname !== productionHost
  ) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.protocol = "https:";
    canonicalUrl.hostname = productionHost;
    canonicalUrl.port = "";
    return NextResponse.redirect(canonicalUrl, 308);
  }

  // These route handlers perform their own owner/admin authorization and must
  // return JSON (or complete the OAuth callback) instead of an HTML login page.
  if (
    request.nextUrl.pathname.startsWith("/api/photos/google/") ||
    request.nextUrl.pathname.startsWith("/api/memories/")
  ) {
    return NextResponse.next();
  }

  if (
    [
      "/auth/verify-email",
      "/auth/reset-password",
      "/auth/recover-account",
      "/auth/google-photos-return",
    ].includes(request.nextUrl.pathname)
  ) {
    return NextResponse.next();
  }

  return getAuth().middleware({ loginUrl: "/auth/sign-in" })(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|og.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
