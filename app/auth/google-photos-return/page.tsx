"use client";

import Link from "next/link";
import { useEffect } from "react";

const allowedStatuses = new Set(["ready", "error", "setup"]);

export default function GooglePhotosReturnPage() {
  useEffect(() => {
    const requestedStatus = new URLSearchParams(window.location.search).get(
      "status",
    );
    const status =
      requestedStatus && allowedStatuses.has(requestedStatus)
        ? requestedStatus
        : "error";

    window.location.replace(`/?googlePhotos=${status}#top`);
  }, []);

  return (
    <main className="auth-shell">
      <Link className="auth-brand" href="/">
        <span aria-hidden="true">✦</span>
        Our Family Adventure Book
      </Link>
      <section className="auth-card">
        <div className="auth-intro">
          <span>GOOGLE PHOTOS</span>
          <h1>Finishing the connection…</h1>
          <p>
            The private family book is reopening with your selected-photos
            permission.
          </p>
        </div>
      </section>
    </main>
  );
}
