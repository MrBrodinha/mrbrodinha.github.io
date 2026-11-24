import ClefChoices from './ClefChoices';
import NotationPreview from './NotationPreview';
import { keyDescription } from './sheetEditorPreview';
import { tieChoice } from './sheetEditorExpressions';
import { performanceTimeline, auditionTimeline } from './sheetEditorPlayback';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MUSICAL_KEYS, keyName } from '../../brodle/lib/musicGame';
import { usePianoAudio } from '../../brodle/hooks/usePianoAudio';
import RhythmSymbol from '../../brodle/components/RhythmSymbol';
import BrodleIcon from '../../brodle/components/BrodleIcon';
import EditableStaff from './EditableStaff';
import SheetCodeEditor from './SheetCodeEditor';
import { scoreCodeSnapshot, sourceKey } from './sheetEditorCode';
import { parseSheetCode, linkedScoreRange } from './sheetEditorCodeParser';
import {
  activeTargets,
  emptyScore,
  inputPitch,
  isDefaultScore,
  primary,
  refKey,
  scoreReducer,
  scoreWithTuplet,
  tupletValueForRest,
  selectedPitches,
  toneFor,
} from './scoreModel';
import type { Action, Clef } from './scoreModel';
import {
  eventLabel,
  CLEFS,
  NOTE_TICKS,
  TUPLET_RATIOS,
  TUPLET_NAMES,
  eventTones,
  NATURAL_PITCHES,
  NOTE_VALUES,
  pitchKey,
  pitchLabel,
  pitchMidi,
  positionLabel,
  scoreSteps,
  timedEvents,
  totalTicks,
  validPitch,
  meterBeatTicks,
  measureTicks, meterName, validMeter, validTempoBeat, DEFAULT_TEMPO_BEAT,
} from './sheetEditorModel';
import type { Meter, TempoBeat } from './sheetEditorRhythm';
import type { MusicalKey } from '../../brodle/lib/musicGame';
import type { Caret, EditorAction, NoteValue, PlacementCommand } from './sheetEditorModel';
import './SheetEditor.css';
const labels: Record<NoteValue, string> = {
  'thirty-second': 'Thirty-second',
  sixteenth: 'Sixteenth',
  eighth: 'Eighth',
  quarter: 'Quarter',
  half: 'Half',
  whole: 'Whole',
};
const fractions: Record<NoteValue, string> = {
  'thirty-second': '1/32',
  sixteenth: '1/16',
  eighth: '1/8',
  quarter: '1/4',
  half: '1/2',
  whole: '1',
};
export default function SheetEditor() {
  const [state, dispatch] = useReducer(scoreReducer, undefined, emptyScore),
    now = useRef(state);
  now.current = state;
  const [zoom, setZoom] = useState(1),
    [tipsDismissed, setTipsDismissed] = useState(false),
    [panel, setPanel] = useState<'add-staff' | 'arpeggio' | 'tuplets' | null>(null),
    panelTrigger = useRef<HTMLButtonElement | null>(null),
    dismissedPointer = useRef<number | null>(null);
  const [codeText, setCodeText] = useState<string | null>(null),
    [codeError, setCodeError] = useState(''),
    codeBase = useRef(0);
  const [property, setProperty] = useState<{ kind: 'clef' | 'key' | 'tempo' | 'meter'; staffId: string; revision: number; context: number } | null>(null);
  const propertyNow = useRef(property); propertyNow.current = property;
  const propertyDialog = useRef<HTMLDialogElement>(null), addStaffDialog = useRef<HTMLDialogElement>(null), propertyAnchor = useRef<HTMLElement | null>(null);
  const [propertyError, setPropertyError] = useState('');
  const [propertyDraft, setPropertyDraft] = useState({ clef: 'treble', key: 'C', numerator: '4', denominator: '4', bpm: '120', duration: 'quarter', dotted: false });
  const propertyDraftNow = useRef(propertyDraft);
  propertyDraftNow.current = propertyDraft;
  const [newClef, setNewClef] = useState<Clef>('bass'),
    [addition, setAddition] = useState('E4');
  const [epoch, setEpoch] = useState(0),
    epochNow = useRef(0),
    root = useRef<HTMLElement>(null);
  const [request, setRequest] = useState<{
    token: number;
    modeVersion: number;
    revision: number;
    interactionVersion: number;
    command: PlacementCommand & { staffId?: string };
  } | null>(null);
  const score = state.score,
    staff = score.staffs.find((s) => s.id === state.active)!,
    events = staff.events,
    ref = primary(state);
  const selectedStaff = score.staffs.find((s) => s.id === (ref?.staffId ?? state.rest?.staffId));
  const selected = selectedStaff?.events.find(
    (e) => e.id === (ref?.eventId ?? state.rest?.eventId),
  );
  const member = ref ? toneFor(score, ref) : null,
    selectedPitch = member?.spelling ?? null,
    tones = selected ? eventTones(selected) : [];
  const tie = selectedStaff && state.selection.every(note => note.staffId === selectedStaff.id)
    ? tieChoice(selectedStaff.events, state.selection) : null;
  const targetStaff = score.staffs.find((s) => s.id === state.target?.staffId),
    target = targetStaff?.events.find((e) => e.id === state.target?.eventId);
  const snapshot = useMemo(() => scoreCodeSnapshot(score), [score]),
    displayed = codeText ?? snapshot.code,
    dirty = displayed !== snapshot.code;
  const propertyOpen = property !== null;
  const locked = dirty || propertyOpen, lockedNow = useRef(locked);
  lockedNow.current = locked;
  const barTicks = measureTicks(score.meter);
  const rhythmDuration = state.mode === 'edit' && selected ? selected.duration : state.duration;
  const rhythmRest = state.mode === 'edit' && selected ? !eventTones(selected).length : state.entryKind === 'rest';
  const draft = useMemo(() => {
    try {
      return parseSheetCode(displayed);
    } catch {
      return null;
    }
  }, [displayed]);
  const linked = ref ?? state.rest ?? state.target;
  const range = linked
    ? dirty
      ? draft
        ? linkedScoreRange(draft, score, linked.staffId, linked.eventId)
        : null
      : (snapshot.ranges[sourceKey(linked.staffId, linked.eventId)] ?? null)
    : null;
  const steps = useMemo(() => scoreSteps(events), [events]),
    audio = usePianoAudio(steps, score.bpm),
    stopAudio = audio.stopAudio;
  const group = state.selection.length > 1;
  const options = (clef: Clef) =>
    NATURAL_PITCHES.filter((m) => m >= CLEFS[clef].minimum && m <= 89).flatMap((m) =>
      ([-1, 0, 1] as const).map((a) => ({ ...inputPitch(m, a, score.key) })).filter(validPitch),
    );
  const partOptions = options(selectedStaff?.clef ?? staff.clef),
    editOptions =
      selectedPitch && !partOptions.some((p) => pitchKey(p) === pitchKey(selectedPitch))
        ? [...partOptions, selectedPitch]
        : partOptions;
  const additions = options(targetStaff?.clef ?? staff.clef),
    additionValue = additions.some((p) => pitchKey(p) === addition) ? addition : 'E4';
  const targets = activeTargets(state),
    hasNotes = score.staffs.some((s) => s.events.some((e) => eventTones(e).length));
  useEffect(() => stopAudio, [stopAudio]);
  useEffect(() => {
    const before = document.title;
    document.title = 'Melody Studio · Testing';
    return () => {
      document.title = before;
    };
  }, []);
  useEffect(() => {
    if (!property) return;
    const dialog = propertyDialog.current, anchor = propertyAnchor.current, editor = root.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { dialog?.close(); if (anchor?.isConnected) anchor.focus({ preventScroll: true }); else editor?.querySelector<HTMLElement>(`[data-clef-staff="${property.staffId}"], [data-add-staff]`)?.focus({ preventScroll: true }); };
  }, [property]);
  useEffect(() => {
    if (panel !== 'add-staff') return;
    const dialog = addStaffDialog.current, trigger = panelTrigger.current, editor = root.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      if (trigger?.isConnected && !trigger.disabled) trigger.focus({ preventScroll: true });
      else editor?.querySelector<HTMLElement>('.sheet-editor-scroll')?.focus({ preventScroll: true });
    };
  }, [panel]);
  function invalidate() {
    epochNow.current++;
    setEpoch(epochNow.current);
    setRequest(null);
  }
  function interact(action: Action) {
    if (epochNow.current !== epoch || propertyNow.current || (lockedNow.current && !['mode','select','clear-selection','caret','target'].includes(action.type))) return;
    setPanel(null);
    const command = {
        ...action,
        revision: state.revision,
        context: state.context,
      },
      next = scoreReducer(now.current, command);
    now.current = next;
    dispatch(command);
    audio.stopAudio();
    invalidate();
  }
  function togglePanel(next: NonNullable<typeof panel>, trigger?: HTMLButtonElement) {
    if (epochNow.current !== epoch || lockedNow.current)
      return;
    panelTrigger.current = trigger ?? null;
    invalidate();
    setPanel(panel === next ? null : next);
  }
  function closePanel(focus = true) {
    invalidate();
    setPanel(null);
    if (focus) panelTrigger.current?.focus({ preventScroll: true });
  }
  function chooseValue(value: NoteValue) {
    if (state.mode === 'edit') change({ type: 'event-duration', duration: value });
    else interact({ type: 'tool', duration: value });
  }
  function chooseKind(value: 'note' | 'rest') {
    if (state.mode === 'edit') change({ type: 'entry-kind', value });
    else interact({ type: 'entry-kind', value });
  }
  function audition(
    notes: number[],
    beats = 1,
    bpm = now.current.score.bpm,
    arpeggio?: 'up' | 'down',
    staccato = false,
  ) {
    if (notes.length)
      void audio.playTimeline(
        auditionTimeline(notes, bpm, beats, arpeggio, now.current.score.tempoBeat, staccato),
        'testing-sheet-editor-entry',
      );
  }
  function change(action: Action) {
    if (epochNow.current !== epoch || dirty || propertyNow.current) return;
    const previous = now.current,
      command = { ...action, revision: state.revision, context: state.context },
      next = scoreReducer(previous, command);
    now.current = next;
    dispatch(command);
    setRequest(null);
    const caretMoved = action.type === 'pitch-step' && next.pitch !== previous.pitch;
    if (next.revision === previous.revision && !caretMoved) return;
    audio.stopAudio();
    if (caretMoved) {
      audition([pitchMidi(inputPitch(next.pitch, next.accidental, next.score.key))], 1, next.score.bpm, undefined, next.staccato);
      return;
    }
    if (action.type === 'transpose') {
      const ref = primary(next), event = ref && next.score.staffs.find(staff => staff.id === ref.staffId)?.events.find(event => event.id === ref.eventId);
      audition(selectedPitches(next), 1, next.score.bpm, undefined, Boolean(event?.staccato));
      return;
    }
    if (action.type === 'part') {
      const a = action.action,
        s = next.score.staffs.find((s) => s.id === (action.staffId ?? previous.active));
      const entry =
        a.type === 'fill' ||
        a.type === 'add-tone' ||
        (a.type === 'update' &&
          a.midi !== null &&
          previous.score.staffs
            .find((s) => s.id === (action.staffId ?? previous.active))
            ?.events.find((e) => e.id === a.id)?.midi === null);
      const event = entry && 'id' in a ? s?.events.find((e) => e.id === a.id) : null;
      if (event) {
        const step = scoreSteps([event])[0];
        audition(
          eventTones(event).map((t) => pitchMidi(t.spelling)),
          step.beats,
          next.score.bpm,
          event.arpeggio,
          Boolean(event.staccato),
        );
      }
    }
  }
  function part(action: EditorAction, staffId = selectedStaff?.id ?? staff.id) {
    change({ type: 'part', staffId, action });
  }
  function select(id: string, toneId?: string, staffId = staff.id, toggle = false) {
    const event = score.staffs.find(part => part.id === staffId)?.events.find(event => event.id === id);
    if (state.mode === 'place' && event && eventTones(event).length) return;
    interact({ type: 'select', staffId, eventId: id, toneId, toggle });
  }
  function switchMode(mode: 'place' | 'edit', recover = false) {
    if (epochNow.current !== epoch) return;
    interact({ type: 'mode', mode });
    if (
      recover &&
      document.activeElement?.closest(
        '.sheet-editor-toolbar,.sheet-editor-selection,.sheet-editor-slots,.sheet-editor-members',
      )
    )
      root.current
        ?.querySelector<HTMLElement>('.sheet-editor-scroll')
        ?.focus({ preventScroll: true });
  }
  function erase() {
    if (state.selection.length) change({ type: 'delete-selection' });
  }
  function editCode(text: string) {
    if (propertyNow.current) return;
    setPanel(null);
    if (!dirty) codeBase.current = state.revision;
    invalidate();
    audio.stopAudio();
    setCodeError('');
    setCodeText(text === snapshot.code ? null : text);
    lockedNow.current = text !== snapshot.code;
  }
  function resetCode() {
    if (propertyNow.current) return;
    invalidate();
    setCodeText(null);
    setCodeError('');
    lockedNow.current = propertyOpen;
  }
  function applyCode() {
    if (epoch !== epochNow.current || !dirty || propertyNow.current) return;
    try {
      if (codeBase.current !== now.current.revision)
        throw new Error('The score changed. Reset the draft before applying.');
      const parsed = parseSheetCode(displayed),
        action: Action = {
          type: 'apply',
          value: parsed,
          seed: crypto.randomUUID(),
          revision: codeBase.current,
        };
      const previous = now.current,
        next = scoreReducer(previous, action);
      if (next !== previous && next.revision === previous.revision) throw new Error(next.message);
      now.current = next;
      dispatch(action);
      audio.stopAudio();
      invalidate();
      setCodeText(null);
      setCodeError('');
      lockedNow.current = false;
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : 'Unable to read score.');
    }
  }
  function openProperty(kind: 'clef' | 'key' | 'tempo' | 'meter', staffId = state.active, anchor?: HTMLElement) {
    if (lockedNow.current || epochNow.current !== epoch) return;
    const part = now.current.score.staffs.find(item => item.id === staffId);
    if (!part) return;
    audio.stopAudio(); invalidate(); setPanel(null); setPropertyError('');
    propertyAnchor.current = anchor ?? (document.activeElement as HTMLElement | null);
    const beat = score.tempoBeat ?? DEFAULT_TEMPO_BEAT;
    setPropertyDraft({ clef: part.clef, key: score.key, numerator: String(score.meter.numerator), denominator: String(score.meter.denominator), bpm: String(score.bpm), duration: beat.duration, dotted: beat.dotted });
    setProperty({ kind, staffId, revision: state.revision, context: state.context });
    lockedNow.current = true;
  }
  function closeProperty() {
    if (propertyNow.current !== property) return;
    propertyNow.current = null;
    setProperty(null); setPropertyError(''); lockedNow.current = dirty;
  }
  function applyProperty(remove = false) {
    if (propertyNow.current !== property || propertyDraftNow.current !== propertyDraft) return;
    if (!property || dirty || property.revision !== now.current.revision || property.context !== now.current.context) { setPropertyError('The score changed. Close and reopen this setting.'); return; }
    const meter = { numerator: Number(propertyDraft.numerator), denominator: Number(propertyDraft.denominator) } as Meter;
    const beat = { duration: propertyDraft.duration, dotted: propertyDraft.dotted } as TempoBeat;
    if (property.kind === 'meter' && (!propertyDraft.numerator.trim() || !validMeter(meter))) { setPropertyError('Use a numerator from 1 to 32 and a supported denominator.'); return; }
    if (property.kind === 'tempo' && (!propertyDraft.bpm.trim() || !Number.isInteger(Number(propertyDraft.bpm)) || Number(propertyDraft.bpm) < 20 || Number(propertyDraft.bpm) > 400 || !validTempoBeat(beat))) { setPropertyError('Use a supported beat and an integer BPM from 20 to 400.'); return; }
    const action: Action = remove ? { type: 'remove-staff', staffId: property.staffId }
      : property.kind === 'key' ? { type: 'key', value: propertyDraft.key as MusicalKey }
      : property.kind === 'tempo' ? { type: 'tempo', bpm: Number(propertyDraft.bpm), beat }
      : property.kind === 'meter' ? { type: 'meter', value: meter }
      : { type: 'clef', staffId: property.staffId, value: propertyDraft.clef as Clef };
    const command = { ...action, revision: property.revision, context: property.context }, previous = now.current, next = scoreReducer(previous, command);
    if (next !== previous && next.revision === previous.revision) { setPropertyError(next.message); return; }
    now.current = next; dispatch(command); audio.stopAudio(); invalidate(); closeProperty();
  }
  function changeZoom(value: number) {
    if (epochNow.current !== epoch) return;
    invalidate(); setPanel(null); setZoom(Math.min(2, Math.max(0.75, value)));
  }
  const tupletRest = state.mode === 'edit' && selectedStaff && selected && !tones.length && !group
    ? { staffId: selectedStaff.id, eventId: selected.id } : null;
  function applyTuplet(count: number) {
    if (!tupletRest || lockedNow.current || epochNow.current !== epoch) return;
    const duration = tupletValueForRest(score, tupletRest.staffId, tupletRest.eventId, count);
    if (!duration) return;
    change({ type: 'tuplet', count, duration, id: crypto.randomUUID() });
    closePanel();
  }
  function setAccidental(value: -1 | 0 | 1) {
    if (state.mode === 'edit' && selectedPitch) part({ type: 'accidental', value });
    else interact({ type: 'entry-accidental', value });
  }
  const selectedKeys = new Set(state.selection.map(refKey));
  return (
    <main
      ref={root}
      className="testing-page sheet-editor-page"
      data-hide-tooltips={tipsDismissed}
      onFocusCapture={() => setTipsDismissed(false)}
      onPointerOverCapture={() => setTipsDismissed(false)}
      onPointerDownCapture={(event) => {
        if (panel && !(event.target as HTMLElement).closest('[data-studio-panel]')) {
          dismissedPointer.current = event.pointerId;
          event.preventDefault();
          event.stopPropagation();
          closePanel(false);
        }
      }}
      onClickCapture={(event) => {
        if (dismissedPointer.current !== null) {
          dismissedPointer.current = null;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerCancelCapture={() => {
        dismissedPointer.current = null;
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') setTipsDismissed(true);
        if (panel && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closePanel();
        }
      }}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          target.closest('button,input,textarea,select,dialog,[contenteditable]:not([contenteditable="false"])')
        )
          return;
        const mode =
          event.key.toLowerCase() === 'n'
            ? 'place'
            : event.key.toLowerCase() === 'e'
              ? 'edit'
              : null;
        if (
          !event.shiftKey &&
          !event.repeat &&
          (event.key === '.' || event.key.toLowerCase() === 't')
        ) {
          if (event.key === '.' && (selected || state.mode === 'place')) {
            event.preventDefault();
            if (state.mode === 'edit' && selected) change({ type: 'dot', value: !selected.dotted });
            else interact({ type: 'entry-dot', value: !state.dotted });
          } else if (event.key.toLowerCase() === 't' && state.selection.length) {
            event.preventDefault();
            change({ type: 'tie' });
          }
          return;
        }
        if (mode && !event.shiftKey && !event.repeat) {
          event.preventDefault();
          switchMode(mode, true);
        } else if (
          state.selection.length &&
          (['ArrowUp', 'ArrowDown'].includes(event.key) ||
            (state.mode === 'edit' && ['Delete', 'Backspace'].includes(event.key)))
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown')
            change({
              type: 'transpose',
              delta: event.key === 'ArrowUp' ? 1 : -1,
            });
          else erase();
        }
      }}
    >
      <header className="sheet-editor-heading"><h1>Melody editor</h1><span className="sheet-editor-eyebrow">Testing · Unsaved</span></header>
      {property && <dialog ref={propertyDialog} className="studio-property-dialog" aria-labelledby="score-property-title" onCancel={event => { event.preventDefault(); closeProperty(); }} onClick={event => { if (event.target === event.currentTarget) closeProperty(); }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); closeProperty(); } else if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'BUTTON') { event.preventDefault(); applyProperty(); } }}>
        <form onSubmit={event => { event.preventDefault(); applyProperty(); }}>
          <h2 id="score-property-title">{property.kind === 'clef' ? 'Clef' : property.kind === 'key' ? 'Key signature' : property.kind === 'tempo' ? 'Tempo' : 'Time signature'}</h2>
          <p>{property.kind === 'clef' ? `Staff ${score.staffs.findIndex(item => item.id === property.staffId) + 1}` : 'Applies to the whole score'}</p>
          {(property.kind === 'clef') && <ClefChoices aria-label="Staff clef" value={propertyDraft.clef as Clef} onChange={clef => setPropertyDraft({ ...propertyDraft, clef })} />}
          {property.kind === 'key' && <div className="studio-property-preview"><NotationPreview clef={score.staffs.find(part => part.id === property.staffId)?.clef ?? 'treble'} musicalKey={propertyDraft.key as MusicalKey} /><p>{keyDescription(propertyDraft.key as MusicalKey)}</p></div>}
          {property.kind === 'key' && <label>Key signature<select aria-label="Key signature" value={propertyDraft.key} onChange={event => setPropertyDraft({ ...propertyDraft, key: event.target.value })}>{MUSICAL_KEYS.map(key => <option key={key} value={key}>{keyName(key)}</option>)}</select></label>}
          {property.kind === 'meter' && <div className="studio-property-preview studio-meter-preview" aria-hidden="true">{propertyDraft.numerator || '—'} / {propertyDraft.denominator}</div>}
          {property.kind === 'meter' && <div className="studio-meter-fields"><label>Numerator<input aria-label="Numerator" type="number" min="1" max="32" step="1" value={propertyDraft.numerator} onChange={event => setPropertyDraft({ ...propertyDraft, numerator: event.target.value })} /></label><span>/</span><label>Denominator<select aria-label="Denominator" value={propertyDraft.denominator} onChange={event => setPropertyDraft({ ...propertyDraft, denominator: event.target.value })}>{[1,2,4,8,16,32].map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>}
          {property.kind === 'tempo' && <><div className="studio-property-preview studio-tempo-preview" aria-label="Tempo preview"><RhythmSymbol duration={propertyDraft.duration as TempoBeat['duration']} dotted={propertyDraft.dotted} /><span>= {Number.isInteger(Number(propertyDraft.bpm)) && Number(propertyDraft.bpm) >= 20 && Number(propertyDraft.bpm) <= 400 ? propertyDraft.bpm : '—'}</span></div><fieldset className="studio-tempo-beat-choices" aria-label="Tempo beat unit"><legend>Beat unit</legend>{NOTE_VALUES.map(value => <button key={value} type="button" data-tempo-beat={value} aria-label={`${labels[value]} beat`} aria-pressed={propertyDraft.duration === value} onClick={() => setPropertyDraft({ ...propertyDraft, duration: value })}><RhythmSymbol duration={value} dotted={propertyDraft.dotted} /></button>)}</fieldset><label className="studio-check"><input type="checkbox" aria-label="Dotted tempo beat" checked={propertyDraft.dotted} onChange={event => setPropertyDraft({ ...propertyDraft, dotted: event.target.checked })} />Dotted beat</label><label>BPM<input aria-label="BPM" id="score-bpm" type="number" min="20" max="400" step="1" value={propertyDraft.bpm} onChange={event => { setPropertyDraft({ ...propertyDraft, bpm: event.target.value }); setPropertyError(''); }} /></label></>}
          {propertyError && <p role="alert">{propertyError}</p>}
          <div className="studio-dialog-actions"><button type="submit">Apply</button><button type="button" onClick={closeProperty}>Cancel</button>{property.kind === 'clef' && <button type="button" disabled={score.staffs.length === 1} onClick={() => applyProperty(true)}>Remove staff</button>}</div>
        </form>
      </dialog>}
      {panel === 'add-staff' && <dialog ref={addStaffDialog} className="studio-property-dialog" data-studio-panel aria-label="Add a staff" onCancel={event => { event.preventDefault(); closePanel(); }} onClick={event => { if (event.target === event.currentTarget) closePanel(); }} onKeyDown={event => event.stopPropagation()}>
        <h2>Add a staff</h2><p>Choose a clef for the new staff.</p><ClefChoices aria-label="New staff clef" value={newClef} onChange={clef => { invalidate(); setNewClef(clef); }} /><div className="studio-dialog-actions"><button type="button" disabled={locked || score.staffs.length >= 4} onClick={() => { change({ type: 'add-staff', id: crypto.randomUUID(), clef: newClef }); closePanel(); }}>Create staff</button><button type="button" onClick={() => closePanel()}>Cancel</button></div>
      </dialog>}
      <div className="sheet-editor-panel">
        <div className="studio-command-row">
          <div className="sheet-editor-tools studio-mode" role="group" aria-label="Editor mode">
            <button type="button" aria-label="Write" aria-keyshortcuts="N" aria-pressed={state.mode === 'place'} disabled={locked} onClick={() => switchMode('place')}>Write melody</button>
            <button type="button" aria-label="Edit" aria-keyshortcuts="E" aria-pressed={state.mode === 'edit'} disabled={locked} onClick={() => switchMode('edit')}>Edit melody</button>
          </div>
          <select className="studio-mobile-mode" aria-label="Editor mode" disabled={locked} value={state.mode} onChange={event => switchMode(event.target.value as 'place' | 'edit')}><option value="place">Write melody</option><option value="edit">Edit melody</option></select>
          <div className="sheet-editor-history studio-primary-actions" role="group" aria-label="Playback and history">
            <button type="button" aria-label={audio.playing ? 'Stop audio' : 'Play score'} data-tooltip={audio.playing ? 'Stop audio' : 'Play score'} disabled={locked || (!hasNotes && !audio.playing)} onClick={() => { if (audio.playing) audio.stopAudio(); else if (!lockedNow.current && now.current.revision === state.revision && epochNow.current === epoch) void audio.playTimeline(performanceTimeline(score), 'testing-sheet-editor'); }}><BrodleIcon name={audio.playing ? 'stop' : 'play'} /><span>{audio.playing ? 'Stop' : 'Play'}</span></button>
            <button type="button" aria-label="Undo" data-tooltip="Undo" disabled={locked || !state.past.length} onClick={() => change({ type: 'undo' })}><BrodleIcon name="undo" /><span>Undo</span></button>
            <button type="button" aria-label="Reset score" data-tooltip="Reset score" disabled={locked || isDefaultScore(score)} onClick={() => change({ type: 'reset' })}><BrodleIcon name="restart" /><span>Reset</span></button>
          </div>
        </div>
        <div className="sheet-editor-toolbar" aria-label="Editing tools">
          <div className="studio-entry-kind" role="group" aria-label="Notes or rests">
            <button type="button" aria-label="Notes" aria-pressed={!rhythmRest} disabled={locked || (state.mode === 'edit' && (!selected || group))} onClick={() => chooseKind('note')}>Notes</button>
            <button type="button" aria-label="Rests" aria-pressed={rhythmRest} disabled={locked || (state.mode === 'edit' && (!selected || group))} onClick={() => chooseKind('rest')}>Rests</button>
          </div>
          <fieldset className="studio-duration-buttons" aria-label="Note value" disabled={locked || (state.mode === 'edit' && (!selected || group || Boolean(selected.tuplet)))}>
            {NOTE_VALUES.map(value => <button key={value} type="button" aria-label={`${labels[value]}${rhythmRest ? ' rest' : ''}`} data-tooltip={`${labels[value]}${rhythmRest ? ' rest' : ''}`} aria-pressed={rhythmDuration === value} onClick={() => chooseValue(value)}><RhythmSymbol duration={value} rest={rhythmRest} /></button>)}
          </fieldset>
          <div
            className="sheet-editor-tools studio-accidentals"
            role="group"
            aria-label="Accidentals"
          >

            {(
              [
                ['Sharp', 1, '♯'],
                ['Flat', -1, '♭'],
                ['Natural', 0, '♮'],
              ] as const
            ).map(([label, value, glyph]) => (
              <button
                type="button"
                key={label}
                aria-label={label}
                data-tooltip={label}
                disabled={locked || (state.mode === 'edit' && (!selectedPitch || group))}
                aria-pressed={
                  state.mode === 'edit'
                    ? selectedPitch?.accidental === value
                    : state.accidental === value
                }
                onClick={() => setAccidental(value)}
              >
                {glyph}
              </button>
            ))}
          </div>
          <div className="studio-expression-tools" role="group" aria-label="Expression tools">
            <button
              type="button"
              disabled={
                locked ||
                (state.mode === 'edit' &&
                  (!selected ||
                    group ||
                    Boolean(selected.tuplet) ||
                    selected.duration === 'thirty-second'))
              }
              aria-label={state.mode === 'edit' ? 'Selected dotted' : 'Dotted entry'}
              data-tooltip="Dotted · ×1.5 (.)"
              aria-keyshortcuts="."
              aria-pressed={state.mode === 'edit' ? Boolean(selected?.dotted) : state.dotted}
              onClick={() =>
                state.mode === 'edit'
                  ? change({ type: 'dot', value: !selected?.dotted })
                  : interact({ type: 'entry-dot', value: !state.dotted })
              }
            >
              <RhythmSymbol duration="quarter" rest={false} dotted /> Dotted
            </button>
            <button type="button" aria-label="Staccato" aria-pressed={state.mode === 'edit' ? Boolean(selected?.staccato) : state.staccato}
              disabled={locked || (state.mode === 'edit' ? !selected || group || !tones.length : rhythmRest)}
              data-tooltip={state.mode === 'edit' ? 'Staccato · shorten the selected note or chord' : 'Staccato · short, detached notes for the next entries'} onClick={() => state.mode === 'edit'
                ? change({ type: 'staccato', value: !selected?.staccato })
                : interact({ type: 'entry-staccato', value: !state.staccato })}>
              <RhythmSymbol duration="quarter" staccato /> Staccato
            </button>
            <button type="button" aria-label={tie?.tone.tieToNext ? 'Untie' : 'Tie'} aria-keyshortcuts="T"
              disabled={locked || !tie} aria-pressed={Boolean(tie?.tone.tieToNext)}
              data-tooltip="Sustain matching pitches in touching notes (T)" onClick={() => change({ type: 'tie' })}>
              <svg width="24" height="18" viewBox="0 0 24 18" aria-hidden="true"><path d="M2 14 Q12 0 22 14" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
              {tie?.tone.tieToNext ? 'Untie' : 'Tie'}
            </button>
            <button type="button" data-studio-panel aria-label="Arpeggio" aria-haspopup="dialog" aria-expanded={panel === 'arpeggio'}
              aria-controls="studio-arpeggio" disabled={locked || group || tones.length < 2}
              data-tooltip="Roll the notes of the selected chord" onClick={event => togglePanel('arpeggio', event.currentTarget)}>
              <svg width="18" height="30" viewBox="0 0 18 32" aria-hidden="true" focusable="false">
                <path d="M9 3C5 5 5 7 9 9S13 13 9 15S5 19 9 21S13 25 9 27" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>Arpeggio
            </button>
            <button type="button" data-studio-panel aria-label="Tuplets" aria-haspopup="dialog" aria-controls="studio-tuplet-menu" aria-expanded={panel === 'tuplets'}
              disabled={locked || !tupletRest} data-tooltip="Select a rest, then choose a tuplet" onClick={event => { if (!tupletRest) return; togglePanel('tuplets', event.currentTarget); }}>
              <svg width="32" height="30" viewBox="0 0 42 34" aria-hidden="true" focusable="false">
                <path d="M4 10V5H14M28 5H38V10" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <text x="21" y="11" textAnchor="middle" fontFamily="serif" fontSize="13" fontStyle="italic" fill="currentColor">?</text>
                {[8,20,32].map(x => <g key={x}>
                  <ellipse cx={x} cy="29" rx="3.2" ry="2.1" transform={`rotate(-20 ${x} 29)`} fill="currentColor" />
                  <path d={`M${x + 2.7} 28V16`} stroke="currentColor" strokeWidth="1.3" />
                </g>)}
                <path d="M10.7 16H34.7" stroke="currentColor" strokeWidth="2.8" />
              </svg>Tuplets
            </button>
            {panel === 'tuplets' && (
              <div id="studio-tuplet-menu" data-studio-panel role="dialog" className="studio-tools-popup studio-tuplet-popup" aria-label="Choose a tuplet" aria-describedby="sheet-editor-tuplet-hint">
                <h3>Tuplets</h3>
                <div className="studio-tuplet-presets">
                  {Object.entries(TUPLET_RATIOS).map(([value, ratio]) => {
                    const count = Number(value);
                    const width = count * 18 + 6, center = width / 2;
                    const duration = tupletRest && tupletValueForRest(score, tupletRest.staffId, tupletRest.eventId, count);
                    const tupletDuration = duration ?? selected?.duration ?? 'eighth';
                    const beamed = tupletDuration === 'eighth' || tupletDuration === 'sixteenth';
                    const fits = tupletRest && duration && scoreWithTuplet(score, tupletRest.staffId, tupletRest.eventId, count, duration, '__tuplet_choice__');
                    return <button key={value} type="button" data-tuplet-preset={count} aria-label={TUPLET_NAMES[count]}
                      disabled={locked || !fits} onClick={() => applyTuplet(count)}
                      data-tooltip={!duration ? 'Cannot fit this rest using a supported note value' : !fits ? 'Needs an empty span within this bar and the event limit' : `${TUPLET_NAMES[count]} · ${labels[duration]} notes · ${Number((NOTE_TICKS[duration] * ratio / meterBeatTicks(score.meter)).toFixed(3))} beats`}>
                      <svg className="studio-tuplet-symbol" viewBox={`0 0 ${width} 56`} aria-hidden="true" focusable="false">
                        <path d={`M6 14V8H${center - 9}M${center + 9} 8H${width - 6}V14`} fill="none" stroke="currentColor" strokeWidth="1.2" />
                        <text x={center} y="12" textAnchor="middle" fill="currentColor" fontFamily="serif" fontSize="14" fontStyle="italic">{count}</text>
                        {Array.from({ length: count }, (_, index) => {
                          const x = 10 + index * 18;
                          return <g key={index}>
                            <ellipse cx={x} cy="44" rx="4.3" ry="3" transform={`rotate(-20 ${x} 44)`}
                              fill={tupletDuration === 'half' || tupletDuration === 'whole' ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.2" />
                            {tupletDuration !== 'whole' && <path d={`M${x + 3.7} 43V20`} stroke="currentColor" strokeWidth="1.2" />}
                          </g>;
                        })}
                        {beamed && <path d={`M13.7 20H${width - 10.3}`} stroke="currentColor" strokeWidth="3" />}
                        {tupletDuration === 'sixteenth' && <path d={`M13.7 26H${width - 10.3}`} stroke="currentColor" strokeWidth="3" />}
                      </svg>
                    </button>;
                  })}
                </div>
                <div className="studio-tuplet-settings">
                  {selected?.tuplet && !tones.length && selectedStaff && <button type="button" disabled={locked || !tupletRest || selectedStaff.events.some(event => event.tuplet?.id === selected.tuplet?.id && eventTones(event).length)} onClick={() => { change({ type: 'remove-tuplet' }); closePanel(); }}>Remove tuplet</button>}
                </div>
                <p id="sheet-editor-tuplet-hint">Note values are chosen automatically to fill the selected rest. Choices that cannot fit exactly are disabled.</p>
                <div className="studio-dialog-actions"><button type="button" onClick={() => closePanel()}>Close tuplets</button></div>
              </div>
            )}
            {panel === 'arpeggio' && <div id="studio-arpeggio" data-studio-panel role="dialog" aria-label="Arpeggio direction" className="studio-tools-popup">
              <h3>Arpeggio</h3><p>Roll the selected chord without changing its written duration.</p>
              <div className="studio-choice-row">{(['off', 'up', 'down'] as const).map(value => <button key={value} type="button" disabled={locked || group || tones.length < 2}
                aria-pressed={(selected?.arpeggio ?? 'off') === value}
                onClick={() => { change({ type: 'arpeggio', value: value === 'off' ? null : value }); closePanel(); }}>
                {value === 'off' ? 'Off' : value === 'up' ? 'Ascending' : 'Descending'}
              </button>)}</div>
              <div className="studio-dialog-actions"><button type="button" onClick={() => closePanel()}>Close arpeggio</button></div>
            </div>}
          </div>

          {state.mode === 'edit' && (group || selected?.tuplet || selected?.duration === 'thirty-second') && (
            <span className="studio-tool-hint">
              {group ? 'Select one event to change its rhythm.' : selected?.tuplet
                ? 'Tuplet rhythm is fixed. Use Tuplets to edit the group while all slots are rests.'
                : 'Thirty-second events cannot be dotted; choose another value first.'}
            </span>
          )}
        </div>
        <div className="sheet-editor-score-heading">
          <div className="studio-score-summary"><strong>{meterName(score.meter)}</strong><span>{totalTicks(events) / barTicks} measures · {score.staffs.length} {score.staffs.length === 1 ? 'staff' : 'staffs'}</span></div>
          <div className="studio-score-actions">
            <button type="button" className="studio-reverb-toggle" aria-label="Light reverb" aria-pressed={audio.reverb}
              data-tooltip="A subtle room effect with a short, soft tail" onClick={() => audio.setReverb(!audio.reverb)}>
              Reverb {audio.reverb ? 'On' : 'Off'}
            </button>
            <div className="studio-zoom" role="group" aria-label="Score zoom">
              <button type="button" aria-label="Zoom out" disabled={zoom <= .75} onClick={() => changeZoom(zoom - .25)}>−</button>
              <button type="button" aria-label="Reset zoom" onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}%</button>
              <button type="button" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => changeZoom(zoom + .25)}>+</button>
            </div>

          </div>
        </div>
        <EditableStaff
          zoom={zoom}
          entryKind={state.entryKind}
          staffActions={<div className="studio-add-staff"><button type="button" className="studio-add-staff-button" data-studio-panel data-add-staff aria-label="Add staff" aria-haspopup="dialog" aria-expanded={panel === 'add-staff'} disabled={locked || score.staffs.length >= 4} onClick={event => togglePanel('add-staff', event.currentTarget)}>
            <svg width="26" height="24" viewBox="0 0 26 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
              <path d="M2 5h18M2 9h18M2 13h11M2 17h11M2 21h11M20 13v10M15 18h10" />
            </svg>
            <span>Add staff</span>
          </button></div>}
          onProperty={openProperty}
          onAddMeasure={() => { setPanel(null); change({ type: 'add-measure' }); }}
          score={score}
          activeStaffId={state.active}
          selection={state.selection}
          entryAccidental={state.accidental}
          events={events}
          selectedId={selected?.id ?? null}
          selectedToneId={ref?.toneId ?? null}
          locked={locked}
          interactionVersion={epoch + state.context}
          revision={state.revision}
          mode={state.mode}
          modeVersion={state.context}
          targetId={state.target?.eventId ?? null}
          caret={{ tick: state.tick, pitch: state.pitch }}
          duration={state.duration}
          dotted={state.dotted}
          staccato={state.staccato}
          accidental={inputPitch(state.pitch, state.accidental, score.key).accidental}
          requestedOperation={request}
          onSelect={select}
          onClearSelection={() => interact({ type: 'clear-selection' })}
          onTranspose={(delta) => change({ type: 'transpose', delta })}
          onPitchStep={(delta) => change({ type: 'pitch-step', delta })}
          onDelete={erase}
          onUndo={() => change({ type: 'undo' })}
          onCaret={(position) => interact({ type: 'caret', ...position })}
          onPlace={(position: Caret & { staffId?: string }) =>
            part(
              {
                type: 'fill',
                tick: position.tick,
                pitch: position.pitch,
                id: crypto.randomUUID(),
              },
              position.staffId ?? staff.id,
            )
          }
          onAddTone={(command) =>
            part(
              {
                type: 'add-tone',
                id: command.eventId,
                pitch: command.pitch,
                spelling: command.spelling,
                toneId: crypto.randomUUID(),
              },
              command.staffId ?? staff.id,
            )
          }
        />
        <footer className="studio-score-footer">
          <span>
            {totalTicks(events) / barTicks}{' '}
            {totalTicks(events) === barTicks ? 'measure' : 'measures'} ·{' '}
            {totalTicks(events) / meterBeatTicks(score.meter)} beats · {score.staffs.length}{' '}
            {score.staffs.length === 1 ? 'part' : 'parts'}
          </span>
          <span className="studio-shortcuts">
            <kbd>N</kbd> Write <kbd>E</kbd> Edit <kbd>↕</kbd> Pitch
            <span><kbd>.</kbd> Toggle dotted notes or rests</span>
            {state.mode === 'place' ? (
              <>
                <kbd>Enter</kbd> Place
              </>
            ) : (
              <>
                <kbd>Del</kbd> Delete
              </>
            )}
          </span>
          <Link to="/testing" className="sheet-editor-back">
            ← Testing
          </Link>
        </footer>
      </div>
      <div role="status" className="sheet-editor-status" aria-live="polite">
        <span>{state.message}</span>
        <span>
          {state.mode === 'edit'
            ? `${state.selection.length} notes selected in ${new Set(state.selection.map((r) => r.staffId)).size} staffs${selectedPitch ? ' · Primary: ' + pitchLabel(selectedPitch) : ''}.`
            : `Staff ${score.staffs.indexOf(staff) + 1}${selectedPitch ? ' · Selected: ' + pitchLabel(selectedPitch) : ''} · Next ${pitchLabel(inputPitch(state.pitch, state.accidental, score.key))} · ${positionLabel(state.tick, score.meter)}`}
        </span>
      </div>
      {audio.sound !== 'synth' && <div className="studio-audio-fallback"><button type="button" onClick={() => { audio.stopAudio(); audio.setSound('synth'); }}>Use Synth</button><span>Use the built-in instrument.</span></div>}
      {audio.audioError && (
        <p role="alert" className="sheet-editor-audio-error">
          {audio.audioError} You can keep editing the score.
        </p>
      )}
      {(selected || target || group) && (
        <section className="studio-inspector" aria-label="Selection inspector">
          {state.mode === 'place' && target && (
            <details className="studio-chord-options">
              <summary>Add chord tones</summary>
              <fieldset
                disabled={locked}
                className="sheet-editor-selection sheet-editor-add-tone"
                aria-label="Add to chord"
              >
                <span>Target: {eventLabel(target)}</span>
                <label>
                  Pitch to add
                  <select value={additionValue} onChange={(e) => setAddition(e.target.value)}>
                    {additions.map((p) => (
                      <option key={pitchKey(p)} value={pitchKey(p)}>
                        {pitchLabel(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (lockedNow.current || epochNow.current !== epoch) return;
                    const spelling = additions.find((p) => pitchKey(p) === additionValue)!;
                    setRequest({
                      token: Date.now(),
                      modeVersion: state.context,
                      revision: state.revision,
                      interactionVersion: epoch + state.context,
                      command: {
                        kind: 'add-tone',
                        eventId: target.id,
                        staffId: targetStaff!.id,
                        pitch: pitchMidi({ ...spelling, accidental: 0 }),
                        spelling,
                      },
                    });
                  }}
                >
                  Add tone
                </button>
                <button type="button" onClick={() => interact({ type: 'clear-selection' })}>
                  Clear target
                </button>
              </fieldset>
            </details>
          )}
          {state.mode === 'edit' && selected && tones.length > 0 && (
            <div role="group" aria-label="Chord tones" className="sheet-editor-members">
              {tones.map((tone) => {
                const note = {
                    staffId: selectedStaff!.id,
                    eventId: selected.id,
                    toneId: tone.id,
                  },
                  chosen = selectedKeys.has(refKey(note));
                return (
                  <span key={tone.id}>
                    <button
                      type="button"
                      aria-pressed={chosen}
                      onClick={(event) =>
                        select(selected.id, tone.id, selectedStaff!.id, event.shiftKey)
                      }
                    >
                      {pitchLabel(tone.spelling)}
                    </button>
                    <button
                      type="button"
                      aria-label={`${chosen ? 'Remove' : 'Add'} ${pitchLabel(tone.spelling)} ${chosen ? 'from' : 'to'} selection`}
                      onClick={() => select(selected.id, tone.id, selectedStaff!.id, true)}
                    >
                      {chosen ? '−' : '+'}
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {state.mode === 'place' && selected && selectedPitch && (
            <fieldset
              disabled={locked}
              className="sheet-editor-selection"
              aria-label="Placed note controls"
            >
              <legend>Selected note · {pitchLabel(selectedPitch)}</legend>
              <button
                type="button"
                disabled={pitchMidi(selectedPitch) <= 0}
                onClick={() => change({ type: 'transpose', delta: -1 })}
              >
                ↓ Down semitone
              </button>
              <button
                type="button"
                disabled={pitchMidi(selectedPitch) >= 127}
                onClick={() => change({ type: 'transpose', delta: 1 })}
              >
                ↑ Up semitone
              </button>
              <label>
                Selected note duration
                <select
                  aria-label="Selected note duration"
                  value={selected.duration}
                  disabled={Boolean(selected.tuplet)}
                  onChange={(event) =>
                    part({
                      type: 'duration',
                      id: selected.id,
                      duration: event.target.value as NoteValue,
                    })
                  }
                >
                  {NOTE_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {labels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => interact({ type: 'clear-selection' })}>
                Continue placing
              </button>
              <span>
                Duration applies to the whole chord. The visible value buttons set the next entry.
              </span>
            </fieldset>
          )}
          {group ? (
            <fieldset disabled={locked} className="sheet-editor-selection">
              <legend>{state.selection.length} selected notes</legend>
              <button type="button" onClick={() => change({ type: 'transpose', delta: -1 })}>
                ↓ Down semitone
              </button>
              <button type="button" onClick={() => change({ type: 'transpose', delta: 1 })}>
                ↑ Up semitone
              </button>
              <button type="button" onClick={erase}>
                Delete selected notes
              </button>
            </fieldset>
          ) : (
            state.mode === 'edit' &&
            selected && (
              <fieldset disabled={locked} className="sheet-editor-selection">
                <legend>Edit event {selectedStaff!.events.indexOf(selected) + 1}</legend>
                <label>
                  {tones.length > 1 ? 'Tone pitch' : 'Pitch or rest'}
                  <select
                    value={selectedPitch ? pitchKey(selectedPitch) : 'rest'}
                    onChange={(event) => {
                      const spelling = editOptions.find((p) => pitchKey(p) === event.target.value);
                      if (event.target.value === 'rest')
                        part({
                          type: 'update',
                          id: selected.id,
                          midi: null,
                          duration: selected.duration,
                        });
                      else if (spelling)
                        part({
                          type: 'update',
                          id: selected.id,
                          midi: pitchMidi(spelling),
                          spelling,
                          duration: selected.duration,
                        });
                    }}
                  >
                    {tones.length <= 1 && <option value="rest">Rest</option>}
                    {editOptions.map((p) => (
                      <option key={pitchKey(p)} value={pitchKey(p)}>
                        {pitchLabel(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!selectedPitch || pitchMidi(selectedPitch) <= 0}
                  onClick={() => change({ type: 'transpose', delta: -1 })}
                >
                  ↓ Down semitone
                </button>
                <button
                  type="button"
                  disabled={!selectedPitch || pitchMidi(selectedPitch) >= 127}
                  onClick={() => change({ type: 'transpose', delta: 1 })}
                >
                  ↑ Up semitone
                </button>
                {selectedPitch && (
                  <button type="button" onClick={erase}>
                    Delete tone
                  </button>
                )}
                <button type="button" onClick={() => part({ type: 'delete', id: selected.id })}>
                  Delete event
                </button>
                {selectedPitch && (
                  <button
                    type="button"
                    onClick={() =>
                      part({
                        type: 'update',
                        id: selected.id,
                        midi: null,
                        duration: selected.duration,
                      })
                    }
                  >
                    Convert event to rest
                  </button>
                )}
                <button type="button" onClick={() => switchMode('place')}>
                  Return to note entry
                </button>
              </fieldset>
            )
          )}
        </section>
      )}
      <SheetCodeEditor
        value={displayed}
        dirty={dirty}
        error={codeError}
        range={range}
        selectionVersion={state.context}
        linkMissing={Boolean(linked && !range)}
        blocked={propertyOpen}
        onChange={editCode}
        onApply={applyCode}
        onReset={resetCode}
      />
      {state.mode === 'place' && (
        <details className="sheet-editor-slots studio-support">
          <summary>Positions</summary>
          <section aria-label="Rhythmic positions">
            <h2>Choose a position</h2>
            <p>Choose a beat or subdivision, focus the staff and press Enter. The end position adds a measure when you enter a note.</p>
            <div>
              {targets.map((tick) => (
                <button
                  type="button"
                  key={tick}
                  aria-label={tick === totalTicks(events) ? `End of score · ${positionLabel(tick, score.meter)}` : positionLabel(tick, score.meter)}
                  aria-pressed={state.tick === tick}
                  onClick={() => interact({ type: 'caret', tick, pitch: state.pitch })}
                >
                  {tick === totalTicks(events) ? `End of score · ${positionLabel(tick, score.meter)}` : positionLabel(tick, score.meter)}
                </button>
              ))}
            </div>
          </section>
        </details>
      )}
      <details className="studio-support">
        <summary>Sequence</summary>
        <section className="sheet-editor-events" aria-label="Score events">
          <h2>Your sequence</h2>
          <p>
            {state.mode === 'place' ? 'Switch to Edit melody to select existing notes. Rest entries can set the writing position.' : 'Choose one event. Shift-click or use its +/− button to toggle its first tone in the selection.'}
          </p>
          {score.staffs.map((s, index) => (
            <div key={s.id}>
              <h3>
                Staff {index + 1} · {s.clef}
              </h3>
              <ol>
                {timedEvents(s.events).map(({ event, start }) => {
                  const first = eventTones(event)[0],
                    chosen = state.selection.some(
                      (r) => r.staffId === s.id && r.eventId === event.id,
                    );
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        disabled={state.mode === 'place' && Boolean(first)}
                        aria-pressed={
                          state.mode === 'place'
                            ? state.target?.staffId === s.id && state.target.eventId === event.id
                            : chosen ||
                              (state.rest?.staffId === s.id && state.rest.eventId === event.id)
                        }
                        aria-label={`${state.mode === 'place' ? 'Target' : 'Select'} staff ${index + 1}, ${positionLabel(start, score.meter)}: ${eventLabel(event)}, ${labels[event.duration]}`}
                        onClick={(e) => select(event.id, undefined, s.id, e.shiftKey)}
                      >
                        <small>{positionLabel(start, score.meter)}</small>
                        {eventLabel(event)}{' '}
                        <span>
                          {fractions[event.duration]}
                          {event.dotted ? ' · dotted' : ''}
                          {event.staccato ? ' · staccato' : ''}
                          {event.tuplet ? ` · ${TUPLET_NAMES[event.tuplet.count]}` : ''}
                        </span>
                      </button>
                      {state.mode === 'edit' && first && (
                        <button
                          type="button"
                          aria-label={`Toggle ${pitchLabel(first.spelling)} in staff ${index + 1}, ${positionLabel(start, score.meter)}`}
                          onClick={() => select(event.id, first.id, s.id, true)}
                        >
                          ±
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </section>
      </details>
      <details className="studio-support">
        <summary>Help and shortcuts</summary>
        <aside className="sheet-editor-help">
          <div>
            <h2>Compose together</h2>
            <p>
              Use up to four staffs with independent Treble, Bass, Alto or Tenor clefs and shared tempo, key and
              measures. Entry uses the selected Sharp, Flat or Natural accidental; Natural is the default.
              Existing pitches stay unchanged when key or clef changes. Reset score returns to one
              treble staff, C major and 120 BPM.
            </p>
          </div>
          <div>
            <h2>Keyboard entry</h2>
            <p id="sheet-editor-keyboard">
              N selects Write and E selects Edit outside text fields. Period toggles the next-entry
              dot in Write and the selected event’s dot in Edit; T ties matching adjacent tones or removes that
              tie. In Edit, select a rest first, then open Tuplets and choose Duplet, Triplet or another preset to apply it. Clicking a rest only selects it. Write fills the resulting fixed slots.
              Arpeggios roll chords up or down. Write: Left/Right chooses time, Up/Down edits and
              auditions the selected note; with no selection it auditions the next pitch. Enter
              fills a rest and selects it; at the end it adds a measure automatically. Escape or Left/Right clears the selection; the
              selected-note duration control edits its event while the visible note-value buttons
              set the next entry. Edit: the top note values, Notes/Rests, Dotted and accidental tools change
              the selection. New notes and duration edits consume rests, then carry later notes into new measures
              as needed; notes crossing barlines display tied segments. Click a head; Shift-click
              toggles more notes across staffs. Up/Down auditions a semitone move for the selection;
              Delete removes those tones without moving time. The +/− member buttons and sequence ±
              buttons toggle notes by keyboard. Escape clears selection. Ctrl/⌘ Z on the staff
              undoes a score edit.
            </p>
          </div>
          <p className="sheet-editor-limit">
            Pointer entry: Treble F3–F6, Bass F1–F6, Alto G2–F6, Tenor E2–F6. Code/arrows: MIDI 0–127. Four staffs, 64 events
            per staff including rests, eight tones per chord. The score wraps into rows with normal
            page scrolling. Leaving/reloading resets this transient sketch.
          </p>
        </aside>
      </details>
    </main>
  );
}
