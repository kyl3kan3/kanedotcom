import { AuthView } from "@neondatabase/auth/react/ui";
import Link from "next/link";

export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<{ verified?: string }>;
}) {
  const { path } = await params;
  const { verified } = await searchParams;

  return (
    <main className="auth-shell">
      <Link className="auth-brand" href="/">
        <span aria-hidden="true">✦</span>
        Our Family Adventure Book
      </Link>
      <section className="auth-card">
        <div className="auth-intro">
          <span>PRIVATE FAMILY ENTRANCE</span>
          <h1>Come back to the adventure.</h1>
          <p>
            Sign in to save memory-game stamps, family votes, and new trip
            details to the private family archive.
          </p>
        </div>
        <div className="auth-view-wrap">
          {path === "sign-in" && verified === "1" && (
            <p className="auth-verified-note" role="status">
              <span aria-hidden="true">✓</span> Your email is verified. Sign in
              to open the family book.
            </p>
          )}
          <AuthView path={path} redirectTo="/" />
          {(path === "sign-in" || path === "sign-up") && (
            <p className="verification-link">
              Have a six-digit verification code?{" "}
              <Link href="/auth/verify-email">Enter it here</Link>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
