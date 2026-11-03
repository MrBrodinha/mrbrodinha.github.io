import { supabase } from '../../../lib/supabase';
import { parseProgress, serializeProgress } from '../lib/gameProgress';
import type { GameMode, GameProgress } from '../lib/gameProgress';
import type { ProgressTransport } from '../lib/progressSync';

export function progressTransport(userId: string, challengeId: string, target: readonly number[], mode: GameMode = 'guided'): ProgressTransport | undefined {
  const client = supabase;
  if (!client) return undefined;
  // An owner check prevents a delayed request from writing the previous user's
  // round into a different account after an authentication change.
  const scope = { p_user_id: userId, p_challenge_id: challengeId, p_target_notes: [...target] };
  const signalFor = (signal: AbortSignal) => AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  return {
    async load(signal) {
      const { data, error } = await client.rpc('get_brodle_progress', scope).abortSignal(signalFor(signal));
      if (error) throw error;
      return parseProgress(data === null ? null : JSON.stringify(data), target, mode);
    },
    async save(progress: GameProgress, signal) {
      const { data, error } = await client.rpc('save_brodle_progress', { ...scope, p_progress: JSON.parse(serializeProgress(progress)) }).abortSignal(signalFor(signal));
      if (error) throw error;
      return parseProgress(JSON.stringify(data), target, mode);
    },
  };
}
