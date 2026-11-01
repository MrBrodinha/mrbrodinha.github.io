import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext } from './authContext';
import { supabase } from '../lib/supabase';
import { authErrorMessage, validUsername } from './authUtils';
import { BRODLE_RESET_EVENT, clearSavedBrodleProgress, isNewSignIn } from './loginReset';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ id: string; username: string } | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [emailReturn] = useState(() => window.location.pathname.startsWith('/auth/')
    && new URLSearchParams(window.location.hash.slice(1)).has('access_token'));
  const user = session?.user.email_confirmed_at ? session.user : null;

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let eventReceived = false;
    // undefined means initial restoration, which must preserve a signed-in round.
    let previousUserId: string | null | undefined = emailReturn ? null : undefined;
    // Keep this callback synchronous; querying Supabase inside it can deadlock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      eventReceived = true;
      const nextUserId = next?.user.email_confirmed_at ? next.user.id : null;
      if (isNewSignIn(event, previousUserId, nextUserId)) {
        let storageError = false;
        try { clearSavedBrodleProgress(window.localStorage); } catch { storageError = true; }
        // Reset open game tabs as well as the persisted round. Keep the SDK's
        // session, authored melodies, and account-owned rating drafts intact.
        window.dispatchEvent(new CustomEvent(BRODLE_RESET_EVENT, { detail: { storageError } }));
      }
      previousUserId = nextUserId;
      setSession(next);
      setLoading(false);
      setError(null);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    void supabase.auth.getSession().then(({ data, error: problem }) => {
      if (!active || eventReceived) return;
      previousUserId = data.session?.user.email_confirmed_at ? data.session.user.id : null;
      setSession(data.session);
      setError(problem ? authErrorMessage(problem) : null);
      setLoading(false);
    }).catch(() => {
      if (active) { setError('Unable to restore your session. Please try signing in again.'); setLoading(false); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [emailReturn]);

  const userId = user?.id;
  useEffect(() => {
    setProfile(null);
    if (!userId || !supabase) return;
    let active = true;
    // The existing database trigger owns profile creation. Never insert here.
    void supabase.from('users').select('id, username').eq('id', userId).maybeSingle().then(({ data }) => {
      if (active && data && validUsername(data.username)) setProfile({ id: userId, username: data.username });
    });
    return () => { active = false; };
  }, [userId]);

  async function signOut() {
    if (!supabase) return null;
    try {
      const { error: problem } = await supabase.auth.signOut();
      return problem ? authErrorMessage(problem) : null;
    } catch { return 'Unable to sign out. Please check your connection and try again.'; }
  }

  const username = user && profile?.id === user.id ? profile.username
    : user && validUsername(user.user_metadata.username) ? user.user_metadata.username : null;
  return <AuthContext.Provider value={{ user, username, loading, error, recovery, signOut }}>{children}</AuthContext.Provider>;
}
