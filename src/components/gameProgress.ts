import { CHALLENGE, TARGET, scoreGuess } from './musicGame';
import type { Attempt } from './musicGame';

export type GameProgress = {
  guess: number[];
  attempts: Attempt[];
  selectedAttempt: number;
};

// A changed challenge or target gets a fresh round, independent of deployments.
export const PROGRESS_STORAGE_KEY = `brodle:progress:v1:${CHALLENGE.id}:${TARGET.join('-')}`;

export function emptyProgress(): GameProgress {
  return { guess: [], attempts: [], selectedAttempt: 0 };
}

export function isFinished(progress: GameProgress): boolean {
  return progress.attempts.some((attempt) => attempt.feedback.every((value) => value === 'correct'));
}

function validNotes(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((note) => Number.isInteger(note) && note >= 48 && note <= 84);
}

export function parseProgress(serialized: string | null): GameProgress {
  if (serialized === null) return emptyProgress();
  try {
    const saved: unknown = JSON.parse(serialized);
    if (typeof saved !== 'object' || saved === null || !('attempts' in saved) || !Array.isArray(saved.attempts)) {
      return emptyProgress();
    }
    const attempts: Attempt[] = [];
    for (const notes of saved.attempts) {
      // Keep valid history if a later entry is damaged. Recompute all feedback.
      if (!validNotes(notes) || notes.length !== TARGET.length) break;
      const feedback = scoreGuess(notes, TARGET);
      attempts.push({ notes, feedback });
      if (feedback.every((value) => value === 'correct')) break;
    }
    const progress = { ...emptyProgress(), attempts };
    if (!isFinished(progress) && 'guess' in saved && validNotes(saved.guess) && saved.guess.length <= TARGET.length) {
      progress.guess = saved.guess;
    }
    const selected = 'selectedAttempt' in saved ? saved.selectedAttempt : undefined;
    progress.selectedAttempt = typeof selected === 'number' && Number.isInteger(selected) && selected >= 0 && selected < attempts.length
      ? selected : Math.max(0, attempts.length - 1);
    return progress;
  } catch {
    return emptyProgress();
  }
}

export function serializeProgress(progress: GameProgress): string {
  return JSON.stringify({
    guess: progress.guess,
    attempts: progress.attempts.map((attempt) => attempt.notes),
    selectedAttempt: progress.selectedAttempt,
  });
}
