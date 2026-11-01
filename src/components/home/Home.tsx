import { Link } from 'react-router-dom';
import './Home.css';

function Home() {
  return (
    <main className="home-page">
      <h1 className="home-title" aria-label="mrbrodinha">
        <Link className="mvg-letter" to="/mvg" aria-label="Open the MVG page" title="MVG">m</Link>
        <Link className="redbull-letter" to="/redbull" aria-label="Open Red Bull Rater" title="Red Bull Rater">r</Link>
        <Link className="brodle-letter" to="/brodle" aria-label="Open Brodle" title="Brodle">b</Link>
        <span>r</span>
        <span>odinh</span>
        <span>a</span>
      </h1>
    </main>
  );
}

export default Home;
