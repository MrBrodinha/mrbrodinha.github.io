import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './authContext';
import './Auth.css';

export default function AccountControls({ theme = 'dark', showProfile = true }: { theme?: 'dark' | 'light'; showProfile?: boolean }) {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <div className={`account-controls account-controls-${theme}`} role="group" aria-label="Account">
    {loading ? <span role="status">Restoring account…</span> : user ? <>
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true); setError(await signOut()); setBusy(false);
      }}>{busy ? 'Signing out…' : 'Log out'}</button>
      {showProfile && <Link to="/account" state={{ returnTo: location.pathname + location.search }} className="account-profile">Profile</Link>}
    </> : <>
      <Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Log in</Link>
      <Link to={`/signup?next=${encodeURIComponent(location.pathname)}`}>Sign up</Link>
    </>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
