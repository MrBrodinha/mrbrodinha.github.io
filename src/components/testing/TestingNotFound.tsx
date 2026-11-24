import { Link } from 'react-router-dom';

export default function TestingNotFound() {
  return <main className="testing-page">
    <h1>Testing page not found</h1>
    <p>This experiment is not available.</p>
    <Link to="/testing">Back to testing</Link>
  </main>;
}
