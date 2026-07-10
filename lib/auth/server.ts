import { createNeonAuth } from "@neondatabase/auth/next/server";

let authInstance: ReturnType<typeof createNeonAuth> | null = null;

export function getAuth() {
  if (authInstance) return authInstance;

  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

  if (!baseUrl || !cookieSecret) {
    throw new Error(
      "NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are required for Neon Auth.",
    );
  }

  authInstance = createNeonAuth({
    baseUrl,
    cookies: {
      secret: cookieSecret,
      sessionDataTtl: 300,
      // Google OAuth returns through a top-level cross-site GET. Lax keeps the
      // signed-in family session available for that callback while continuing
      // to exclude the cookie from cross-site POST requests.
      sameSite: "lax",
    },
    logLevel: "warn",
  });

  return authInstance;
}
