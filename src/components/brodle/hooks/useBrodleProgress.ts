import { useCallback, useEffect, useRef, useState } from 'react';
import { progressStorageKey, emptyProgress, parseProgress, serializeProgress } from '../lib/gameProgress';
import type { GameProgress } from '../lib/gameProgress';
import { CHALLENGE, TARGET } from '../lib/musicGame';
import { BRODLE_RESET_EVENT } from '../../../auth/loginReset';

function readProgress(key: string, target: readonly number[], fallback = emptyProgress()) {
  try {
    const saved = window.localStorage.getItem(key);
    const progress = saved === null ? fallback : parseProgress(saved, target);
    // A stale tab must not discard attempts already made in this tab.
    return { progress: progress.attempts.length >= fallback.attempts.length ? progress : fallback, storageError: false };
  } catch {
    return { progress: fallback, storageError: true };
  }
}

export function useBrodleProgress(challengeId = CHALLENGE.id, target: readonly number[] = TARGET) {
  const key = progressStorageKey(challengeId, target);
  const [state, setState] = useState(() => readProgress(key, target));
  const current = useRef(state.progress);

  const updateProgress = useCallback((update: (previous: GameProgress) => GameProgress) => {
    // Read first so an already-open tab resumes the latest stored round too.
    const { progress: previous } = readProgress(key, target, current.current);
    const next = update(previous);
    let storageError = false;
    try {
      // Save within the input event, before a refresh can discard the render.
      window.localStorage.setItem(key, serializeProgress(next));
    } catch {
      storageError = true;
    }
    current.current = next;
    setState({ progress: next, storageError });
    return { previous, next };
  }, [key, target]);

  useEffect(() => {
    const reset = (event?: Event) => {
      const progress = emptyProgress();
      current.current = progress;
      const storageError = event instanceof CustomEvent && event.detail?.storageError === true;
      setState({ progress, storageError });
    };
    const receiveProgress = (event: StorageEvent) => {
      if (event.key !== null && event.key !== key) return;
      if (event.newValue === null) { reset(); return; }
      const progress = parseProgress(event.newValue, target);
      if (progress.attempts.length < current.current.attempts.length) return;
      current.current = progress;
      setState({ progress, storageError: false });
    };
    window.addEventListener('storage', receiveProgress);
    window.addEventListener(BRODLE_RESET_EVENT, reset);
    return () => {
      window.removeEventListener('storage', receiveProgress);
      window.removeEventListener(BRODLE_RESET_EVENT, reset);
    };
  }, [key, target]);

  return { ...state, updateProgress };
}
