import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import BrodleIcon from './BrodleIcon';

const titles = ['Find the melody', 'Casual mode', 'Hard mode', 'Make the piano yours'];

export default function BrodleTutorial({ maxHints, onOpen, exactOnly = false }: { maxHints: number; onOpen: () => void; exactOnly?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (dialog.current?.open) heading.current?.focus();
  }, [step]);

  function openTutorial() {
    onOpen();
    setStep(0);
    dialog.current?.showModal();
    heading.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return <>
    <button type="button" className="brodle-button tutorial-trigger" aria-haspopup="dialog" onClick={openTutorial}>
      <BrodleIcon name="help" />How to play
    </button>
    <dialog ref={dialog} className="brodle-tutorial" aria-labelledby="tutorial-title" onKeyDown={handleKeyDown}>
      <div className="tutorial-header">
        <h2 id="tutorial-title">How to play Brodle</h2>
        <button type="button" className="brodle-button ghost-button" aria-label="Close tutorial" onClick={() => dialog.current?.close()}>
          <BrodleIcon name="close" />
        </button>
      </div>
      <div className="tutorial-progress" aria-label={`Step ${step + 1} of ${titles.length}`}>
        {titles.map((title, index) => <span key={title} className={index === step ? 'is-current' : ''} aria-hidden="true" />)}
      </div>
      <section className="tutorial-step" aria-labelledby="tutorial-step-title">
        <span className="tutorial-eyebrow">Step {step + 1} of {titles.length}</span>
        <h3 id="tutorial-step-title" ref={heading} tabIndex={-1}>{titles[step]}</h3>
        {step === 0 && <>
          <p>Use the piano to guess the hidden melody, one note at a time. Rhythm and rests are filled in for you. Enter every note, then choose <strong>Submit</strong>.</p>
          <ul className="tutorial-feedback">
            <li><span className="feedback-pill feedback-correct">✓ Correct</span> The right pitch in the right position.</li>
            <li><span className="feedback-pill feedback-low">↑ Raise</span> Try a higher note at this position.</li>
            <li><span className="feedback-pill feedback-high">↓ Lower</span> Try a lower note at this position.</li>
            {!exactOnly && <><li><span className="feedback-pill feedback-shifted">♪ Right melody, shifted pitch</span> The melody matches at a different pitch.</li>
            <li><span className="feedback-pill feedback-octave">↕ Right note, different octave</span> The melody matches in a different octave.</li></>}
          </ul>
          <p>{exactOnly ? 'Hard mode requires every note at the correct pitch and octave to win.' : 'In Casual mode, a melody at a consistent shifted pitch or octave wins too. The full victory arrangement plays at your winning pitch.'}</p>
        </>}
        {step === 1 && <>
          <p>A little help as you go. Casual mode is the default and includes the song clue when one is available.</p>
          <ul>
            <li>The piano remembers feedback for each position. After a note is too low or too high, ruled-out keys become unavailable.</li>
            <li>Previously correct notes stay correct when you fill or copy their positions. Clear and Remove last note keep what the piano has learned.</li>
            <li>Optional note hints reveal the next note in order. The final hint also plays the challenge melody and unlocks free replays.</li>
            <li>A matching melody at a different pitch or octave finishes the round and plays the victory arrangement in that pitch.</li>
          </ul>
          <p>After submitting, start a fresh guess or select any entry in <strong>Attempts</strong> to replay it or copy it to your draft. If copied notes fall outside their allowed range, choose the message beside Submit to jump to the first one.</p>
        </>}
        {step === 2 && <>
          <p>Find the exact melody, including its pitch and octave. Every note must match to win.</p>
          <ul>
            <li>Every playable pitch stays available. Previous feedback does not narrow the piano or lock correct guesses.</li>
            <li>The song clue is available when one has been provided.</li>
            <li>A shifted pitch or different octave gets normal higher/lower feedback and does not count as a win.</li>
            <li>Note hints and challenge-melody playback are off.</li>
          </ul>
          <p>You can still listen to your own guesses. Choose Casual or Hard before your first submission; the mode locks once you submit a guess.</p>
        </>}
        {step === 3 && <>
          <ul>
            <li>Select a note on your guess to replace it, then choose a piano key. <strong>Listen</strong> plays your current guess.</li>
            <li><strong>Remove last note</strong> or <strong>Backspace</strong> removes the last entered note. <strong>Clear</strong> starts the draft again. Revealed notes stay in place.</li>
            <li><strong>Free play</strong> lets you try keys without changing your guess. Turn it off to continue entering notes.</li>
            <li>The controls above the piano let you choose A–G or Dó–Si note names, the instrument, and volume. On phones, use the labeled octave buttons to reach lower or higher notes.</li>
          </ul>
          <p>{maxHints > 0 ? <>In Casual mode, this puzzle has <strong>{maxHints} optional note {maxHints === 1 ? 'hint' : 'hints'}</strong>. Each reveals the next note permanently, up to half the melody rounded down.</> : 'This short puzzle has no note hints. Longer puzzles allow up to half their notes to be revealed in Casual mode, rounded down.'} Hard mode has no note hints. Hints used are included in shared results.</p>
          <p>Open <strong>How to play</strong> any time to revisit this tutorial.</p>
        </>}
      </section>
      <div className="tutorial-actions">
        <button type="button" className="brodle-button" disabled={step === 0} onClick={() => setStep((previous) => previous - 1)}>Back</button>
        {step < titles.length - 1
          ? <button type="button" className="brodle-button tutorial-next" onClick={() => setStep((previous) => previous + 1)}>Next<span aria-hidden="true">→</span></button>
          : <button type="button" className="brodle-button tutorial-next" onClick={() => dialog.current?.close()}>Start playing</button>}
      </div>
    </dialog>
  </>;
}
