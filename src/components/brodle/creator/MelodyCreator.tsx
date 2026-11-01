import { useAuth } from '../../../auth/authContext';
import { useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import BrodleIcon from '../components/BrodleIcon';
import PianoKeyboard from '../components/PianoKeyboard';
import PianoControls from '../components/PianoControls';
import SheetMusic from '../components/SheetMusic';
import RhythmSymbol from '../components/RhythmSymbol';
import { usePianoAudio } from '../hooks/usePianoAudio';
import { keyName, melodyNotation, MUSICAL_KEYS, TIME_SIGNATURES, noteName } from '../lib/musicGame';
import type { MusicalKey, NoteNaming, TimeSignature } from '../lib/musicGame';
import { COMPOSER_STORAGE_KEY, DURATIONS, durationForStep, emptyComposerDraft, exportMelodyCode, makeStep, makeVictoryStep, parseComposerDraft } from './melodyComposer';
import { parseMelodyCode } from './melodyCode';
import type { ComposerDraft, DurationId } from './melodyComposer';
import '../Brodle.css';
import './MelodyCreator.css';
import '../library/MelodyLibrary.css';
import StudioCloudPanel from './StudioCloudPanel';
import { useStudioCloud } from './useStudioCloud';
import { victoryScore, stepPitches } from '../lib/victoryMusic';
import type { VictoryStep, Clef } from '../lib/victoryMusic';
import { MAX_MELODY_STEPS, MAX_FINAL_STEPS } from '../lib/melodyLibrary';

function loadDraft(): ComposerDraft {
  try { return parseComposerDraft(localStorage.getItem(COMPOSER_STORAGE_KEY)); }
  catch { return emptyComposerDraft(); }
}

function MelodyCreator({ fresh }: { fresh: boolean }) {
  const [draft, setDraft] = useState(() => fresh ? emptyComposerDraft() : loadDraft());
  const [duration, setDuration] = useState<DurationId>('quarter');
  const [dotted, setDotted] = useState(false);
  const [restMode, setRestMode] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [track, setTrack] = useState<'melody' | 'finalMelody' | 'finalBass'>('melody');
  const [chordMode, setChordMode] = useState(false);
  const [naming, setNaming] = useState<NoteNaming>('letters');
  const [bpmText, setBpmText] = useState(() => String(draft.bpm));
  const [storageError, setStorageError] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [codeText, setCodeText] = useState<string | null>(null);
  const [codeError, setCodeError] = useState('');
  const [codeMessage, setCodeMessage] = useState('');
  const codeField = useRef<HTMLTextAreaElement>(null);
  const copyRequest = useRef(0);
  const audio = usePianoAudio();
  const cloud = useStudioCloud(draft, setDraft, audio.stopAudio);
  const editable = !cloud.locked && !cloud.loading && !cloud.busy;
  const sequence = useMemo<VictoryStep[]>(() => draft[track] ?? [], [draft, track]);
  const chordNotes = selectedIndex !== null && sequence[selectedIndex] ? stepPitches(sequence[selectedIndex]) : [];
  const inVictory = track !== 'melody';
  const mainVictory = draft.finalMelody?.length ? draft.finalMelody : draft.melody;
  const bass = draft.finalBass ?? [];
  const clefField = track === 'finalBass' ? 'finalBassClef' : 'finalClef';
  const clef: Clef = draft[clefField] ?? (track === 'finalBass' ? 'bass' : 'treble');
  function changeTrack(next: typeof track) { audio.stopAudio(); setTrack(next); setSelectedIndex(null); setChordMode(false); }
  useEffect(() => setBpmText(String(draft.bpm)), [draft.bpm]);
  const validBpm = Number.isInteger(Number(bpmText)) && Number(bpmText) >= 20 && Number(bpmText) <= 400;
  const chordCount = sequence.filter((step) => step.pitches?.length).length;
  const noteCount = sequence.filter((step) => step.midi !== null && !step.pitches?.length).length;
  const restCount = sequence.filter((step) => step.midi === null).length;
  const beats = sequence.reduce((total, step) => total + step.beats, 0);
  const code = exportMelodyCode(draft);
  const displayedCode = codeText ?? code;
  const codeDirty = displayedCode !== code;
  const notation = useMemo(() => {
    if (inVictory) return victoryScore(draft.finalMelody?.length ? draft.finalMelody : draft.melody, draft.finalBass ?? [], naming, draft.key, draft.bpm, draft.timeSignature, draft.finalClef, draft.finalBassClef, track === 'finalBass' || Boolean(draft.finalBass?.length));
    const score = melodyNotation(draft.melody, naming, draft.key, draft.bpm, draft.timeSignature, false);
    return { abc: score.abc, stepIndices: [score.stepIndices] };
  }, [draft, naming, inVictory, track]);
  const stepLabels = useMemo(() => sequence.map((step, index) => `Step ${index + 1}: ${step.midi === null ? step.rhythm : `${stepPitches(step).map((pitch) => noteName(pitch, naming, draft.key)).join(' + ')}, ${step.rhythm}`}`), [sequence, naming, draft.key]);
  const scoreLabels = (inVictory ? [mainVictory, bass] : [draft.melody]).map((part, voice) => part.map((step, index) => `${inVictory ? voice ? 'Bass / second part' : 'Main part' : 'Challenge'}, step ${index + 1}: ${step.midi === null ? 'rest' : stepPitches(step).map((pitch) => noteName(pitch, naming, draft.key)).join(' + ')}, ${step.beats} beats. Select to edit.`));

  useEffect(() => {
    setSelectedIndex(null); setChordMode(false); setRestMode(false); setCodeText(null); setCodeError(''); setCodeMessage('');
    setTrack('melody'); setDuration('quarter'); setDotted(false);
  }, [cloud.draftVersion]);

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

  function commitMelody(melody: VictoryStep[]) {
    if (!editable) return;
    audio.stopAudio();
    setDraft((previous) => ({ ...previous, [track]: melody }));
    if (selectedIndex !== null && selectedIndex >= melody.length) setSelectedIndex(null);
  }

  function enterStep(midi: number | null, nextDuration = duration) {
    if (!editable || (selectedIndex === null && sequence.length >= (track === 'melody' ? MAX_MELODY_STEPS : MAX_FINAL_STEPS))) return;
    // The keyboard has already started the note; don't stop a held piano voice.
    const step = inVictory ? makeVictoryStep(midi === null ? [] : [midi], nextDuration, dotted) : makeStep(midi, nextDuration, dotted);
    const melody = selectedIndex === null ? [...sequence, step] : sequence.map((previous, index) => index === selectedIndex ? step : previous);
    setDraft((previous) => ({ ...previous, [track]: melody }));
    if (midi === null) audio.stopAudio();
  }

  function chooseDuration(next: DurationId) {
    setDuration(next);
    if (selectedIndex !== null) replaceDuration(next, dotted);
    else if (restMode) enterStep(null, next);
  }

  function replaceDuration(next: DurationId, nextDotted: boolean) {
    if (selectedIndex === null || !sequence[selectedIndex]) return;
    const step = sequence[selectedIndex];
    const replacement = inVictory ? makeVictoryStep(stepPitches(step), next, nextDotted) : makeStep(step.midi, next, nextDotted);
    commitMelody(sequence.map((previous, index) => index === selectedIndex ? replacement : previous));
  }

  function selectStep(voice: number, index: number) {
    if (!editable) return;
    audio.stopAudio();
    const nextTrack = inVictory ? voice === 0 ? 'finalMelody' : 'finalBass' : 'melody';
    const part: readonly VictoryStep[] = inVictory ? voice === 0 ? mainVictory : bass : draft.melody;
    const step = part[index];
    if (!step) return;
    if (nextTrack === 'finalMelody' && !draft.finalMelody?.length) setDraft((previous) => ({ ...previous, finalMelody: [...previous.melody] }));
    setTrack(nextTrack); setSelectedIndex(index);
    const timing = durationForStep(step);
    setDuration(timing.duration); setDotted(timing.dotted); setRestMode(step.midi === null);
    setChordMode(Boolean(step.pitches));
  }

  function deleteStep(voice: number, index: number) {
    if (!editable) return;
    const nextTrack = inVictory ? voice === 0 ? 'finalMelody' : 'finalBass' : 'melody';
    const part = inVictory ? voice === 0 ? mainVictory : bass : draft.melody;
    const step = part[index];
    if (!step) return;
    selectStep(voice, index);
    const timing = durationForStep(step);
    setDraft((previous) => ({ ...previous, [nextTrack]: part.map((value, position) => position === index ? makeStep(null, timing.duration, timing.dotted) : value) }));
    setRestMode(true); setChordMode(false);
  }

  function enterPianoNote(midi: number) {
    if (!editable) return;
    setRestMode(false);
    if (inVictory && chordMode) {
      updateChord(chordNotes.includes(midi) ? chordNotes.filter((pitch) => pitch !== midi) : [...chordNotes, midi]);
      return;
    }
    enterStep(midi);
  }

  function updateChord(pitches: readonly number[]) {
    if (!inVictory || !editable || pitches.length > 8 || (selectedIndex === null && sequence.length >= MAX_FINAL_STEPS)) return;
    const step = makeVictoryStep(pitches, duration, dotted);
    // Each key immediately updates the same score entry; no confirmation step.
    // Keep the just-started piano voice sounding while a key is held.
    setDraft((previous) => ({ ...previous, [track]: selectedIndex === null ? [...sequence, step] : sequence.map((value, index) => index === selectedIndex ? step : value) }));
    if (selectedIndex === null) setSelectedIndex(sequence.length);
  }

  function undo() {
    if (!editable || !sequence.length) return;
    commitMelody(sequence.slice(0, -1));
  }

  function applyCode() {
    if (!editable) return;
    try {
      const content = parseMelodyCode(displayedCode);
      audio.stopAudio();
      setDraft((previous) => ({ ...previous, ...content }));
      setSelectedIndex(null); setChordMode(false); setCodeText(null); setCodeError('');
      setCodeMessage('Code applied to the score and browser draft.');
    } catch (error) { setCodeError(error instanceof Error ? error.message : 'Unable to read the melody code.'); setCodeMessage(''); }
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
      await navigator.clipboard.writeText(displayedCode);
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
      </header>

      <div className="brodle-workspace">
        <section className="brodle-panel composer-details" aria-labelledby="melody-details-title">
          <h2 id="melody-details-title">About this melody</h2>
          <div className="melody-details-grid">
            <div className="composer-field"><label htmlFor="melody-title">Title</label><input id="melody-title" maxLength={160} value={draft.title ?? ''} disabled={!editable} onChange={(event) => setDraft((previous) => ({ ...previous, title: event.target.value }))} placeholder="The song or melody name" /></div>
            <div className="composer-field"><label htmlFor="melody-source">Source / artist <span>Optional</span></label><input id="melody-source" maxLength={200} value={draft.source ?? ''} disabled={!editable} onChange={(event) => setDraft((previous) => ({ ...previous, source: event.target.value }))} /></div>
            <div className="composer-field melody-hint-field"><label htmlFor="melody-hint">Player hint <span>Optional</span></label><input id="melody-hint" maxLength={300} value={draft.hint ?? ''} disabled={!editable} onChange={(event) => setDraft((previous) => ({ ...previous, hint: event.target.value }))} placeholder="A clue without giving away the title" /></div>
          </div>
        </section>
        <section className="brodle-panel composer-settings" aria-labelledby="settings-title">
          <div className="composer-section-intro"><span className="composer-step">01</span><div><h2 id="settings-title">Set the feel</h2><p>Choose your key, tempo, and time signature.</p></div></div>
          <div className="composer-settings-grid">
            <div className="composer-field"><label htmlFor="composer-key">Key signature</label>
              <select id="composer-key" disabled={!editable} value={draft.key} onChange={(event) => { audio.stopAudio(); setDraft((previous) => ({ ...previous, key: event.target.value as MusicalKey })); }}>
                <optgroup label="Major">{MUSICAL_KEYS.filter((key) => !key.endsWith('m')).map((key) => <option key={key} value={key}>{keyName(key, naming)}</option>)}</optgroup>
                <optgroup label="Minor">{MUSICAL_KEYS.filter((key) => key.endsWith('m')).map((key) => <option key={key} value={key}>{keyName(key, naming)}</option>)}</optgroup>
              </select>
            </div>
            <div className="composer-field"><label htmlFor="composer-meter">Time signature</label>
              <select id="composer-meter" disabled={!editable} value={draft.timeSignature} onChange={(event) => { audio.stopAudio(); setDraft((previous) => ({ ...previous, timeSignature: event.target.value as TimeSignature })); }}>
                {TIME_SIGNATURES.map((meter) => <option key={meter} value={meter}>{meter}</option>)}
              </select>
            </div>
            <div className="composer-field composer-tempo"><label htmlFor="composer-bpm">Tempo <span>BPM</span></label>
              <input id="composer-bpm" disabled={!editable} type="number" min="20" max="400" step="1" value={bpmText} aria-invalid={!validBpm}
                aria-describedby="tempo-help" onChange={(event) => changeBpm(event.target.value)}
                onBlur={() => changeBpm(String(Math.min(400, Math.max(20, Math.round(Number(bpmText) || draft.bpm)))))} />
              <span id="tempo-help">20–400 BPM</span>
            </div>
          </div>
        </section>

        <section className="brodle-panel composer-score" aria-labelledby="score-title">
          <div className="composer-score-heading"><div className="composer-section-intro"><span className="composer-step">02</span><div><h2 id="score-title">Write your melody</h2>
            <p>{noteCount} {noteCount === 1 ? 'note' : 'notes'}{chordCount > 0 && <> · {chordCount} {chordCount === 1 ? 'chord' : 'chords'}</>} · {restCount} {restCount === 1 ? 'rest' : 'rests'} · {beats} beats</p></div></div>
            <div className="game-controls"><button type="button" className="primary-button composer-play" disabled={!(inVictory ? mainVictory.length || bass.length : sequence.length) || !validBpm}
              onClick={() => audio.playing === 'composer' ? audio.stopAudio() : void (inVictory ? audio.playArrangement([mainVictory, bass], 'composer', draft.bpm) : audio.playMelody(sequence, 'composer', draft.bpm))}>
              <BrodleIcon name={audio.playing === 'composer' ? 'stop' : 'play'} />{audio.playing === 'composer' ? 'Stop' : inVictory ? 'Play victory arrangement' : 'Play melody'}</button></div>
          </div>
          <div className="studio-track-switch" role="group" aria-label="Melody section">
            <button type="button" aria-pressed={track === 'melody'} onClick={() => changeTrack('melody')}>Challenge melody</button>
            <button type="button" aria-pressed={inVictory} onClick={() => changeTrack('finalMelody')}>Victory melody · optional</button>
          </div>
          {inVictory && <>
            <p className="library-muted">Both parts start together. An empty main part reuses the challenge melody; use rests to delay either part.</p>
            <div className="victory-controls">
              <div className="studio-track-switch" role="group" aria-label="Victory part">
                <button type="button" aria-pressed={track === 'finalMelody'} onClick={() => changeTrack('finalMelody')}>Main part</button>
                <button type="button" aria-pressed={track === 'finalBass'} onClick={() => changeTrack('finalBass')}>Bass / second part</button>
              </div>
              <label htmlFor="victory-clef">Clef for this part<select id="victory-clef" value={clef} disabled={!editable} onChange={(event) => { audio.stopAudio(); setDraft((previous) => ({ ...previous, [clefField]: event.target.value as Clef })); }}><option value="treble">Treble clef</option><option value="bass">Bass clef</option></select></label>
            </div>
            <p className="writing-part" role="status">Writing: {track === 'finalBass' ? 'Bass / second part' : 'Main part'} · {clef === 'bass' ? 'Bass clef' : 'Treble clef'}</p>
          </>}
          <div className="duration-field composer-duration-toolbar"><div className="composer-entry-tools"><span className="composer-field-label">{selectedIndex === null ? 'Next' : `Editing step ${selectedIndex + 1} ·`} {restMode ? 'rest' : inVictory && chordMode ? 'chord' : 'note'}</span>
            <div className="composer-mode-toggles">
              <label className="rest-mode-toggle"><input id="composer-rest-mode" type="checkbox" checked={restMode} onChange={(event) => { audio.stopAudio(); setRestMode(event.target.checked); if (event.target.checked) { setChordMode(false); if (selectedIndex !== null) deleteStep(track === 'finalBass' ? 1 : 0, selectedIndex); } }} />Rests</label>
              <button type="button" className="dotted-button" aria-pressed={dotted} onClick={() => { setDotted(!dotted); replaceDuration(duration, !dotted); }} title="Add half the duration">
                <span aria-hidden="true">•</span>Dotted
              </button>
            </div></div>
            <div className="duration-picker" role="group" aria-label={restMode ? 'Rest duration' : inVictory && chordMode ? 'Chord duration' : 'Note duration'}>
              {DURATIONS.map((option) => <button type="button" key={option.id} data-duration={option.id}
                aria-label={`${restMode ? 'Add ' : ''}${dotted ? 'dotted ' : ''}${option.label.toLowerCase()} ${restMode ? 'rest' : 'note'}`} aria-pressed={duration === option.id}
                onClick={() => chooseDuration(option.id)}><RhythmSymbol duration={option.id} rest={restMode} dotted={dotted} /><span>{option.label}</span><small>{option.fraction}</small></button>)}
            </div>
          </div>
          <SheetMusic abc={notation.abc} musicalKey={draft.key} naming={naming} bpm={draft.bpm} timeSignature={draft.timeSignature} wrap
            selection={editable ? { stepIndices: notation.stepIndices, labels: scoreLabels, selected: selectedIndex === null ? null : { voice: track === 'finalBass' ? 1 : 0, index: selectedIndex }, onSelect: selectStep, onDelete: deleteStep } : undefined}
            label={stepLabels.length ? stepLabels.join('. ') : 'Empty melody. Choose a duration, then play a piano key or choose a rest.'} />
          {!sequence.length && <p className="composer-empty">Choose a length, then play the piano. For rests, turn on Rests and click a duration.</p>}
          <div className="composer-edit-toolbar game-controls">
            <button type="button" disabled={!editable || !sequence.length} onClick={undo} title="Remove the last entry in this part"><BrodleIcon name="undo" />Undo last note</button>
            {selectedIndex !== null && <><button type="button" className="delete-selected" disabled={!editable} onClick={() => deleteStep(track === 'finalBass' ? 1 : 0, selectedIndex)}>Delete → rest</button><button type="button" className="finish-edit" onClick={() => { setSelectedIndex(null); }}>Done editing</button></>}
            <button type="button" className="clear-guess" disabled={!editable || !sequence.length} onClick={() => { commitMelody([]); setSelectedIndex(null); }}>{inVictory ? 'Clear part' : 'Clear melody'}</button>
            <span className="composer-edit-hint" role="status">{!editable ? 'Make a copy to edit this melody.' : selectedIndex !== null ? `Editing step ${selectedIndex + 1}. Choose a piano key, duration, or rest. Delete keeps its timing.` : 'Click a note or rest to edit it. Undo always removes the last entry in this part.'}</span>
          </div>
        </section>

        {audio.audioError && audio.soundStatus !== 'error' && <p className="audio-error" role="alert">{audio.audioError}</p>}
        <section className="keyboard-section brodle-panel" aria-label="Composer piano">
          <PianoControls audio={audio} naming={naming} onNaming={setNaming} />
          {inVictory && <div className="piano-chord-controls" role="group" aria-label="Chord entry">
            <button className="chord-mode-button" type="button" aria-pressed={chordMode} disabled={!editable} onClick={() => { audio.stopAudio(); setChordMode(!chordMode); setRestMode(false); if (chordMode) setSelectedIndex(null); }}>Chords</button>
            {chordMode && <button type="button" className="confirm-chord" aria-label="Confirm chord" title="Confirm chord" disabled={!editable || !chordNotes.length} onClick={() => { audio.stopAudio(); setChordMode(false); setSelectedIndex(null); setRestMode(false); }}><BrodleIcon name="check" size={19} /></button>}
          </div>}
          <PianoKeyboard {...audio} chordNotes={inVictory && chordMode ? chordNotes : undefined} naming={naming} onNote={enterPianoNote} />
          {!chordMode && <div className="piano-help"><p>{selectedIndex !== null ? `Tap a key to replace step ${selectedIndex + 1}. Hold to sustain.` : 'Tap to add a note. Hold to sustain.'}<span className="piano-scroll-hint"> Swipe for more keys.</span>{restMode && ' Piano keys switch back to notes.'}</p></div>}
        </section>

        <StudioCloudPanel cloud={cloud} valid={validBpm && !codeDirty} />

        <section className="brodle-panel composer-export" aria-labelledby="export-title">
          <div className="composer-export-heading"><div className="composer-section-intro"><span className="composer-step">03</span><div><h2 id="export-title">Make it a Brodle</h2></div></div>
            <div className="game-controls"><button type="button" className="primary-button" disabled={!draft.melody.some((step) => step.midi !== null) || !validBpm} onClick={() => void copyCode()}><BrodleIcon name={copyStatus === 'Copied!' ? 'check' : 'share'} />{copyStatus === 'Copied!' ? 'Copied!' : 'Copy code'}</button></div>
          </div>
          <p className="composer-export-help">Edit notes, BPM, key, time signature, or victory parts, then press Apply code. Use MIDI numbers for pitches, <code>null</code> for rests, and <code>beats</code> for duration. Lengths and rhythm labels update automatically.</p>
          <label className="sr-only" htmlFor="melody-code">Generated melody code</label>
          <textarea ref={codeField} id="melody-code" readOnly={!editable} spellCheck={false} value={displayedCode} aria-invalid={Boolean(codeError)} aria-describedby="melody-code-help" onChange={(event) => { setCodeText(event.target.value); setCodeError(''); setCodeMessage(''); copyRequest.current++; setCopyStatus(''); }} rows={Math.min(16, Math.max(8, draft.melody.length + 7))} />
          <div className="game-controls code-edit-actions"><button type="button" className="primary-button apply-code" disabled={!editable || !codeDirty} onClick={applyCode}>Apply code</button><button type="button" disabled={!codeDirty} onClick={() => { setCodeText(null); setCodeError(''); setCodeMessage(''); }}>Reset code to score</button></div>
          <p id="melody-code-help" className="library-muted" role="status">{codeDirty ? 'Code edits are not applied yet. Apply them before saving, submitting, or scheduling. Reset code to use the current score.' : codeMessage || 'The code matches the current score.'}</p>
          {codeError && <p className="progress-error" role="alert">{codeError} Your score has not changed.</p>}
          <div className="composer-export-status"><span role="status">{copyStatus}</span><span>{storageError ? 'Draft could not be saved. Keep this tab open.' : 'Draft saved in this browser'}</span></div>
        </section>
      </div>
    </main>
  </div>;
}

export default function MelodyStudioPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  return <MelodyCreator key={user?.id ?? 'guest'} fresh={params.get('new') === '1'} />;
}
