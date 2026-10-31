import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import SheetMusic from './SheetMusic';
import WinConfetti from './WinConfetti';
import { usePianoAudio } from './usePianoAudio';
import { PIANO_SOUNDS } from './pianoSounds';
import type { PianoSound } from './pianoSounds';
import {
  MELODY_FINAL, TARGET, whiteKeys, blackKeys, noteName, scoreGuess, toAbc,
  transpositionOffset, buildShareText,
} from './musicGame';
import type { Attempt, Feedback, NoteNaming } from './musicGame';
import './Brodle.css';

const labels: Record<Feedback, string> = {
  correct: 'Correct pitch and position',
  low: 'Too low. Try a higher note',
  high: 'Too high. Try a lower note',
};
const finalMelodyNotes = MELODY_FINAL.map((note) => note.midi);

function attemptSummary(attempt: Attempt): string {
  const offset = transpositionOffset(attempt.notes, TARGET);
  if (offset !== null) {
    return 'Right melody · shifted pitch';
  }
  const correct = attempt.feedback.filter((value) => value === 'correct').length;
  return correct === TARGET.length ? 'Correct melody!' : `${correct} of ${TARGET.length} pitches in place`;
}

function notationLabel(notes: readonly number[], naming: NoteNaming, feedback?: readonly Feedback[]): string {
  if (!notes.length) return 'Empty staff. Use the piano to enter your guess.';
  return notes.map((note, index) =>
    `Note ${index + 1}: ${noteName(note, naming)}${feedback ? `, ${labels[feedback[index]]}` : ''}`,
  ).join('. ');
}

function Brodle() {
  const { sound, setSound, soundStatus, soundProgress, retrySound,
    volume, setVolume, playing, audioError, setAudioError, pressedNotes,
    playNotes, startNote, releaseNote, stopAudio } = usePianoAudio();
  const [guess, setGuess] = useState<number[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState(0);
  const [noteNaming, setNoteNaming] = useState<NoteNaming>('letters');
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [manualShareText, setManualShareText] = useState<string | null>(null);
  const shareRequest = useRef(0);

  const exactWinIndex = attempts.findIndex((attempt) => attempt.feedback.every((value) => value === 'correct'));
  const melodyWinIndex = attempts.findIndex((attempt) =>
    attempt.feedback.every((value) => value === 'correct') || transpositionOffset(attempt.notes, TARGET) !== null,
  );
  const exactWon = exactWinIndex !== -1;
  const won = melodyWinIndex !== -1;
  const finished = exactWon;
  const celebration = exactWon ? 'exact' : won ? 'melody' : null;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Brodle · MrBrodinha';
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => () => { shareRequest.current += 1; }, []);

  useEffect(() => {
    function handleBackspace(event: KeyboardEvent) {
      if (event.key !== 'Backspace' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || finished) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;
      event.preventDefault();
      stopAudio();
      setGuess((previous) => previous.slice(0, -1));
    }
    window.addEventListener('keydown', handleBackspace);
    return () => window.removeEventListener('keydown', handleBackspace);
  }, [finished, stopAudio]);

  function addNote(midi: number) {
    if (finished) return;
    setGuess((previous) => previous.length < TARGET.length ? [...previous, midi] : previous);
  }

  function keyHandlers(midi: number): ButtonHTMLAttributes<HTMLButtonElement> {
    return {
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        void startNote(midi, `pointer-${event.pointerId}`);
        addNote(midi);
      },
      onPointerUp: (event) => releaseNote(`pointer-${event.pointerId}`),
      onPointerCancel: (event) => releaseNote(`pointer-${event.pointerId}`, true),
      onLostPointerCapture: (event) => releaseNote(`pointer-${event.pointerId}`, true),
      onKeyDown: (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        if (event.repeat) return;
        void startNote(midi, `keyboard-${midi}-${event.key}`);
        addNote(midi);
      },
      onKeyUp: (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        releaseNote(`keyboard-${midi}-${event.key}`);
      },
      onBlur: () => {
        releaseNote(`keyboard-${midi}- `, true);
        releaseNote(`keyboard-${midi}-Enter`, true);
      },
      onClick: (event) => {
        // Assistive technology can activate a button without pointer/key events.
        if (event.detail !== 0) return;
        void playNotes([midi], null);
        addNote(midi);
      },
    };
  }

  function togglePlayback(notes: readonly number[], id: string, rhythm?: readonly { beats: number }[]) {
    if (playing === id) stopAudio();
    else void playNotes(notes, id, rhythm);
  }

  function editGuess(notes: number[]) {
    stopAudio();
    setGuess(notes);
  }

  function submitGuess() {
    if (guess.length !== TARGET.length || finished) return;
    const attempt: Attempt = { notes: [...guess], feedback: scoreGuess(guess, TARGET) };
    clearShare();
    setAttempts((previous) => [...previous, attempt]);
    setSelectedAttempt(attempts.length);
    setGuess([]);
    if (attempt.feedback.every((feedback) => feedback === 'correct')) {
      void playNotes(finalMelodyNotes, 'final', MELODY_FINAL);
    } else {
      void playNotes(attempt.notes, `attempt-${attempts.length}`);
    }
  }

  function restart() {
    stopAudio();
    clearShare();
    setAudioError('');
    setGuess([]);
    setAttempts([]);
    setSelectedAttempt(0);
  }

  function selectAttempt(index: number) {
    if (index === selectedAttempt || index < 0 || index >= attempts.length) return;
    stopAudio();
    setSelectedAttempt(index);
  }

  function clearShare() {
    shareRequest.current += 1;
    setSharing(false);
    setShareStatus('');
    setManualShareText(null);
  }

  async function shareResults() {
    if (!won || sharing) return;
    const request = ++shareRequest.current;
    const current = () => request === shareRequest.current;
    const count = Math.min(4, attempts.length);
    const detail = `the latest ${count} ${count === 1 ? 'attempt' : 'attempts'}`;
    const text = buildShareText(attempts, TARGET, `${window.location.origin}/brodle`);
    const data = { title: 'Brodle', text };
    setSharing(true);
    setShareStatus('');
    setManualShareText(null);
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        try {
          await navigator.share(data);
          if (current()) setShareStatus(`Shared ${detail}.`);
          return;
        } catch (error) {
          if (!current()) return;
          if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') {
            setShareStatus('Sharing cancelled.');
            return;
          }
        }
      }
      if (!current()) return;
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable.');
      await navigator.clipboard.writeText(text);
      if (current()) setShareStatus(`Copied ${detail}.`);
    } catch {
      if (current()) {
        setManualShareText(text);
        setShareStatus('Select and copy your result below.');
      }
    } finally {
      if (current()) setSharing(false);
    }
  }

  const visibleAttempt = attempts[selectedAttempt];
  const visibleAttemptId = `attempt-${selectedAttempt}`;
  const isAttemptPlaying = playing === visibleAttemptId;
  const isTransposedAttempt = visibleAttempt ? transpositionOffset(visibleAttempt.notes, TARGET) !== null : false;
  const correctPitchId = `correct-pitch-${selectedAttempt}`;
  const isCorrectPitchPlaying = playing === correctPitchId;
  const isFinalMelodyPlaying = playing === 'final';
  const message = exactWon
    ? `You found the tune in ${exactWinIndex + 1} ${exactWinIndex === 0 ? 'attempt' : 'attempts'}!`
    : won
      ? `You won in ${melodyWinIndex + 1} ${melodyWinIndex === 0 ? 'attempt' : 'attempts'}, but can you guess on the correct pitch?`
      : `Attempt ${attempts.length + 1}. Enter ${TARGET.length} notes. Unlimited attempts.`;

  return (
    <main className="brodle-page">
      {celebration && <WinConfetti key={celebration} />}
      <div className="brodle-content">
        <Link to="/" className="brodle-home">← Home</Link>
        <header className="brodle-header">
          <div className="brodle-brand">
            <span className="brodle-mark" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none">
                <rect x="6" y="7" width="28" height="27" rx="4" fill="currentColor" />
                <path d="M15 8V33M25 8V33" stroke="#6d4b91" strokeWidth="1.5" />
                <path d="M13 7H17V22H13ZM23 7H27V22H23Z" fill="#332440" />
              </svg>
            </span>
            <div>
              <p className="brodle-kicker">The melody game</p>
              <h1>Brodle</h1>
              <p className="brodle-subtitle">Find the melody. We’ll take care of the rhythm.</p>
            </div>
          </div>
          <div className="game-controls">
            <button type="button" onClick={restart}>Restart</button>
          </div>
        </header>
      </div>

      <div className="brodle-content brodle-workspace">
        <p className="tune-tip">Tip: freddy jumpscare in fnaf 1</p>
        {audioError && <p role="alert" className="audio-error">{audioError}</p>}

        <p className={`game-status${won ? ' game-status-won' : ''}`} role="status">
          {message}
        </p>
        {exactWon && (
          <div className="game-controls final-melody-playback">
            <button type="button" aria-label={isFinalMelodyPlaying ? 'Stop full melody' : 'Play full melody'}
              onClick={() => togglePlayback(finalMelodyNotes, 'final', MELODY_FINAL)}>
              {isFinalMelodyPlaying ? '■ Stop melody' : '▶ Play full melody'}
            </button>
          </div>
        )}
        {won && !exactWon && (
          <p className="melody-hint">
            Correct-pitch challenge: attempt {attempts.length + 1}. Keep the same intervals and try a different starting note.
          </p>
        )}

        <section className="attempt-history" aria-labelledby="history-heading">
          <div className="history-heading">
            <h2 id="history-heading">Your attempts</h2>
            <div className="game-controls history-actions">
              <span className="attempt-count">{attempts.length} submitted</span>
              <button type="button" disabled={!won || sharing} aria-label="Share results"
                title={won ? 'Share only the latest four attempts' : 'Win to share your results'} onClick={() => void shareResults()}>
                {sharing ? 'Sharing…' : 'Share'}
              </button>
            </div>
          </div>
          {shareStatus && <p className="share-status" role="status">{shareStatus}</p>}
          {manualShareText !== null && (
            <div className="share-result">
              <label htmlFor="shared-results">Copy your result</label>
              <textarea id="shared-results" readOnly value={manualShareText} rows={10}
                onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} />
              <div className="game-controls">
                <button type="button" onClick={clearShare}>Close</button>
              </div>
            </div>
          )}
          {visibleAttempt ? (
            <>
              <nav className="game-controls attempt-picker" aria-label="Attempt history navigation">
                <button type="button" aria-label="Previous attempt" disabled={selectedAttempt === 0}
                  onClick={() => selectAttempt(selectedAttempt - 1)}>←</button>
                <select value={selectedAttempt} aria-label="Choose an attempt"
                  onChange={(event) => selectAttempt(Number(event.currentTarget.value))}>
                  {attempts.map((_, index) => (
                    <option key={index} value={index}>Attempt {index + 1} of {attempts.length}</option>
                  ))}
                </select>
                <button type="button" aria-label="Next attempt" disabled={selectedAttempt === attempts.length - 1}
                  onClick={() => selectAttempt(selectedAttempt + 1)}>→</button>
              </nav>
              <article className="attempt-card" aria-labelledby="selected-attempt-heading">
                <div className="attempt-card-heading">
                  <div className="attempt-info">
                    <h3 id="selected-attempt-heading" className="attempt-number">Attempt {selectedAttempt + 1}</h3>
                    <div className="attempt-result">
                      <span className="attempt-dots" aria-hidden="true">
                        {visibleAttempt.feedback.map((feedback, position) => (
                          <span className={`feedback-dot dot-${feedback}`} key={position}
                            title={`Note ${position + 1}: ${labels[feedback]}`}>
                            {feedback === 'low' ? '↑' : feedback === 'high' ? '↓' : '✓'}
                          </span>
                        ))}
                      </span>
                      <span className={isTransposedAttempt ? 'transposed-result' : ''}>
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
                <SheetMusic abc={toAbc(visibleAttempt.notes, noteNaming)} feedback={visibleAttempt.feedback}
                  label={notationLabel(visibleAttempt.notes, noteNaming, visibleAttempt.feedback)} />
                {isTransposedAttempt && (
                  <div className="game-controls correct-pitch-playback">
                    <button type="button" className="correct-pitch-button"
                      aria-label={isCorrectPitchPlaying ? 'Stop correct pitch playback' : 'Play melody at the correct pitch'}
                      onClick={() => togglePlayback(TARGET, correctPitchId)}>
                      {isCorrectPitchPlaying ? '■ Stop correct pitch' : '▶ Play at the correct pitch'}
                    </button>
                  </div>
                )}
              </article>
              <ul className="feedback-legend" aria-label="Feedback rules">
                <li className="legend-correct">Correct pitch & position</li>
                <li className="legend-low">↑ Too low · play higher</li>
                <li className="legend-high">↓ Too high · play lower</li>
                <li className="legend-transposed">Purple label: right melody, shifted pitch</li>
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
            <SheetMusic abc={toAbc(guess, noteNaming)} label={notationLabel(guess, noteNaming)} />
            <div className="game-controls guess-actions">
              <button type="button" className="play-guess" disabled={!guess.length}
                aria-label={playing === 'current' ? 'Stop current guess' : 'Play current guess'}
                onClick={() => togglePlayback(guess, 'current')}>
                {playing === 'current' ? '■ Stop' : '▶ Play guess'}
              </button>
              <button type="button" disabled={!guess.length} aria-keyshortcuts="Backspace"
                title="Undo last note (Backspace)" onClick={() => editGuess(guess.slice(0, -1))}>Undo <kbd>⌫</kbd></button>
              <button type="button" disabled={!guess.length} onClick={() => editGuess([])}>Clear</button>
              <button type="button" className="submit-guess"
                disabled={guess.length !== TARGET.length} onClick={submitGuess}>Submit guess</button>
            </div>
          </section>
        )}

        <section className="keyboard-section" aria-label="Piano">
          <div className="piano-toolbar">
            <div className="game-controls">
              <button type="button" className="note-naming-toggle" aria-label="Use Dó–Si note names"
                aria-pressed={noteNaming === 'solfege'}
                onClick={() => setNoteNaming((previous) => previous === 'letters' ? 'solfege' : 'letters')}>
                <span className={noteNaming === 'letters' ? 'active-naming' : ''}>A–G</span>
                <span className="naming-switch" aria-hidden="true" />
                <span className={noteNaming === 'solfege' ? 'active-naming' : ''}>Dó–Si</span>
              </button>
            </div>
            <div className="piano-sound">
              <label htmlFor="piano-sound">Sound</label>
              <select id="piano-sound" value={sound}
                onChange={(event) => setSound(event.currentTarget.value as PianoSound)}>
                {Object.entries(PIANO_SOUNDS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="piano-volume">
              <label htmlFor="piano-volume">Volume</label>
              <input id="piano-volume" type="range" min="0" max="100" step="1" value={volume}
                aria-valuetext={`${volume}%`} onChange={(event) => setVolume(Number(event.currentTarget.value))} />
              <output htmlFor="piano-volume">{volume}%</output>
            </div>
          </div>
          {soundStatus === 'loading' && (
            <div className="sound-status" role="status">
              <span>Loading {PIANO_SOUNDS[sound]}… {soundProgress}%</span>
              <progress value={soundProgress} max="100" aria-label={`Loading ${PIANO_SOUNDS[sound]}`} />
            </div>
          )}
          {soundStatus === 'error' && (
            <div className="sound-status game-controls">
              <span>This sound couldn’t load. Try again or choose Synth.</span>
              <button type="button" onClick={retrySound}>Retry sound</button>
            </div>
          )}
          <p className="piano-help">Tap for a short note; hold to sustain it.{!finished && ' Backspace undoes the last note.'} <span>Scroll sideways on smaller screens.</span></p>
          <div className="piano-scroll" tabIndex={0} role="region" aria-label="Scrollable piano keyboard">
            <div className="piano-keyboard">
              {whiteKeys.map(({ midi }) => (
                <button key={midi} type="button" className={`piano-key piano-white${pressedNotes.has(midi) ? ' is-held' : ''}`}
                  aria-label={`Play ${noteName(midi, noteNaming)}`} {...keyHandlers(midi)}>{noteName(midi, noteNaming)}</button>
              ))}
              {blackKeys.map(({ midi, position }) => (
                <button key={midi} type="button" className={`piano-key piano-black${pressedNotes.has(midi) ? ' is-held' : ''}`}
                  style={{ left: `${position / whiteKeys.length * 100}%`, width: `${60 / whiteKeys.length}%` }}
                  aria-label={`Play ${noteName(midi, noteNaming)}`} {...keyHandlers(midi)}>{noteName(midi, noteNaming)}</button>
              ))}
            </div>
          </div>
          <p className="sound-credits">
            Grand piano: <a href="https://github.com/sfzinstruments/SplendidGrandPiano">Splendid Grand / AKAI</a>.
            {' '}Electric piano: <a href="https://github.com/sfzinstruments/GregSullivan.E-Pianos">Greg Sullivan / kinwie</a>
            {' '}(<a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>),
            {' '}via <a href="https://github.com/danigb/smplr">smplr</a>.
          </p>
        </section>

      </div>
    </main>
  );
}

export default Brodle;
