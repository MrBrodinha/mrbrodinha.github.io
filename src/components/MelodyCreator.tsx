import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BrodleIcon from './BrodleIcon';
import BrodleFooter from './BrodleFooter';
import PianoKeyboard from './PianoKeyboard';
import PianoControls from './PianoControls';
import SheetMusic from './SheetMusic';
import { usePianoAudio } from './usePianoAudio';
import { keyName, melodyToAbc, MUSICAL_KEYS, noteName } from './musicGame';
import type { MelodyStep, MusicalKey, NoteNaming } from './musicGame';
import { COMPOSER_STORAGE_KEY, DURATIONS, durationForStep, emptyComposerDraft, exportMelodyCode, makeStep, parseComposerDraft } from './melodyComposer';
import type { ComposerDraft, DurationId } from './melodyComposer';
import './Brodle.css';
import './MelodyCreator.css';

function loadDraft(): ComposerDraft {
  try { return parseComposerDraft(localStorage.getItem(COMPOSER_STORAGE_KEY)); }
  catch { return emptyComposerDraft(); }
}

function DurationIcon({ id }: { id: DurationId }) {
  const whole = id === 'whole';
  return <svg width="28" height="30" viewBox="0 0 28 30" aria-hidden="true">
    <ellipse cx={whole ? 14 : 10} cy="22" rx={whole ? 7 : 5} ry="3.5" transform={whole ? undefined : 'rotate(-20 10 22)'}
      fill={whole || id === 'half' ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.6" />
    {!whole && <path d="M14.5 21V3" stroke="currentColor" strokeWidth="1.6" />}
    {(id === 'eighth' || id === 'sixteenth') && <path d="M14.5 3c0 6 10 6 6 13" stroke="currentColor" fill="none" strokeWidth="1.6" />}
    {id === 'sixteenth' && <path d="M14.5 8c0 6 10 6 6 13" stroke="currentColor" fill="none" strokeWidth="1.6" />}
  </svg>;
}

export default function MelodyCreator() {
  const [draft, setDraft] = useState(loadDraft);
  const [duration, setDuration] = useState<DurationId>('quarter');
  const [dotted, setDotted] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState<MelodyStep[][]>([]);
  const [naming, setNaming] = useState<NoteNaming>('letters');
  const [bpmText, setBpmText] = useState(() => String(draft.bpm));
  const [storageError, setStorageError] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const codeField = useRef<HTMLTextAreaElement>(null);
  const copyRequest = useRef(0);
  const audio = usePianoAudio();
  const validBpm = Number.isInteger(Number(bpmText)) && Number(bpmText) >= 20 && Number(bpmText) <= 400;
  const noteCount = draft.melody.filter((step) => step.midi !== null).length;
  const restCount = draft.melody.length - noteCount;
  const beats = draft.melody.reduce((total, step) => total + step.beats, 0);
  const code = exportMelodyCode(draft);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Create a melody · Brodle';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(COMPOSER_STORAGE_KEY, JSON.stringify(draft)); setStorageError(false); }
    catch { setStorageError(true); }
    copyRequest.current++;
    setCopyStatus('');
  }, [draft]);
  useEffect(() => () => { copyRequest.current++; }, []);

  function commitMelody(melody: MelodyStep[]) {
    audio.stopAudio();
    setHistory((previous) => [...previous.slice(-49), draft.melody]);
    setDraft((previous) => ({ ...previous, melody }));
  }

  function enterStep(midi: number | null) {
    // The keyboard has already started the note; don't stop a held piano voice.
    const melody = [...draft.melody];
    const step = makeStep(midi, duration, dotted);
    if (selected === null) melody.push(step);
    else melody[selected] = step;
    setHistory((previous) => [...previous.slice(-49), draft.melody]);
    setDraft((previous) => ({ ...previous, melody }));
    if (midi === null) audio.stopAudio();
  }

  function chooseDuration(next: DurationId, nextDotted = dotted) {
    setDuration(next);
    setDotted(nextDotted);
    if (selected !== null) {
      const melody = [...draft.melody];
      melody[selected] = makeStep(melody[selected].midi, next, nextDotted);
      commitMelody(melody);
    }
  }

  function selectStep(index: number) {
    audio.stopAudio();
    const value = durationForStep(draft.melody[index]);
    setDuration(value.duration);
    setDotted(value.dotted);
    setSelected(index);
  }

  function undo() {
    if (!history.length) return;
    audio.stopAudio();
    setDraft((previous) => ({ ...previous, melody: history[history.length - 1] }));
    setHistory((previous) => previous.slice(0, -1));
    setSelected(null);
  }

  function changeBpm(value: string) {
    setBpmText(value);
    audio.stopAudio();
    const bpm = Number(value);
    if (Number.isInteger(bpm) && bpm >= 20 && bpm <= 400) setDraft((previous) => ({ ...previous, bpm }));
  }

  async function copyCode() {
    const request = ++copyRequest.current;
    try {
      await navigator.clipboard.writeText(code);
      if (request === copyRequest.current) setCopyStatus('Copied!');
    } catch {
      if (request !== copyRequest.current) return;
      codeField.current?.focus();
      codeField.current?.select();
      setCopyStatus('Select and copy the code below.');
    }
  }

  return <div className="brodle-page creator-page">
    <main className="brodle-content brodle-main">
      <header className="brodle-header creator-header">
        <div className="brodle-brand">
          <span className="brodle-mark"><BrodleIcon name="music" size={25} /></span>
          <div><p className="creator-eyebrow">Brodle / Create</p><h1>Melody studio</h1><p>A tune in your head. A challenge in the making.</p></div>
        </div>
        <Link to="/brodle" className="brodle-home"><BrodleIcon name="home" />Back to Brodle</Link>
      </header>

      <div className="brodle-workspace">
        <section className="brodle-panel composer-settings" aria-labelledby="settings-title">
          <div className="composer-section-intro"><span className="composer-step">01</span><div><h2 id="settings-title">Set the feel</h2><p>Choose a key, tempo, and the length of your next note.</p></div></div>
          <div className="composer-settings-grid">
            <div className="composer-field"><label htmlFor="composer-key">Key signature</label>
              <select id="composer-key" value={draft.key} onChange={(event) => { audio.stopAudio(); setDraft((previous) => ({ ...previous, key: event.target.value as MusicalKey })); }}>
                <optgroup label="Major">{MUSICAL_KEYS.filter((key) => !key.endsWith('m')).map((key) => <option key={key} value={key}>{keyName(key, naming)}</option>)}</optgroup>
                <optgroup label="Minor">{MUSICAL_KEYS.filter((key) => key.endsWith('m')).map((key) => <option key={key} value={key}>{keyName(key, naming)}</option>)}</optgroup>
              </select>
            </div>
            <div className="composer-field composer-tempo"><label htmlFor="composer-bpm">Tempo <span>BPM</span></label>
              <input id="composer-bpm" type="number" min="20" max="400" step="1" value={bpmText} aria-invalid={!validBpm}
                aria-describedby="tempo-help" onChange={(event) => changeBpm(event.target.value)}
                onBlur={() => changeBpm(String(Math.min(400, Math.max(20, Math.round(Number(bpmText) || draft.bpm)))))} />
              <span id="tempo-help">20–400 BPM</span>
            </div>
            <div className="duration-field"><span className="composer-field-label">{selected === null ? 'Note length' : 'Selected step length'}</span>
              <div className="duration-picker" role="group" aria-label="Note duration">
                {DURATIONS.map((option) => <button type="button" key={option.id} aria-label={option.label + ' note'} aria-pressed={duration === option.id}
                  onClick={() => chooseDuration(option.id)}><DurationIcon id={option.id} /><span>{option.label}</span><small>{option.fraction}</small></button>)}
              </div>
              <label className="dotted-toggle"><input type="checkbox" checked={dotted} onChange={(event) => chooseDuration(duration, event.target.checked)} />Dotted <span>adds half the duration</span></label>
            </div>
          </div>
        </section>

        <section className="brodle-panel composer-score" aria-labelledby="score-title">
          <div className="composer-score-heading"><div className="composer-section-intro"><span className="composer-step">02</span><div><h2 id="score-title">Write your melody</h2>
            <p>{noteCount} {noteCount === 1 ? 'note' : 'notes'} · {restCount} {restCount === 1 ? 'rest' : 'rests'} · {beats} beats</p></div></div>
            <div className="game-controls"><button type="button" className="primary-button composer-play" disabled={!draft.melody.length || !validBpm}
              onClick={() => audio.playing === 'composer' ? audio.stopAudio() : void audio.playMelody(draft.melody, 'composer', draft.bpm)}>
              <BrodleIcon name={audio.playing === 'composer' ? 'stop' : 'play'} />{audio.playing === 'composer' ? 'Stop' : 'Play melody'}</button></div>
          </div>
          <SheetMusic abc={melodyToAbc(draft.melody, naming, draft.key, draft.bpm)} musicalKey={draft.key} naming={naming} bpm={draft.bpm} wrap
            label={draft.melody.length ? draft.melody.map((step, index) => `Step ${index + 1}: ${step.midi === null ? step.rhythm : `${noteName(step.midi, naming, draft.key)}, ${step.rhythm}`}`).join('. ') : 'Empty melody. Choose a duration, then play the piano or add a rest.'} />
          {!draft.melody.length && <p className="composer-empty">Your first note starts here. Play a key on the piano below.</p>}
          <div className="melody-steps" role="group" aria-label="Melody steps">
            {draft.melody.map((step, index) => <button type="button" key={index} className={'melody-step' + (step.midi === null ? ' is-rest' : '')}
              aria-pressed={selected === index} aria-label={`Edit step ${index + 1}: ${step.midi === null ? step.rhythm : `${noteName(step.midi, naming, draft.key)}, ${step.rhythm}`}`}
              onClick={() => selectStep(index)}><span className="step-number">{index + 1}</span><strong>{step.midi === null ? 'Rest' : noteName(step.midi, naming, draft.key)}</strong><small>{step.beats} {step.beats === 1 ? 'beat' : 'beats'}</small></button>)}
          </div>
          <div className="composer-edit-toolbar game-controls">
            <button type="button" className="composer-rest" onClick={() => enterStep(null)}>+ {selected === null ? 'Add rest' : 'Make rest'}</button>
            <button type="button" disabled={!history.length} onClick={undo}><BrodleIcon name="undo" />Undo</button>
            {selected !== null ? <><button type="button" onClick={() => { commitMelody(draft.melody.filter((_, index) => index !== selected)); setSelected(null); }}><BrodleIcon name="close" />Delete step</button>
              <button type="button" className="composer-add-mode" onClick={() => setSelected(null)}>+ Add notes</button></>
              : <button type="button" className="clear-guess" disabled={!draft.melody.length} onClick={() => { commitMelody([]); setSelected(null); }}>Clear melody</button>}
            <span className="composer-edit-hint" role="status">{selected === null ? 'Select a step to edit its pitch or length.' : `Editing step ${selected + 1}. Play a key to replace its pitch.`}</span>
          </div>
        </section>

        {audio.audioError && audio.soundStatus !== 'error' && <p className="audio-error" role="alert">{audio.audioError}</p>}
        <section className="keyboard-section brodle-panel" aria-label="Composer piano">
          <PianoControls audio={audio} naming={naming} onNaming={setNaming} />
          <PianoKeyboard {...audio} naming={naming} onNote={enterStep} />
          <div className="piano-help"><p>Tap to add a note. Hold to sustain.<span className="piano-scroll-hint"> Swipe for more keys.</span></p><span>{selected === null ? 'Adding notes' : `Editing step ${selected + 1}`}</span></div>
        </section>

        <section className="brodle-panel composer-export" aria-labelledby="export-title">
          <div className="composer-export-heading"><div className="composer-section-intro"><span className="composer-step">03</span><div><h2 id="export-title">Make it a Brodle</h2><p>Your melody, ready to use.</p></div></div>
            <div className="game-controls"><button type="button" className="primary-button" disabled={!noteCount || !validBpm} onClick={() => void copyCode()}><BrodleIcon name={copyStatus === 'Copied!' ? 'check' : 'share'} />{copyStatus === 'Copied!' ? 'Copied!' : 'Copy code'}</button></div>
          </div>
          <p className="composer-export-help">Copy these constants into <code>musicGame.ts</code> to use your melody in the game.</p>
          <p className="composer-export-help">For the same ending, set <code>MELODY_FINAL = MELODY</code>, or write a longer version. {!noteCount && 'Add at least one note to export a playable melody.'}</p>
          <label className="sr-only" htmlFor="melody-code">Generated melody code</label>
          <textarea ref={codeField} id="melody-code" readOnly spellCheck={false} value={code} rows={Math.min(16, Math.max(7, draft.melody.length + 6))} />
          <div className="composer-export-status"><span role="status">{copyStatus}</span><span>{storageError ? 'Draft could not be saved. Keep this tab open.' : 'Draft saved in this browser'}</span></div>
        </section>
      </div>
    </main>
    <BrodleFooter creatorLink={false} />
  </div>;
}
