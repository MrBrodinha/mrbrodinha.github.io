import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './authContext';
import AccountControls from './AccountControls';
import { safeReturnPath } from './authUtils';
import BrodleIcon from '../components/brodle/components/BrodleIcon';
import './Auth.css';

export default function AccountPage() {
  const { user, username, loading, error } = useAuth();
  const location = useLocation();
  const returnTo = typeof location.state?.returnTo === 'string' ? location.state.returnTo : '';
  const pathname = returnTo.split(/[?#]/)[0];
  const backTo = pathname === '/' || safeReturnPath(pathname) !== '/account' ? returnTo : '/';
  if (loading) return <main className="auth-page" role="status">Restoring your account…</main>;
  if (!user) return <Navigate to="/login" replace />;
  return <main className="auth-page profile-page">
    <section className="auth-card profile-card" aria-label="Your profile">
      <div className="profile-card-top"><Link to={backTo} className="profile-back" aria-label="Go back" title="Go back"><BrodleIcon name="home" size={21} /></Link><span className="profile-wordmark">mrbrodinha<BrodleIcon name="sparkle" size={15} /></span></div>
      <div className="profile-avatar" aria-hidden="true"><span>{(username ?? 'mr').slice(0, 2).toUpperCase()}</span><i className="profile-sparkle profile-sparkle-one"><BrodleIcon name="sparkle" size={25} /></i><i className="profile-sparkle profile-sparkle-two"><BrodleIcon name="sparkle" size={15} /></i></div>
      <h1>{username ?? 'Your account'}</h1>
      <div className="profile-divider" aria-hidden="true"><BrodleIcon name="sparkle" size={13} /></div>
      <div className="profile-actions"><AccountControls showProfile={false} /></div>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </section>
  </main>;
}
