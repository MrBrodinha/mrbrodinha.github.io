import { createClient } from '@supabase/supabase-js';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const url = (() => {
  try {
    const parsed = new URL(configuredUrl ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.username || parsed.password || (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))) return null;
    return parsed.href;
  } catch { return null; }
})();

// Only public browser keys belong in a Vite build. Never accept a secret key.
export const authConfigured = Boolean(url && key?.startsWith('sb_publishable_'));
export const supabase = authConfigured ? createClient(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
}) : null;
