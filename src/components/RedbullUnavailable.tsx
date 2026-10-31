import { Link } from 'react-router-dom';

function RedbullUnavailable() {
  return (
    <main className="unavailable-page">
      <section aria-labelledby="unavailable-heading">
        <p>Red Bull Rater</p>
        <h1 id="unavailable-heading">Temporarily unavailable</h1>
        <p>This page is paused. Please check back later.</p>
        <Link to="/">← Back to home</Link>
      </section>
    </main>
  );
}

export default RedbullUnavailable;
