import { useMemo } from 'react';
import { Link } from 'react-router-dom';

const backgrounds = [
  'radial-gradient(circle at 18% 20%, #ff9ac5 0, transparent 35%), radial-gradient(circle at 82% 75%, #8167ff 0, transparent 38%), #17121d',
  'radial-gradient(circle at 75% 18%, #ffca7a 0, transparent 32%), radial-gradient(circle at 20% 80%, #ff70ae 0, transparent 38%), #20172a',
  'radial-gradient(circle at 15% 75%, #65d6ce 0, transparent 36%), radial-gradient(circle at 80% 25%, #ff7eb3 0, transparent 40%), #151a24',
  'linear-gradient(135deg, #18111f 0%, #46305c 45%, #e46a9f 140%)',
  'linear-gradient(145deg, #16222a 0%, #3a6073 48%, #ed76a8 130%)',
];

function Home() {
  const background = useMemo(() => backgrounds[Math.floor(Math.random() * backgrounds.length)], []);

  return (
    <main className="home-page" style={{ background }}>
      <h1 className="home-title" aria-label="mrbrodinha">
        <span>m</span>
        <Link className="redbull-letter" to="/redbull" aria-label="Open the Red Bull ratings" title="Red Bull ratings">r</Link>
        <span>brodinha</span>
      </h1>
    </main>
  );
}

export default Home;
