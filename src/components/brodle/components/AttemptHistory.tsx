import { useId, useMemo, useState } from 'react';
import { attemptSummary, feedbackLabels } from '../lib/feedback';
import { melodyForGuess, notationForGuess, notationKey, noteName } from '../lib/musicGame';
import type { Attempt, MelodyStep, MusicalKey, NoteNaming, TimeSignature } from '../lib/musicGame';
import BrodleIcon from './BrodleIcon';
import FeedbackLegend from './FeedbackLegend';
import SheetMusic from './SheetMusic';

type ScoreProps = {
  attempt: Attempt;
  melody: readonly MelodyStep[];
  musicalKey: MusicalKey;
  naming: NoteNaming;
  timeSignature: TimeSignature;
  bpm: number;
  exactOnly?: boolean;
};

type Props = Omit<ScoreProps, 'attempt'> & {
  attempts: readonly Attempt[];
  selectedIndex: number;
  playing: string | null;
  finished: boolean;
  onSelect: (index: number) => void;
  onReplay: (index: number) => void;
  onCopy: (index: number) => void;
};

function AttemptScore({ attempt, melody, musicalKey, naming, timeSignature, bpm, exactOnly }: ScoreProps) {
  const key = exactOnly ? musicalKey : notationKey(attempt.notes, melody, musicalKey);
  const notation = useMemo(() => notationForGuess(attempt.notes, naming, melody, key, timeSignature, bpm),
    [attempt, naming, melody, key, timeSignature, bpm]);
  let position = 0;
  const label = melodyForGuess(attempt.notes, melody).map((step) => {
    if (step.midi === null) return step.rhythm;
    const note = position++;
    return `Note ${note + 1}: ${noteName(step.midi, naming, key)}, ${feedbackLabels[attempt.feedback[note]]}`;
  }).join('. ');

  return <SheetMusic abc={notation.abc} feedback={attempt.feedback} feedbackIndices={notation.noteIndices} compact wrap
    musicalKey={key} naming={naming} bpm={bpm} timeSignature={timeSignature} label={label} />;
}

export default function AttemptHistory({ attempts, selectedIndex, melody, musicalKey, naming, timeSignature, bpm,
  playing, finished, exactOnly = false, onSelect, onReplay, onCopy }: Props) {
  const [expanded, setExpanded] = useState(true);
  const detailsId = useId();
  const latestIndex = attempts.length - 1;
  const latest = attempts[latestIndex];
  const index = Math.max(0, Math.min(selectedIndex, latestIndex));

  if (!latest) return null;

  return <section data-tour="attempts" className="attempts-panel brodle-panel" aria-label="Latest attempt and history">
    <div className="attempt-summary-row">
      <p className="latest-attempt-summary" role="status">
        <strong>Attempt {latestIndex + 1}</strong><span aria-hidden="true"> · </span>{attemptSummary(latest, true)}
      </p>
      <div className="attempt-summary-actions">
        <button type="button" className="brodle-button latest-replay" onClick={() => onReplay(latestIndex)}
          aria-label={`${playing === `attempt-${latestIndex}` ? 'Stop' : 'Replay'} attempt ${latestIndex + 1}`}>
          <BrodleIcon name={playing === `attempt-${latestIndex}` ? 'stop' : 'play'} />{playing === `attempt-${latestIndex}` ? 'Stop' : 'Replay'}
        </button>
        {!finished && <button type="button" className="brodle-button copy-attempt" onClick={() => onCopy(latestIndex)}
          aria-label={`Copy attempt ${latestIndex + 1} to draft`}>
          <BrodleIcon name="copy" />Copy to draft
        </button>}
        <button type="button" className="brodle-button history-toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide details' : 'View details'}<span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
      </div>
    </div>
    <div id={detailsId} className="attempts-body" hidden={!expanded}>
      {expanded && <>
        {attempts.length > 1 && <div className="attempt-history-controls" role="group" aria-label="Browse attempts">
          <button type="button" className="brodle-button" disabled={index === 0} aria-label="Previous attempt" onClick={() => onSelect(index - 1)}>‹ Previous</button>
          <span role="status" aria-label={`Viewing attempt ${index + 1} of ${attempts.length}`}>{index + 1} / {attempts.length}</span>
          <button type="button" className="brodle-button" disabled={index === latestIndex} aria-label="Next attempt" onClick={() => onSelect(index + 1)}>Next ›</button>
        </div>}
        <div className="attempt-score" role="region" aria-label={`Attempt ${index + 1}: ${attemptSummary(attempts[index])}`} tabIndex={0}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const next = index + (event.key === 'ArrowLeft' ? -1 : 1);
            if (next >= 0 && next <= latestIndex) onSelect(next);
          }}>
          {index !== latestIndex && <p className="attempt-summary">{attemptSummary(attempts[index])}</p>}
          <AttemptScore attempt={attempts[index]} melody={melody} musicalKey={musicalKey} naming={naming} timeSignature={timeSignature} bpm={bpm} exactOnly={exactOnly} />
        </div>
        {index !== latestIndex && <div className="attempt-result-actions">
          <button type="button" className="brodle-button" onClick={() => onReplay(index)} aria-label={`${playing === `attempt-${index}` ? 'Stop' : 'Replay'} attempt ${index + 1}`}>
            <BrodleIcon name={playing === `attempt-${index}` ? 'stop' : 'play'} />{playing === `attempt-${index}` ? 'Stop' : 'Replay'} attempt {index + 1}
          </button>
          {!finished && <button type="button" className="brodle-button copy-attempt" onClick={() => onCopy(index)}>
            <BrodleIcon name="copy" />Copy attempt {index + 1} to draft
          </button>}
        </div>}
        <FeedbackLegend exactOnly={exactOnly} />
      </>}
    </div>
  </section>;
}
