import type { MelodyStep } from '../lib/musicGame';
import { rateMelody } from '../lib/melodyDifficulty';

export default function MelodyDifficulty({ melody, showDetails = false }: { melody: readonly Pick<MelodyStep, 'midi'>[]; showDetails?: boolean }) {
  const rating = rateMelody(melody);
  if (!rating) return null;
  const badge = <span data-tour="difficulty" className={`melody-difficulty difficulty-${rating.slug}`}
    title="Very Easy, Easy, Medium, Hard, and Very Hard estimate pitch reconstruction from note count, pitch variety, pitch span, and interval jumps. Difficulty does not change the rules or available hints.">
    Difficulty: <strong>{rating.level}</strong>
  </span>;
  if (!showDetails) return badge;
  return <div className="melody-difficulty-explained">
    {badge}
    <details className="melody-difficulty-details">
      <summary>About this rating</summary>
      <p>{rating.noteCount} sounding {rating.noteCount === 1 ? 'note' : 'notes'} · {rating.uniquePitches} distinct {rating.uniquePitches === 1 ? 'pitch' : 'pitches'} · {rating.rangeSemitones} {rating.rangeSemitones === 1 ? 'semitone' : 'semitones'} of span</p>
      <p>More notes, more different pitches, and larger jumps increase the estimate. Note count and pitch variety matter most. Rhythm and tempo are already supplied in Brodle; this estimates pitch reconstruction, with the same rules and optional hints for everyone.</p>
    </details>
  </div>;
}
