import { CHALLENGE, TARGET, getWinKind, scoreGuess, PIANO_MIN_MIDI, PIANO_MAX_MIDI } from './musicGame';
import type { Attempt, Feedback } from './musicGame';

// Keep the saved preference values compatible: guided = Casual, classic = Hard.
export type GameMode = 'guided' | 'classic';
export const GAME_MODE_STORAGE_KEY = 'brodle:game-mode:v1';

export function gameModeStorageKey(challengeId: string, target: readonly number[], userId: string | null) {
  return `brodle:mode:v1:${userId ? 'user:' + userId : 'guest'}:${challengeId}:${target.join('-')}`;
}

export function modeWithAttempts(preferred: GameMode, rounds: Record<GameMode, GameProgress>): GameMode {
  const other = preferred === 'guided' ? 'classic' : 'guided';
  return rounds[preferred].attempts.length || !rounds[other].attempts.length ? preferred : other;
}

export type GameProgress = {
  guess: number[];
  attempts: Attempt[];
  selectedAttempt: number;
  hintsUsed: number;
};

// Existing shared rounds stay in Casual. Hard has its own browser/account ID.
export function progressRoundId(challengeId: string, mode: GameMode = 'guided') {
  return mode === 'classic' ? `hard:${challengeId}` : challengeId;
}

// A changed challenge, target, or mode gets an independent round.
export function progressStorageKey(id = CHALLENGE.id, target: readonly number[] = TARGET, userId: string | null = null, mode: GameMode = 'guided') {
  const roundId = progressRoundId(id, mode);
  return userId ? `brodle:progress:v2:user:${userId}:${roundId}:${target.join('-')}` : `brodle:progress:v1:${roundId}:${target.join('-')}`;
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

export function noteConstraints(progress: GameProgress, target: readonly number[], mode: GameMode = 'guided'): NoteConstraint[] {
  return target.map((midi, index) => {
    let minMidi = PIANO_MIN_MIDI;
    let maxMidi = PIANO_MAX_MIDI;
    let lockedMidi: number | null = index < progress.hintsUsed ? midi : null;
    for (const attempt of mode === 'guided' ? progress.attempts : []) {
      const pitch = attempt.notes[index];
      const feedback = attempt.feedback[index];
      const transposed = feedback === 'octave' || feedback === 'shifted';
      if (feedback === 'correct') lockedMidi = pitch;
      else if (feedback === 'low' || (transposed && pitch < midi)) minMidi = Math.max(minMidi, pitch + 1);
      else if (feedback === 'high' || (transposed && pitch > midi)) maxMidi = Math.min(maxMidi, pitch - 1);
    }
    return lockedMidi === null ? { minMidi, maxMidi, lockedMidi } : { minMidi: lockedMidi, maxMidi: lockedMidi, lockedMidi };
  });
}

function restoreGuess(progress: GameProgress, target: readonly number[], mode: GameMode): number[] {
  const notes = progress.guess;
  const constraints = noteConstraints(progress, target, mode);
  const length = Math.max(notes.length, progress.hintsUsed);
  return Array.from({ length }, (_, index) => constraints[index].lockedMidi ?? notes[index]);
}

export function editProgressGuess(progress: GameProgress, notes: readonly number[], target: readonly number[], mode: GameMode = 'guided'): GameProgress {
  if (isFinished(progress, mode) || !validNotes(notes) || notes.length > target.length) return progress;
  const current = restoreGuess(progress, target, mode);
  const constraints = noteConstraints(progress, target, mode);
  const guess = Array.from({ length: Math.max(notes.length, progress.hintsUsed) }, (_, index) => constraints[index].lockedMidi ?? notes[index]);
  if (guess.some((midi, index) => midi !== current[index]
    && (midi < constraints[index].minMidi || midi > constraints[index].maxMidi))) return progress;
  return { ...progress, guess };
}

export function copyLastAttempt(progress: GameProgress, target: readonly number[], mode: GameMode = 'guided'): GameProgress {
  return copyAttemptToDraft(progress, progress.attempts.length - 1, target, mode);
}

export function copyAttemptToDraft(progress: GameProgress, index: number, target: readonly number[], mode: GameMode = 'guided'): GameProgress {
  const attempt = Number.isInteger(index) ? progress.attempts[index] : undefined;
  if (!attempt || isFinished(progress, mode)) return progress;
  const next = { ...progress, guess: [...attempt.notes] };
  return { ...next, guess: restoreGuess(next, target, mode) };
}

export function guessRangeIssues(progress: GameProgress, target: readonly number[], mode: GameMode = 'guided'): number[] {
  const constraints = noteConstraints(progress, target, mode);
  return progress.guess.flatMap((midi, index) => {
    const constraint = constraints[index];
    return constraint && (midi < constraint.minMidi || midi > constraint.maxMidi) ? [index] : [];
  });
}

export function replaceGuessNote(progress: GameProgress, index: number, midi: number, target: readonly number[], mode: GameMode = 'guided'): GameProgress {
  if (isFinished(progress, mode) || !Number.isInteger(index) || index < 0 || index >= progress.guess.length) return progress;
  const constraint = noteConstraints(progress, target, mode)[index];
  if (constraint.lockedMidi !== null || midi < constraint.minMidi || midi > constraint.maxMidi) return progress;
  return editProgressGuess(progress, progress.guess.map((note, position) => position === index ? midi : note), target, mode);
}

export function canSubmitGuess(progress: GameProgress, target: readonly number[], mode: GameMode = 'guided'): boolean {
  if (isFinished(progress, mode) || !validNotes(progress.guess) || progress.guess.length !== target.length) return false;
  const last = progress.attempts[progress.attempts.length - 1];
  if (mode === 'guided' && last && progress.guess.every((midi, index) => midi === last.notes[index])) return false;
  return guessRangeIssues(progress, target, mode).length === 0;
}

export function guessFeedback(progress: GameProgress, target: readonly number[], mode: GameMode = 'guided'): (Feedback | undefined)[] {
  const last = progress.attempts[progress.attempts.length - 1];
  const finished = isFinished(progress, mode);
  const notes = finished && last ? last.notes : progress.guess;
  const constraints = noteConstraints(progress, target, mode);
  return notes.map((midi, index) => {
    if (constraints[index].lockedMidi !== null) return 'correct';
    return finished && last?.notes[index] === midi ? last.feedback[index] : undefined;
  });
}

export function revealNextHint(progress: GameProgress, target: readonly number[], mode: GameMode = 'guided'): GameProgress {
  if (isFinished(progress, mode) || progress.hintsUsed >= hintLimit(target)) return progress;
  const next = { ...progress, hintsUsed: progress.hintsUsed + 1 };
  return { ...next, guess: restoreGuess(next, target, mode) };
}

function winningFeedback(feedback: readonly Feedback[], mode: GameMode): boolean {
  const first = feedback[0];
  return (first === 'correct' || (mode === 'guided' && (first === 'octave' || first === 'shifted')))
    && feedback.every((value) => value === first);
}

export function isFinished(progress: GameProgress, mode: GameMode = 'guided'): boolean {
  return progress.attempts.some((attempt) => winningFeedback(attempt.feedback, mode));
}

export function winningAttempt(progress: GameProgress, target: readonly number[], mode: GameMode = 'guided') {
  for (const [index, attempt] of progress.attempts.entries()) {
    const kind = getWinKind(attempt.notes, target, mode === 'classic');
    if (kind) return { index, kind, offset: attempt.notes[0] - target[0] };
  }
  return null;
}

function validNotes(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((note) => Number.isInteger(note) && note >= PIANO_MIN_MIDI && note <= PIANO_MAX_MIDI);
}

export function parseProgress(serialized: string | null, target: readonly number[] = TARGET, mode: GameMode = 'guided'): GameProgress {
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
      const feedback = scoreGuess(notes, target, mode === 'classic');
      const id = typeof ids[index] === 'string' && /^[A-Za-z0-9:-]{1,1500}$/.test(ids[index]) ? ids[index] : legacyAttemptId(notes, index);
      if (seen.has(id)) continue;
      seen.add(id);
      const hintsUsed = validHintCount(attemptHints[index], target);
      const verifiedHints = notes.slice(0, hintsUsed).every((note, position) => note === target[position]) ? hintsUsed : 0;
      attempts.push({ id, notes, feedback, ...(verifiedHints ? { hintsUsed: verifiedHints } : {}) });
      revealedHints = Math.max(revealedHints, verifiedHints);
      if (winningFeedback(feedback, mode)) break;
    }
    const progress = { ...emptyProgress(), attempts, hintsUsed: revealedHints };
    if (!isFinished(progress, mode) && 'guess' in saved && validNotes(saved.guess) && saved.guess.length <= target.length) {
      progress.guess = saved.guess;
    }
    if (!isFinished(progress, mode)) progress.guess = restoreGuess(progress, target, mode);
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
export function mergeProgress(saved: GameProgress, incoming: GameProgress, target: readonly number[], preferIncomingDraft = true, mode: GameMode = 'guided'): GameProgress {
  const attempts: Attempt[] = [];
  const seen = new Set<string>();
  let finished = false;
  for (const part of [saved, incoming]) {
    for (const [index, attempt] of part.attempts.entries()) {
      if (finished) break;
      const id = attempt.id ?? legacyAttemptId(attempt.notes, index);
      if (seen.has(id)) continue;
      seen.add(id);
      const feedback = scoreGuess(attempt.notes, target, mode === 'classic');
      attempts.push({ ...attempt, id, feedback });
      finished = winningFeedback(feedback, mode);
    }
  }
  const draft = preferIncomingDraft ? incoming : saved;
  const selected = draft.attempts[draft.selectedAttempt];
  const selectedId = selected && (selected.id ?? legacyAttemptId(selected.notes, draft.selectedAttempt));
  const selectedIndex = attempts.findIndex((attempt) => attempt.id === selectedId);
  return parseProgress(serializeProgress({ guess: draft.guess, attempts, selectedAttempt: selectedIndex >= 0 ? selectedIndex : Math.max(0, attempts.length - 1),
    hintsUsed: Math.max(saved.hintsUsed, incoming.hintsUsed),
  }), target, mode);
}
