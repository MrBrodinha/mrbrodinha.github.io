import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BrodleIcon from './components/BrodleIcon';
import SheetMusic from './components/SheetMusic';
import PianoKeyboard from './components/PianoKeyboard';
import PianoControls from './components/PianoControls';
import AttemptHistory from './components/AttemptHistory';
import FeedbackLegend from './components/FeedbackLegend';
import { usePianoAudio } from './hooks/usePianoAudio';
import { canSubmitGuess, copyAttemptToDraft, editProgressGuess, guessFeedback, guessRangeIssues, hintLimit, noteConstraints, replaceGuessNote, revealNextHint, winningAttempt } from './lib/gameProgress';
import { challengePianoRange, notationForGuess, noteName } from './lib/musicGame';
import type { NoteNaming } from './lib/musicGame';
import { feedbackLabels } from './lib/feedback';
import { PRACTICE_BPM, PRACTICE_LESSONS, practiceProgress, submitPracticeGuess } from './lib/practiceLessons';
import './Brodle.css';
import './BrodlePractice.css';

const EMPTY_PRESSED_NOTES = new Set<number>();

export default function BrodlePractice() {
  const [lessonIndex, setLessonIndex] = useState(0);
  const lesson = PRACTICE_LESSONS[lessonIndex];
  const lessonHeading = useRef<HTMLHeadingElement>(null);
  const previousLesson = useRef(lessonIndex);
  const [progress, setProgress] = useState(() => practiceProgress(lesson));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [naming, setNaming] = useState<NoteNaming>('letters');
  const [freePlay, setFreePlay] = useState(false);
  const audio = usePianoAudio(lesson.melody, PRACTICE_BPM);
  const { guess, attempts, hintsUsed } = progress;
  const win = winningAttempt(progress, lesson.target);
  const finished = win !== null;
  const constraints = noteConstraints(progress, lesson.target);
  const lastAttempt = attempts[attempts.length - 1];
  const feedback = guessFeedback(progress, lesson.target).map((status, index) => status
    ?? (lastAttempt?.notes[index] === guess[index] ? lastAttempt.feedback[index] : undefined));
  const invalidNotes = guessRangeIssues(progress, lesson.target);
  const notation = useMemo(() => notationForGuess(guess, naming, lesson.melody, 'C', '4/4', PRACTICE_BPM), [guess, naming, lesson]);
  const selected = selectedIndex !== null && selectedIndex < guess.length && constraints[selectedIndex].lockedMidi === null ? selectedIndex : null;
  const activeIndex = selected ?? (guess.length < lesson.target.length ? guess.length : null);
  const availableRange = finished || freePlay ? undefined : activeIndex === null ? { minMidi: 1, maxMidi: 0 } : constraints[activeIndex];
  const songPlaying = audio.playing === 'practice-song';

  useEffect(() => {
    const previous = document.title;
    document.title = 'Learn to play · Brodle';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (previousLesson.current !== lessonIndex) {
      lessonHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      lessonHeading.current?.focus({ preventScroll: true });
    }
    previousLesson.current = lessonIndex;
  }, [lessonIndex]);

  function changeLesson(index: number) {
    if (index < 0 || index >= PRACTICE_LESSONS.length) return;
    audio.stopAudio();
    const next = practiceProgress(PRACTICE_LESSONS[index]);
    setLessonIndex(index);
    setProgress(next);
    setSelectedIndex(guessRangeIssues(next, PRACTICE_LESSONS[index].target)[0] ?? null);
    setFreePlay(false);
  }

  function editGuess(notes: number[]) {
    audio.stopAudio();
    setSelectedIndex(null);
    setProgress(previous => editProgressGuess(previous, notes, lesson.target));
  }

  function addNote(midi: number) {
    if (finished || freePlay) return;
    const next = selected === null
      ? editProgressGuess(progress, [...guess, midi], lesson.target)
      : replaceGuessNote(progress, selected, midi, lesson.target);
    setProgress(next);
    if (selected !== null && next !== progress) {
      const nextIndex = noteConstraints(next, lesson.target).findIndex((constraint, index) =>
        index > selected && index < next.guess.length && constraint.lockedMidi === null);
      setSelectedIndex(nextIndex === -1 ? null : nextIndex);
    }
  }

  function togglePlayback(notes: readonly number[], id: string) {
    if (audio.playing === id) audio.stopAudio();
    else void audio.playNotes(notes, id, lesson.melody);
  }

  function submit() {
    const next = submitPracticeGuess(progress, lesson);
    if (next === progress) return;
    audio.stopAudio();
    setSelectedIndex(null);
    setProgress(next);
    const attempt = next.attempts[next.selectedAttempt];
    void audio.playNotes(attempt.notes, 'practice-result', lesson.melody);
  }

  return <div className="brodle-page practice-page">
    <main className="brodle-content brodle-main">
      <header className="practice-header">
        <div>
          <p className="practice-eyebrow">Brodle · Learn by playing</p>
          <h1>A little practice. Your first melody.</h1>
          <p>Three short lessons with the real piano and feedback. Your daily puzzle and account progress stay untouched.</p>
        </div>
        <Link className="brodle-button" to="/brodle" onClick={audio.stopAudio}>Back to puzzle<BrodleIcon name="home" /></Link>
      </header>

      <nav className="practice-lessons" aria-label="Practice lessons">
        {PRACTICE_LESSONS.map((item, index) => <button key={item.id} type="button" aria-current={lessonIndex === index ? 'step' : undefined}
          onClick={() => changeLesson(index)}><span>{index + 1}</span>{item.title}</button>)}
      </nav>

      <div className="brodle-workspace">
        <section className="brodle-panel practice-instructions" aria-labelledby="practice-lesson-title">
          <p className="practice-eyebrow">Lesson {lessonIndex + 1} of {PRACTICE_LESSONS.length} · Casual practice</p>
          <h2 id="practice-lesson-title" ref={lessonHeading} tabIndex={-1}>{lesson.title}</h2>
          <p>{lesson.description.replace('D5', noteName(74, naming)).replace('E5', noteName(76, naming))}</p>
          {lesson.showNotes && <ol className="practice-note-pattern" aria-label="Example melody notes">
            {lesson.target.map((midi, index) => <li key={index}><span>Note {index + 1}</span><strong>{noteName(midi, naming)}</strong></li>)}
          </ol>}
          {lessonIndex === 0 && <p className="practice-tip">{noteName(72, naming)} and {noteName(84, naming)} share a note name, but {noteName(84, naming)} is one octave higher. This example stays between {noteName(72, naming)} and {noteName(84, naming)}.</p>}
          {lessonIndex === 1 && <FeedbackLegend exactOnly />}
        </section>

        {audio.audioError && <p role="alert" className="audio-error">{audio.audioError}</p>}
        {finished && <section className="brodle-panel practice-success" aria-labelledby="practice-success-title">
          <BrodleIcon name="check" size={24} />
          <div><h2 id="practice-success-title">{lessonIndex === PRACTICE_LESSONS.length - 1 ? 'You’re ready for Brodle.' : 'You’ve got it!'}</h2>
            <p>{win.kind === 'exact' ? 'You matched every note and octave.' : 'You matched the melody at a different pitch. Casual accepts this too; Hard requires the exact notes and octaves.'}</p></div>
          {lessonIndex < PRACTICE_LESSONS.length - 1
            ? <button type="button" className="brodle-button" onClick={() => changeLesson(lessonIndex + 1)}>Next lesson<span aria-hidden="true">→</span></button>
            : <Link className="brodle-button" to="/brodle" onClick={audio.stopAudio}>Play the daily puzzle<span aria-hidden="true">→</span></Link>}
        </section>}

        {attempts.length > 0 && <AttemptHistory key={`${lesson.id}:${attempts.length}`} attempts={attempts} selectedIndex={progress.selectedAttempt} melody={lesson.melody}
          musicalKey="C" naming={naming} timeSignature="4/4" bpm={PRACTICE_BPM} playing={audio.playing} finished={finished}
          onSelect={index => { audio.stopAudio(); setProgress(previous => ({ ...previous, selectedAttempt: index })); }}
          onReplay={index => togglePlayback(attempts[index].notes, `attempt-${index}`)}
          onCopy={index => {
            audio.stopAudio(); setFreePlay(false);
            const next = copyAttemptToDraft(progress, index, lesson.target);
            setProgress(next);
            const firstEditable = noteConstraints(next, lesson.target).findIndex(constraint => constraint.lockedMidi === null);
            setSelectedIndex(guessRangeIssues(next, lesson.target)[0] ?? (firstEditable < 0 ? null : firstEditable));
          }} />}

        <section className="play-panel brodle-panel" aria-label="Practice staff and piano">
          {!finished && <>
            <div className="guess-heading">
              <div className="guess-title"><h2>Your practice guess<span className="attempt-total">{guess.length} / {lesson.target.length} notes</span></h2></div>
              <div className="guess-heading-actions">
                <button type="button" className="brodle-button play-guess" disabled={!guess.length} onClick={() => togglePlayback(guess, 'practice-guess')}>
                  <BrodleIcon name={audio.playing === 'practice-guess' ? 'stop' : 'play'} />{audio.playing === 'practice-guess' ? 'Stop' : 'Listen'}
                </button>
              </div>
            </div>
            <div className="casual-hints" role="group" aria-label="Practice hints">
              <span className="casual-hints-label">Hints</span>
              <button type="button" className="brodle-button" disabled={hintsUsed >= hintLimit(lesson.target)} onClick={() => {
                audio.stopAudio(); setSelectedIndex(null); setProgress(previous => revealNextHint(previous, lesson.target));
              }}><BrodleIcon name="plus" />Add note<span className="hint-count">{hintsUsed} / {hintLimit(lesson.target)}</span></button>
              <button type="button" className={'brodle-button' + (songPlaying ? ' is-playing' : '')} aria-pressed={songPlaying}
                onClick={() => togglePlayback(lesson.target, 'practice-song')}><BrodleIcon name={songPlaying ? 'stop' : 'play'} />{songPlaying ? 'Stop song' : 'Play song'}</button>
            </div>
            <SheetMusic abc={notation.abc} musicalKey="C" naming={naming} timeSignature="4/4" bpm={PRACTICE_BPM} compact
              label={`Practice guess: ${guess.length ? guess.map(midi => noteName(midi, naming)).join(', ') : 'empty staff'}`}
              feedback={feedback} feedbackIndices={notation.noteIndices}
              selection={{ stepIndices: [notation.guessIndices.map(index => index !== null && constraints[index].lockedMidi !== null ? null : index)],
                labels: [guess.map((midi, index) => `Note ${index + 1}: ${noteName(midi, naming)}.${feedback[index] ? ` ${feedbackLabels[feedback[index]]}.` : ''} Select to replace.`)],
                selected: selected === null ? null : { voice: 0, index: selected },
                onSelect: (_, index) => { audio.stopAudio(); setFreePlay(false); setSelectedIndex(index); } }} />
            <p className="practice-status" role="status">{selected !== null ? `Editing note ${selected + 1}. Choose its replacement on the piano.`
              : invalidNotes.length ? 'Select a marked note on the staff to fix its pitch.'
              : guess.length < lesson.target.length ? `${lesson.target.length - guess.length} more notes to enter.` : 'Ready to submit your melody.'}</p>
            <div className="game-controls guess-actions">
              <div className="guess-edit-actions"><button type="button" className="undo-guess" disabled={guess.length <= hintsUsed}
                onClick={() => editGuess(guess.slice(0, -1))}>Remove last note</button></div>
              <button type="button" className="clear-guess" disabled={guess.length <= hintsUsed} onClick={() => editGuess([])}>Clear</button>
              <button type="button" className="primary-button submit-guess" disabled={!canSubmitGuess(progress, lesson.target)} onClick={submit}>Submit<BrodleIcon name="check" /></button>
            </div>
          </>}
          <section className="keyboard-section" aria-label="Practice piano">
            <PianoControls audio={audio} naming={naming} onNaming={setNaming} compact
              freePlay={finished ? undefined : { enabled: freePlay, onToggle: () => { audio.stopAudio(); setFreePlay(previous => !previous); } }} />
            <p id="piano-mode-status" className="sr-only" role="status">{freePlay || finished ? 'Play freely without editing your guess.' : 'Piano keys add or replace notes in your practice guess.'}</p>
            <PianoKeyboard {...audio} {...challengePianoRange(lesson.target)} naming={naming} onNote={addNote} octaveNavigation fitToWidth
              pressedNotes={songPlaying ? EMPTY_PRESSED_NOTES : audio.pressedNotes} playing={songPlaying ? null : audio.playing}
              availableRange={availableRange} highlightedNotes={!freePlay && selected !== null ? [guess[selected]] : []} />
          </section>
        </section>
      </div>

      <footer className="practice-footer">
        <button type="button" className="brodle-button" onClick={() => changeLesson(lessonIndex)}><BrodleIcon name="restart" />Restart lesson</button>
        <p>You can jump between lessons or restart any time. Practice resets when you leave this page.</p>
      </footer>
    </main>
  </div>;
}
