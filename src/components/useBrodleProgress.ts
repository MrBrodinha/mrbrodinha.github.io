import { useCallback, useEffect, useRef, useState } from 'react';
import { PROGRESS_STORAGE_KEY, emptyProgress, parseProgress, serializeProgress } from './gameProgress';
import type { GameProgress } from './gameProgress';

function readProgress(fallback = emptyProgress()) {
  try {
    const saved = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    const progress = saved === null ? fallback : parseProgress(saved);
    // A stale tab must not discard attempts already made in this tab.
    return { progress: progress.attempts.length >= fallback.attempts.length ? progress : fallback, storageError: false };
  } catch {
    return { progress: fallback, storageError: true };
  }
}

export function useBrodleProgress() {
  const [state, setState] = useState(() => readProgress());
  const current = useRef(state.progress);

  const updateProgress = useCallback((update: (previous: GameProgress) => GameProgress) => {
    // Read first so an already-open tab resumes the latest stored round too.
    const { progress: previous } = readProgress(current.current);
    const next = update(previous);
    let storageError = false;
    try {
      // Save within the input event, before a refresh can discard the render.
      window.localStorage.setItem(PROGRESS_STORAGE_KEY, serializeProgress(next));
    } catch {
      storageError = true;
    }
    current.current = next;
    setState({ progress: next, storageError });
    return { previous, next };
  }, []);

  useEffect(() => {
    const receiveProgress = (event: StorageEvent) => {
      if (event.key !== PROGRESS_STORAGE_KEY || event.newValue === null) return;
      const progress = parseProgress(event.newValue);
      if (progress.attempts.length < current.current.attempts.length) return;
      current.current = progress;
      setState({ progress, storageError: false });
    };
    window.addEventListener('storage', receiveProgress);
    return () => window.removeEventListener('storage', receiveProgress);
  }, []);

  return { ...state, updateProgress };
}
