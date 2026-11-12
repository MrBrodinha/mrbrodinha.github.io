import { useAuth } from '../../auth/authContext';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import SheetMusic from './components/SheetMusic';
import WinConfetti from './components/WinConfetti';
import BrodleIcon from './components/BrodleIcon';
import PianoKeyboard from './components/PianoKeyboard';
import PianoControls from './components/PianoControls';
import BrodleTutorial from './components/BrodleTutorial';
import AttemptHistory from './components/AttemptHistory';
import { usePianoAudio } from './hooks/usePianoAudio';
import { useBrodleProgress } from './hooks/useBrodleProgress';
import { canSubmitGuess, copyAttemptToDraft, editProgressGuess, GAME_MODE_STORAGE_KEY, gameModeStorageKey, guessFeedback, guessRangeIssues, hintLimit, isFinished, modeWithAttempts, noteConstraints, parseProgress, progressStorageKey, replaceGuessNote, revealNextHint, winningAttempt } from './lib/gameProgress';
import type { GameMode } from './lib/gameProgress';
import {
  noteName, scoreGuess, notationForGuess, melodyForGuess,
  buildShareText, getWinKind, challengePianoRange,
} from './lib/musicGame';
import type { Attempt, Feedback, MelodyStep, MusicalKey, NoteNaming } from './lib/musicGame';
import { transposeVictory, victoryPianoRange } from './lib/victoryMusic';
import { useDailyChallenge } from './hooks/useDailyChallenge';
import { displayDate, lisbonDate } from './lib/melodyLibrary';
import type { GameChallenge } from './lib/melodyLibrary';
import ChallengeNavigation from './components/ChallengeNavigation';
import type { ChallengeNavigationProps } from './components/ChallengeNavigation';
import { feedbackLabels } from './lib/feedback';
import './Brodle.css';
import './library/MelodyLibrary.css';

const EMPTY_PRESSED_NOTES = new Set<number>();

function loadGameMode(challengeId: string, target: readonly number[], userId: string | null, preferred?: GameMode): GameMode {
  try {
    const saved = window.localStorage.getItem(gameModeStorageKey(challengeId, target, userId));
    const preference = saved === 'guided' || saved === 'classic' ? saved : window.localStorage.getItem(GAME_MODE_STORAGE_KEY);
    const choice = preferred ?? (preference === 'classic' ? 'classic' : 'guided');
    return modeWithAttempts(choice, {
      guided: parseProgress(window.localStorage.getItem(progressStorageKey(challengeId, target, userId, 'guided')), target, 'guided'),
      classic: parseProgress(window.localStorage.getItem(progressStorageKey(challengeId, target, userId, 'classic')), target, 'classic'),
    });
  } catch { return preferred ?? 'guided'; }
}

function notationLabel(notes: readonly number[], naming: NoteNaming, MELODY: readonly MelodyStep[], feedback: readonly (Feedback | undefined)[] | undefined, key: MusicalKey): string {
  if (!notes.length) return 'Empty staff. Use the piano to enter your guess.';
  let position = 0;
  return melodyForGuess(notes, MELODY).map((step) => {
    if (step.midi === null) return step.rhythm;
    const index = position++;
    const status = feedback?.[index];
    return `Note ${index + 1}: ${noteName(step.midi, naming, key)}${status ? `, ${feedbackLabels[status]}` : ''}`;
  }).join('. ');
}

function Brodle({ challenge, notice, navigation }: { challenge: GameChallenge; notice: string; navigation: ChallengeNavigationProps }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const CHALLENGE = challenge;
  const { melody: MELODY, finalMelody: MELODY_FINAL, key: KEY, bpm, timeSignature } = challenge;
  const TARGET = useMemo(() => MELODY.flatMap((step) => step.midi === null ? [] : [step.midi]), [MELODY]);
  const audio = usePianoAudio(MELODY, bpm);
  const { soundStatus, playing, audioError, playNotes, stopAudio } = audio;
  const modeKey = gameModeStorageKey(CHALLENGE.id, TARGET, userId);
  const [gameMode, setGameMode] = useState<GameMode>(() => loadGameMode(CHALLENGE.id, TARGET, userId));
  const casual = gameMode === 'guided';
  const { progress, updateProgress, storageError, loading: progressLoading, status: progressStatus, accountProgress, retrySync } = useBrodleProgress(CHALLENGE.id, TARGET, gameMode, setGameMode);
  const { guess, attempts, hintsUsed } = progress;
  const constraints = useMemo(() => noteConstraints(progress, TARGET, gameMode), [progress, TARGET, gameMode]);
  const sheetFeedback = useMemo(() => guessFeedback(progress, TARGET, gameMode), [progress, TARGET, gameMode]);
  const invalidNotes = useMemo(() => guessRangeIssues(progress, TARGET, gameMode), [progress, TARGET, gameMode]);
  const challengeRange = useMemo(() => challengePianoRange(TARGET), [TARGET]);
  const maxHints = hintLimit(TARGET);
  const melodyHintUnlocked = casual && maxHints > 0 && hintsUsed >= maxHints;
  const nextHintPlaysMelody = casual && maxHints > 0 && hintsUsed === maxHints - 1;
  const isMelodyHintPlaying = playing === 'hint-melody';
  const [celebration, setCelebration] = useState<'exact' | 'octave' | 'melody' | null>(null);
  const [winScrollRequest, setWinScrollRequest] = useState(0);
  const [noteNaming, setNoteNaming] = useState<NoteNaming>('letters');
  const [selectedGuessIndex, setSelectedGuessIndex] = useState<number | null>(null);
  const [freePlay, setFreePlay] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [manualShareText, setManualShareText] = useState<string | null>(null);
  const shareRequest = useRef(0);
  const draft = useRef<HTMLElement>(null);

  const win = winningAttempt(progress, TARGET, gameMode);
  const exactWon = win?.kind === 'exact';
  const octaveWon = win?.kind === 'octave';
  const won = win !== null;
  const finished = won;
  const winOffset = win?.offset ?? 0;
  const victoryParts = useMemo(() => [MELODY_FINAL, challenge.finalBass ?? []].map((part) => transposeVictory(part, winOffset)), [MELODY_FINAL, challenge.finalBass, winOffset]);
  const finalRange = useMemo(() => victoryPianoRange(victoryParts), [victoryParts]);
  const finalPlaying = playing === 'final';
  const pianoRange = finalPlaying && finalRange ? finalRange : challengeRange;
  const finalBpm = challenge.finalBpm ?? bpm;

  useEffect(() => {
    if (!attempts.length) return;
    try { window.localStorage.setItem(modeKey, gameMode); } catch { /* The current round stays locked in memory. */ }
  }, [modeKey, gameMode, attempts.length]);

  useEffect(() => {
    const keys = ['guided', 'classic'].map((mode) => progressStorageKey(CHALLENGE.id, TARGET, userId, mode as GameMode));
    const restoreMode = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && event.key && keys.includes(event.key)) {
        setGameMode((current) => loadGameMode(CHALLENGE.id, TARGET, userId, current));
      }
    };
    window.addEventListener('storage', restoreMode);
    return () => window.removeEventListener('storage', restoreMode);
  }, [CHALLENGE.id, TARGET, userId]);

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
    function handleEditingKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || finished) return;
      const target = event.target;
      if (target instanceof Element && (target.closest('input, textarea, select, dialog') || (target instanceof HTMLElement && target.isContentEditable))) return;
      if (event.key === 'Escape') { setSelectedGuessIndex(null); return; }
      if (event.key !== 'Backspace') return;
      event.preventDefault();
      if (freePlay) return;
      stopAudio();
      setSelectedGuessIndex(null);
      updateProgress((previous) => editProgressGuess(previous, previous.guess.slice(0, -1), TARGET, gameMode));
    }
    window.addEventListener('keydown', handleEditingKey);
    return () => window.removeEventListener('keydown', handleEditingKey);
  }, [finished, gameMode, freePlay, stopAudio, updateProgress, TARGET]);

  function addNote(midi: number) {
    if (finished || freePlay) return;
    const editingIndex = selectedGuessIndex;
    const { previous, next } = updateProgress((previous) => {
      if (isFinished(previous, gameMode)) return previous;
      if (selectedGuessIndex !== null && selectedGuessIndex < previous.guess.length) {
        return replaceGuessNote(previous, selectedGuessIndex, midi, TARGET, gameMode);
      }
      return previous.guess.length >= TARGET.length ? previous
        : editProgressGuess(previous, [...previous.guess, midi], TARGET, gameMode);
    });
    if (editingIndex !== null && previous !== next) {
      const nextIndex = noteConstraints(next, TARGET, gameMode).findIndex((constraint, index) =>
        index > editingIndex && index < next.guess.length && constraint.lockedMidi === null);
      setSelectedGuessIndex(nextIndex === -1 ? null : nextIndex);
    }
  }

  function togglePlayback(notes: readonly number[], id: string, rhythm?: readonly Pick<MelodyStep, 'midi' | 'beats' | 'triplet'>[]) {
    if (playing === id) stopAudio();
    else void playNotes(notes, id, rhythm);
  }

  function toggleFreePlay() {
    stopAudio();
    setFreePlay((previous) => !previous);
  }

  function changeGameMode(mode: GameMode) {
    if (mode === gameMode || attempts.length || progressLoading) return;
    const nextMode = loadGameMode(CHALLENGE.id, TARGET, userId, mode);
    stopAudio();
    setSelectedGuessIndex(null);
    setFreePlay(false);
    setCelebration(null);
    setWinScrollRequest(0);
    clearShare();
    setGameMode(nextMode);
    try { window.localStorage.setItem(GAME_MODE_STORAGE_KEY, nextMode); window.localStorage.setItem(modeKey, nextMode); }
    catch { /* The round still works if the browser cannot remember a preference. */ }
  }

  function editGuess(notes: number[]) {
    stopAudio();
    setSelectedGuessIndex(null);
    updateProgress((previous) => editProgressGuess(previous, notes, TARGET, gameMode));
  }

  function copyAttempt(index: number) {
    stopAudio();
    setFreePlay(false);
    const { next } = updateProgress((previous) => copyAttemptToDraft(previous, index, TARGET, gameMode));
    const firstIssue = guessRangeIssues(next, TARGET, gameMode)[0];
    const editableIndex = firstIssue ?? noteConstraints(next, TARGET, gameMode).findIndex((constraint, position) =>
      position < next.guess.length && constraint.lockedMidi === null);
    setSelectedGuessIndex(editableIndex === -1 ? null : editableIndex);
    requestAnimationFrame(() => draft.current?.scrollIntoView({ block: 'nearest' }));
  }

  function selectAttempt(index: number) {
    stopAudio();
    updateProgress((previous) => ({ ...previous, selectedAttempt: index }));
  }

  function fixFirstNote() {
    const index = invalidNotes[0];
    if (index === undefined) return;
    stopAudio();
    setFreePlay(false);
    setSelectedGuessIndex(index);
    requestAnimationFrame(() => {
      const note = draft.current?.querySelector<SVGElement>(`[data-score-index="${index}"]`);
      note?.focus({ preventScroll: true });
      note?.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  }

  function revealHint() {
    if (!casual) return;
    if (melodyHintUnlocked) {
      togglePlayback(TARGET, 'hint-melody', MELODY);
      return;
    }
    stopAudio();
    setSelectedGuessIndex(null);
    clearShare();
    const { next } = updateProgress((previous) => revealNextHint(previous, TARGET, gameMode));
    if (casual && next.guess.length && !isFinished(next, gameMode)) {
      const index = noteConstraints(next, TARGET, gameMode).findIndex((constraint) => constraint.lockedMidi === null);
      setSelectedGuessIndex(index === -1 || index >= next.guess.length ? null : index);
    }
    if (casual && !isFinished(next, gameMode) && maxHints > 0 && next.hintsUsed >= maxHints) {
      void playNotes(TARGET, 'hint-melody', MELODY);
    }
  }

  function submitGuess() {
    if (!canSubmitGuess(progress, TARGET, gameMode)) return;
    const { previous, next } = updateProgress((saved) => {
      if (!canSubmitGuess(saved, TARGET, gameMode)) return saved;
      const attempt: Attempt = { id: crypto.randomUUID(), notes: [...saved.guess], feedback: scoreGuess(saved.guess, TARGET, !casual), hintsUsed: saved.hintsUsed };
      return { ...saved, guess: TARGET.slice(0, saved.hintsUsed),
        attempts: [...saved.attempts, attempt], selectedAttempt: saved.attempts.length };
    });
    if (previous === next) return;
    setSelectedGuessIndex(null);
    const attempt = next.attempts[next.selectedAttempt];
    clearShare();
    const kind = getWinKind(attempt.notes, TARGET, !casual);
    if (kind) {
      setWinScrollRequest((request) => request + 1);
      setCelebration(kind === 'shifted' ? 'melody' : kind);
      const offset = attempt.notes[0] - TARGET[0];
      void audio.playArrangement([MELODY_FINAL, challenge.finalBass ?? []].map((part) => transposeVictory(part, offset)), 'final', finalBpm);
    } else {
      void playNotes(attempt.notes, `attempt-${next.selectedAttempt}`);
    }
  }

  function toggleFinalMelody() {
    if (!won) return;
    if (playing === 'final') stopAudio();
    else void audio.playArrangement(victoryParts, 'final', finalBpm);
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
    const text = buildShareText(attempts, TARGET, `${window.location.origin}/brodle${challenge.date ? '?date=' + challenge.date : ''}`, hintsUsed, !casual)
      + `\nMode: ${casual ? 'Casual' : 'Hard'}` + (challenge.date ? `\nChallenge: ${challenge.date}` : '');
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

  const lastAttempt = attempts[attempts.length - 1];
  const guessKey = KEY;
  const guessNotation = useMemo(() => notationForGuess(guess, noteNaming, MELODY, guessKey, timeSignature, bpm), [guess, noteNaming, guessKey, MELODY, timeSignature, bpm]);
  const guessSelectionIndices = useMemo(() => [guessNotation.guessIndices.map((index) => index !== null && constraints[index].lockedMidi !== null ? null : index)], [guessNotation, constraints]);
  const selectedNoteIndex = selectedGuessIndex !== null && selectedGuessIndex < guess.length && constraints[selectedGuessIndex].lockedMidi === null ? selectedGuessIndex : null;
  const highlightedGuessNotes = useMemo(() => !finished && !freePlay && selectedNoteIndex !== null ? [guess[selectedNoteIndex]] : [], [finished, freePlay, guess, selectedNoteIndex]);
  const activeNoteIndex = selectedNoteIndex ?? (guess.length < TARGET.length ? guess.length : null);
  const availableRange = finished || freePlay || !casual ? undefined : activeNoteIndex === null ? { minMidi: 1, maxMidi: 0 } : constraints[activeNoteIndex];
  const submittable = canSubmitGuess(progress, TARGET, gameMode);
  const unchangedGuess = casual && lastAttempt && guess.length === TARGET.length && guess.every((midi, index) => midi === lastAttempt.notes[index]);
  const winPlaybackId = 'final';
  const isWinPlaying = playing === winPlaybackId;
  const winCount = (win?.index ?? -1) + 1;
  const shareLabel = sharing ? 'Sharing…' : shareStatus === 'Copied!' || shareStatus === 'Shared!' ? shareStatus : 'Share';
  const message = exactWon
    ? 'You found the tune in ' + winCount + (winCount === 1 ? ' attempt!' : ' attempts!')
    : octaveWon
      ? 'You found the melody in a different octave.'
    : won
      ? 'You won in ' + winCount + (winCount === 1 ? ' attempt' : ' attempts') + ' with the correct melody at a shifted pitch!'
      : 'Attempt ' + (attempts.length + 1) + '. Enter ' + TARGET.length + ' notes.';

  if (progressLoading) return <main className="route-loading" role="status">Restoring your Brodle attempts…</main>;

  return (
    <div className="brodle-page">
      {celebration && <WinConfetti key={celebration} variant={celebration === 'octave' ? 'melody' : celebration} />}
      <main className="brodle-content brodle-main">
        <h1 className="sr-only">Brodle</h1>

        <div className="puzzle-toolbar">
          <div className="puzzle-intro">
            <div className="daily-caption" aria-live="polite">
              {challenge.date && <strong>{displayDate(challenge.date)} · {navigation.archive ? 'Selected day' : 'Midnight Lisbon reset'}</strong>}
              {notice && notice !== 'Archive challenge' && <span>{notice}</span>}
              {accountProgress && <span role="status">{progressStatus === 'saved' ? 'Progress saved to your account' : progressStatus === 'saving' ? 'Saving your progress…' : progressStatus === 'error' ? 'Account sync unavailable. Your progress will retry automatically.' : 'Progress saved in this browser'}</span>}
              {accountProgress && progressStatus === 'error' && <button type="button" className="brodle-button" onClick={retrySync}>Retry saving progress</button>}
            </div>
          </div>
          <p className="sr-only" role="status">{message}</p>
          <div className="game-mode-picker">
            {attempts.length ? <span className="game-mode-locked" role="status">{casual ? 'Casual' : 'Hard'}<span>Mode locked</span></span> : <div className="game-mode-options" role="group" aria-label="Game mode">
              <button type="button" className="brodle-button" aria-pressed={casual} onClick={() => changeGameMode('guided')}>Casual</button>
              <button type="button" className="brodle-button" aria-pressed={!casual} onClick={() => changeGameMode('classic')}>Hard</button>
            </div>}
            <BrodleTutorial maxHints={maxHints} onOpen={stopAudio} exactOnly={!casual} />
          </div>
        </div>
        <div className="brodle-workspace">
          {won ? (
            <section className={'win-section' + (exactWon ? ' win-exact' : octaveWon ? ' win-octave' : '')} aria-labelledby="win-title">
              <div className="win-emblem"><BrodleIcon name={exactWon ? 'check' : 'sparkle'} size={28} /></div>
              <div className="win-copy">
                {!exactWon && <p className="win-eyebrow">{octaveWon ? 'Correct melody. Different octave!' : 'Correct melody. Shifted pitch!'}</p>}
                <h2 id="win-title">{CHALLENGE.title}</h2>
                <p className="song-source">{CHALLENGE.source}{CHALLENGE.author && ` · Melody by ${CHALLENGE.author}`}</p>
                <p className="win-result">
                  Solved in <strong>{winCount}</strong> {winCount === 1 ? 'attempt' : 'attempts'}.
                </p>
              </div>
              <div className="win-actions game-controls">
                <button type="button" className="primary-button"
                  aria-label={isWinPlaying ? 'Stop melody' : 'Play full melody'}
                  onClick={toggleFinalMelody}>
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
          ) : null}

          {audioError && soundStatus !== 'error' && <p role="alert" className="audio-error">{audioError}</p>}
          {storageError && <p role="status" className="progress-error">Your progress couldn’t be saved in this browser.{progressStatus === 'saved' ? ' It is saved to your account.' : ' Keep this tab open until it is saved.'}</p>}

          {attempts.length > 0 && <AttemptHistory key={attempts.length} attempts={attempts} selectedIndex={progress.selectedAttempt}
            melody={MELODY} musicalKey={KEY} naming={noteNaming} timeSignature={timeSignature} bpm={bpm}
            playing={playing} finished={finished} exactOnly={!casual} onSelect={selectAttempt}
            onReplay={(index) => togglePlayback(attempts[index].notes, `attempt-${index}`)} onCopy={copyAttempt} />}
          <section className="play-panel brodle-panel" aria-label="Draft and piano">
            {!finished ? <section ref={draft} className="current-guess" aria-label="Your guess" data-empty={guess.length === 0}>
              <div className="guess-heading">
                <div className="guess-clue">
                  {CHALLENGE.hint && <p className="tune-tip"><span>Clue:</span> {CHALLENGE.hint}</p>}
                </div>
                <div className="guess-title">
                  <h2>Your guess <span className="attempt-total">Attempt {attempts.length + 1}</span></h2>
                </div>
                <div className="guess-heading-actions">
                  <button type="button" className={'brodle-button play-guess' + (playing === 'current' ? ' is-playing' : '')} disabled={!guess.length}
                    aria-label={playing === 'current' ? 'Stop current guess' : 'Play current guess'}
                    onClick={() => togglePlayback(guess, 'current')}>
                    <BrodleIcon name={playing === 'current' ? 'stop' : 'play'} />{playing === 'current' ? 'Stop' : 'Listen'}
                  </button>
                  <span className="sr-only" aria-live="polite">{guess.length} of {TARGET.length} notes entered</span>
                </div>
              </div>
              <SheetMusic abc={guessNotation.abc} musicalKey={guessKey} naming={noteNaming} bpm={bpm} timeSignature={timeSignature}
                compact minWidth={guess.length ? Math.max(320, TARGET.length * 34 + 120) : undefined} invalidNotes={invalidNotes}
                feedback={sheetFeedback} feedbackIndices={guessNotation.noteIndices}
                selection={{ stepIndices: guessSelectionIndices,
                  labels: [guess.map((midi, index) => `Note ${index + 1}: ${noteName(midi, noteNaming, guessKey)}.${invalidNotes.includes(index) ? ' Outside its allowed range.' : ''} Select to change this note.`)],
                  selected: selectedNoteIndex === null ? null : { voice: 0, index: selectedNoteIndex },
                  onSelect: (_, index) => { stopAudio(); setFreePlay(false); setSelectedGuessIndex(index); } }}
                label={notationLabel(guess, noteNaming, MELODY, sheetFeedback, guessKey)} />
              {selectedNoteIndex !== null && <div className="draft-edit-status">
                <p className="guess-edit-hint" role="status">Editing note {selectedNoteIndex + 1}. Choose a piano key to replace it.</p>
                <button type="button" className="brodle-button finish-edit" onClick={() => setSelectedGuessIndex(null)}>Done editing</button>
              </div>}
            </section> : <div className="completed-draft"><BrodleIcon name="check" /><p>Melody found. Play freely or revisit your attempts.</p></div>}

            <div className="play-controls">
              {!finished && <>
                <div className="draft-guidance">
                  <div id="submission-help" className={'submission-help' + (invalidNotes.length ? ' has-issues' : '')} role="status">
                    {invalidNotes.length ? <button type="button" onClick={fixFirstNote}>
                      <span aria-hidden="true">!</span> {invalidNotes.length} {invalidNotes.length === 1 ? 'note outside its' : 'notes outside their'} allowed range. Fix note {invalidNotes[0] + 1} <span aria-hidden="true">→</span>
                    </button> : guess.length < TARGET.length
                      ? `${TARGET.length - guess.length} more ${TARGET.length - guess.length === 1 ? 'note' : 'notes'} to play before submitting.`
                      : unchangedGuess ? 'Change at least one note from your last attempt.' : 'Your guess is ready to submit.'}
                  </div>
                  {casual && <div className="guess-hints">
                    <button type="button" className={'brodle-button' + (isMelodyHintPlaying ? ' is-playing' : '')} disabled={maxHints === 0} onClick={revealHint}
                      aria-pressed={melodyHintUnlocked ? isMelodyHintPlaying : undefined}
                      aria-describedby="hint-explanation"
                      title={melodyHintUnlocked ? 'Replay the challenge melody without using another hint.'
                        : nextHintPlaysMelody ? 'Use the final hint to reveal the next note and hear the challenge melody.'
                        : 'Reveal the next note.'}>
                      {(isMelodyHintPlaying || melodyHintUnlocked || nextHintPlaysMelody) && <BrodleIcon name={isMelodyHintPlaying ? 'stop' : 'play'} />}
                      {isMelodyHintPlaying ? 'Stop melody' : melodyHintUnlocked ? 'Replay melody' : nextHintPlaysMelody ? 'Play melody (last hint)' : hintsUsed >= maxHints && maxHints > 0 ? 'All note hints used' : 'Reveal next note'}
                      <span className="hint-count" aria-label={`${hintsUsed} of ${maxHints} hints used`}>{hintsUsed} / {maxHints}</span>
                    </button>
                    <details className="hint-explanation">
                      <summary aria-label="About hints" title="About hints"><BrodleIcon name="help" /></summary>
                      <p id="hint-explanation">{hintsUsed > 0
                        ? `The first ${hintsUsed === 1 ? 'note stays' : `${hintsUsed} notes stay`} correct in every attempt.`
                        : `Use up to ${maxHints} optional note ${maxHints === 1 ? 'hint' : 'hints'}. Revealed notes stay correct.`}
                        {maxHints > 0 && ' The final hint also plays the melody and unlocks free replays.'}</p>
                    </details>
                  </div>}
                </div>
                <div className="game-controls guess-actions">
                  <div className="guess-edit-actions">
                    <button type="button" className="undo-guess" disabled={guess.length <= hintsUsed} aria-keyshortcuts="Backspace"
                      title="Remove last note (Backspace)" onClick={() => editGuess(guess.slice(0, -1))}>
                      <BrodleIcon name="undo" /><span>Remove last note</span>
                    </button>
                  </div>
                  <button type="button" className="clear-guess" disabled={guess.length <= hintsUsed} onClick={() => editGuess([])}>Clear</button>
                  <button type="button" className="primary-button submit-guess" aria-describedby="submission-help"
                    disabled={!submittable} onClick={submitGuess}>Submit<BrodleIcon name="check" /></button>
                </div>
              </>}
              <section className="keyboard-section" aria-label="Piano">
                <PianoControls audio={audio} naming={noteNaming} onNaming={setNoteNaming} compact
                  freePlay={finished ? undefined : { enabled: freePlay, onToggle: toggleFreePlay }} />
                {!finished && <p id="piano-mode-status" className="sr-only" role="status">{freePlay
                  ? 'Try any piano key. Your guess stays unchanged.'
                  : 'Free play is off. Piano keys enter notes in your guess.'}</p>}
                <PianoKeyboard {...audio} {...pianoRange} octaveNavigation
                  fitToWidth playbackMode={finalPlaying}
                  pressedNotes={isMelodyHintPlaying ? EMPTY_PRESSED_NOTES : audio.pressedNotes}
                  playing={isMelodyHintPlaying ? null : playing}
                  availableRange={availableRange}
                  highlightedNotes={highlightedGuessNotes} naming={noteNaming} onNote={addNote} />
                {(freePlay || finished) && <div className="piano-help">
                  <p>Free play · Your draft stays unchanged.</p>
                </div>}
              </section>
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
  const { challenge, loading, notice, previousDate, nextDate, today, refresh } = useDailyChallenge(date);
  const archive = Boolean(date && date !== (today ?? lisbonDate()));
  if (loading || authLoading) return <main className="route-loading" role="status">{date ? 'Loading this day’s melody…' : 'Loading today’s melody…'}</main>;
  if (!challenge) return <main className="brodle-content brodle-main challenge-unavailable">
    <h1>This puzzle isn’t available</h1><p role="status">{notice || 'There is no published puzzle for this day.'}</p>
    <div className="challenge-navigation-actions">{archive && <Link to="/brodle">Today’s puzzle</Link>}<button type="button" onClick={() => void refresh()}>Try again</button></div>
  </main>;
  return <Brodle key={`${user?.id ?? 'guest'}:${challenge.id}`} challenge={challenge} notice={notice}
    navigation={{ date: challenge.date, previousDate, nextDate, archive }} />;
}

export default function BrodlePage() {
  const [params] = useSearchParams();
  const date = params.get('date');
  if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000') || !Number.isFinite(Date.parse(date + 'T12:00:00Z')) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date)) {
    return <main className="brodle-content brodle-main challenge-unavailable"><h1>Invalid puzzle date</h1><p>Return to today’s puzzle, then choose a published day below the game.</p><Link to="/brodle">Back to today’s puzzle</Link></main>;
  }
  return <BrodleDay key={date ?? 'daily'} date={date} />;
}
