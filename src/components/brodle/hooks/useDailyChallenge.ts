import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { CHALLENGE, BPM, KEY, TIME_SIGNATURE, MELODY, MELODY_FINAL, MELODY_FINAL_BASS, FINAL_CLEF, FINAL_BASS_CLEF } from '../lib/musicGame';
import { publishedChallenge } from '../lib/melodyLibrary';
import type { ChallengeSnapshot, GameChallenge } from '../lib/melodyLibrary';

export const PRACTICE_CHALLENGE: GameChallenge = { ...CHALLENGE, bpm: BPM, key: KEY, timeSignature: TIME_SIGNATURE, melody: MELODY, finalMelody: MELODY_FINAL, finalBass: MELODY_FINAL_BASS, finalClef: FINAL_CLEF, finalBassClef: FINAL_BASS_CLEF, author: '' };
type DailyState = {
  challenge: GameChallenge | null; loading: boolean; notice: string;
  previousDate: string | null; nextDate: string | null; today: string | null;
};
export function useDailyChallenge(date: string | null = null) {
  const [state, setState] = useState<DailyState>({ challenge: date ? null : PRACTICE_CHALLENGE, loading: Boolean(supabase), notice: '', previousDate: null, nextDate: null, today: null });
  const request = useRef(0);
  const activeRequest = useRef<AbortController>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const current = ++request.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const deadline = setTimeout(() => controller.abort(), 8000);
    try {
      const { data, error } = await (date ? supabase.rpc('get_brodle_day', { p_date: date }) : supabase.rpc('get_daily_brodle')).abortSignal(controller.signal);
      if (error) throw error;
      if (current !== request.current) return;
      const daily = data as { today: string; serverNow: string; nextChangeAt: string; previousDate?: string | null; nextDate?: string | null; challenge: { id: string; playDate: string; snapshot: ChallengeSnapshot } | null };
      const challenge = daily.challenge ? publishedChallenge(daily.challenge.id, daily.challenge.playDate, daily.challenge.snapshot) : date ? null : PRACTICE_CHALLENGE;
      setState({ challenge, loading: false, today: daily.today, previousDate: daily.previousDate ?? null, nextDate: daily.nextDate ?? null,
        notice: date ? (daily.challenge ? 'Archive challenge' : 'No published puzzle is available for this day.') : daily.challenge ? (daily.challenge.playDate < daily.today ? 'Latest published challenge' : '') : 'Practice melody · the daily calendar is coming soon.' });
      clearTimeout(timer.current);
      const wait = Date.parse(daily.nextChangeAt) - Date.parse(daily.serverNow);
      timer.current = setTimeout(() => void refresh(), Number.isFinite(wait) ? Math.max(1000, Math.min(wait + 500, 86401000)) : 60000);
    } catch {
      if (current !== request.current) return;
      setState((previous) => ({ ...previous, loading: false, notice: previous.challenge?.date ? 'Could not refresh this challenge. Your current round is kept.' : date ? 'Could not load this day. Please try again.' : 'Daily challenge unavailable · you can play the practice melody.' }));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void refresh(), 60000);
    } finally { clearTimeout(deadline); }
  }, [date]);
  useEffect(() => {
    const pending = request;
    void refresh();
    const resume = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { pending.current++; activeRequest.current?.abort(); clearTimeout(timer.current); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [refresh]);
  return { ...state, refresh };
}
