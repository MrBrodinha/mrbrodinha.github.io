import { useAuth } from '../../auth/authContext';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import SheetMusic from './components/SheetMusic';
import WinConfetti from './components/WinConfetti';
import BrodleIcon from './components/BrodleIcon';
import PianoKeyboard from './components/PianoKeyboard';
import PianoControls from './components/PianoControls';
import { usePianoAudio } from './hooks/usePianoAudio';
import { useBrodleProgress } from './hooks/useBrodleProgress';
import { isFinished } from './lib/gameProgress';
import {
  noteName, scoreGuess, notationForGuess, melodyForGuess,
  transpositionOffset, buildShareText, notationKey, getWinKind, melodyPitchHint,
} from './lib/musicGame';
import type { Attempt, Feedback, MelodyStep, MusicalKey, NoteNaming } from './lib/musicGame';
import { useDailyChallenge } from './hooks/useDailyChallenge';
import { displayDate } from './lib/melodyLibrary';
import type { GameChallenge } from './lib/melodyLibrary';
import ChallengeNavigation from './components/ChallengeNavigation';
import type { ChallengeNavigationProps } from './components/ChallengeNavigation';
import './Brodle.css';
import './library/MelodyLibrary.css';

const labels: Record<Feedback, string> = {
  correct: 'Correct pitch and position',
  octave: 'Correct melody, different octave',
  shifted: 'Correct melody, shifted pitch',
  low: 'Too low. Try a higher note',
  high: 'Too high. Try a lower note',
};
const feedbackIcons = { correct: 'check', octave: 'music', shifted: 'music', low: 'up', high: 'down' } as const;

function attemptSummary(attempt: Attempt, TARGET: readonly number[]): string {
  const hint = melodyPitchHint(attempt.notes, TARGET);
  if (hint) {
    return `Right melody · ${getWinKind(attempt.notes, TARGET) === 'octave' ? 'different octave' : 'shifted pitch'} · try ${hint.direction === 'up' ? 'higher' : 'lower'}`;
  }
  const correct = attempt.feedback.filter((value) => value === 'correct').length;
  return correct === TARGET.length ? 'Correct melody!' : `${correct} of ${TARGET.length} pitches in place`;
}

function notationLabel(notes: readonly number[], naming: NoteNaming, MELODY: readonly MelodyStep[], feedback: readonly Feedback[] | undefined, key: MusicalKey): string {
  if (!notes.length) return 'Empty staff. Use the piano to enter your guess.';
  let position = 0;
  return melodyForGuess(notes, MELODY).map((step) => {
    if (step.midi === null) return step.rhythm;
    const index = position++;
    return `Note ${index + 1}: ${noteName(step.midi, naming, key)}${feedback ? `, ${labels[feedback[index]]}` : ''}`;
  }).join('. ');
}

function Brodle({ challenge, notice, navigation }: { challenge: GameChallenge; notice: string; navigation: ChallengeNavigationProps }) {
  const CHALLENGE = challenge;
  const { melody: MELODY, finalMelody: MELODY_FINAL, key: KEY, bpm, timeSignature } = challenge;
  const TARGET = useMemo(() => MELODY.flatMap((step) => step.midi === null ? [] : [step.midi]), [MELODY]);
  const audio = usePianoAudio(MELODY, bpm);
  const { soundStatus, playing, audioError, playNotes, stopAudio } = audio;
  const { progress, updateProgress, storageError, loading: progressLoading, status: progressStatus, accountProgress, retrySync } = useBrodleProgress(CHALLENGE.id, TARGET);
  const { guess, attempts, selectedAttempt } = progress;
  const [celebration, setCelebration] = useState<'exact' | 'octave' | 'melody' | null>(null);
  const [winScrollRequest, setWinScrollRequest] = useState(0);
  const [noteNaming, setNoteNaming] = useState<NoteNaming>('letters');
  const [selectedGuessIndex, setSelectedGuessIndex] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [manualShareText, setManualShareText] = useState<string | null>(null);
  const shareRequest = useRef(0);
  const attemptTabs = useRef<HTMLDivElement>(null);

  const exactWinIndex = attempts.findIndex((attempt) => attempt.feedback.every((value) => value === 'correct'));
  const octaveWinIndex = attempts.findIndex((attempt) => getWinKind(attempt.notes, TARGET) === 'octave');
  const melodyWinIndex = attempts.findIndex((attempt) =>
    attempt.feedback.every((value) => value === 'correct') || transpositionOffset(attempt.notes, TARGET) !== null,
  );
  const exactWon = exactWinIndex !== -1;
  const octaveWon = !exactWon && octaveWinIndex !== -1;
  const won = melodyWinIndex !== -1;
  const finished = exactWon;
  const victoryParts = [MELODY_FINAL, challenge.finalBass ?? []];
  const finalBpm = challenge.finalBpm ?? bpm;
  const latestPitchHint = attempts.reduce<ReturnType<typeof melodyPitchHint>>((hint, attempt) => melodyPitchHint(attempt.notes, TARGET) ?? hint, null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Brodle · MrBrodinha';
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => () => { shareRequest.current += 1; }, []);

  useEffect(() => {
    if (!winScrollRequest) return;
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [winScrollRequest]);

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
  }, [attempts.length, selectedAttempt, progressLoading]);

  useEffect(() => {
    function handleEditingKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || finished) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;
      if (event.key === 'Escape') { setSelectedGuessIndex(null); return; }
      if (event.key !== 'Backspace') return;
      event.preventDefault();
      stopAudio();
      setSelectedGuessIndex(null);
      updateProgress((previous) => isFinished(previous) ? previous : { ...previous, guess: previous.guess.slice(0, -1) });
    }
    window.addEventListener('keydown', handleEditingKey);
    return () => window.removeEventListener('keydown', handleEditingKey);
  }, [finished, stopAudio, updateProgress]);

  function addNote(midi: number) {
    if (finished) return;
    updateProgress((previous) => {
      if (isFinished(previous)) return previous;
      if (selectedGuessIndex !== null && selectedGuessIndex < previous.guess.length) {
        return { ...previous, guess: previous.guess.map((note, index) => index === selectedGuessIndex ? midi : note) };
      }
      return previous.guess.length >= TARGET.length ? previous : { ...previous, guess: [...previous.guess, midi] };
    });
  }

  function togglePlayback(notes: readonly number[], id: string, rhythm?: readonly Pick<MelodyStep, 'midi' | 'beats'>[]) {
    if (playing === id) stopAudio();
    else void playNotes(notes, id, rhythm);
  }

  function editGuess(notes: number[]) {
    stopAudio();
    setSelectedGuessIndex(null);
    updateProgress((previous) => isFinished(previous) ? previous : { ...previous, guess: notes });
  }

  function copyLastAttempt() {
    stopAudio();
    setSelectedGuessIndex(null);
    updateProgress((previous) => {
      const last = previous.attempts[previous.attempts.length - 1];
      return isFinished(previous) || !last ? previous : { ...previous, guess: [...last.notes] };
    });
  }

  function submitGuess() {
    if (guess.length !== TARGET.length || finished) return;
    const { previous, next } = updateProgress((saved) => {
      if (saved.guess.length !== TARGET.length || isFinished(saved)) return saved;
      const attempt: Attempt = { id: crypto.randomUUID(), notes: [...saved.guess], feedback: scoreGuess(saved.guess, TARGET) };
      return { guess: [], attempts: [...saved.attempts, attempt], selectedAttempt: saved.attempts.length };
    });
    if (previous === next) return;
    setSelectedGuessIndex(null);
    const attempt = next.attempts[next.selectedAttempt];
    clearShare();
    const kind = getWinKind(attempt.notes, TARGET);
    if (kind) setWinScrollRequest((request) => request + 1);
    if (kind === 'exact') {
      setCelebration('exact');
      void audio.playArrangement(victoryParts, 'final', finalBpm);
    } else {
      if (kind === 'octave' && !previous.attempts.some((entry) => getWinKind(entry.notes, TARGET) === 'octave')) setCelebration('octave');
      else if (kind === 'shifted' && !previous.attempts.some((entry) => transpositionOffset(entry.notes, TARGET) !== null)) setCelebration('melody');
      void playNotes(attempt.notes, `attempt-${next.selectedAttempt}`);
    }
  }

  function toggleFinalMelody() {
    if (!exactWon) return;
    if (playing === 'final') stopAudio();
    else void audio.playArrangement(victoryParts, 'final', finalBpm);
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
    const text = buildShareText(attempts, TARGET, `${window.location.origin}/brodle${challenge.date ? '?date=' + challenge.date : ''}`) + (challenge.date ? `\nChallenge: ${challenge.date}` : '');
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
  const visibleKey = notationKey(visibleAttempt?.notes ?? [], MELODY, KEY);
  const guessKey = KEY;
  const visibleNotation = useMemo(() => notationForGuess(visibleAttempt?.notes ?? [], noteNaming, MELODY, visibleKey, timeSignature, bpm), [visibleAttempt, noteNaming, visibleKey, MELODY, timeSignature, bpm]);
  const guessNotation = useMemo(() => notationForGuess(guess, noteNaming, MELODY, guessKey, timeSignature, bpm), [guess, noteNaming, guessKey, MELODY, timeSignature, bpm]);
  const guessSelectionIndices = useMemo(() => [guessNotation.guessIndices], [guessNotation]);
  const selectedNoteIndex = selectedGuessIndex !== null && selectedGuessIndex < guess.length ? selectedGuessIndex : null;
  const highlightedGuessNotes = useMemo(() => !finished && selectedNoteIndex !== null ? [guess[selectedNoteIndex]] : [], [finished, guess, selectedNoteIndex]);
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
      ? 'You found the melody in a different octave. Find the right octave to unlock a surprise.'
    : won
      ? 'You won in ' + winCount + (winCount === 1 ? ' attempt' : ' attempts') + ' with the correct melody at a shifted pitch! Find the exact pitch and octave to unlock a surprise.'
      : 'Attempt ' + (attempts.length + 1) + '. Enter ' + TARGET.length + ' notes. Unlimited attempts.';

  if (progressLoading) return <main className="route-loading" role="status">Restoring your Brodle attempts…</main>;

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
        </header>

        <div className="daily-caption" aria-live="polite">
          {challenge.date && <strong>{displayDate(challenge.date)} · {navigation.archive ? 'Selected day' : 'Midnight Lisbon reset'}</strong>}
          {notice && <span>{notice}</span>}
          {accountProgress && <span role="status">{progressStatus === 'saved' ? 'Progress saved to your account' : progressStatus === 'saving' ? 'Saving your progress…' : progressStatus === 'error' ? 'Account sync unavailable. Your progress will retry automatically.' : 'Progress saved in this browser'}</span>}
          {accountProgress && progressStatus === 'error' && <button type="button" className="brodle-button" onClick={retrySync}>Retry saving progress</button>}
        </div>
        <p className="sr-only" role="status">{message}{!exactWon && latestPitchHint && ` Latest correct melody: ${latestPitchHint.text}`}</p>
        <div className="brodle-workspace">
          {won ? (
            <section className={'win-section' + (exactWon ? ' win-exact' : octaveWon ? ' win-octave' : '')} aria-labelledby="win-title">
              <div className="win-emblem"><BrodleIcon name={exactWon ? 'check' : 'sparkle'} size={28} /></div>
              <div className="win-copy">
                <p className="win-eyebrow">{exactWon ? 'Perfect pitch. Surprise unlocked!' : octaveWon ? 'Correct melody. Different octave!' : 'Correct melody. Shifted pitch!'}</p>
                <h2 id="win-title">{CHALLENGE.title}</h2>
                <p className="song-source">{CHALLENGE.source}{CHALLENGE.author && ` · Melody by ${CHALLENGE.author}`}</p>
                <p className="win-result">
                  Solved in <strong>{winCount}</strong> {winCount === 1 ? 'attempt' : 'attempts'}.
                </p>
              </div>
              <div className="win-actions game-controls">
                {exactWon && <button type="button" className="primary-button"
                  aria-label={isWinPlaying ? 'Stop melody' : 'Play full melody'}
                  onClick={toggleFinalMelody}>
                  <BrodleIcon name={isWinPlaying ? 'stop' : 'play'} />{isWinPlaying ? 'Stop melody' : 'Play melody'}
                </button>}
                <button type="button" disabled={sharing} aria-label={exactWon ? 'Share exact-pitch result' : octaveWon ? 'Share different-octave result' : 'Share shifted-melody result'}
                  title="Share the latest four attempts" onClick={() => void shareResults()}>
                  <BrodleIcon name={shareStatus === 'Copied!' || shareStatus === 'Shared!' ? 'check' : 'share'} />{shareLabel}
                </button>
              </div>
              {!exactWon && <div className="win-surprise">
                <span className="win-surprise-icon"><BrodleIcon name="sparkle" size={24} /></span>
                <div><strong>Get the pitch right to unlock a surprise!</strong>
                  {latestPitchHint && <p className="melody-direction-hint"><BrodleIcon name={latestPitchHint.direction} size={20} /><span>Latest correct melody: <b>{latestPitchHint.text}</b></span></p>}
                </div>
              </div>}
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
          {storageError && <p role="status" className="progress-error">Your progress couldn’t be saved in this browser.{progressStatus === 'saved' ? ' It is saved to your account.' : ' Keep this tab open until it is saved.'}</p>}

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
                      {attemptSummary(visibleAttempt, TARGET)}
                    </p>
                  </div>
                  <button type="button" className={'brodle-button replay-button' + (isAttemptPlaying ? ' is-playing' : '')}
                    aria-label={(isAttemptPlaying ? 'Stop' : 'Play') + ' attempt ' + (selectedAttempt + 1)}
                    onClick={() => togglePlayback(visibleAttempt.notes, visibleAttemptId)}>
                    <BrodleIcon name={isAttemptPlaying ? 'stop' : 'play'} />{isAttemptPlaying ? 'Stop' : 'Replay'}
                  </button>
                </div>
                <SheetMusic abc={visibleNotation.abc} feedback={visibleAttempt.feedback} feedbackIndices={visibleNotation.noteIndices}
                  musicalKey={visibleKey} naming={noteNaming} bpm={bpm} timeSignature={timeSignature}
                  label={notationLabel(visibleAttempt.notes, noteNaming, MELODY, visibleAttempt.feedback, visibleKey)} />
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
                <div className="guess-heading-actions">
                  {attempts.length > 0 && <button type="button" className="brodle-button copy-last-attempt" onClick={copyLastAttempt}
                    title="Replace your current guess with the last submitted attempt">
                    <BrodleIcon name="copy" />Copy last attempt
                  </button>}
                  <span className="note-count">{guess.length}<span> / {TARGET.length} notes</span></span>
                </div>
              </div>
              <SheetMusic abc={guessNotation.abc} musicalKey={guessKey} naming={noteNaming} bpm={bpm} timeSignature={timeSignature}
                selection={{ stepIndices: guessSelectionIndices,
                  labels: [guess.map((midi, index) => `Note ${index + 1}: ${noteName(midi, noteNaming, guessKey)}. Select to change this note.`)],
                  selected: selectedNoteIndex === null ? null : { voice: 0, index: selectedNoteIndex },
                  onSelect: (_, index) => { stopAudio(); setSelectedGuessIndex(index); } }}
                label={notationLabel(guess, noteNaming, MELODY, undefined, guessKey)} />
              <p className="guess-edit-hint" role="status">{selectedNoteIndex === null
                ? 'Click a note to change it, then choose a piano key.'
                : `Editing note ${selectedNoteIndex + 1}. Choose a piano key to replace only this note.`}</p>
              <div className="game-controls guess-actions">
                <div className="guess-edit-actions">
                  <button type="button" className={'play-guess' + (playing === 'current' ? ' is-playing' : '')} disabled={!guess.length}
                    aria-label={playing === 'current' ? 'Stop current guess' : 'Play current guess'}
                    onClick={() => togglePlayback(guess, 'current')}>
                    <BrodleIcon name={playing === 'current' ? 'stop' : 'play'} />{playing === 'current' ? 'Stop' : 'Listen'}
                  </button>
                  <button type="button" className="undo-guess" disabled={!guess.length} aria-keyshortcuts="Backspace"
                    title="Undo last note (Backspace)" onClick={() => editGuess(guess.slice(0, -1))}>
                    <BrodleIcon name="undo" />Undo
                  </button>
                  {selectedNoteIndex !== null && <button type="button" className="finish-edit" onClick={() => setSelectedGuessIndex(null)}>Done editing</button>}
                </div>
                <button type="button" className="primary-button submit-guess"
                  disabled={guess.length !== TARGET.length} onClick={submitGuess}>Submit guess<BrodleIcon name="check" /></button>
                <button type="button" className="clear-guess" disabled={!guess.length} onClick={() => editGuess([])}>Clear</button>
              </div>
            </section>
          )}

          <section className="keyboard-section brodle-panel" aria-label="Piano">
            <PianoControls audio={audio} naming={noteNaming} onNaming={setNoteNaming} />
            <PianoKeyboard {...audio} highlightedNotes={highlightedGuessNotes} naming={noteNaming} onNote={addNote} />
            <div className="piano-help">
              <p>Tap to play. Hold to sustain.<span className="piano-scroll-hint"> Swipe for more keys.</span></p>
              {!finished && <span className="keyboard-shortcut"><kbd>⌫</kbd> Undo</span>}
            </div>
          </section>
        </div>
      </main>
      <ChallengeNavigation {...navigation} />
    </div>
  );
}

function BrodleDay({ date }: { date: string | null }) {
  const { user, loading: authLoading } = useAuth();
  const { challenge, loading, notice, previousDate, nextDate, refresh } = useDailyChallenge(date);
  if (loading || authLoading) return <main className="route-loading" role="status">{date ? 'Loading this day’s melody…' : 'Loading today’s melody…'}</main>;
  if (!challenge) return <main className="brodle-content brodle-main challenge-unavailable">
    <h1>This puzzle isn’t available</h1><p role="status">{notice || 'There is no published puzzle for this day.'}</p>
    <div className="challenge-navigation-actions"><Link to="/brodle">Today’s puzzle</Link><button type="button" onClick={() => void refresh()}>Try again</button></div>
  </main>;
  return <Brodle key={`${user?.id ?? 'guest'}:${challenge.id}`} challenge={challenge} notice={notice}
    navigation={{ date: challenge.date, previousDate, nextDate, archive: Boolean(date) }} />;
}

export default function BrodlePage() {
  const [params] = useSearchParams();
  const date = params.get('date');
  if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000') || !Number.isFinite(Date.parse(date + 'T12:00:00Z')) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date)) {
    return <main className="brodle-content brodle-main challenge-unavailable"><h1>Invalid puzzle date</h1><p>Choose a published day using the arrows below the game.</p><Link to="/brodle">Back to today’s puzzle</Link></main>;
  }
  return <BrodleDay key={date ?? 'daily'} date={date} />;
}
