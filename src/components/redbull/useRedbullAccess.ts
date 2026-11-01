import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

export function useRedbullAccess(userId?: string) {
  const [allowed, setAllowed] = useState<boolean | null>(userId ? null : false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const check = useCallback(async () => {
    if (!userId || !supabase) return;
    const current = ++request.current;
    setChecking(true); setError('');
    try {
      const { data, error: problem } = await supabase.rpc('can_use_redbull');
      if (current !== request.current) return;
      if (problem) throw problem;
      setAllowed(data === true);
    } catch { if (current === request.current) { setAllowed(false); setError('Unable to check access right now. Please try again.'); } }
    finally { if (current === request.current) setChecking(false); }
  }, [userId]);
  useEffect(() => {
    const pending = request;
    if (!userId || !supabase) return;
    void check();
    const focus = () => { if (!document.hidden) void check(); };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    return () => { pending.current++; window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [check, userId]);
  return { allowed, checking, error, check };
}
