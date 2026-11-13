import type { MelodyStep } from '../lib/musicGame';
import { rateMelody } from '../lib/melodyDifficulty';

export default function MelodyDifficulty({ melody }: { melody: readonly Pick<MelodyStep, 'midi'>[] }) {
  const rating = rateMelody(melody);
  if (!rating) return null;
  return <span data-tour="difficulty" className={`melody-difficulty difficulty-${rating.level.toLowerCase()}`}
    title="Estimated from note count, unique pitches, octave range, and interval jumps.">
    Difficulty: <strong>{rating.level}</strong>
  </span>;
}
