import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../auth/authContext';
import { progressStorageKey } from '../lib/gameProgress';
import type { GameMode, GameProgress } from '../lib/gameProgress';
import { ProgressSync, readProgressCache, serializeProgressCache, emptyProgressCache } from '../lib/progressSync';
import type { ProgressSyncState } from '../lib/progressSync';
import { progressTransport } from '../services/progressService';
import { CHALLENGE, TARGET } from '../lib/musicGame';

function loadCache(key: string, target: readonly number[], mode: GameMode) {
  try { return { ...readProgressCache(window.localStorage.getItem(key), target, mode), storageError: false }; }
  catch { return { ...emptyProgressCache(), storageError: true }; }
}

export function useBrodleProgress(challengeId = CHALLENGE.id, target: readonly number[] = TARGET, mode: GameMode = 'guided') {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const key = progressStorageKey(challengeId, target, userId);
  const session = useRef<ProgressSync>();
  const [state, setState] = useState<ProgressSyncState & { storageError: boolean }>(() => ({
    ...loadCache(key, target, mode), loading: Boolean(userId), status: userId ? 'loading' : 'local',
  }));

  useEffect(() => {
    const initial = loadCache(key, target, mode);
    const sync = new ProgressSync(target, initial, userId ? progressTransport(userId, challengeId, target, mode) : undefined, (next) => {
      let storageError = false;
      try { window.localStorage.setItem(key, serializeProgressCache(next.progress, next.pending)); }
      catch { storageError = true; }
      setState({ ...next, storageError });
    }, mode);
    session.current = sync;
    setState({ ...sync.state, storageError: initial.storageError });
    void sync.sync();

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
      sync.dispose();
      if (session.current === sync) session.current = undefined;
      window.clearInterval(retry);
      window.removeEventListener('storage', receiveProgress);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [key, challengeId, userId, target, mode]);

  const updateProgress = useCallback((update: (previous: GameProgress) => GameProgress) => {
    const sync = session.current;
    if (!sync) return { previous: state.progress, next: state.progress };
    const cached = loadCache(key, target, mode);
    sync.receive(cached.progress, cached.pending);
    return sync.update(update);
  }, [key, target, mode, state.progress]);

  return { ...state, updateProgress, retrySync: () => void session.current?.sync(), accountProgress: Boolean(userId) };
}
