"use client";

export default function HomeError({ reset }: { reset: () => void }) {
  return (
    <main className="access-shell">
      <section className="access-card" role="alert">
        <p className="access-kicker">a page got stuck</p>
        <h1>Your family book is safe.</h1>
        <p>
          Every saved memory and chapter is still stored privately — this page
          just could not open. Try again in a moment.
        </p>
        <div className="account-error-actions">
          <button type="button" className="primary-button" onClick={reset}>
            Open the book again
          </button>
        </div>
      </section>
    </main>
  );
}
