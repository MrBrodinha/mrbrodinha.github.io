import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './authContext';
import { supabase } from '../lib/supabase';
import { authErrorMessage, MIN_PASSWORD_LENGTH, returnLinkError } from './authUtils';
import './Auth.css';

export default function AuthReturn({ reset = false }: { reset?: boolean }) {
  const { user, loading, error: sessionError } = useAuth();
  const navigate = useNavigate();
  const [linkError] = useState(() => returnLinkError(window.location.search, window.location.hash));
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    if (loading) return;
    // The SDK consumes the email link. Strip any leftover error/token fragments.
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!reset && user && !linkError && !sessionError) navigate('/account?confirmed=1', { replace: true });
  }, [loading, reset, user, linkError, sessionError, navigate]);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || busy) return;
    if (password.length < MIN_PASSWORD_LENGTH) { setError('Use at least 8 characters.'); return; }
    if (password !== repeat) { setError('The passwords do not match.'); return; }
    setBusy(true); setError(null);
    try {
      const { error: problem } = await supabase.auth.updateUser({ password });
      if (problem) { setError(authErrorMessage(problem)); return; }
      setComplete(true);
      await supabase.auth.signOut({ scope: 'local' });
    } catch { setError(authErrorMessage(null)); }
    finally { setPassword(''); setRepeat(''); setBusy(false); }
  }

  const problem = linkError ?? sessionError;
  return <main className="auth-page"><section className="auth-card" aria-labelledby="auth-return-title">
    <p className="auth-eyebrow">Your account</p>
    <h1 id="auth-return-title">{reset ? 'Choose a new password' : 'Confirming your email'}</h1>
    {loading ? <p role="status">Checking your email link…</p> : complete ? <>
      <p className="auth-success" role="status">Password updated. You can now log in with your new password.</p><Link className="auth-primary" to="/login">Log in</Link>
    </> : problem || !user ? <>
      <p className="auth-error" role="alert">{problem ?? 'This link is missing, expired, or has already been used. Request a new email to continue.'}</p>
      <Link className="auth-primary" to={reset ? '/forgot-password' : '/login'}>{reset ? 'Request a new reset link' : 'Log in or resend confirmation'}</Link>
    </> : reset ? <form onSubmit={(event) => void updatePassword(event)} aria-busy={busy}>
      <p className="auth-intro">Use a password you haven’t used before.</p>
      <label htmlFor="new-password">New password<input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={128} disabled={busy} /></label>
      <label htmlFor="repeat-password">Confirm password<input id="repeat-password" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={8} maxLength={128} disabled={busy} /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="auth-primary" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
    </form> : <p role="status">Email confirmed. Opening your account…</p>}
    <p className="auth-privacy">Your email is stored privately by Supabase Auth for verification and password recovery.</p>
  </section></main>;
}
