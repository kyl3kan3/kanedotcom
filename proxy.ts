import { type NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/server";

export async function proxy(request: NextRequest) {
  if (
    [
      "/auth/verify-email",
      "/auth/reset-password",
      "/auth/recover-account",
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
