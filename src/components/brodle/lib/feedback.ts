import type { Attempt, Feedback } from './musicGame';

export const feedbackLabels: Record<Feedback, string> = {
  correct: 'Correct pitch and position',
  low: 'Raise this note',
  high: 'Lower this note',
  shifted: 'Right melody, shifted pitch',
  octave: 'Right note, different octave',
};

export const feedbackMarkers: Record<Feedback, string> = {
  correct: '✓', low: '↑', high: '↓', shifted: '♪', octave: '↕',
};

export function attemptSummary(attempt: Attempt, compact = false): string {
  if (attempt.feedback.every((value) => value === 'octave')) return feedbackLabels.octave;
  if (attempt.feedback.every((value) => value === 'shifted')) return feedbackLabels.shifted;
  const correct = attempt.feedback.filter((value) => value === 'correct').length;
  const raise = attempt.feedback.filter((value) => value === 'low').length;
  const lower = attempt.feedback.filter((value) => value === 'high').length;
  return [`${correct}/${attempt.notes.length} correct`, ...(raise ? [`↑ ${raise}${compact ? '' : ' to raise'}`] : []), ...(lower ? [`↓ ${lower}${compact ? '' : ' to lower'}`] : [])].join(' · ');
}
