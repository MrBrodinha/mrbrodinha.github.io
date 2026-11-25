import { melodyPitchHint } from '../lib/musicGame';

export default function MelodyPitchNotice({ notes, target }: { notes: readonly number[]; target: readonly number[] }) {
  const hint = melodyPitchHint(notes, target);
  return <div role="status" aria-live="polite" aria-atomic="true">
    {hint && <p className="melody-pitch-notice"><span aria-hidden="true">{hint.direction === 'up' ? '↑' : '↓'}</span>{hint.text}</p>}
  </div>;
}
