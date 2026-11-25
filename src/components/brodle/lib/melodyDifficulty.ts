import type { MelodyStep } from './musicGame';

export const MELODY_DIFFICULTY_LEVELS = [
  { level: 'Very Easy', slug: 'very-easy', upperBound: 20 },
  { level: 'Easy', slug: 'easy', upperBound: 40 },
  { level: 'Medium', slug: 'medium', upperBound: 60 },
  { level: 'Hard', slug: 'hard', upperBound: 80 },
  { level: 'Very Hard', slug: 'very-hard', upperBound: Infinity },
] as const;

export type MelodyDifficultyLevel = typeof MELODY_DIFFICULTY_LEVELS[number]['level'];
export type MelodyDifficultyContributions = { length: number; variety: number; span: number; intervals: number };
export type MelodyDifficultyRating = {
  level: MelodyDifficultyLevel;
  slug: typeof MELODY_DIFFICULTY_LEVELS[number]['slug'];
  score: number;
  contributions: MelodyDifficultyContributions;
  noteCount: number;
  uniquePitches: number;
  rangeSemitones: number;
  averageJump: number;
  largestJump: number;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function difficultyForScore(score: number) {
  // Classify the raw score so rounding cannot move a melody into another tier.
  return MELODY_DIFFICULTY_LEVELS.find(tier => score < tier.upperBound) ?? MELODY_DIFFICULTY_LEVELS[4];
}

// Rate the sounding challenge notes only. Pitch span (rather than octave labels)
// keeps the rating unchanged when the same melody is transposed.
export function rateMelody(melody: readonly Pick<MelodyStep, 'midi' | 'tieToNext'>[]): MelodyDifficultyRating | null {
  const notes = melody.flatMap(({ midi }, i) => midi === null || melody[i - 1]?.tieToNext?.includes(midi) ? [] : [midi]);
  if (!notes.length) return null;

  const noteCount = notes.length;
  const uniquePitches = new Set(notes).size;
  const rangeSemitones = Math.max(...notes) - Math.min(...notes);
  const jumps = notes.slice(1).map((note, index) => Math.abs(note - notes[index]));
  const averageJump = jumps.length ? jumps.reduce((sum, jump) => sum + jump, 0) / jumps.length : 0;
  const largestJump = jumps.length ? Math.max(...jumps) : 0;
  // Difficulty v2: length and variety carry 65% of the estimate. Cap them at
  // 32 notes and 12 distinct pitches; cap span at two octaves. This keeps a
  // short melody's slightly wider range from dominating its difficulty.
  const contributions: MelodyDifficultyContributions = {
    length: 35 * clamp((noteCount - 1) / 31),
    variety: 30 * clamp((uniquePitches - 1) / 11),
    span: 10 * clamp(rangeSemitones / 24),
    // Frequent jumps (up to a fifth on average) and isolated octave leaps matter.
    intervals: 25 * (.6 * clamp(averageJump / 7) + .4 * clamp(largestJump / 12)),
  };
  const score = contributions.length + contributions.variety + contributions.span + contributions.intervals;
  const { level, slug } = difficultyForScore(score);

  return { level, slug, score, contributions,
    noteCount, uniquePitches, rangeSemitones, averageJump, largestJump };
}
