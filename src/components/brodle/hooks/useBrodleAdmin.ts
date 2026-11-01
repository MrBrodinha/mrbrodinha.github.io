import { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/authContext';
import { supabase } from '../../../lib/supabase';
import { melodyError } from '../services/melodyService';

export function useBrodleAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<{ id: string | null; admin: boolean; loading: boolean; error: string | null }>({ id: null, admin: false, loading: false, error: null });
  const userId = user?.id;
  useEffect(() => {
    if (!userId || !supabase) { setState({ id: null, admin: false, loading: false, error: null }); return; }
    let active = true;
    setState({ id: userId, admin: false, loading: true, error: null });
    void supabase.rpc('is_brodle_admin').then(({ data, error }) => {
      if (active) setState({ id: userId, admin: data === true, loading: false, error: error ? melodyError(error) : null });
    });
    return () => { active = false; };
  }, [userId]);
  return { admin: Boolean(user && state.id === user.id && state.admin), loading: authLoading || Boolean(user && (state.id !== user.id || state.loading)), error: state.id === user?.id ? state.error : null };
}
