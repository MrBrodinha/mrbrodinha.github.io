import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from './authContext';
import { authErrorMessage, signupErrorMessage, authRedirect, MIN_PASSWORD_LENGTH, safeReturnPath, validUsername } from './authUtils';
import './Auth.css';

type Mode = 'login' | 'signup' | 'forgot';
export default function AuthPage({ mode }: { mode: Mode }) {
  const { user, loading, recovery } = useAuth();
  const [params] = useSearchParams();
  const next = safeReturnPath(params.get('next'));
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const request = useRef(0);
  useEffect(() => {
    const pending = request;
    request.current++;
    setError(null); setMessage(''); setPassword(''); setConfirmation(false); setBusy(false);
    return () => { pending.current++; };
  }, [location.pathname]);
  useEffect(() => { if (!cooldown) return; const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  useEffect(() => {
    if (mode !== 'forgot' && !loading && user && !(mode === 'signup' && busy)) navigate(recovery ? '/auth/reset-password' : next, { replace: true });
  }, [user, loading, next, navigate, recovery, mode, busy]);

  async function resend() {
    if (!supabase || busy || cooldown) return;
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    const current = ++request.current;
    setBusy(true); setError(null); setMessage('');
    try {
      const { error: problem } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: authRedirect('/auth/callback') } });
      if (current !== request.current) return;
      if (problem) setError(authErrorMessage(problem));
      else { setMessage('If this address has an unconfirmed account, a new confirmation email is on its way.'); setCooldown(60); }
    } catch { if (current === request.current) setError(authErrorMessage(null)); }
    finally { if (current === request.current) setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    if (mode === 'signup' && !validUsername(username.trim())) { setError('Username must contain 3–30 letters, numbers, or underscores.'); return; }
    const current = ++request.current;
    setBusy(true); setError(null); setMessage('');
    try {
      if (mode === 'signup') {
        const name = username.trim();
        const { data, error: problem } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { username: name }, emailRedirectTo: authRedirect('/auth/callback') },
        });
        // Confirm-email must also be enabled in the Supabase dashboard.
        if (data.session) await supabase.auth.signOut({ scope: 'local' });
        if (current !== request.current) return;
        if (problem) { setError(signupErrorMessage(problem)); return; }
        if (data.session) { setError('Email confirmation is not enabled. Please contact the site owner before creating an account.'); return; }
        setConfirmation(true); setCooldown(60);
        setMessage('Check your email. Follow the confirmation link before signing in.');
      } else if (mode === 'forgot') {
        const { error: problem } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect('/auth/reset-password') });
        if (current !== request.current) return;
        if (problem) setError(authErrorMessage(problem));
        else { setMessage('Check your email. If an account exists for this address, you’ll receive a password reset link.'); setCooldown(60); }
      } else {
        const { data, error: problem } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (current !== request.current) return;
        if (problem) { setError(authErrorMessage(problem)); setConfirmation(problem.code === 'email_not_confirmed'); }
        else if (!data.user?.email_confirmed_at) {
          await supabase.auth.signOut({ scope: 'local' });
          if (current === request.current) { setError('Confirm your email before signing in.'); setConfirmation(true); }
        }
      }
    } catch { if (current === request.current) setError(authErrorMessage(null)); }
    finally { if (current === request.current) { setPassword(''); setBusy(false); } }
  }

  const title = mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Forgot your password?' : 'Welcome back';
  const suffix = `?next=${encodeURIComponent(next)}`;
  return <main className="auth-page"><section className="auth-card" aria-labelledby="auth-title">
    <Link to={next === '/account' ? '/' : next} className="auth-back">← Back to the site</Link>
    <p className="auth-eyebrow">mrbrodinha / Account</p><h1 id="auth-title">{title}</h1>
    <p className="auth-intro">{mode === 'forgot' ? 'We’ll send you a link to choose a new password.' : 'One account across mrbrodinha.com.'}</p>
    {!supabase && <p role="alert" className="auth-error">Accounts are not configured yet. You can still browse the site.</p>}
    <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
      {mode === 'signup' && <label htmlFor="auth-username">Username<input id="auth-username" name="username" autoComplete="username" value={username}
        onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" aria-describedby="username-help" disabled={busy || confirmation} /><small id="username-help">3–30 letters, numbers, or underscores. Usernames are public and unique, ignoring case.</small></label>}
      <label htmlFor="auth-email">Email<input id="auth-email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} disabled={busy} /></label>
      {mode !== 'forgot' && !confirmation && <label htmlFor="auth-password">Password<input id="auth-password" name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password}
        onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'signup' ? MIN_PASSWORD_LENGTH : 1} maxLength={128} disabled={busy} />{mode === 'signup' && <small>At least 8 characters.</small>}</label>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {message && <p className="auth-success" role="status">{message}</p>}
      {!confirmation && <button className="auth-primary" type="submit" disabled={!supabase || busy || loading || (mode === 'forgot' && cooldown > 0)}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? (cooldown ? `Send again in ${cooldown}s` : 'Send reset link') : 'Log in'}</button>}
      {confirmation && <button className="auth-primary" type="button" onClick={() => void resend()} disabled={!supabase || busy || cooldown > 0}>{busy ? 'Sending…' : cooldown ? `Resend confirmation in ${cooldown}s` : 'Resend confirmation email'}</button>}
      {confirmation && mode === 'login' && <button type="button" className="auth-text-button" onClick={() => { setConfirmation(false); setError(null); setMessage(''); }}>Back to login</button>}
    </form>
    <nav className="auth-links" aria-label="Account options">
      {mode !== 'login' && <Link to={'/login' + suffix}>Already have an account? Log in</Link>}
      {mode === 'login' && <><Link to={'/signup' + suffix}>Create an account</Link><Link to={'/forgot-password' + suffix}>Forgot password?</Link></>}
      <Link to="/">Back to MrBrodinha</Link>
    </nav>
    <p className="auth-privacy">Your email is stored privately by Supabase Auth for verification and password recovery. Only your username is public.</p>
  </section></main>;
}
