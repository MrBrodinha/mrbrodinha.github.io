import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../auth/authContext';
import { emptyProgress, progressStorageKey } from '../lib/gameProgress';
import type { GameMode, GameProgress } from '../lib/gameProgress';
import { ProgressSync, readProgressCache, serializeProgressCache, emptyProgressCache } from '../lib/progressSync';
import type { ProgressSyncState } from '../lib/progressSync';
import { progressTransport } from '../services/progressService';
import { CHALLENGE, TARGET } from '../lib/musicGame';

function loadCache(key: string, target: readonly number[], mode: GameMode) {
  try { return { ...readProgressCache(window.localStorage.getItem(key), target, mode), storageError: false }; }
  catch { return { ...emptyProgressCache(), storageError: true }; }
}

export function useBrodleProgress(challengeId = CHALLENGE.id, target: readonly number[] = TARGET, mode: GameMode = 'guided', restoreStartedMode?: (mode: GameMode) => void) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const key = progressStorageKey(challengeId, target, userId, mode);
  const session = useRef<{ key: string; sync: ProgressSync }>();
  const [state, setState] = useState<ProgressSyncState & { storageError: boolean; key: string }>(() => ({
    ...loadCache(key, target, mode), loading: Boolean(userId), status: userId ? 'loading' : 'local', key,
  }));

  useEffect(() => {
    const initial = loadCache(key, target, mode);
    const otherMode = mode === 'guided' ? 'classic' : 'guided';
    const otherTransport = userId && restoreStartedMode && !initial.progress.attempts.length
      ? progressTransport(userId, challengeId, target, otherMode) : undefined;
    const modeRequest = new AbortController();
    let checkingMode = Boolean(otherTransport);
    let active = true;
    const sync = new ProgressSync(target, initial, userId ? progressTransport(userId, challengeId, target, mode) : undefined, (next) => {
      let storageError = false;
      try { window.localStorage.setItem(key, serializeProgressCache(next.progress, next.pending)); }
      catch { storageError = true; }
      setState({ ...next, loading: next.loading || checkingMode, storageError, key });
    }, mode);
    session.current = { key, sync };
    setState({ ...sync.state, loading: sync.state.loading || checkingMode, storageError: initial.storageError, key });
    // A new device may prefer Casual even though this account already started
    // the day in Hard. Resolve that before exposing the mode switch or piano.
    void Promise.all([
      sync.sync(),
      otherTransport?.load(modeRequest.signal).catch(() => null),
    ]).then(([, other]) => {
      if (!active) return;
      checkingMode = false;
      if (other?.attempts.length && !sync.state.progress.attempts.length) {
        restoreStartedMode?.(otherMode);
      } else setState((previous) => previous.key === key ? { ...previous, ...sync.state } : previous);
    });

    const receiveProgress = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== key || event.newValue === null) return;
      const cached = readProgressCache(event.newValue, target, mode);
      sync.receive(cached.progress, cached.pending);
    };
    const resume = () => { if (!document.hidden) void sync.sync(); };
    window.addEventListener('storage', receiveProgress);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    const retry = userId ? window.setInterval(() => { if (sync.state.status === 'error' || sync.state.pending) resume(); }, 30000) : undefined;
    return () => {
      active = false;
      modeRequest.abort();
      sync.dispose();
      if (session.current?.sync === sync) session.current = undefined;
      window.clearInterval(retry);
      window.removeEventListener('storage', receiveProgress);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [key, challengeId, userId, target, mode, restoreStartedMode]);

  const updateProgress = useCallback((update: (previous: GameProgress) => GameProgress) => {
    const sync = session.current?.key === key ? session.current.sync : undefined;
    if (!sync) return { previous: state.progress, next: state.progress };
    const cached = loadCache(key, target, mode);
    sync.receive(cached.progress, cached.pending);
    return sync.update(update);
  }, [key, target, mode, state.progress]);

  // Do not render or edit the previous mode's round while its replacement loads.
  const { key: stateKey, ...savedState } = state;
  return { ...savedState, progress: stateKey === key ? state.progress : emptyProgress(),
    loading: stateKey !== key || state.loading, updateProgress,
    retrySync: () => { if (session.current?.key === key) void session.current.sync.sync(); },
    accountProgress: Boolean(userId) };
}
