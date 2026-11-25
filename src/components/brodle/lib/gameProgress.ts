import { CHALLENGE, TARGET, getWinKind, scoreGuess, PIANO_MIN_MIDI, PIANO_MAX_MIDI } from './musicGame';
import type { Attempt, Feedback } from './musicGame';

export type GameProgress = {
  guess: number[];
  attempts: Attempt[];
  selectedAttempt: number;
  hintsUsed: number;
  songHintUsed?: boolean;
};

// Keep the existing unprefixed round as the single canonical round.
export function progressStorageKey(id = CHALLENGE.id, target: readonly number[] = TARGET, userId: string | null = null) {
  return userId ? `brodle:progress:v2:user:${userId}:${id}:${target.join('-')}` : `brodle:progress:v1:${id}:${target.join('-')}`;
}

// Read-only compatibility source; new gameplay never saves to this key.
export function legacyHardStorageKey(id: string, target: readonly number[], userId: string | null) {
  return progressStorageKey(`hard:${id}`, target, userId);
}

export function hasProgress(progress: GameProgress): boolean {
  return progress.attempts.length > 0 || progress.guess.length > 0 || progress.hintsUsed > 0 || progress.songHintUsed === true;
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

export type NoteConstraint = { minMidi: number; maxMidi: number; lockedMidi: number | null };

export function noteConstraints(progress: GameProgress, target: readonly number[]): NoteConstraint[] {
  return target.map((midi, index) => {
    let minMidi = PIANO_MIN_MIDI;
    let maxMidi = PIANO_MAX_MIDI;
    let lockedMidi: number | null = index < progress.hintsUsed ? midi : null;
    for (const attempt of progress.attempts) {
      const pitch = attempt.notes[index];
      const feedback = attempt.feedback[index];
      if (feedback === 'correct') lockedMidi = pitch;
      else if (feedback === 'low') minMidi = Math.max(minMidi, pitch + 1);
      else if (feedback === 'high') maxMidi = Math.min(maxMidi, pitch - 1);
    }
    return lockedMidi === null ? { minMidi, maxMidi, lockedMidi } : { minMidi: lockedMidi, maxMidi: lockedMidi, lockedMidi };
  });
}

function restoreGuess(progress: GameProgress, target: readonly number[]): number[] {
  const notes = progress.guess;
  const constraints = noteConstraints(progress, target);
  const length = Math.max(notes.length, progress.hintsUsed);
  return Array.from({ length }, (_, index) => constraints[index].lockedMidi ?? notes[index]);
}

export function editProgressGuess(progress: GameProgress, notes: readonly number[], target: readonly number[]): GameProgress {
  if (isFinished(progress) || !validNotes(notes) || notes.length > target.length) return progress;
  const current = restoreGuess(progress, target);
  const constraints = noteConstraints(progress, target);
  const guess = Array.from({ length: Math.max(notes.length, progress.hintsUsed) }, (_, index) => constraints[index].lockedMidi ?? notes[index]);
  if (guess.some((midi, index) => midi !== current[index]
    && (midi < constraints[index].minMidi || midi > constraints[index].maxMidi))) return progress;
  return { ...progress, guess };
}

export function copyLastAttempt(progress: GameProgress, target: readonly number[]): GameProgress {
  return copyAttemptToDraft(progress, progress.attempts.length - 1, target);
}

export function copyAttemptToDraft(progress: GameProgress, index: number, target: readonly number[]): GameProgress {
  const attempt = Number.isInteger(index) ? progress.attempts[index] : undefined;
  if (!attempt || isFinished(progress)) return progress;
  const next = { ...progress, guess: [...attempt.notes] };
  return { ...next, guess: restoreGuess(next, target) };
}

export function guessRangeIssues(progress: GameProgress, target: readonly number[]): number[] {
  const constraints = noteConstraints(progress, target);
  return progress.guess.flatMap((midi, index) => {
    const constraint = constraints[index];
    return constraint && (midi < constraint.minMidi || midi > constraint.maxMidi) ? [index] : [];
  });
}

export function replaceGuessNote(progress: GameProgress, index: number, midi: number, target: readonly number[]): GameProgress {
  if (isFinished(progress) || !Number.isInteger(index) || index < 0 || index >= progress.guess.length) return progress;
  const constraint = noteConstraints(progress, target)[index];
  if (constraint.lockedMidi !== null || midi < constraint.minMidi || midi > constraint.maxMidi) return progress;
  return editProgressGuess(progress, progress.guess.map((note, position) => position === index ? midi : note), target);
}

export function canSubmitGuess(progress: GameProgress, target: readonly number[]): boolean {
  if (isFinished(progress) || !validNotes(progress.guess) || progress.guess.length !== target.length) return false;
  const last = progress.attempts[progress.attempts.length - 1];
  if (last && progress.guess.every((midi, index) => midi === last.notes[index])) return false;
  return guessRangeIssues(progress, target).length === 0;
}

export function guessFeedback(progress: GameProgress, target: readonly number[]): (Feedback | undefined)[] {
  const last = progress.attempts[progress.attempts.length - 1];
  const finished = isFinished(progress);
  const notes = finished && last ? last.notes : progress.guess;
  const constraints = noteConstraints(progress, target);
  return notes.map((midi, index) => {
    if (constraints[index].lockedMidi !== null) return 'correct';
    return finished && last?.notes[index] === midi ? last.feedback[index] : undefined;
  });
}

export function revealNextHint(progress: GameProgress, target: readonly number[]): GameProgress {
  if (isFinished(progress) || progress.hintsUsed >= hintLimit(target)) return progress;
  const next = { ...progress, hintsUsed: progress.hintsUsed + 1 };
  return { ...next, guess: restoreGuess(next, target) };
}

export function markSongHintUsed(progress: GameProgress): GameProgress {
  if (isFinished(progress) || progress.songHintUsed) return progress;
  return { ...progress, songHintUsed: true };
}

function winningFeedback(feedback: readonly Feedback[]): boolean {
  return feedback.length > 0 && feedback.every((value) => value === 'correct');
}

export function isFinished(progress: GameProgress): boolean {
  return progress.attempts.some((attempt) => winningFeedback(attempt.feedback));
}

export function winningAttempt(progress: GameProgress, target: readonly number[]) {
  for (const [index, attempt] of progress.attempts.entries()) {
    const kind = getWinKind(attempt.notes, target);
    if (kind) return { index, kind, offset: attempt.notes[0] - target[0] };
  }
  return null;
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
      if (winningFeedback(feedback)) break;
    }
    const progress = { ...emptyProgress(), attempts, hintsUsed: revealedHints,
      ...('songHintUsed' in saved && saved.songHintUsed === true ? { songHintUsed: true } : {}) };
    if (!isFinished(progress) && 'guess' in saved && validNotes(saved.guess) && saved.guess.length <= target.length) {
      progress.guess = saved.guess;
    }
    if (!isFinished(progress)) progress.guess = restoreGuess(progress, target);
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
    ...(progress.songHintUsed ? { songHintUsed: true } : {}),
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
      const feedback = scoreGuess(attempt.notes, target);
      attempts.push({ ...attempt, id, feedback });
      finished = winningFeedback(feedback);
    }
  }
  const draft = preferIncomingDraft ? incoming : saved;
  const selected = draft.attempts[draft.selectedAttempt];
  const selectedId = selected && (selected.id ?? legacyAttemptId(selected.notes, draft.selectedAttempt));
  const selectedIndex = attempts.findIndex((attempt) => attempt.id === selectedId);
  return parseProgress(serializeProgress({ guess: draft.guess, attempts, selectedAttempt: selectedIndex >= 0 ? selectedIndex : Math.max(0, attempts.length - 1),
    hintsUsed: Math.max(saved.hintsUsed, incoming.hintsUsed),
    ...(saved.songHintUsed || incoming.songHintUsed ? { songHintUsed: true } : {}),
  }), target);
}
