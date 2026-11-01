import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';

type AuthState = {
  user: User | null;
  username: string | null;
  loading: boolean;
  error: string | null;
  recovery: boolean;
  signOut: () => Promise<string | null>;
};
export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requires AuthProvider');
  return value;
}
