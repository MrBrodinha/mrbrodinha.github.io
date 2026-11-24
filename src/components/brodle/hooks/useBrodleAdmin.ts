import { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/authContext';
import { supabase } from '../../../lib/supabase';
import { melodyError } from '../services/melodyService';

export function useBrodleAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<{ id: string | null; admin: boolean; loading: boolean; error: string | null }>({ id: null, admin: false, loading: false, error: null });
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId || !supabase) {
      setState({ id: userId, admin: false, loading: false, error: userId ? melodyError({ code: 'not_configured' }) : null });
      return;
    }
    const client = supabase;
    let active = true;
    setState({ id: userId, admin: false, loading: true, error: null });
    void (async () => {
      try {
        const { data, error } = await client.rpc('is_brodle_admin');
        if (active) setState({ id: userId, admin: !error && data === true, loading: false, error: error ? melodyError(error) : null });
      } catch (error) {
        if (active) setState({ id: userId, admin: false, loading: false, error: melodyError(error) });
      }
    })();
    return () => { active = false; };
  }, [userId]);
  return { admin: Boolean(user && state.id === user.id && state.admin), loading: authLoading || Boolean(user && (state.id !== user.id || state.loading)), error: state.id === userId ? state.error : null };
}
