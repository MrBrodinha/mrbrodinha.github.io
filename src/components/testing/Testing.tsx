import { Link } from 'react-router-dom';

type TestingDestination = { label: string; description: string; path: string };

// Add experimental routes beneath TestingAccess in App.tsx before linking them here.
const destinations: TestingDestination[] = [
  { label: 'Melody editor', description: 'Write a musical sketch with interactive notation, clefs and tuplets.', path: '/testing/sheet-editor' },
];

export default function Testing() {
  return <main className="testing-page">
    <h1>Testing</h1>
    <p>Try new features and experiments here.</p>
    {destinations.length ? <ul className="testing-destinations">
      {destinations.map(({ label, description, path }) => <li key={path}>
        <Link to={path}>{label}</Link>
        <p>{description}</p>
      </li>)}
    </ul> : <p className="testing-empty">No experiments are available yet.</p>}
  </main>;
}
