import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import SheetMusic from './SheetMusic';
import WinConfetti from './WinConfetti';
import BrodleIcon from './BrodleIcon';
import { usePianoAudio } from './usePianoAudio';
import { useBrodleProgress } from './useBrodleProgress';
import { isFinished } from './gameProgress';
import { PIANO_SOUNDS } from './pianoSounds';
import type { PianoSound } from './pianoSounds';
import {
  CHALLENGE, KEY, MELODY, MELODY_FINAL, TARGET, whiteKeys, blackKeys, noteName, scoreGuess, toAbc, melodyForGuess,
  transpositionOffset, buildShareText, notationKey, getWinKind,
} from './musicGame';
import type { Attempt, Feedback, MelodyStep, MusicalKey, NoteNaming } from './musicGame';
import './Brodle.css';

const labels: Record<Feedback, string> = {
  correct: 'Correct pitch and position',
  octave: 'Correct melody, different octave',
  shifted: 'Correct melody, shifted pitch',
  low: 'Too low. Try a higher note',
  high: 'Too high. Try a lower note',
};
const feedbackIcons = { correct: 'check', octave: 'music', shifted: 'music', low: 'up', high: 'down' } as const;

function attemptSummary(attempt: Attempt): string {
  if (getWinKind(attempt.notes, TARGET) === 'octave') return 'Right melody · different octave';
  const offset = transpositionOffset(attempt.notes, TARGET);
  if (offset !== null) {
    return 'Right melody · shifted pitch';
  }
  const correct = attempt.feedback.filter((value) => value === 'correct').length;
  return correct === TARGET.length ? 'Correct melody!' : `${correct} of ${TARGET.length} pitches in place`;
}

function notationLabel(notes: readonly number[], naming: NoteNaming, feedback?: readonly Feedback[], key: MusicalKey = KEY): string {
  if (!notes.length) return 'Empty staff. Use the piano to enter your guess.';
  let position = 0;
  return melodyForGuess(notes, MELODY).map((step) => {
    if (step.midi === null) return step.rhythm;
    const index = position++;
    return `Note ${index + 1}: ${noteName(step.midi, naming, key)}${feedback ? `, ${labels[feedback[index]]}` : ''}`;
  }).join('. ');
}

function Brodle() {
  const { sound, setSound, soundStatus, soundProgress, retrySound,
    volume, setVolume, playing, audioError, pressedNotes,
    playNotes, startNote, releaseNote, stopAudio } = usePianoAudio();
  const { progress, updateProgress, storageError } = useBrodleProgress();
  const { guess, attempts, selectedAttempt } = progress;
  const [celebration, setCelebration] = useState<'exact' | 'octave' | 'melody' | null>(null);
  const [noteNaming, setNoteNaming] = useState<NoteNaming>('letters');
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [manualShareText, setManualShareText] = useState<string | null>(null);
  const shareRequest = useRef(0);
  const attemptTabs = useRef<HTMLDivElement>(null);
  const keyboardScroll = useRef<HTMLDivElement>(null);

  const exactWinIndex = attempts.findIndex((attempt) => attempt.feedback.every((value) => value === 'correct'));
  const octaveWinIndex = attempts.findIndex((attempt) => getWinKind(attempt.notes, TARGET) === 'octave');
  const melodyWinIndex = attempts.findIndex((attempt) =>
    attempt.feedback.every((value) => value === 'correct') || transpositionOffset(attempt.notes, TARGET) !== null,
  );
  const exactWon = exactWinIndex !== -1;
  const octaveWon = !exactWon && octaveWinIndex !== -1;
  const won = melodyWinIndex !== -1;
  const finished = exactWon;
  const bestWinKind = exactWon ? 'exact' : octaveWon ? 'octave' : 'shifted';
  const winOffset = attempts.reduce((offset, attempt) => getWinKind(attempt.notes, TARGET) === bestWinKind
    ? transpositionOffset(attempt.notes, TARGET) ?? 0 : offset, 0);
  const finalMelodyNotes = MELODY_FINAL.flatMap((note) => note.midi === null ? [] : [note.midi]);
  const winMelodyNotes = finalMelodyNotes.map((midi) => midi + winOffset);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Brodle · MrBrodinha';
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => () => { shareRequest.current += 1; }, []);

  useEffect(() => {
    const strip = attemptTabs.current;
    if (!strip) return;
    const revealSelected = () => {
      const tab = strip.querySelector<HTMLButtonElement>('[data-attempt="' + selectedAttempt + '"]');
      if (tab) strip.scrollLeft = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
    };
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [attempts.length, selectedAttempt]);

  useEffect(() => {
    if (!playing || !pressedNotes.size) return;
    const area = keyboardScroll.current;
    const midi = pressedNotes.values().next().value;
    const key = area?.querySelector<HTMLButtonElement>('[data-midi="' + midi + '"]');
    if (!area || !key) return;
    const bounds = area.getBoundingClientRect();
    const note = key.getBoundingClientRect();
    if (note.left < bounds.left + 8) area.scrollLeft += note.left - bounds.left - 8;
    else if (note.right > bounds.right - 8) area.scrollLeft += note.right - bounds.right + 8;
  }, [playing, pressedNotes]);

  useEffect(() => {
    function handleBackspace(event: KeyboardEvent) {
      if (event.key !== 'Backspace' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || finished) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;
      event.preventDefault();
      stopAudio();
      updateProgress((previous) => isFinished(previous) ? previous : { ...previous, guess: previous.guess.slice(0, -1) });
    }
    window.addEventListener('keydown', handleBackspace);
    return () => window.removeEventListener('keydown', handleBackspace);
  }, [finished, stopAudio, updateProgress]);

  function addNote(midi: number) {
    if (finished) return;
    updateProgress((previous) => isFinished(previous) || previous.guess.length >= TARGET.length
      ? previous : { ...previous, guess: [...previous.guess, midi] });
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
        void playNotes([midi], null, [{ midi, beats: 1 }]);
        addNote(midi);
      },
    };
  }

  function togglePlayback(notes: readonly number[], id: string, rhythm?: readonly Pick<MelodyStep, 'midi' | 'beats'>[]) {
    if (playing === id) stopAudio();
    else void playNotes(notes, id, rhythm);
  }

  function editGuess(notes: number[]) {
    stopAudio();
    updateProgress((previous) => isFinished(previous) ? previous : { ...previous, guess: notes });
  }

  function submitGuess() {
    if (guess.length !== TARGET.length || finished) return;
    const { previous, next } = updateProgress((saved) => {
      if (saved.guess.length !== TARGET.length || isFinished(saved)) return saved;
      const attempt: Attempt = { notes: [...saved.guess], feedback: scoreGuess(saved.guess, TARGET) };
      return { guess: [], attempts: [...saved.attempts, attempt], selectedAttempt: saved.attempts.length };
    });
    if (previous === next) return;
    const attempt = next.attempts[next.selectedAttempt];
    clearShare();
    const offset = transpositionOffset(attempt.notes, TARGET);
    if (offset !== null || attempt.feedback.every((feedback) => feedback === 'correct')) {
      if (offset === null) setCelebration('exact');
      else if (offset % 12 === 0 && !previous.attempts.some((entry) => getWinKind(entry.notes, TARGET) === 'octave')) setCelebration('octave');
      else if (!previous.attempts.some((entry) => transpositionOffset(entry.notes, TARGET) !== null)) setCelebration('melody');
      void playNotes(finalMelodyNotes.map((midi) => midi + (offset ?? 0)), 'final', MELODY_FINAL);
    } else {
      void playNotes(attempt.notes, `attempt-${next.selectedAttempt}`);
    }
  }

  function selectAttempt(index: number) {
    if (index === selectedAttempt || index < 0 || index >= attempts.length) return;
    stopAudio();
    updateProgress((previous) => ({ ...previous, selectedAttempt: index }));
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
    const text = buildShareText(attempts, TARGET, `${window.location.origin}/brodle`);
    const data = { title: 'Brodle', text };
    setSharing(true);
    setShareStatus('');
    setManualShareText(null);
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        try {
          await navigator.share(data);
          if (current()) setShareStatus('Shared!');
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
      if (current()) setShareStatus('Copied!');
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
  const visibleKey = notationKey(visibleAttempt?.notes ?? []);
  const guessKey = KEY;
  const visibleAttemptId = 'attempt-' + selectedAttempt;
  const isAttemptPlaying = playing === visibleAttemptId;
  const isTransposedAttempt = visibleAttempt ? transpositionOffset(visibleAttempt.notes, TARGET) !== null : false;
  const winPlaybackId = 'final';
  const isWinPlaying = playing === winPlaybackId;
  const winCount = (exactWon ? exactWinIndex : octaveWon ? octaveWinIndex : melodyWinIndex) + 1;
  const shareLabel = sharing ? 'Sharing…' : shareStatus === 'Copied!' || shareStatus === 'Shared!' ? shareStatus : 'Share';
  const message = exactWon
    ? 'You found the tune in ' + winCount + (winCount === 1 ? ' attempt!' : ' attempts!')
    : octaveWon
      ? 'You found the melody in a different octave. Now find the right octave.'
    : won
      ? 'You won in ' + winCount + (winCount === 1 ? ' attempt' : ' attempts') + ' with the correct melody at a shifted pitch!'
      : 'Attempt ' + (attempts.length + 1) + '. Enter ' + TARGET.length + ' notes. Unlimited attempts.';

  return (
    <div className="brodle-page">
      {celebration && <WinConfetti key={celebration} variant={celebration === 'octave' ? 'melody' : celebration} />}
      <main className="brodle-content brodle-main">
        <header className="brodle-header">
          <div className="brodle-brand">
            <span className="brodle-mark"><BrodleIcon name="music" size={25} /></span>
            <div>
              <h1>Brodle</h1>
              <p>Find the melody. We’ll take care of the rhythm.</p>
            </div>
          </div>
          <nav className="brodle-header-actions" aria-label="Game navigation">
            <Link to="/" className="brodle-home" aria-label="Back to home" title="Home"><BrodleIcon name="home" /><span>Home</span></Link>
          </nav>
        </header>

        <p className="sr-only" role="status">{message}</p>
        <div className="brodle-workspace">
          {won ? (
            <section className={'win-section' + (exactWon ? ' win-exact' : octaveWon ? ' win-octave' : '')} aria-labelledby="win-title">
              <div className="win-emblem"><BrodleIcon name={exactWon ? 'check' : 'sparkle'} size={28} /></div>
              <div className="win-copy">
                <p className="win-eyebrow">{exactWon ? 'Perfect pitch. You did it!' : octaveWon ? 'Correct melody. Different octave!' : 'Correct melody. Shifted pitch!'}</p>
                <h2 id="win-title">{CHALLENGE.title}</h2>
                <p className="song-source">{CHALLENGE.source}</p>
                <p className="win-result">
                  Solved in <strong>{winCount}</strong> {winCount === 1 ? 'attempt' : 'attempts'}.
                  {!exactWon && <span className="melody-hint">{octaveWon ? 'Now find the right octave.' : 'Find the exact pitch for a bigger celebration.'}</span>}
                </p>
              </div>
              <div className="win-actions game-controls">
                <button type="button" className="primary-button"
                  aria-label={isWinPlaying ? 'Stop melody' : exactWon ? 'Play full melody' : octaveWon ? 'Play full melody in your octave' : 'Play full melody at your shifted pitch'}
                  onClick={() => togglePlayback(winMelodyNotes, winPlaybackId, MELODY_FINAL)}>
                  <BrodleIcon name={isWinPlaying ? 'stop' : 'play'} />{isWinPlaying ? 'Stop melody' : 'Play melody'}
                </button>
                <button type="button" disabled={sharing} aria-label={exactWon ? 'Share exact-pitch result' : octaveWon ? 'Share different-octave result' : 'Share shifted-melody result'}
                  title="Share the latest four attempts" onClick={() => void shareResults()}>
                  <BrodleIcon name={shareStatus === 'Copied!' || shareStatus === 'Shared!' ? 'check' : 'share'} />{shareLabel}
                </button>
              </div>
              <span className="sr-only" role="status">{shareStatus}</span>
              {manualShareText !== null && (
                <div className="share-result">
                  <div className="share-result-heading">
                    <label htmlFor="shared-results">Copy your result</label>
                    <button type="button" className="brodle-button ghost-button" onClick={clearShare} aria-label="Close share result">
                      <BrodleIcon name="close" />Close
                    </button>
                  </div>
                  <textarea id="shared-results" readOnly value={manualShareText} rows={8}
                    onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} />
                </div>
              )}
            </section>
          ) : (
            <div className="round-meta">
              <p className="game-status"><span className="round-dot" />Attempt {attempts.length + 1}<span>Unlimited attempts</span></p>
              <p className="tune-tip"><BrodleIcon name="sparkle" /><span>Hint</span><strong>{CHALLENGE.hint}</strong></p>
            </div>
          )}

          {audioError && soundStatus !== 'error' && <p role="alert" className="audio-error">{audioError}</p>}
          {storageError && <p role="status" className="progress-error">Your progress couldn’t be saved in this browser. Keep this tab open to avoid losing it.</p>}

          {visibleAttempt && (
            <section className="attempt-history brodle-panel" aria-labelledby="history-heading">
              <div className="history-heading">
                <h2 id="history-heading">Your attempts <span className="attempt-count">{attempts.length}</span></h2>
              </div>
              <div ref={attemptTabs} className="attempt-tabs" role="tablist" aria-label="Attempts"
                onKeyDown={(event) => {
                  let next = selectedAttempt;
                  if (event.key === 'ArrowRight') next = (next + 1) % attempts.length;
                  else if (event.key === 'ArrowLeft') next = (next - 1 + attempts.length) % attempts.length;
                  else if (event.key === 'Home') next = 0;
                  else if (event.key === 'End') next = attempts.length - 1;
                  else return;
                  event.preventDefault();
                  selectAttempt(next);
                  attemptTabs.current?.querySelector<HTMLButtonElement>('[data-attempt="' + next + '"]')?.focus();
                }}>
                {attempts.map((attempt, index) => (
                  <button key={index} type="button" role="tab" id={'attempt-tab-' + index}
                    data-attempt={index} aria-selected={selectedAttempt === index} aria-controls="attempt-panel"
                    tabIndex={selectedAttempt === index ? 0 : -1} onClick={() => selectAttempt(index)}>
                    {getWinKind(attempt.notes, TARGET) !== null && (
                      <BrodleIcon name={transpositionOffset(attempt.notes, TARGET) !== null ? 'music' : 'check'} size={13} />
                    )}
                    Attempt {index + 1}
                  </button>
                ))}
              </div>
              <div className="attempt-card" id="attempt-panel" role="tabpanel" aria-labelledby={'attempt-tab-' + selectedAttempt} tabIndex={0}>
                <div className="attempt-card-heading">
                  <div className="attempt-feedback">
                    <span className="attempt-dots" aria-hidden="true">
                      {visibleAttempt.feedback.map((feedback, position) => (
                        <span className={'feedback-dot feedback-' + feedback} key={position}
                          title={'Note ' + (position + 1) + ': ' + labels[feedback]}>
                          <BrodleIcon name={feedbackIcons[feedback]} size={14} />
                        </span>
                      ))}
                    </span>
                    <p className={'attempt-summary' + (visibleAttempt.feedback[0] === 'octave' ? ' octave-result' : isTransposedAttempt ? ' transposed-result' : '')}>
                      {attemptSummary(visibleAttempt)}
                    </p>
                  </div>
                  <button type="button" className={'brodle-button replay-button' + (isAttemptPlaying ? ' is-playing' : '')}
                    aria-label={(isAttemptPlaying ? 'Stop' : 'Play') + ' attempt ' + (selectedAttempt + 1)}
                    onClick={() => togglePlayback(visibleAttempt.notes, visibleAttemptId)}>
                    <BrodleIcon name={isAttemptPlaying ? 'stop' : 'play'} />{isAttemptPlaying ? 'Stop' : 'Replay'}
                  </button>
                </div>
                <SheetMusic abc={toAbc(visibleAttempt.notes, noteNaming, MELODY, visibleKey)} feedback={visibleAttempt.feedback}
                  musicalKey={visibleKey} naming={noteNaming}
                  label={notationLabel(visibleAttempt.notes, noteNaming, visibleAttempt.feedback, visibleKey)} />
              </div>
              <ul className="feedback-legend" aria-label="Feedback rules">
                <li className="feedback-pill feedback-correct"><BrodleIcon name="check" size={13} />Correct</li>
                <li className="feedback-pill feedback-low" title="Too low. Try a higher note"><BrodleIcon name="up" size={13} />Too low</li>
                <li className="feedback-pill feedback-high" title="Too high. Try a lower note"><BrodleIcon name="down" size={13} />Too high</li>
                <li className="feedback-pill feedback-shifted" title="Correct melody at a shifted pitch"><BrodleIcon name="music" size={13} />Correct · shifted</li>
                <li className="feedback-pill feedback-octave" title="Correct melody in a different octave"><BrodleIcon name="music" size={13} />Correct · octave</li>
              </ul>
            </section>
          )}

          {!finished && (
            <section className="current-guess brodle-panel" aria-label="Current guess">
              <div className="guess-heading">
                <h2>Your guess</h2>
                <span className="note-count">{guess.length}<span> / {TARGET.length} notes</span></span>
              </div>
              <SheetMusic abc={toAbc(guess, noteNaming, MELODY, guessKey)} musicalKey={guessKey} naming={noteNaming}
                label={notationLabel(guess, noteNaming)} />
              <div className="game-controls guess-actions">
                <button type="button" className={'play-guess' + (playing === 'current' ? ' is-playing' : '')} disabled={!guess.length}
                  aria-label={playing === 'current' ? 'Stop current guess' : 'Play current guess'}
                  onClick={() => togglePlayback(guess, 'current')}>
                  <BrodleIcon name={playing === 'current' ? 'stop' : 'play'} />{playing === 'current' ? 'Stop' : 'Listen'}
                </button>
                <button type="button" className="undo-guess" disabled={!guess.length} aria-keyshortcuts="Backspace"
                  title="Undo last note (Backspace)" onClick={() => editGuess(guess.slice(0, -1))}>
                  <BrodleIcon name="undo" />Undo
                </button>
                <button type="button" className="clear-guess" disabled={!guess.length} onClick={() => editGuess([])}>Clear</button>
                <button type="button" className="primary-button submit-guess"
                  disabled={guess.length !== TARGET.length} onClick={submitGuess}>Submit guess<BrodleIcon name="check" /></button>
              </div>
            </section>
          )}

          <section className="keyboard-section brodle-panel" aria-label="Piano">
            <div className="piano-toolbar">
              <div className="note-naming-control" role="group" aria-label="Note names">
                <button type="button" aria-label="Use A–G note names" aria-pressed={noteNaming === 'letters'} onClick={() => setNoteNaming('letters')}>A–G</button>
                <button type="button" aria-label="Use Dó–Si note names" aria-pressed={noteNaming === 'solfege'} onClick={() => setNoteNaming('solfege')}>Dó–Si</button>
              </div>
              <div className="piano-sound">
                <label htmlFor="piano-sound">Instrument</label>
                <select id="piano-sound" value={sound} onChange={(event) => setSound(event.currentTarget.value as PianoSound)}>
                  {Object.entries(PIANO_SOUNDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="piano-volume">
                <label htmlFor="piano-volume" title="Volume"><BrodleIcon name="volume" size={17} /><span className="sr-only">Volume</span></label>
                <input id="piano-volume" type="range" min="0" max="100" step="1" value={volume}
                  aria-valuetext={volume + '%'} onChange={(event) => setVolume(Number(event.currentTarget.value))} />
                <output htmlFor="piano-volume">{volume}%</output>
              </div>
            </div>
            {soundStatus === 'loading' && (
              <div className="sound-status" role="status">
                <span>Loading {PIANO_SOUNDS[sound]}… {soundProgress}%</span>
                <progress value={soundProgress} max="100" aria-label={'Loading ' + PIANO_SOUNDS[sound]} />
              </div>
            )}
            {soundStatus === 'error' && (
              <div className="sound-status sound-error" role="alert">
                <span>This sound couldn’t load. Try again or choose Synth.</span>
                <button type="button" className="brodle-button" onClick={retrySound}>Retry sound</button>
              </div>
            )}
            <div ref={keyboardScroll} className="piano-scroll" tabIndex={0} role="region" aria-label="Scrollable piano keyboard">
              <div className="piano-keyboard">
                {whiteKeys.map(({ midi }) => (
                  <button key={midi} type="button" data-midi={midi} className={'piano-key piano-white' + (pressedNotes.has(midi) ? ' is-held' : '')}
                    aria-label={'Play ' + noteName(midi, noteNaming)} {...keyHandlers(midi)}>
                    <span className="key-label">{noteName(midi, noteNaming)}</span>
                  </button>
                ))}
                {blackKeys.map(({ midi, position }) => (
                  <button key={midi} type="button" data-midi={midi} className={'piano-key piano-black' + (pressedNotes.has(midi) ? ' is-held' : '')}
                    style={{ left: position / whiteKeys.length * 100 + '%', width: 60 / whiteKeys.length + '%' }}
                    aria-label={'Play ' + noteName(midi, noteNaming)} {...keyHandlers(midi)}>
                    <span className="key-label">{noteName(midi, noteNaming)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="piano-help">
              <p>Tap to play. Hold to sustain.<span className="piano-scroll-hint"> Swipe for more keys.</span></p>
              {!finished && <span className="keyboard-shortcut"><kbd>⌫</kbd> Undo</span>}
            </div>
          </section>
        </div>
      </main>

      <footer className="brodle-footer">
        <div className="brodle-content footer-content">
          <Link to="/" className="footer-brand">MrBrodinha</Link>
          <p className="sound-credits">
            Piano: <a href="https://github.com/sfzinstruments/SplendidGrandPiano">Splendid Grand / AKAI</a>
            <span aria-hidden="true"> · </span>Electric: <a href="https://github.com/sfzinstruments/GregSullivan.E-Pianos">Greg Sullivan / kinwie</a>
            {' '}(<a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>)
            <span aria-hidden="true"> · </span>via <a href="https://github.com/danigb/smplr">smplr</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Brodle;
