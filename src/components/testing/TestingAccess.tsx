import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/authContext';
import { useBrodleAdmin } from '../brodle/hooks/useBrodleAdmin';
import './Testing.css';

export default function TestingAccess() {
  const { user, loading: authLoading } = useAuth();
  const { admin, loading, error } = useBrodleAdmin();

  if (authLoading || loading) return <main className="testing-page">
    <h1>Testing</h1>
    <p role="status">Checking administrator access…</p>
  </main>;

  if (!user || !admin || error) return <main className="testing-page">
    <h1>Administrator access required</h1>
    {error ? <p role="alert">Unable to check administrator access. Please try again later.</p>
      : <p>This area is reserved for administrators.</p>}
    <nav className="testing-actions" aria-label="Testing access">
      {!user && <Link to="/login?next=%2Ftesting">Log in</Link>}
      <Link to="/">Back to home</Link>
    </nav>
  </main>;

  return <Outlet />;
}
