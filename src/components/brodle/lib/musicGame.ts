export type Feedback = 'correct' | 'octave' | 'shifted' | 'low' | 'high';
export type WinKind = 'exact' | 'octave' | 'shifted';
export type Attempt = { id?: string; notes: number[]; feedback: Feedback[]; hintsUsed?: number };
export type NoteNaming = 'letters' | 'solfege';
export type TripletPosition = 1 | 2 | 3;
export type MelodyStep = { midi: number | null; length: string; beats: number; rhythm: string; triplet?: TripletPosition };

// Written durations stay unchanged; a triplet takes two thirds of that time.
// 96 ticks also represent dotted 32nds and tied fragments at triplet bar lines.
export const RHYTHM_TICKS = 96;
export const stepTicks = (step: Pick<MelodyStep, 'beats' | 'triplet'>) => Math.round(step.beats * RHYTHM_TICKS * (step.triplet ? 2 / 3 : 1));
export const stepBeats = (step: Pick<MelodyStep, 'beats' | 'triplet'>) => stepTicks(step) / RHYTHM_TICKS;
export const melodyBeats = (steps: readonly Pick<MelodyStep, 'beats' | 'triplet'>[]) => steps.reduce((sum, step) => sum + stepTicks(step), 0) / RHYTHM_TICKS;

export function validateTriplets(steps: readonly Pick<MelodyStep, 'beats' | 'triplet'>[], complete = false) {
  let expected = 1;
  let duration = 0;
  let elapsed = 0;
  for (const step of steps) {
    if (step.triplet === undefined) {
      if (expected !== 1) throw new Error('Complete each triplet with three entries.');
    } else {
      // abcjs supports flags through 64ths. Starting halfway through a 32nd
      // would need unsupported 128th-note ties when a triplet crosses a bar.
      if (expected === 1 && elapsed % 4 !== 0) throw new Error('Complete the dotted 32nd subdivision before starting a triplet.');
      if (![1, 2, 3].includes(step.triplet) || step.triplet !== expected || ![.5, 1].includes(step.beats)
        || (expected !== 1 && step.beats !== duration)) throw new Error('Use three matching eighth or quarter notes/rests per triplet.');
      duration = step.beats;
      expected = step.triplet === 3 ? 1 : step.triplet + 1;
    }
    elapsed += stepTicks(step);
  }
  if (complete && expected !== 1) throw new Error('Complete each triplet with three entries.');
}

export const PIANO_MIN_MIDI = 31; // G1
export const PIANO_MAX_MIDI = 103; // G7

export function challengePianoRange(target: readonly number[]) {
  const lowest = target.length ? Math.min(...target) : PIANO_MIN_MIDI;
  const highest = target.length ? Math.max(...target) : PIANO_MAX_MIDI;
  // Use the fewest complete C-to-C octaves that contain every target note.
  const minMidi = Math.floor(lowest / 12) * 12;
  return {
    minMidi,
    maxMidi: Math.max(minMidi + 12, Math.ceil(highest / 12) * 12),
  };
}
// Quarter-note beats per minute for the challenge melody.
export const BPM = 180;
export const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '5/4', '6/4', '7/4', '3/8', '5/8', '6/8', '7/8', '9/8', '12/8', '2/2', '3/2', '4/2', '5/16', '7/16'] as const;
export type TimeSignature = typeof TIME_SIGNATURES[number];
export const TIME_SIGNATURE: TimeSignature = '4/4';

// Durations and BPM use quarter-note units, regardless of the meter.
export function beatsPerBar(timeSignature: TimeSignature): number {
  const [numerator, denominator] = timeSignature.split('/').map(Number);
  return numerator * 4 / denominator;
}

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
export const FINAL_BPM = 180;
export const FINAL_KEY: MusicalKey = 'C';

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


export const MELODY_FINAL: (MelodyStep & { pitches?: number[] })[] = [
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



export const MELODY_FINAL_BASS: (MelodyStep & { pitches?: number[] })[] = [];
export const FINAL_CLEF: 'treble' | 'bass' = 'treble';
export const FINAL_BASS_CLEF: 'treble' | 'bass' = 'bass';

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
  return `${names[(midi % 12 + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function transpositionOffset(guess: readonly number[], target: readonly number[]): number | null {
  if (guess.length < 2 || guess.length !== target.length) return null;
  const offset = guess[0] - target[0];
  return offset !== 0 && guess.every((note, i) => note - target[i] === offset) ? offset : null;
}

export function melodyPitchHint(guess: readonly number[], target: readonly number[]): { direction: 'up' | 'down'; text: string } | null {
  const offset = transpositionOffset(guess, target);
  if (offset === null) return null;
  const high = offset > 0;
  const direction = high ? 'down' : 'up';
  const movement = high ? 'lower' : 'higher';
  return { direction, text: `Too ${high ? 'high' : 'low'}. ${offset % 12 === 0 ? `Try a ${movement} octave.` : `Play the whole melody ${movement}.`}` };
}

export function getWinKind(guess: readonly number[], target: readonly number[], exactOnly = false): WinKind | null {
  if (!guess.length || guess.length !== target.length) return null;
  if (guess.every((note, index) => note === target[index])) return 'exact';
  if (exactOnly) return null;
  const offset = transpositionOffset(guess, target);
  return offset === null ? null : offset % 12 === 0 ? 'octave' : 'shifted';
}

export function scoreGuess(guess: readonly number[], target: readonly number[], exactOnly = false): Feedback[] {
  if (guess.length !== target.length) throw new Error('A guess must match the target length.');
  // A consistent transposition is a correct melody in a different pitch.
  const kind = getWinKind(guess, target, exactOnly);
  if (kind === 'octave' || kind === 'shifted') return guess.map(() => kind);
  return guess.map((note, i) => {
    if (note === target[i]) return 'correct';
    return note < target[i] ? 'low' : 'high';
  });
}

export function buildShareText(attempts: readonly Attempt[], target: readonly number[], url: string,
  hintsUsed = attempts.reduce((total, attempt) => Math.max(total, attempt.hintsUsed ?? 0), 0), exactOnly = false): string {
  // Re-evaluate old cached feedback too: Hard never shares shifted/octave wins.
  attempts = attempts.map((attempt) => ({ ...attempt, feedback: scoreGuess(attempt.notes, target, exactOnly) }));
  const symbols: Record<Feedback, string> = { correct: '✓', octave: '↕', shifted: '♪', low: '↑', high: '↓' };
  const recent = attempts.slice(-4);
  const start = attempts.length - recent.length;
  const exactWin = attempts.findIndex((attempt) => attempt.feedback.every((value) => value === 'correct'));
  const octaveWin = attempts.findIndex((attempt) => getWinKind(attempt.notes, target, exactOnly) === 'octave');
  const melodyWin = attempts.findIndex((attempt) => getWinKind(attempt.notes, target, exactOnly) === 'shifted');
  const count = (value: number) => `${value} ${value === 1 ? 'attempt' : 'attempts'}`;
  const summary = exactWin !== -1
    ? `Exact pitch found in ${count(exactWin + 1)}!`
    : octaveWin !== -1
      ? `Melody found in ${count(octaveWin + 1)} — different octave!`
      : melodyWin !== -1
        ? `Melody found in ${count(melodyWin + 1)} — shifted pitch!`
        : `${count(attempts.length)} so far`;
  const shifted = recent.some((attempt) => getWinKind(attempt.notes, target, exactOnly) === 'shifted');
  const octave = recent.some((attempt) => getWinKind(attempt.notes, target, exactOnly) === 'octave');

  return [
    `Brodle${exactWin !== -1 ? ' 🎉' : octaveWin !== -1 ? ' ↕' : melodyWin !== -1 ? ' ♪' : ''}`,
    summary, ...(hintsUsed > 0 ? [`Hints used: ${hintsUsed}`] : []), `Latest ${recent.length} of ${count(attempts.length)}:`,
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

export function toAbc(notes: readonly number[], naming: NoteNaming = 'letters', melody: readonly MelodyStep[] = MELODY, key: MusicalKey = KEY, timeSignature: TimeSignature = TIME_SIGNATURE): string {
  return notationForGuess(notes, naming, melody, key, timeSignature).abc;
}

export function notationForGuess(notes: readonly number[], naming: NoteNaming, melody: readonly MelodyStep[], key: MusicalKey, timeSignature: TimeSignature = TIME_SIGNATURE, bpm = BPM) {
  const steps = melodyForGuess(notes, melody);
  const notation = melodyNotation(steps, naming, key, bpm, timeSignature);
  let noteIndex = 0;
  const guessPositions = steps.map((step) => step.midi === null ? null : noteIndex++);
  return { ...notation, guessIndices: notation.stepIndices.map((index) => guessPositions[index]) };
}

export function melodyToAbc(melody: readonly MelodyStep[], naming: NoteNaming, key: MusicalKey, bpm: number, timeSignature: TimeSignature = TIME_SIGNATURE): string {
  return melodyNotation(melody, naming, key, bpm, timeSignature).abc;
}

// Keep the original step/pitch indices when a long note or rest crosses a bar.
// This maps selection and game feedback onto every fragment of a tied note.
export function melodyNotation(melody: readonly MelodyStep[], naming: NoteNaming, key: MusicalKey, bpm: number, timeSignature: TimeSignature = TIME_SIGNATURE, showNoteNames = true, clef: 'treble' | 'bass' = 'treble') {
  const fragments: NotationFragment[] = [];
  const stepIndices: number[] = [];
  const noteIndices: number[] = [];
  const barTicks = Math.round(beatsPerBar(timeSignature) * RHYTHM_TICKS);
  let position = 0;
  let noteIndex = 0;
  let groupStart = 0;
  const finishGroup = () => {
    if (fragments.length > groupStart) fragments[groupStart].tupletCount = fragments.length - groupStart;
  };
  melody.forEach((step, stepIndex) => {
    if (step.triplet === 1) groupStart = fragments.length;
    let remaining = stepTicks(step);
    let first = true;
    while (remaining > 0) {
      const available = Math.min(remaining, barTicks - position);
      // Odd meters can leave durations such as 2.5 beats. Tie together
      // representable note values instead of asking the renderer to draw one.
      const scale = step.triplet ? 2 / 3 : 1;
      const written = [6, 4, 3, 2, 1.5, 1, .75, .5, .375, .25, .1875, .125, .0625, .03125]
        .find((value) => Math.round(value * RHYTHM_TICKS * scale) <= available) ?? available / RHYTHM_TICKS / scale;
      const ticks = Math.round(written * RHYTHM_TICKS * scale);
      remaining -= ticks;
      fragments.push({ ...step, beats: ticks / RHYTHM_TICKS, ticks, length: abcLength(written), tie: step.midi !== null && remaining > 0, hideLabel: !showNoteNames || !first });
      stepIndices.push(stepIndex);
      if (step.midi !== null) noteIndices.push(noteIndex);
      first = false;
      position = (position + ticks) % barTicks;
    }
    if (step.triplet && (step.triplet === 3 || !melody[stepIndex + 1]?.triplet)) finishGroup();
    if (step.midi !== null) noteIndex++;
  });
  return { abc: renderMelodyAbc(fragments, naming, key, bpm, timeSignature, clef), stepIndices, noteIndices };
}

export function abcLength(beats: number): string {
  let numerator = Math.round(beats * RHYTHM_TICKS);
  let denominator = RHYTHM_TICKS;
  let a = numerator, b = denominator;
  while (b) { const remainder = a % b; a = b; b = remainder; }
  numerator /= a; denominator /= a;
  return denominator === 1 ? String(numerator) : numerator === 1 ? `/${denominator}` : `${numerator}/${denominator}`;
}

type NotationFragment = MelodyStep & { pitches?: readonly number[]; tie?: boolean; hideLabel?: boolean; ticks: number; tupletCount?: number };

function renderMelodyAbc(melody: readonly NotationFragment[], naming: NoteNaming, key: MusicalKey, bpm: number, timeSignature: TimeSignature, clef: 'treble' | 'bass' = 'treble'): string {
  const altered = new Map<string, number>();
  const signature = keyAccidentals(key);
  const tokens: string[] = [];
  let ticksInBar = 0;
  const barBeats = beatsPerBar(timeSignature);
  melody.forEach(({ midi, pitches, length, ticks, tie, hideLabel, tupletCount }) => {
    if (ticksInBar >= Math.round(barBeats * RHYTHM_TICKS)) {
      tokens.push('|');
      altered.clear();
      ticksInBar = 0;
    }
    if (tupletCount) tokens.push(`(3:2:${tupletCount}`);
    if (midi === null) {
      tokens.push(`z${length}`);
      ticksInBar += ticks;
      return;
    }
    const renderPitch = (midi: number) => {
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
      return `${accidental}${letter}${suffix}`;
    };
    const symbol = pitches?.length ? `[${pitches.map(renderPitch).join('')}]` : renderPitch(midi);
    tokens.push(`${hideLabel ? '' : `"_${noteName(midi, naming, key)}"`}${symbol}${length}${tie ? '-' : ''}`);
    ticksInBar += ticks;
  });
  // No future durations are visible. An invisible spacer draws an empty staff.
  const music = tokens.length ? tokens.join(' ') : `x${abcLength(barBeats)}`;
  return `X:1\nM:${timeSignature}\nL:1/4\nQ:1/4=${bpm}\nK:${key} clef=${clef}\n${music} |]\n`;
}

export function keyboardKeys(minMidi = PIANO_MIN_MIDI, maxMidi = PIANO_MAX_MIDI) {
  const keys = Array.from({ length: maxMidi - minMidi + 1 }, (_, index) => ({ midi: minMidi + index, name: noteName(minMidi + index), black: NAMES[((minMidi + index) % 12 + 12) % 12].length > 1 }));
  const white = keys.filter((key) => !key.black);
  return { whiteKeys: white, blackKeys: keys.filter((key) => key.black).map((key) => ({ ...key, position: white.filter((note) => note.midi < key.midi).length })) };
}
export const { whiteKeys, blackKeys } = keyboardKeys();
