export default function Loading() {
  return (
    <main className="book-loading" aria-busy="true" aria-label="Opening the family adventure book">
      <header className="book-loading-topbar">
        <span className="book-loading-mark" aria-hidden="true">&#10022;</span>
        <span>Our Family <small>ADVENTURE BOOK</small></span>
      </header>
      <section className="book-loading-hero">
        <div>
          <span className="book-loading-kicker">OPENING THE PRIVATE FAMILY BOOK</span>
          <h1>Gathering our<br /><em>adventures&hellip;</em></h1>
          <p>Loading chapters, photos, and the family memory trail.</p>
          <span className="book-loading-bar" aria-hidden="true"><i /></span>
        </div>
        <div className="book-loading-suitcase" aria-hidden="true">
          <span>FAMILY<br />MEMORIES</span>
        </div>
      </section>
    </main>
  );
}
