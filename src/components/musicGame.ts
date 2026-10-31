export type Feedback = 'correct' | 'octave' | 'shifted' | 'low' | 'high';
export type WinKind = 'exact' | 'octave' | 'shifted';
export type Attempt = { notes: number[]; feedback: Feedback[] };
export type NoteNaming = 'letters' | 'solfege';
export type MelodyStep = { midi: number | null; length: string; beats: number; rhythm: string };

// Quarter-note beats per minute, shared by MELODY and MELODY_FINAL.
export const BPM = 180;

const KEY_SIGNATURES = {
  Cb: -7, Gb: -6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1,
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
  Abm: -7, Ebm: -6, Bbm: -5, Fm: -4, Cm: -3, Gm: -2, Dm: -1,
  Am: 0, Em: 1, Bm: 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6, 'A#m': 7,
} as const;
export type MusicalKey = keyof typeof KEY_SIGNATURES;
export const MUSICAL_KEYS = Object.keys(KEY_SIGNATURES) as MusicalKey[];
// ABC key names: 'C' = C major, 'G' = G major, 'Am' = A minor, etc.
// MIDI pitches stay literal: in F major, 70 is B-flat and 71 is B natural.
export const KEY: MusicalKey = 'C';

export const CHALLENGE = {
  // Give each new challenge its own ID so saved rounds stay separate.
  id: 'supermario-v1',
  title: 'Super Mario Bros. Theme',
  source: 'Super Mario Bros. 1',
  hint: 'italian bros',
};

// Use midi: null for a rest. Rhythm and rests are hints, never guessed or scored.
export const MELODY: MelodyStep[] = [
  { midi: 76, length: '/2', beats: .5, rhythm: 'Sixth note' },
  { midi: 76, length: '/2', beats: .5, rhythm: 'Sixth note' },
  { midi: null, length: '/2', beats: 0.5, rhythm: 'Eighth rest' },
  { midi: 76, length: '/2', beats: .5, rhythm: 'Sixth note' },
  { midi: null, length: '/2', beats: 0.5, rhythm: 'Eighth rest' },
  { midi: 72, length: '/2', beats: .5, rhythm: 'Sixth note' },
  { midi: 76, length: '/2', beats: .5, rhythm: 'Sixth note' },
  { midi: null, length: '/2', beats: 0.5, rhythm: 'Eighth rest' },
  { midi: 79, length: '/2', beats: .5, rhythm: 'Sixth note' },
  { midi: null, length: '1', beats: 1, rhythm: 'Quarter rest' },
  { midi: null, length: '/2', beats: 0.5, rhythm: 'Eighth rest' },
  { midi: 67, length: '/2', beats: .5, rhythm: 'Sixth note' },
];


export const MELODY_FINAL: MelodyStep[] = [
  { midi: 76, length: '/2', beats: .5, rhythm: 'Sixth note' },
  { midi: 76, length: '/2', beats: .5, rhythm: 'Sixth note' },
  { midi: null, length: '/2', beats: 0.5, rhythm: 'Eighth rest' },
  { midi: 76, length: '/2', beats: .5, rhythm: 'Sixth note' },
  { midi: null, length: '/2', beats: 0.5, rhythm: 'Eighth rest' },
  { midi: 72, length: '/2', beats: .5, rhythm: 'Sixth note' },
  { midi: 76, length: '/2', beats: .5, rhythm: 'Sixth note' },
  { midi: null, length: '/2', beats: 0.5, rhythm: 'Eighth rest' },
  { midi: 79, length: '/2', beats: .5, rhythm: 'Sixth note' },
  { midi: null, length: '1.5', beats: 1.5, rhythm: 'Quarter rest' },
  { midi: 67, length: '/2', beats: .5, rhythm: 'Sixth note' },
];



export const TARGET = MELODY.flatMap((note) => note.midi === null ? [] : [note.midi]);
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const SOLFEGE_NAMES = ['Dó', 'Dó#', 'Ré', 'Mib', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Sib', 'Si'];
const NATURAL_PITCHES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function keyName(key: MusicalKey, naming: NoteNaming = 'letters'): string {
  const minor = key.endsWith('m');
  const tonic = minor ? key.slice(0, -1) : key;
  const root = naming === 'solfege' ? SOLFEGE_NAMES[NATURAL_PITCHES[tonic[0]]] : tonic[0];
  const accidental = tonic.slice(1).replace('#', '♯').replace('b', '♭');
  return `${root}${accidental} ${minor ? 'minor' : 'major'}`;
}

export function notationKey(notes: readonly number[], melody: readonly MelodyStep[] = MELODY, key: MusicalKey = KEY): MusicalKey {
  const target = melody.flatMap((step) => step.midi === null ? [] : [step.midi]);
  const offset = transpositionOffset(notes, target) ?? 0;
  if (offset % 12 === 0) return key;
  const tonic = NATURAL_PITCHES[key[0]] + (key[1] === '#' ? 1 : key[1] === 'b' ? -1 : 0);
  const major: MusicalKey[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const minor: MusicalKey[] = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
  return (key.endsWith('m') ? minor : major)[((tonic + offset) % 12 + 12) % 12];
}

function keyAccidentals(key: MusicalKey): Record<string, number> {
  const count = KEY_SIGNATURES[key];
  const accidentals: Record<string, number> = {};
  const order = count < 0 ? 'BEADGCF' : 'FCGDAEB';
  for (const letter of order.slice(0, Math.abs(count))) accidentals[letter] = count < 0 ? -1 : 1;
  return accidentals;
}

function spellPitch(midi: number, key: MusicalKey) {
  const signature = keyAccidentals(key);
  const diatonic = Object.keys(NATURAL_PITCHES).find((letter) =>
    (NATURAL_PITCHES[letter] + (signature[letter] ?? 0) + 12) % 12 === midi % 12,
  );
  const names = KEY_SIGNATURES[key] < 0
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : KEY_SIGNATURES[key] > 0 ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] : NAMES;
  const name = names[midi % 12];
  const letter = diatonic ?? name[0];
  const accidental = diatonic ? signature[letter] ?? 0 : name.includes('#') ? 1 : name.includes('b') ? -1 : 0;
  const octave = (midi - NATURAL_PITCHES[letter] - accidental) / 12 - 1;
  return { letter, accidental, octave };
}

export function noteName(midi: number, naming: NoteNaming = 'letters', key?: MusicalKey): string {
  if (key !== undefined) {
    const { letter, accidental, octave } = spellPitch(midi, key);
    const root = naming === 'solfege' ? SOLFEGE_NAMES[NATURAL_PITCHES[letter]] : letter;
    return `${root}${accidental === 1 ? '#' : accidental === -1 ? 'b' : ''}${octave}`;
  }
  const names = naming === 'solfege' ? SOLFEGE_NAMES : NAMES;
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function transpositionOffset(guess: readonly number[], target: readonly number[]): number | null {
  if (guess.length < 2 || guess.length !== target.length) return null;
  const offset = guess[0] - target[0];
  return offset !== 0 && guess.every((note, i) => note - target[i] === offset) ? offset : null;
}

export function getWinKind(guess: readonly number[], target: readonly number[]): WinKind | null {
  if (!guess.length || guess.length !== target.length) return null;
  if (guess.every((note, index) => note === target[index])) return 'exact';
  const offset = transpositionOffset(guess, target);
  return offset === null ? null : offset % 12 === 0 ? 'octave' : 'shifted';
}

export function scoreGuess(guess: readonly number[], target: readonly number[]): Feedback[] {
  if (guess.length !== target.length) throw new Error('A guess must match the target length.');
  // A consistent transposition is a correct melody in a different pitch.
  const kind = getWinKind(guess, target);
  if (kind === 'octave' || kind === 'shifted') return guess.map(() => kind);
  return guess.map((note, i) => {
    if (note === target[i]) return 'correct';
    return note < target[i] ? 'low' : 'high';
  });
}

export function buildShareText(attempts: readonly Attempt[], target: readonly number[], url: string): string {
  const symbols: Record<Feedback, string> = { correct: '✓', octave: '↕', shifted: '♪', low: '↑', high: '↓' };
  const recent = attempts.slice(-4);
  const start = attempts.length - recent.length;
  const exactWin = attempts.findIndex((attempt) => attempt.feedback.every((value) => value === 'correct'));
  const octaveWin = attempts.findIndex((attempt) => getWinKind(attempt.notes, target) === 'octave');
  const melodyWin = attempts.findIndex((attempt) => getWinKind(attempt.notes, target) === 'shifted');
  const count = (value: number) => `${value} ${value === 1 ? 'attempt' : 'attempts'}`;
  const summary = exactWin !== -1
    ? `Exact pitch found in ${count(exactWin + 1)}!`
    : octaveWin !== -1
      ? `Melody found in ${count(octaveWin + 1)} — different octave!`
      : melodyWin !== -1
        ? `Melody found in ${count(melodyWin + 1)} — shifted pitch!`
        : `${count(attempts.length)} so far`;
  const shifted = recent.some((attempt) => getWinKind(attempt.notes, target) === 'shifted');
  const octave = recent.some((attempt) => getWinKind(attempt.notes, target) === 'octave');

  return [
    `Brodle${exactWin !== -1 ? ' 🎉' : octaveWin !== -1 ? ' ↕' : melodyWin !== -1 ? ' ♪' : ''}`,
    summary, `Latest ${recent.length} of ${count(attempts.length)}:`,
    ...recent.map((attempt, index) =>
      `${start + index + 1}. ${attempt.feedback.map((value) => symbols[value]).join('')}`,
    ),
    '', '✓ exact pitch · ↑ play higher · ↓ play lower',
    ...(shifted ? ['♪ correct melody, shifted pitch'] : []),
    ...(octave ? ['↕ correct melody, different octave'] : []),
    url,
  ].join('\n');
}

export function melodyForGuess<T extends { midi: number | null }>(notes: readonly number[], melody: readonly T[]): T[] {
  if (!notes.length) return [];
  const complete = notes.length === melody.filter((step) => step.midi !== null).length;
  const sequence: T[] = [];
  let position = 0;
  for (const step of melody) {
    // Include leading/between-note rests, and trailing rests on a complete guess.
    // A partial guess must not reveal the rhythm of future notes or rests.
    if (position === notes.length && (!complete || step.midi !== null)) break;
    sequence.push(step.midi === null ? { ...step } : { ...step, midi: notes[position++] });
  }
  return sequence;
}

export function toAbc(notes: readonly number[], naming: NoteNaming = 'letters', melody: readonly MelodyStep[] = MELODY, key: MusicalKey = KEY): string {
  return renderMelodyAbc(melodyForGuess(notes, melody), naming, key, BPM);
}

// Render a complete authored melody, including rest-only scores and tied notes
// crossing a bar line. Guesses keep one rendered note per scored pitch above.
export function melodyToAbc(melody: readonly MelodyStep[], naming: NoteNaming, key: MusicalKey, bpm: number): string {
  const fragments: (MelodyStep & { tie?: boolean; hideLabel?: boolean })[] = [];
  let position = 0;
  for (const step of melody) {
    let remaining = step.beats;
    let first = true;
    while (remaining > 0) {
      const beats = Math.min(remaining, 4 - position);
      remaining -= beats;
      fragments.push({ ...step, beats, length: abcLength(beats), tie: step.midi !== null && remaining > 0, hideLabel: !first });
      first = false;
      position = (position + beats) % 4;
    }
  }
  return renderMelodyAbc(fragments, naming, key, bpm);
}

export function abcLength(beats: number): string {
  let numerator = Math.round(beats * 8);
  let denominator = 8;
  while (denominator > 1 && numerator % 2 === 0) { numerator /= 2; denominator /= 2; }
  return denominator === 1 ? String(numerator) : numerator === 1 ? `/${denominator}` : `${numerator}/${denominator}`;
}

function renderMelodyAbc(melody: readonly (MelodyStep & { tie?: boolean; hideLabel?: boolean })[], naming: NoteNaming, key: MusicalKey, bpm: number): string {
  const altered = new Map<string, number>();
  const signature = keyAccidentals(key);
  const tokens: string[] = [];
  let beatsInBar = 0;
  melody.forEach(({ midi, length, beats, tie, hideLabel }) => {
    if (beatsInBar >= 4) {
      tokens.push('|');
      altered.clear();
      beatsInBar = 0;
    }
    if (midi === null) {
      tokens.push(`z${length}`);
      beatsInBar += beats;
      return;
    }
    const spelling = spellPitch(midi, key);
    const { octave } = spelling;
    const letter = octave >= 5 ? spelling.letter.toLowerCase() : spelling.letter;
    const suffix = octave >= 5 ? "'".repeat(octave - 5) : ','.repeat(4 - octave);
    const pitch = `${spelling.letter}${octave}`;
    let accidental = '';
    if ((altered.get(pitch) ?? signature[spelling.letter] ?? 0) !== spelling.accidental) {
      accidental = spelling.accidental === 1 ? '^' : spelling.accidental === -1 ? '_' : '=';
    }
    altered.set(pitch, spelling.accidental);
    tokens.push(`${hideLabel ? '' : `"_${noteName(midi, naming, key)}"`}${accidental}${letter}${suffix}${length}${tie ? '-' : ''}`);
    beatsInBar += beats;
  });
  // No future durations are visible. An invisible spacer draws an empty staff.
  const music = tokens.length ? tokens.join(' ') : 'x4';
  return `X:1\nM:4/4\nL:1/4\nQ:1/4=${bpm}\nK:${key} clef=treble\n${music} |]\n`;
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
