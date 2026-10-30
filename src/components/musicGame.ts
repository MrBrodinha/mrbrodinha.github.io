export type Feedback = 'correct' | 'present' | 'octave' | 'transposed' | 'absent';
export type Attempt = { notes: number[]; feedback: Feedback[] };

// Fixed five-note challenge. Durations are hints, never guessed or scored.
export const MELODY = [
  { midi: 72, length: '1', beats: 1, rhythm: 'Quarter note' },
  { midi: 74, length: '3/4', beats: .75, rhythm: 'Dotted eighth note' },
  { midi: 72, length: '/4', beats: .25, rhythm: 'Sixteenth note' },
  { midi: 69, length: '1', beats: 1, rhythm: 'Quarter note' },
  { midi: 69, length: '1', beats: 1, rhythm: 'Quarter note' },
];
export const TARGET = MELODY.map((note) => note.midi);
export const MAX_ATTEMPTS = 6;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function transpositionOffset(guess: readonly number[], target: readonly number[]): number | null {
  if (guess.length < 2 || guess.length !== target.length) return null;
  const offset = guess[0] - target[0];
  return offset !== 0 && guess.every((note, i) => note - target[i] === offset) ? offset : null;
}

export function scoreGuess(guess: readonly number[], target: readonly number[]): Feedback[] {
  if (guess.length !== target.length) throw new Error('A guess must match the target length.');
  // A consistent shift preserves the entire melody, including repeated notes.
  if (transpositionOffset(guess, target) !== null) return guess.map(() => 'transposed');
  const used = target.map(() => false);
  const result: Feedback[] = guess.map((note, i) => {
    if (note !== target[i]) return 'absent';
    used[i] = true;
    return 'correct';
  });
  // Reserve exact pitches before octave-only matches. Each occurrence counts once.
  guess.forEach((note, i) => {
    if (result[i] === 'correct') return;
    const match = target.findIndex((pitch, j) => !used[j] && pitch === note);
    if (match !== -1) {
      result[i] = 'present';
      used[match] = true;
    }
  });
  // Prefer the corresponding position when allocating wrong-octave matches.
  guess.forEach((note, i) => {
    if (result[i] === 'absent' && !used[i] && note % 12 === target[i] % 12) {
      result[i] = 'octave';
      used[i] = true;
    }
  });
  guess.forEach((note, i) => {
    if (result[i] !== 'absent') return;
    const match = target.findIndex((pitch, j) => !used[j] && pitch % 12 === note % 12);
    if (match !== -1) {
      result[i] = 'octave';
      used[match] = true;
    }
  });
  return result;
}

export function toAbc(notes: readonly number[]): string {
  const altered = new Set<string>();
  const tokens = MELODY.slice(0, notes.length).map(({ length }, i) => {
    const midi = notes[i];
    const name = NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    const letter = octave >= 5 ? name[0].toLowerCase() : name[0];
    const suffix = octave >= 5 ? "'".repeat(octave - 5) : ','.repeat(4 - octave);
    let accidental = '';
    if (name.includes('#')) {
      accidental = '^';
      altered.add(name[0]);
    } else if (altered.has(name[0])) {
      accidental = '=';
      altered.delete(name[0]);
    }
    return `${accidental}${letter}${suffix}${length}`;
  });
  // No future durations are visible. An invisible spacer draws an empty staff.
  const music = tokens.length ? tokens.join(' ') : 'x4';
  return `X:1\nM:4/4\nL:1/4\nK:C clef=treble\n${music} |]\n`;
}

const keys = Array.from({ length: 37 }, (_, i) => ({
  midi: 48 + i,
  name: noteName(48 + i),
  black: NAMES[(48 + i) % 12].includes('#'),
}));
export const whiteKeys = keys.filter((key) => !key.black);
export const blackKeys = keys.filter((key) => key.black).map((key) => ({
  ...key,
  position: whiteKeys.filter((white) => white.midi < key.midi).length,
}));
