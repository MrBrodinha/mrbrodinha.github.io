import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import SheetMusic from './SheetMusic';
import WinConfetti from './WinConfetti';
import {
  MELODY, TARGET, MAX_ATTEMPTS, whiteKeys, blackKeys, noteName, scoreGuess, toAbc,
  transpositionOffset,
} from './musicGame';
import type { Attempt, Feedback } from './musicGame';
import './Piano.css';

const labels: Record<Feedback, string> = {
  correct: 'Correct pitch and position',
  present: 'Correct pitch, but another position',
  octave: 'Correct note name, but a different octave',
  transposed: 'Right melody, shifted to a different pitch',
  absent: 'Not in the tune, or an extra duplicate',
};

function attemptSummary(attempt: Attempt): string {
  const offset = transpositionOffset(attempt.notes, TARGET);
  if (offset !== null) {
    return 'Right melody · shifted pitch';
  }
  const correct = attempt.feedback.filter((value) => value === 'correct').length;
  return correct === TARGET.length ? 'Correct melody!' : `${correct} of ${TARGET.length} pitches in place`;
}

function notationLabel(notes: readonly number[], feedback?: readonly Feedback[]): string {
  if (!notes.length) return 'Empty staff. Use the piano to enter your guess.';
  return notes.map((note, index) =>
    `Note ${index + 1}: ${noteName(note)}${feedback ? `, ${labels[feedback[index]]}` : ''}`,
  ).join('. ');
}

function Piano() {
  const audioContext = useRef<AudioContext | null>(null);
  const voices = useRef(new Set<OscillatorNode>());
  const playbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackRequest = useRef(0);
  const [guess, setGuess] = useState<number[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const [audioError, setAudioError] = useState('');

  const won = attempts.some((attempt) => attempt.feedback.every((value) => value === 'correct'));
  const finished = won || attempts.length >= MAX_ATTEMPTS;

  useEffect(() => {
    return () => {
      playbackRequest.current += 1;
      if (playbackTimer.current) clearTimeout(playbackTimer.current);
      const context = audioContext.current;
      audioContext.current = null;
      if (context && context.state !== 'closed') void context.close();
    };
  }, []);

  function stopPlayback() {
    playbackRequest.current += 1;
    if (playbackTimer.current) clearTimeout(playbackTimer.current);
    playbackTimer.current = null;
    voices.current.forEach((oscillator) => oscillator.stop());
    voices.current.clear();
    setPlaying(null);
  }

  async function playNotes(notes: readonly number[], id: string | null) {
    stopPlayback();
    if (!notes.length) return;
    const request = playbackRequest.current;
    setPlaying(id);
    setAudioError('');
    try {
      if (!audioContext.current) audioContext.current = new AudioContext();
      const context = audioContext.current;
      if (context.state === 'suspended') await context.resume();
      if (request !== playbackRequest.current || context.state === 'closed') return;

      let time = context.currentTime + .03;
      notes.forEach((midi, index) => {
        const duration = MELODY[index].beats * .5;
        const oscillator = context.createOscillator();
        const volume = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12), time);
        volume.gain.setValueAtTime(0, time);
        volume.gain.linearRampToValueAtTime(.15, time + .01);
        volume.gain.exponentialRampToValueAtTime(.0001, time + duration * .85);
        oscillator.connect(volume);
        volume.connect(context.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          volume.disconnect();
          voices.current.delete(oscillator);
        };
        oscillator.start(time);
        oscillator.stop(time + duration * .9);
        voices.current.add(oscillator);
        time += duration;
      });
      playbackTimer.current = setTimeout(() => {
        if (request !== playbackRequest.current) return;
        playbackTimer.current = null;
        setPlaying(null);
      }, (time - context.currentTime) * 1000);
    } catch {
      if (request !== playbackRequest.current) return;
      stopPlayback();
      setAudioError('Audio could not start. You can still enter and submit notes.');
    }
  }

  function togglePlayback(notes: readonly number[], id: string) {
    if (playing === id) stopPlayback();
    else void playNotes(notes, id);
  }

  function pressKey(midi: number) {
    void playNotes([midi], null);
    if (finished) return;
    setGuess((previous) => previous.length < TARGET.length ? [...previous, midi] : previous);
  }

  function editGuess(notes: number[]) {
    stopPlayback();
    setGuess(notes);
  }

  function submitGuess() {
    if (guess.length !== TARGET.length || finished) return;
    const attempt: Attempt = { notes: [...guess], feedback: scoreGuess(guess, TARGET) };
    setAttempts((previous) => [...previous, attempt]);
    setSelectedAttempt(attempts.length);
    setGuess([]);
    void playNotes(attempt.notes, `attempt-${attempts.length}`);
  }

  function restart() {
    stopPlayback();
    setAudioError('');
    setGuess([]);
    setAttempts([]);
    setSelectedAttempt(0);
  }

  function selectAttempt(index: number) {
    if (index === selectedAttempt) return;
    stopPlayback();
    setSelectedAttempt(index);
  }

  const visibleAttempt = attempts[selectedAttempt];
  const visibleAttemptId = `attempt-${selectedAttempt}`;
  const isAttemptPlaying = playing === visibleAttemptId;
  const lastAttempt = attempts[attempts.length - 1];
  const lastOffset = lastAttempt ? transpositionOffset(lastAttempt.notes, TARGET) : null;
  const message = won
    ? `You found the tune in ${attempts.length} ${attempts.length === 1 ? 'attempt' : 'attempts'}!`
    : finished
      ? `No attempts left. The tune was ${TARGET.map(noteName).join(' → ')}.`
      : `Attempt ${attempts.length + 1} of ${MAX_ATTEMPTS}. Enter ${TARGET.length} notes.`;

  return (
    <main className="piano-page">
      {won && <WinConfetti />}
      <div className="piano-content">
        <Link to="/" className="piano-home">← Home</Link>
        <header className="piano-header">
          <div>
            <h1>Brodle</h1>
            <p>Find the melody. We’ll take care of the rhythm.</p>
          </div>
          <div className="game-controls">
            <button type="button" onClick={restart}>Restart</button>
          </div>
        </header>
        <p className="tune-tip">Tip: Five Nights at Freddy’s (aur aur aur aur aur)</p>
        {audioError && <p role="alert" className="audio-error">{audioError}</p>}

        <p className={`game-status${won ? ' game-status-won' : ''}`} role="status">
          {message}
        </p>
        {lastOffset !== null && !finished && (
          <p className="melody-hint">You have the melody! Keep the same intervals and try a different starting note.</p>
        )}

        <section className="attempt-history" aria-labelledby="history-heading">
          <div className="history-heading">
            <h2 id="history-heading">Your attempts</h2>
            <span>{attempts.length} / {MAX_ATTEMPTS}</span>
          </div>
          {visibleAttempt ? (
            <>
              <nav className="game-controls attempt-picker" aria-label="Choose an attempt">
                {attempts.map((_, index) => (
                  <button key={index} type="button" aria-label={`View attempt ${index + 1}`}
                    aria-pressed={index === selectedAttempt} onClick={() => selectAttempt(index)}>
                    {index + 1}
                  </button>
                ))}
              </nav>
              <article className="attempt-card" aria-labelledby="selected-attempt-heading">
                <div className="attempt-card-heading">
                  <div className="attempt-info">
                    <h3 id="selected-attempt-heading" className="attempt-number">Attempt {selectedAttempt + 1}</h3>
                    <div className="attempt-result">
                      <span className="attempt-dots" aria-hidden="true">
                        {visibleAttempt.feedback.map((feedback, position) => (
                          <span className={`feedback-dot dot-${feedback}`} key={position} />
                        ))}
                      </span>
                      <span className={visibleAttempt.feedback[0] === 'transposed' ? 'transposed-result' : ''}>
                        {attemptSummary(visibleAttempt)}
                      </span>
                    </div>
                  </div>
                  <div className="game-controls attempt-playback">
                    <button type="button" aria-label={`${isAttemptPlaying ? 'Stop' : 'Play'} attempt ${selectedAttempt + 1}`}
                      onClick={() => togglePlayback(visibleAttempt.notes, visibleAttemptId)}>
                      {isAttemptPlaying ? '■ Stop' : '▶ Replay'}
                    </button>
                  </div>
                </div>
                <SheetMusic abc={toAbc(visibleAttempt.notes)} feedback={visibleAttempt.feedback}
                  label={notationLabel(visibleAttempt.notes, visibleAttempt.feedback)} />
              </article>
              <ul className="feedback-legend" aria-label="Feedback rules">
                <li className="legend-correct">Correct pitch & position</li>
                <li className="legend-present">Pitch in another position</li>
                <li className="legend-octave">Note in another octave</li>
                <li className="legend-transposed">Right melody, shifted pitch</li>
                <li className="legend-absent">Absent or extra note</li>
              </ul>
            </>
          ) : (
            <p className="history-empty">Your submitted guesses will appear here, one at a time.</p>
          )}
        </section>

        {!finished && (
          <section className="guess-card current-guess" aria-label="Current guess">
            <div className="guess-heading">
              <h2>Your guess</h2>
              <span className="note-count">{guess.length} / {TARGET.length} notes</span>
            </div>
            <SheetMusic abc={toAbc(guess)} label={notationLabel(guess)} />
            <div className="game-controls guess-actions">
              <button type="button" className="play-guess" disabled={!guess.length}
                aria-label={playing === 'current' ? 'Stop current guess' : 'Play current guess'}
                onClick={() => togglePlayback(guess, 'current')}>
                {playing === 'current' ? '■ Stop' : '▶ Play guess'}
              </button>
              <button type="button" disabled={!guess.length} onClick={() => editGuess(guess.slice(0, -1))}>Undo</button>
              <button type="button" disabled={!guess.length} onClick={() => editGuess([])}>Clear</button>
              <button type="button" className="submit-guess"
                disabled={guess.length !== TARGET.length} onClick={submitGuess}>Submit guess</button>
            </div>
          </section>
        )}

        <section className="keyboard-section" aria-label="Piano">
          <p className="piano-help">Click the keys to {finished ? 'play' : 'add notes'}. <span>Scroll sideways on smaller screens.</span></p>
          <div className="piano-scroll" tabIndex={0} role="region" aria-label="Scrollable piano keyboard">
            <div className="piano-keyboard">
              {whiteKeys.map(({ name, midi }) => (
                <button key={name} type="button" className="piano-key piano-white"
                  aria-label={`Play ${name}`} onClick={() => pressKey(midi)}>{name}</button>
              ))}
              {blackKeys.map(({ name, midi, position }) => (
                <button key={name} type="button" className="piano-key piano-black"
                  style={{ left: `${position / whiteKeys.length * 100}%`, width: `${60 / whiteKeys.length}%` }}
                  aria-label={`Play ${name}`} onClick={() => pressKey(midi)}>{name}</button>
              ))}
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}

export default Piano;
