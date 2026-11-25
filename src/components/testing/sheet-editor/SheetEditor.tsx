import ClefChoices from './ClefChoices';
import NotationPreview from './NotationPreview';
import { keyDescription } from './sheetEditorPreview';
import { tieChoice } from './sheetEditorExpressions';
import { performanceTimeline, auditionTimeline } from './sheetEditorPlayback';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { StudioSession } from './studioDocument';
import { Link } from 'react-router-dom';
import { MUSICAL_KEYS, keyName } from '../../brodle/lib/musicGame';
import { usePianoAudio } from '../../brodle/hooks/usePianoAudio';
import RhythmSymbol from '../../brodle/components/RhythmSymbol';
import BrodleIcon from '../../brodle/components/BrodleIcon';
import EditableStaff from './EditableStaff';
import SheetCodeEditor from './SheetCodeEditor';
import StudioPiano from './StudioPiano';
import StudioTutorial from './StudioTutorial';
import { scoreCodeSnapshot, sourceKey } from './sheetEditorCode';
import { parseSheetCode, linkedScoreRange } from './sheetEditorCodeParser';
import {
  emptyScore,
  inputPitch,
  isDefaultScore,
  primary,
  scoreReducer,
  scoreWithTuplet,
  tupletValueForRest,
  selectedPitches,
  toneFor,
} from './scoreModel';
import type { Action, Clef } from './scoreModel';
import {
  NOTE_TICKS,
  TUPLET_RATIOS,
  TUPLET_NAMES,
  eventTones,
  NOTE_VALUES,
  pitchMidi,
  scoreSteps,
  totalTicks,
  meterBeatTicks,
  measureTicks, meterName, validMeter, validTempoBeat, DEFAULT_TEMPO_BEAT,
} from './sheetEditorModel';
import type { Meter, TempoBeat } from './sheetEditorRhythm';
import type { MusicalKey } from '../../brodle/lib/musicGame';
import type { Caret, EditorAction, NoteValue } from './sheetEditorModel';
import './SheetEditor.css';
const labels: Record<NoteValue, string> = {
  'thirty-second': 'Thirty-second',
  sixteenth: 'Sixteenth',
  eighth: 'Eighth',
  quarter: 'Quarter',
  half: 'Half',
  whole: 'Whole',
};
type Props = { initialSession?: StudioSession; onSessionChange?: (session: StudioSession) => void; readOnly?: boolean; gameMelody?: boolean; labelledBy?: string; children?: ReactNode; backTo?: string; backLabel?: string };
export default function SheetEditor({ initialSession, onSessionChange, readOnly = false, gameMelody = false, labelledBy, children, backTo = '/testing', backLabel = 'Testing' }: Props = {}) {
  const [state, dispatch] = useReducer(scoreReducer, initialSession?.state, value => value ?? emptyScore()),
    now = useRef(state);
  now.current = state;
  const readOnlyNow = useRef(readOnly); readOnlyNow.current = readOnly;
  const [zoom, setZoom] = useState(1),
    [tipsDismissed, setTipsDismissed] = useState(false),
    [panel, setPanel] = useState<'add-staff' | 'arpeggio' | 'tuplets' | null>(null),
    panelTrigger = useRef<HTMLButtonElement | null>(null),
    dismissedPointer = useRef<number | null>(null);
  const [codeText, setCodeText] = useState<string | null>(initialSession?.codeDraft ?? null),
    [codeExpanded, setCodeExpanded] = useState(false),
    [codeError, setCodeError] = useState(''),
    codeBase = useRef(initialSession?.state.revision ?? 0);
  const [property, setProperty] = useState<{ kind: 'clef' | 'key' | 'tempo' | 'meter'; staffId: string; revision: number; context: number } | null>(null);
  const propertyNow = useRef(property); propertyNow.current = property;
  const propertyDialog = useRef<HTMLDialogElement>(null), addStaffDialog = useRef<HTMLDialogElement>(null), propertyAnchor = useRef<HTMLElement | null>(null);
  const toolsPopup = useRef<HTMLDivElement>(null);
  const [propertyError, setPropertyError] = useState('');
  const [propertyDraft, setPropertyDraft] = useState({ clef: 'treble', key: 'C', numerator: '4', denominator: '4', bpm: '120', duration: 'quarter', dotted: false });
  const propertyDraftNow = useRef(propertyDraft);
  propertyDraftNow.current = propertyDraft;
  const [newClef, setNewClef] = useState<Clef>('bass');
  const [epoch, setEpoch] = useState(0),
    epochNow = useRef(0),
    root = useRef<HTMLElement>(null);
  const score = state.score,
    staff = score.staffs.find((s) => s.id === state.active)!,
    events = staff.events,
    ref = primary(state);
  const invalidGameLayout = gameMelody && (score.staffs.length !== 1 || score.staffs[0].clef !== 'treble');
  const selectedStaff = score.staffs.find((s) => s.id === (ref?.staffId ?? state.rest?.staffId));
  const selected = selectedStaff?.events.find(
    (e) => e.id === (ref?.eventId ?? state.rest?.eventId),
  );
  const member = ref ? toneFor(score, ref) : null,
    selectedPitch = member?.spelling ?? null,
    tones = selected ? eventTones(selected) : [];
  const tie = selectedStaff && state.selection.every(note => note.staffId === selectedStaff.id)
    ? tieChoice(selectedStaff.events, state.selection) : null;
  const snapshot = useMemo(() => scoreCodeSnapshot(score), [score]),
    displayed = codeText ?? snapshot.code,
    dirty = displayed !== snapshot.code;
  const propertyOpen = property !== null;
  const locked = dirty || propertyOpen || readOnly, lockedNow = useRef(locked);
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
    audio = usePianoAudio(steps, score.bpm, 'grand'),
    stopAudio = audio.stopAudio;
  const group = state.selection.length > 1;
  const hasNotes = score.staffs.some((s) => s.events.some((e) => eventTones(e).length));
  useEffect(() => stopAudio, [stopAudio]);
  useEffect(() => { onSessionChange?.({ state, codeDraft: codeText }); }, [state, codeText, onSessionChange]);
  useEffect(() => { if (readOnly) stopAudio(); }, [readOnly, stopAudio]);
  useEffect(() => {
    const before = document.title;
    document.title = 'Melody Studio · Brodle';
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
  useEffect(() => {
    if (panel !== 'arpeggio' && panel !== 'tuplets') return;
    const popup = toolsPopup.current, trigger = panelTrigger.current;
    const view = popup?.ownerDocument.defaultView;
    if (!popup || !trigger || !view) return;
    const place = () => {
      if (!popup.isConnected || !trigger.isConnected) return;
      popup.style.position = 'fixed';
      popup.style.transform = 'none';
      const anchor = trigger.getBoundingClientRect(), bounds = popup.getBoundingClientRect();
      const below = anchor.bottom + 8, above = anchor.top - bounds.height - 8;
      const preferred = below + bounds.height <= view.innerHeight - 12 ? below : above >= 12 ? above : below;
      popup.style.left = Math.max(12, Math.min(view.innerWidth - bounds.width - 12, anchor.left + anchor.width / 2 - bounds.width / 2)) + 'px';
      popup.style.top = Math.max(12, Math.min(view.innerHeight - bounds.height - 12, preferred)) + 'px';
    };
    place();
    view.addEventListener('resize', place);
    view.addEventListener('scroll', place, true);
    return () => { view.removeEventListener('resize', place); view.removeEventListener('scroll', place, true); };
  }, [panel]);
  function invalidate() {
    epochNow.current++;
    setEpoch(epochNow.current);
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
  function change(action: Action, playFeedback = true) {
    if (epochNow.current !== epoch || dirty || propertyNow.current || readOnlyNow.current) return;
    const previous = now.current,
      command = { ...action, revision: state.revision, context: state.context },
      next = scoreReducer(previous, command);
    if (gameMelody && (next.score.staffs.length !== 1 || next.score.staffs[0].clef !== 'treble')) return;
    now.current = next;
    dispatch(command);
    const caretMoved = action.type === 'pitch-step' && next.pitch !== previous.pitch;
    if (next.revision === previous.revision && !caretMoved) return;
    if (!playFeedback) return;
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
        '.sheet-editor-toolbar',
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
    if (propertyNow.current || readOnlyNow.current) return;
    setPanel(null);
    if (!dirty) codeBase.current = state.revision;
    invalidate();
    audio.stopAudio();
    setCodeError('');
    setCodeText(text === snapshot.code ? null : text);
    lockedNow.current = text !== snapshot.code;
  }
  function resetCode() {
    if (propertyNow.current || readOnlyNow.current) return;
    invalidate();
    setCodeText(null);
    setCodeError('');
    lockedNow.current = propertyOpen;
  }
  function applyCode() {
    if (epoch !== epochNow.current || !dirty || propertyNow.current || readOnlyNow.current) return;
    try {
      if (codeBase.current !== now.current.revision)
        throw new Error('The score changed. Reset the draft before applying.');
      const parsed = parseSheetCode(displayed);
      if (gameMelody && (parsed.staffs.length !== 1 || parsed.staffs[0].clef !== 'treble')) throw new Error('Game melody must have exactly one staff in Treble clef.');
      const action: Action = {
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
      setCodeExpanded(true);
      setCodeError(error instanceof Error ? error.message : 'Unable to read score.');
    }
  }
  function openProperty(kind: 'clef' | 'key' | 'tempo' | 'meter', staffId = state.active, anchor?: HTMLElement) {
    if (lockedNow.current || epochNow.current !== epoch || (gameMelody && kind === 'clef')) return;
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
    if (propertyNow.current !== property || propertyDraftNow.current !== propertyDraft || (gameMelody && property?.kind === 'clef')) return;
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
    else interact({ type: 'entry-accidental', value: state.accidental === value ? 'key' : value });
  }
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
      <header className="sheet-editor-heading">
        <div className="studio-title"><Link to={backTo} className="sheet-editor-back"><BrodleIcon name="home" />{backLabel}</Link><h1>Melody Studio</h1></div>
        {!onSessionChange && <span className="sheet-editor-eyebrow"><span aria-hidden="true" />Session only</span>}
        <StudioTutorial gameMelody={gameMelody} readOnly={readOnly} onOpen={() => { closePanel(false); audio.stopAudio(); }} />
      </header>
      {property && <dialog ref={propertyDialog} className="studio-property-dialog" aria-labelledby="score-property-title" onCancel={event => { event.preventDefault(); closeProperty(); }} onClick={event => { if (event.target === event.currentTarget) closeProperty(); }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); closeProperty(); } else if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'BUTTON') { event.preventDefault(); applyProperty(); } }}>
        <form onSubmit={event => { event.preventDefault(); applyProperty(); }}>
          <h2 id="score-property-title">{property.kind === 'clef' ? 'Clef' : property.kind === 'key' ? 'Key signature' : property.kind === 'tempo' ? 'Tempo' : 'Time signature'}</h2>
          <button type="button" className="studio-dialog-close studio-icon-button" aria-label="Close score properties" onClick={closeProperty}><BrodleIcon name="close" /></button>
          <p>{property.kind === 'clef' ? `Staff ${score.staffs.findIndex(item => item.id === property.staffId) + 1}` : 'Applies to the whole score'}</p>
          {(property.kind === 'clef') && <ClefChoices aria-label="Staff clef" value={propertyDraft.clef as Clef} onChange={clef => setPropertyDraft({ ...propertyDraft, clef })} />}
          {property.kind === 'key' && <div className="studio-property-preview"><NotationPreview clef={score.staffs.find(part => part.id === property.staffId)?.clef ?? 'treble'} musicalKey={propertyDraft.key as MusicalKey} /><p>{keyDescription(propertyDraft.key as MusicalKey)}</p></div>}
          {property.kind === 'key' && <label>Key signature<select aria-label="Key signature" value={propertyDraft.key} onChange={event => setPropertyDraft({ ...propertyDraft, key: event.target.value })}>{[false, true].map(minor => <optgroup key={String(minor)} label={minor ? 'Minor' : 'Major'}>{MUSICAL_KEYS.filter(key => key.endsWith('m') === minor).map(key => <option key={key} value={key}>{keyName(key)}</option>)}</optgroup>)}</select></label>}
          {property.kind === 'meter' && <div className="studio-property-preview studio-meter-preview" aria-hidden="true">{propertyDraft.numerator || '—'} / {propertyDraft.denominator}</div>}
          {property.kind === 'meter' && <div className="studio-meter-fields"><label>Numerator<input aria-label="Numerator" type="number" min="1" max="32" step="1" value={propertyDraft.numerator} onChange={event => setPropertyDraft({ ...propertyDraft, numerator: event.target.value })} /></label><span>/</span><label>Denominator<select aria-label="Denominator" value={propertyDraft.denominator} onChange={event => setPropertyDraft({ ...propertyDraft, denominator: event.target.value })}>{[1,2,4,8,16,32].map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>}
          {property.kind === 'tempo' && <><div className="studio-property-preview studio-tempo-preview" aria-label="Tempo preview"><RhythmSymbol duration={propertyDraft.duration as TempoBeat['duration']} dotted={propertyDraft.dotted} /><span>= {Number.isInteger(Number(propertyDraft.bpm)) && Number(propertyDraft.bpm) >= 20 && Number(propertyDraft.bpm) <= 400 ? propertyDraft.bpm : '—'}</span></div><fieldset className="studio-tempo-beat-choices" aria-label="Tempo beat unit"><legend>Beat unit</legend>{NOTE_VALUES.map(value => <button key={value} type="button" data-tempo-beat={value} aria-label={`${labels[value]} beat`} aria-pressed={propertyDraft.duration === value} onClick={() => setPropertyDraft({ ...propertyDraft, duration: value })}><RhythmSymbol duration={value} dotted={propertyDraft.dotted} /></button>)}</fieldset><label className="studio-check"><input type="checkbox" aria-label="Dotted tempo beat" checked={propertyDraft.dotted} onChange={event => setPropertyDraft({ ...propertyDraft, dotted: event.target.checked })} />Dotted beat</label><label>BPM<input aria-label="BPM" id="score-bpm" type="number" min="20" max="400" step="1" value={propertyDraft.bpm} onChange={event => { setPropertyDraft({ ...propertyDraft, bpm: event.target.value }); setPropertyError(''); }} /></label></>}
          {propertyError && <p role="alert">{propertyError}</p>}
          <div className="studio-dialog-actions"><button type="submit">Apply</button><button type="button" onClick={closeProperty}>Cancel</button>{property.kind === 'clef' && <button type="button" className="studio-danger" disabled={score.staffs.length === 1} onClick={() => applyProperty(true)}>Remove staff</button>}</div>
        </form>
      </dialog>}
      {panel === 'add-staff' && <dialog ref={addStaffDialog} className="studio-property-dialog" data-studio-panel aria-label="Add a staff" onCancel={event => { event.preventDefault(); closePanel(); }} onClick={event => { if (event.target === event.currentTarget) closePanel(); }} onKeyDown={event => event.stopPropagation()}>
        <button type="button" className="studio-dialog-close studio-icon-button" aria-label="Close add staff" onClick={() => closePanel()}><BrodleIcon name="close" /></button>
        <h2>Add a staff</h2><p>Choose a clef for the new staff.</p><ClefChoices aria-label="New staff clef" value={newClef} onChange={clef => { invalidate(); setNewClef(clef); }} /><div className="studio-dialog-actions"><button type="button" disabled={locked || score.staffs.length >= 4} onClick={() => { change({ type: 'add-staff', id: crypto.randomUUID(), clef: newClef }); closePanel(); }}>Create staff</button><button type="button" onClick={() => closePanel()}>Cancel</button></div>
      </dialog>}
      {children}
      <div className="sheet-editor-panel" id={labelledBy ? 'studio-score-panel' : undefined} role={labelledBy ? 'tabpanel' : undefined} aria-labelledby={labelledBy}>
        {invalidGameLayout && <p role="alert" className="studio-save-error">This saved Game melody has an unsupported staff layout. Your music is preserved in Melody code. Keep exactly one Treble staff there before continuing, or reset the score.</p>}
        <div className="studio-command-row">
          <div className="sheet-editor-tools studio-mode" role="group" aria-label="Editor mode">
            <button type="button" aria-label="Write" aria-keyshortcuts="N" aria-pressed={state.mode === 'place'} disabled={locked} onClick={() => switchMode('place')}><BrodleIcon name="music" />Write</button>
            <button type="button" aria-label="Edit" aria-keyshortcuts="E" aria-pressed={state.mode === 'edit'} disabled={locked} onClick={() => switchMode('edit')}><BrodleIcon name="edit" />Edit</button>
          </div>
          <div className="sheet-editor-history studio-primary-actions" role="group" aria-label="Playback and history">
            <button type="button" aria-label={audio.playing ? 'Stop audio' : 'Play score'} data-tooltip={audio.playing ? 'Stop audio' : 'Play score'} disabled={locked || (!hasNotes && !audio.playing)} onClick={() => { if (audio.playing) audio.stopAudio(); else if (!lockedNow.current && now.current.revision === state.revision && epochNow.current === epoch) void audio.playTimeline(performanceTimeline(score), 'testing-sheet-editor'); }}><BrodleIcon name={audio.playing ? 'stop' : 'play'} /><span>{audio.playing ? 'Stop' : 'Play'}</span></button>
            <button type="button" aria-label="Undo" data-tooltip="Undo" disabled={locked || !state.past.length} onClick={() => change({ type: 'undo' })}><BrodleIcon name="undo" /><span>Undo</span></button>
            <button type="button" aria-label="Reset score" data-tooltip="Reset score" disabled={locked || isDefaultScore(score)} onClick={() => change({ type: 'reset' })}><BrodleIcon name="restart" /><span>Reset</span></button>
          </div>
        </div>
        {dirty && <div className="studio-draft-notice" role="status">
          <BrodleIcon name="edit" /><div><strong>Unapplied code</strong><span>Apply or reset your draft to continue editing or playing the score.</span></div>
          <button type="button" onClick={() => setCodeExpanded(true)}>Review code</button>
        </div>}
        <div className="sheet-editor-toolbar" aria-label="Editing tools">
          <div className="studio-entry-kind" role="group" aria-label="Notes or rests">
            <button type="button" aria-label="Notes" data-tooltip="Notes" aria-pressed={!rhythmRest} disabled={locked || (state.mode === 'edit' && (!selected || group))} onClick={() => chooseKind('note')}><RhythmSymbol duration="quarter" /></button>
            <button type="button" aria-label="Rests" data-tooltip="Rests" aria-pressed={rhythmRest} disabled={locked || (state.mode === 'edit' && (!selected || group))} onClick={() => chooseKind('rest')}><RhythmSymbol duration="quarter" rest /></button>
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
                data-tooltip={state.mode === 'place' && state.accidental === value ? `${label} · click again to follow the key` : label}
                aria-description="In Write, press again to follow the key signature."
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
              data-tooltip="Dotted (.)"
              aria-keyshortcuts="."
              aria-pressed={state.mode === 'edit' ? Boolean(selected?.dotted) : state.dotted}
              onClick={() =>
                state.mode === 'edit'
                  ? change({ type: 'dot', value: !selected?.dotted })
                  : interact({ type: 'entry-dot', value: !state.dotted })
              }
            >
              <RhythmSymbol duration="quarter" rest={false} dotted />
            </button>
            <button type="button" aria-label="Staccato" aria-pressed={state.mode === 'edit' ? Boolean(selected?.staccato) : state.staccato}
              disabled={locked || (state.mode === 'edit' ? !selected || group || !tones.length : rhythmRest)}
              data-tooltip="Staccato" onClick={() => state.mode === 'edit'
                ? change({ type: 'staccato', value: !selected?.staccato })
                : interact({ type: 'entry-staccato', value: !state.staccato })}>
              <RhythmSymbol duration="quarter" staccato />
            </button>
            <button type="button" aria-label={tie?.tone.tieToNext ? 'Untie' : 'Tie'} aria-keyshortcuts="T"
              disabled={locked || !tie} aria-pressed={Boolean(tie?.tone.tieToNext)}
              data-tooltip={tie?.tone.tieToNext ? 'Untie (T)' : 'Tie (T)'} onClick={() => change({ type: 'tie' })}>
              <svg width="24" height="18" viewBox="0 0 24 18" aria-hidden="true"><path d="M2 14 Q12 0 22 14" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
            </button>
            <button type="button" data-studio-panel aria-label="Arpeggio" aria-haspopup="dialog" aria-expanded={panel === 'arpeggio'}
              aria-controls="studio-arpeggio" disabled={locked || group || tones.length < 2}
              data-tooltip="Arpeggio" onClick={event => togglePanel('arpeggio', event.currentTarget)}>
              <svg width="18" height="30" viewBox="0 0 18 32" aria-hidden="true" focusable="false">
                <path d="M9 3C5 5 5 7 9 9S13 13 9 15S5 19 9 21S13 25 9 27" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <button type="button" data-studio-panel aria-label="Tuplets" aria-haspopup="dialog" aria-controls="studio-tuplet-menu" aria-expanded={panel === 'tuplets'}
              disabled={locked || !tupletRest} data-tooltip="Tuplets · select a rest in Edit" onClick={event => { if (!tupletRest) return; togglePanel('tuplets', event.currentTarget); }}>
              <svg width="32" height="30" viewBox="0 0 42 34" aria-hidden="true" focusable="false">
                <path d="M4 10V5H14M28 5H38V10" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <text x="21" y="11" textAnchor="middle" fontFamily="serif" fontSize="13" fontStyle="italic" fill="currentColor">?</text>
                {[8,20,32].map(x => <g key={x}>
                  <ellipse cx={x} cy="29" rx="3.2" ry="2.1" transform={`rotate(-20 ${x} 29)`} fill="currentColor" />
                  <path d={`M${x + 2.7} 28V16`} stroke="currentColor" strokeWidth="1.3" />
                </g>)}
                <path d="M10.7 16H34.7" stroke="currentColor" strokeWidth="2.8" />
              </svg>
            </button>
            {panel === 'tuplets' && (
              <div ref={toolsPopup} id="studio-tuplet-menu" data-studio-panel role="dialog" className="studio-tools-popup studio-tuplet-popup" aria-label="Choose a tuplet" aria-describedby="sheet-editor-tuplet-hint">
                <div className="studio-popup-heading"><h3>Tuplets</h3><button type="button" className="studio-icon-button" aria-label="Close tuplets" onClick={() => closePanel()}><BrodleIcon name="close" /></button></div>
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
              </div>
            )}
            {panel === 'arpeggio' && <div ref={toolsPopup} id="studio-arpeggio" data-studio-panel role="dialog" aria-label="Arpeggio direction" className="studio-tools-popup">
              <div className="studio-popup-heading"><h3>Arpeggio</h3><button type="button" className="studio-icon-button" aria-label="Close arpeggio" onClick={() => closePanel()}><BrodleIcon name="close" /></button></div><p>Roll the selected chord without changing its written duration.</p>
              <div className="studio-choice-row">{(['off', 'up', 'down'] as const).map(value => <button key={value} type="button" disabled={locked || group || tones.length < 2}
                aria-pressed={(selected?.arpeggio ?? 'off') === value}
                onClick={() => { change({ type: 'arpeggio', value: value === 'off' ? null : value }); closePanel(); }}>
                {value === 'off' ? 'Off' : value === 'up' ? 'Ascending' : 'Descending'}
              </button>)}</div>
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
          <div className="studio-score-summary"><strong>{meterName(score.meter)}</strong><span>{totalTicks(events) / barTicks} {totalTicks(events) === barTicks ? 'measure' : 'measures'} · {score.staffs.length} {score.staffs.length === 1 ? 'staff' : 'staffs'}</span></div>
          <div className="studio-score-actions">
            <button type="button" className="studio-icon-button studio-reverb-toggle" aria-label="Light reverb" aria-pressed={audio.reverb}
              data-tooltip={audio.reverb ? 'Light reverb · on' : 'Light reverb · off'} onClick={() => audio.setReverb(!audio.reverb)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M5 4H2v16h3m14-16h3v16h-3M8 9a4 4 0 0 1 0 6m4-9a8 8 0 0 1 0 12" /></svg>
            </button>
            <div className="studio-zoom" role="group" aria-label="Score zoom">
              <button type="button" aria-label="Zoom out" disabled={zoom <= .75} onClick={() => changeZoom(zoom - .25)}>−</button>
              <button type="button" aria-label="Reset zoom" onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}%</button>
              <button type="button" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => changeZoom(zoom + .25)}>+</button>
            </div>

          </div>
        </div>
        {!invalidGameLayout && <EditableStaff
          zoom={zoom}
          fixedClef={gameMelody}
          entryKind={state.entryKind}
          staffActions={gameMelody ? undefined : <div className="studio-add-staff"><button type="button" className="studio-add-staff-button" data-studio-panel data-add-staff aria-label="Add staff" aria-haspopup="dialog" aria-expanded={panel === 'add-staff'} disabled={locked || score.staffs.length >= 4} onClick={event => togglePanel('add-staff', event.currentTarget)}>
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
        />}
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
        </footer>
      </div>
      <div role="status" className="sheet-editor-status" aria-live="polite">
        <span>{state.message}</span>

      </div>
      {audio.audioError && (
        <p role="alert" className="sheet-editor-audio-error">
          {audio.usingSynthFallback ? 'Grand piano couldn’t load. Using Synth as a backup.' : audio.audioError} You can keep editing the score.
        </p>
      )}
      <StudioPiano audio={audio} locked={locked || invalidGameLayout} mode={state.mode} selectedPitches={selectedPitches(state)}
        onNote={midi => { if (!lockedNow.current) change({ type: 'piano-note', midi, id: crypto.randomUUID() }, false); }} />
      <SheetCodeEditor
        expanded={codeExpanded}
        onExpandedChange={setCodeExpanded}
        value={displayed}
        dirty={dirty}
        error={codeError}
        range={range}
        selectionVersion={state.context}
        linkMissing={Boolean(linked && !range)}
        blocked={propertyOpen || readOnly}
        onChange={editCode}
        onApply={applyCode}
        onReset={resetCode}
      />
      <details className="studio-support">
        <summary><BrodleIcon name="help" /><span>Help and shortcuts</span></summary>
        <aside className="sheet-editor-help">
          <div>
            <h2>Compose together</h2>
            <p>
              {gameMelody ? 'Game melody uses one staff in Treble clef. Switch to Victory melody for additional staffs. ' : 'Use up to four staffs with independent Treble, Bass, Alto or Tenor clefs and shared tempo, key and measures. '}
              New staff notes follow the key signature. Sharp, Flat and Natural override it; press the selected accidental again to follow the key.
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
              fills a rest and selects it; at the end it adds a measure automatically. Escape or Left/Right clears the selection.
              The visible note-value buttons set the next entry. Edit: the top note values, Notes/Rests, Dotted and accidental tools change
              the selection. New notes and duration edits consume rests, then carry later notes into new measures
              as needed; notes crossing barlines display tied segments. Click a head; Shift-click
              toggles more notes across staffs. Up/Down auditions a semitone move for the selection;
              Delete removes those tones without moving time. Escape clears selection. Ctrl/⌘ Z on the staff
              undoes a score edit.
            </p>
          </div>
          <p className="sheet-editor-limit">
            Pointer entry: Treble F3–F6, Bass F1–F6, Alto G2–F6, Tenor E2–F6. Code/arrows: MIDI 0–127. Four staffs, 64 events
            per staff including rests, eight tones per chord. The score wraps into rows with normal
            page scrolling. {onSessionChange ? 'Both melodies are backed up by Studio; reloading starts a fresh Undo history.' : 'Leaving/reloading resets this transient sketch.'}
          </p>
        </aside>
      </details>
    </main>
  );
}
