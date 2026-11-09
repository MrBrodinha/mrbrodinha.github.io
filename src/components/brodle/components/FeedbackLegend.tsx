import { feedbackLabels, feedbackMarkers } from '../lib/feedback';
import type { Feedback } from '../lib/musicGame';

const legend: [Feedback, string][] = [
  ['correct', 'Correct'], ['low', 'Raise'], ['high', 'Lower'],
  ['shifted', 'Right melody, shifted pitch'], ['octave', 'Right note, different octave'],
];

export default function FeedbackLegend({ exactOnly = false }: { exactOnly?: boolean }) {
  return <ul className="feedback-legend" aria-label="Feedback rules">
    {legend.filter(([status]) => !exactOnly || (status !== 'shifted' && status !== 'octave')).map(([status, text]) => <li key={status} className={`feedback-pill feedback-${status}`} title={feedbackLabels[status]}>
      <span aria-hidden="true">{feedbackMarkers[status]}</span>{text}
    </li>)}
  </ul>;
}
