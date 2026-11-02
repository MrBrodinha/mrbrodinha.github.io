import { CHALLENGE, TARGET, scoreGuess, PIANO_MIN_MIDI, PIANO_MAX_MIDI } from './musicGame';
import type { Attempt } from './musicGame';

export type GameProgress = {
  guess: number[];
  attempts: Attempt[];
  selectedAttempt: number;
  hintsUsed: number;
};

// A changed challenge or target gets a fresh round, independent of deployments.
export function progressStorageKey(id = CHALLENGE.id, target: readonly number[] = TARGET, userId: string | null = null) {
  return userId ? `brodle:progress:v2:user:${userId}:${id}:${target.join('-')}` : `brodle:progress:v1:${id}:${target.join('-')}`;
}
export const PROGRESS_STORAGE_KEY = progressStorageKey();

export function emptyProgress(): GameProgress {
  return { guess: [], attempts: [], selectedAttempt: 0, hintsUsed: 0 };
}

export function hintLimit(target: readonly number[]): number {
  return Math.floor(target.length / 2);
}

function validHintCount(value: unknown, target: readonly number[]): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= hintLimit(target) ? value : 0;
}

export function editProgressGuess(progress: GameProgress, notes: readonly number[], target: readonly number[]): GameProgress {
  if (isFinished(progress)) return progress;
  return { ...progress, guess: [...target.slice(0, progress.hintsUsed), ...notes.slice(progress.hintsUsed)] };
}

export function revealNextHint(progress: GameProgress, target: readonly number[]): GameProgress {
  if (isFinished(progress) || progress.hintsUsed >= hintLimit(target)) return progress;
  return editProgressGuess({ ...progress, hintsUsed: progress.hintsUsed + 1 }, progress.guess, target);
}

export function isFinished(progress: GameProgress): boolean {
  return progress.attempts.some((attempt) => attempt.feedback.every((value) => value === 'correct'));
}

function validNotes(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((note) => Number.isInteger(note) && note >= PIANO_MIN_MIDI && note <= PIANO_MAX_MIDI);
}

export function parseProgress(serialized: string | null, target: readonly number[] = TARGET): GameProgress {
  if (serialized === null) return emptyProgress();
  try {
    const saved: unknown = JSON.parse(serialized);
    if (typeof saved !== 'object' || saved === null || !('attempts' in saved) || !Array.isArray(saved.attempts)) {
      return emptyProgress();
    }
    const attempts: Attempt[] = [];
    const ids = 'attemptIds' in saved && Array.isArray(saved.attemptIds) ? saved.attemptIds : [];
    const attemptHints = 'attemptHints' in saved && Array.isArray(saved.attemptHints) ? saved.attemptHints : [];
    let revealedHints = validHintCount('hintsUsed' in saved ? saved.hintsUsed : 0, target);
    const seen = new Set<string>();
    for (const [index, notes] of saved.attempts.entries()) {
      // Keep valid history if a later entry is damaged. Recompute all feedback.
      if (!validNotes(notes) || notes.length !== target.length) break;
      const feedback = scoreGuess(notes, target);
      const id = typeof ids[index] === 'string' && /^[A-Za-z0-9:-]{1,1500}$/.test(ids[index]) ? ids[index] : legacyAttemptId(notes, index);
      if (seen.has(id)) continue;
      seen.add(id);
      const hintsUsed = validHintCount(attemptHints[index], target);
      const verifiedHints = notes.slice(0, hintsUsed).every((note, position) => note === target[position]) ? hintsUsed : 0;
      attempts.push({ id, notes, feedback, ...(verifiedHints ? { hintsUsed: verifiedHints } : {}) });
      revealedHints = Math.max(revealedHints, verifiedHints);
      if (feedback.every((value) => value === 'correct')) break;
    }
    const progress = { ...emptyProgress(), attempts, hintsUsed: revealedHints };
    if (!isFinished(progress) && 'guess' in saved && validNotes(saved.guess) && saved.guess.length <= target.length) {
      progress.guess = saved.guess;
    }
    if (!isFinished(progress)) progress.guess = editProgressGuess(progress, progress.guess, target).guess;
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
    attemptIds: progress.attempts.map((attempt, index) => attempt.id ?? legacyAttemptId(attempt.notes, index)),
    selectedAttempt: progress.selectedAttempt,
    hintsUsed: progress.hintsUsed,
    attemptHints: progress.attempts.map((attempt) => attempt.hintsUsed ?? 0),
  });
}

function legacyAttemptId(notes: readonly number[], index: number) {
  return `legacy:${index}:${notes.join('-')}`;
}

// Append attempts by identity so retries and stale devices cannot erase history.
export function mergeProgress(saved: GameProgress, incoming: GameProgress, target: readonly number[], preferIncomingDraft = true): GameProgress {
  const attempts: Attempt[] = [];
  const seen = new Set<string>();
  let finished = false;
  for (const part of [saved, incoming]) {
    for (const [index, attempt] of part.attempts.entries()) {
      if (finished) break;
      const id = attempt.id ?? legacyAttemptId(attempt.notes, index);
      if (seen.has(id)) continue;
      seen.add(id);
      attempts.push({ ...attempt, id });
      finished = attempt.feedback.every((value) => value === 'correct');
    }
  }
  const draft = preferIncomingDraft ? incoming : saved;
  const selected = draft.attempts[draft.selectedAttempt];
  const selectedId = selected && (selected.id ?? legacyAttemptId(selected.notes, draft.selectedAttempt));
  const selectedIndex = attempts.findIndex((attempt) => attempt.id === selectedId);
  return parseProgress(serializeProgress({ guess: draft.guess, attempts, selectedAttempt: selectedIndex >= 0 ? selectedIndex : Math.max(0, attempts.length - 1),
    hintsUsed: Math.max(saved.hintsUsed, incoming.hintsUsed),
  }), target);
}
