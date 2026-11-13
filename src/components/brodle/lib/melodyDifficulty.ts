import type { MelodyStep } from './musicGame';

export type MelodyDifficultyLevel = 'Easy' | 'Medium' | 'Hard';
export type MelodyDifficultyRating = {
  level: MelodyDifficultyLevel;
  score: number;
  noteCount: number;
  uniquePitches: number;
  rangeSemitones: number;
  averageJump: number;
  largestJump: number;
};

const points = (value: number, easyLimit: number, mediumLimit: number) => value <= easyLimit ? 0 : value <= mediumLimit ? 1 : 2;

// Rate the sounding challenge notes only. Pitch span (rather than octave labels)
// keeps the rating unchanged when the same melody is transposed.
export function rateMelody(melody: readonly Pick<MelodyStep, 'midi'>[]): MelodyDifficultyRating | null {
  const notes = melody.flatMap(({ midi }) => midi === null ? [] : [midi]);
  if (!notes.length) return null;

  const noteCount = notes.length;
  const uniquePitches = new Set(notes).size;
  const rangeSemitones = Math.max(...notes) - Math.min(...notes);
  const jumps = notes.slice(1).map((note, index) => Math.abs(note - notes[index]));
  const averageJump = jumps.length ? jumps.reduce((sum, jump) => sum + jump, 0) / jumps.length : 0;
  const largestJump = jumps.length ? Math.max(...jumps) : 0;
  // Frequent moderate jumps and isolated large leaps both contribute.
  const jumpPoints = Math.max(points(averageJump, 2, 4), points(largestJump, 4, 7));
  const score = points(noteCount, 8, 16) + points(uniquePitches, 4, 8)
    + points(rangeSemitones, 7, 12) + jumpPoints;

  return { level: score <= 2 ? 'Easy' : score <= 5 ? 'Medium' : 'Hard', score,
    noteCount, uniquePitches, rangeSemitones, averageJump, largestJump };
}
