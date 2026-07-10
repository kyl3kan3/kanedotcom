"use client";

import Link from "next/link";

export default function AccountSettingsError({ reset }: { reset: () => void }) {
  return (
    <main className="access-shell">
      <section className="access-card" role="alert">
        <p className="access-kicker">settings hiccup</p>
        <h1>Your family book is safe.</h1>
        <p>
          Nothing was changed. Try opening Settings again, or return to the
          adventure book and come back when you’re ready.
        </p>
        <div className="account-error-actions">
          <button type="button" className="primary-button" onClick={reset}>
            Try Settings again
          </button>
          <Link className="text-button" href="/">
            Back to the adventure book <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
