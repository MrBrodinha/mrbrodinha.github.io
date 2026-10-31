export type Feedback = 'correct' | 'low' | 'high';
export type Attempt = { notes: number[]; feedback: Feedback[] };
export type NoteNaming = 'letters' | 'solfege';

export const CHALLENGE = {
  title: 'Freddy’s Jumpscare',
  source: 'Five Nights at Freddy’s 1',
  hint: 'freddy jumpscare in fnaf 1',
};

// Challenge pitches and rhythm. Durations are hints, never guessed or scored.
export const MELODY = [
  { midi: 72, length: '1', beats: 1, rhythm: 'Quarter note' },
  { midi: 74, length: '3/4', beats: .75, rhythm: 'Dotted eighth note' },
  { midi: 72, length: '/4', beats: .25, rhythm: 'Sixteenth note' },
  { midi: 69, length: '1', beats: 1, rhythm: 'Quarter note' },
  { midi: 69, length: '1', beats: 1, rhythm: 'Quarter note' },
];

export const MELODY_FINAL = [
  { midi: 72, length: '1', beats: 1, rhythm: 'Quarter note' },
  { midi: 74, length: '3/4', beats: .75, rhythm: 'Dotted eighth note' },
  { midi: 72, length: '/4', beats: .25, rhythm: 'Sixteenth note' },
  { midi: 69, length: '1', beats: 1, rhythm: 'Quarter note' },
  { midi: 69, length: '1', beats: 1, rhythm: 'Quarter note' },
  { midi: 69, length: '3/4', beats: .75, rhythm: 'Dotted eighth note' },
  { midi: 67, length: '/4', beats: .25, rhythm: 'Sixteenth note' },
  { midi: 69, length: '3/4', beats: .75, rhythm: 'Dotted eighth note' },
  { midi: 70, length: '/4', beats: .25, rhythm: 'Sixteenth note' },
  { midi: 69, length: '1', beats: 1, rhythm: 'Quarter note' },
];
export const TARGET = MELODY.map((note) => note.midi);
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const SOLFEGE_NAMES = ['Dó', 'Dó#', 'Ré', 'Mib', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Sib', 'Si'];

export function noteName(midi: number, naming: NoteNaming = 'letters'): string {
  const names = naming === 'solfege' ? SOLFEGE_NAMES : NAMES;
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function transpositionOffset(guess: readonly number[], target: readonly number[]): number | null {
  if (guess.length < 2 || guess.length !== target.length) return null;
  const offset = guess[0] - target[0];
  return offset !== 0 && guess.every((note, i) => note - target[i] === offset) ? offset : null;
}

export function scoreGuess(guess: readonly number[], target: readonly number[]): Feedback[] {
  if (guess.length !== target.length) throw new Error('A guess must match the target length.');
  // Every note is compared with the target pitch at the same position.
  return guess.map((note, i) => {
    if (note === target[i]) return 'correct';
    return note < target[i] ? 'low' : 'high';
  });
}

export function buildShareText(attempts: readonly Attempt[], target: readonly number[], url: string): string {
  const symbols: Record<Feedback, string> = { correct: '✓', low: '↑', high: '↓' };
  const recent = attempts.slice(-4);
  const start = attempts.length - recent.length;
  const exactWin = attempts.findIndex((attempt) => attempt.feedback.every((value) => value === 'correct'));
  const melodyWin = attempts.findIndex((attempt) => transpositionOffset(attempt.notes, target) !== null);
  const count = (value: number) => `${value} ${value === 1 ? 'attempt' : 'attempts'}`;
  const summary = exactWin !== -1
    ? `Exact pitch found in ${count(exactWin + 1)}!`
    : melodyWin !== -1
      ? `Melody found in ${count(melodyWin + 1)} — still chasing the correct pitch!`
      : `${count(attempts.length)} so far`;
  const shifted = recent.some((attempt) => transpositionOffset(attempt.notes, target) !== null);

  return [
    'Brodle', summary, `Latest ${recent.length} of ${count(attempts.length)}:`,
    ...recent.map((attempt, index) =>
      `${start + index + 1}. ${attempt.feedback.map((value) => symbols[value]).join('')}${transpositionOffset(attempt.notes, target) !== null ? ' ♪' : ''}`,
    ),
    '', '✓ correct · ↑ play higher · ↓ play lower',
    ...(shifted ? ['♪ right melody, shifted pitch'] : []),
    url,
  ].join('\n');
}

export function toAbc(notes: readonly number[], naming: NoteNaming = 'letters'): string {
  const altered = new Set<string>();
  const tokens: string[] = [];
  let beatsInBar = 0;
  MELODY.slice(0, notes.length).forEach(({ length, beats }, i) => {
    if (beatsInBar >= 4) {
      tokens.push('|');
      altered.clear();
      beatsInBar = 0;
    }
    const midi = notes[i];
    const name = NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    const letter = octave >= 5 ? name[0].toLowerCase() : name[0];
    const suffix = octave >= 5 ? "'".repeat(octave - 5) : ','.repeat(4 - octave);
    const pitch = `${name[0]}${octave}`;
    let accidental = '';
    if (name.length > 1) {
      accidental = name.includes('#') ? '^' : '_';
      altered.add(pitch);
    } else if (altered.has(pitch)) {
      accidental = '=';
      altered.delete(pitch);
    }
    tokens.push(`"_${noteName(midi, naming)}"${accidental}${letter}${suffix}${length}`);
    beatsInBar += beats;
  });
  // No future durations are visible. An invisible spacer draws an empty staff.
  const music = tokens.length ? tokens.join(' ') : 'x4';
  return `X:1\nM:4/4\nL:1/4\nK:C clef=treble\n${music} |]\n`;
}

const keys = Array.from({ length: 37 }, (_, i) => ({
  midi: 48 + i,
  name: noteName(48 + i),
  black: NAMES[(48 + i) % 12].length > 1,
}));
export const whiteKeys = keys.filter((key) => !key.black);
export const blackKeys = keys.filter((key) => key.black).map((key) => ({
  ...key,
  position: whiteKeys.filter((white) => white.midi < key.midi).length,
}));
