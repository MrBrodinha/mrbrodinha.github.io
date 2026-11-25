import { feedbackLabels, feedbackMarkers } from '../lib/feedback';
import type { Feedback } from '../lib/musicGame';

const legend: [Feedback, string][] = [
  ['correct', 'Correct'], ['low', 'Raise'], ['high', 'Lower'],
];

export default function FeedbackLegend() {
  return <ul className="feedback-legend" aria-label="Feedback rules">
    {legend.map(([status, text]) => <li key={status} className={`feedback-pill feedback-${status}`} title={feedbackLabels[status]}>
      <span aria-hidden="true">{feedbackMarkers[status]}</span>{text}
    </li>)}
  </ul>;
}
