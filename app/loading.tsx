export default function HomeLoading() {
  return (
    <main className="book-loading" aria-label="Opening the family adventure book">
      <div className="book-loading-mark" aria-hidden="true">✦</div>
      <p>Opening the family adventure book…</p>
      <span className="book-loading-bar" aria-hidden="true"><i /></span>
    </main>
  );
}
