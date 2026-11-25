import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../auth/authContext';
import { emptyProgress, hasProgress, legacyHardStorageKey, mergeProgress, progressStorageKey } from '../lib/gameProgress';
import type { GameProgress } from '../lib/gameProgress';
import { ProgressSync, readProgressCache, serializeProgressCache, emptyProgressCache } from '../lib/progressSync';
import type { ProgressSyncState } from '../lib/progressSync';
import { loadLegacyHardProgress, progressTransport } from '../services/progressService';
import { CHALLENGE, TARGET } from '../lib/musicGame';

function loadCache(key: string, target: readonly number[]) {
  try { return { ...readProgressCache(window.localStorage.getItem(key), target), storageError: false }; }
  catch { return { ...emptyProgressCache(), storageError: true }; }
}

function initialCache(key: string, legacyKey: string, target: readonly number[], account: boolean) {
  const cached = loadCache(key, target);
  if (account || hasProgress(cached.progress)) return cached;
  // The canonical key remains after Clear, so a retired draft cannot return.
  try { if (window.localStorage.getItem(key) !== null) return cached; }
  catch { return cached; }
  const legacy = loadCache(legacyKey, target);
  return { ...legacy, storageError: cached.storageError || legacy.storageError };
}

export function useBrodleProgress(challengeId = CHALLENGE.id, target: readonly number[] = TARGET) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const key = progressStorageKey(challengeId, target, userId);
  const legacyKey = legacyHardStorageKey(challengeId, target, userId);
  const session = useRef<{ key: string; sync: ProgressSync }>();
  const [state, setState] = useState<ProgressSyncState & { storageError: boolean; key: string }>(() => ({
    ...initialCache(key, legacyKey, target, Boolean(userId)), loading: Boolean(userId), status: userId ? 'loading' : 'local', key,
  }));

  useEffect(() => {
    const initial = initialCache(key, legacyKey, target, Boolean(userId));
    const changed = (next: ProgressSyncState) => {
      let storageError = false;
      try { window.localStorage.setItem(key, serializeProgressCache(next.progress, next.pending)); }
      catch { storageError = true; }
      setState({ ...next, storageError, key });
    };
    const transport = userId ? progressTransport(userId, challengeId, target) : undefined;
    const fallback = userId ? async (signal: AbortSignal) => {
      const remote = await loadLegacyHardProgress(userId, challengeId, target, signal);
      const cached = loadCache(legacyKey, target);
      return mergeProgress(remote, cached.progress, target, cached.pending || !hasProgress(remote));
    } : undefined;
    const sync = new ProgressSync(target, initial, transport, changed, fallback);
    session.current = { key, sync };
    changed(sync.state);
    void sync.sync();

    const receiveProgress = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== key || event.newValue === null) return;
      const cached = readProgressCache(event.newValue, target);
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
      if (session.current?.sync === sync) session.current = undefined;
      window.clearInterval(retry);
      window.removeEventListener('storage', receiveProgress);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [key, legacyKey, challengeId, userId, target]);

  const updateProgress = useCallback((update: (previous: GameProgress) => GameProgress) => {
    const sync = session.current?.key === key ? session.current.sync : undefined;
    if (!sync) return { previous: state.progress, next: state.progress };
    const cached = loadCache(key, target);
    sync.receive(cached.progress, cached.pending);
    return sync.update(update);
  }, [key, target, state.progress]);

  // Do not expose the previous account or puzzle while its replacement loads.
  const { key: stateKey, ...savedState } = state;
  return { ...savedState, progress: stateKey === key ? state.progress : emptyProgress(),
    loading: stateKey !== key || state.loading, updateProgress,
    retrySync: () => { if (session.current?.key === key) void session.current.sync.sync(); },
    accountProgress: Boolean(userId) };
}
