import { tupletEvents, removeTuplet, tiedEvents, arpeggioEvents } from './sheetEditorExpressions';
import { MUSICAL_KEYS } from '../../brodle/lib/musicGame';
import type { MusicalKey } from '../../brodle/lib/musicGame';
import {
  composeScore,
  isClef,
  cleanRelations,
  protectedSpans,
  editorReducer,
  emptyEditor,
  eventTones,
  importedScore,
  initialEvents,
  isInitialScore,
  isNaturalPitch,
  pitchMidi,
  rhythmTargets,
  sameScore,
  scoreSteps,
  shiftPitch,
  spellMidi,
  timedEvents,
  totalTicks,
  eventTicks,
  NOTE_VALUES,
  NOTE_TICKS,
  TUPLET_RATIOS,
  resizedEvents,
  validPitch,
  validMidi,
  withTones,
  rebarEvents, measureTicks, validMeter, validTempoBeat, DEFAULT_METER, DEFAULT_TEMPO_BEAT, meterName,
} from './sheetEditorModel';
import type {
  Accidental,
  EditorAction,
  EditorMode,
  ImportedStep,
  NoteValue,
  ScoreEvent,
  WrittenPitch,
} from './sheetEditorModel';

import type { Meter, TempoBeat } from './sheetEditorRhythm';

import type { Clef } from './sheetEditorClefs';
export type { Clef } from './sheetEditorClefs';
export type Staff = { id: string; clef: Clef; events: ScoreEvent[] };
export type Score = { meter: Meter; tempoBeat: TempoBeat; bpm: number; key: MusicalKey; staffs: Staff[] };
export type NoteRef = { staffId: string; eventId: string; toneId: string };
export type ScoreState = {
  score: Score;
  past: Score[];
  revision: number;
  context: number;
  mode: EditorMode;
  entryKind: 'note' | 'rest';
  active: string;
  selection: NoteRef[];
  rest: { staffId: string; eventId: string } | null;
  target: { staffId: string; eventId: string } | null;
  tick: number;
  pitch: number;
  duration: NoteValue;
  dotted: boolean;
  staccato: boolean;
  accidental: Accidental;
  message: string;
};
export type ImportStaff = { id: string; clef: Clef; steps: ImportedStep[] };
export type ImportedScore = { meter?: Meter; tempoBeat?: TempoBeat; bpm: number; key: MusicalKey; staffs: ImportStaff[] };
export type Action = (
  | { type: 'entry-kind'; value: 'note' | 'rest' }
  | { type: 'meter'; value: Meter }
  | { type: 'tempo'; bpm: number; beat: TempoBeat }
  | { type: 'skip-rest'; duration: NoteValue }
  | { type: 'rest-value'; duration: NoteValue }
  | { type: 'event-duration'; duration: NoteValue }
  | { type: 'apply-tuplet'; staffId: string; eventId: string; count: number; duration: NoteValue; id: string }
  | { type: 'entry-dot'; value: boolean }
  | { type: 'entry-staccato'; value: boolean }
  | { type: 'staccato'; value: boolean }
  | { type: 'dot'; value: boolean }
  | { type: 'tie'; value?: boolean }
  | { type: 'arpeggio'; value: 'up' | 'down' | null }
  | { type: 'tuplet'; count: number; duration: NoteValue; id: string }
  | { type: 'remove-tuplet' }
  | { type: 'mode'; mode: EditorMode }
  | { type: 'activate'; staffId: string }
  | { type: 'select'; staffId: string; eventId: string; toneId?: string; toggle?: boolean }
  | { type: 'clear-selection' }
  | { type: 'tool'; duration: NoteValue }
  | { type: 'entry-accidental'; value: Accidental }
  | { type: 'caret'; tick: number; pitch: number; staffId?: string }
  | { type: 'pitch-step'; delta: -1 | 1 }
  | { type: 'part'; staffId?: string; action: EditorAction }
  | { type: 'transpose'; delta: -1 | 1 }
  | { type: 'delete-selection' }
  | { type: 'bpm'; value: number }
  | { type: 'key'; value: MusicalKey }
  | { type: 'clef'; staffId: string; value: Clef }
  | { type: 'add-staff'; id: string; clef: Clef }
  | { type: 'remove-staff'; staffId: string }
  | { type: 'add-measure' }
  | { type: 'reset' }
  | { type: 'undo' }
  | { type: 'apply'; value: ImportedScore; seed: string }
) & { revision?: number; context?: number };
const SHARPS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'],
  FLATS = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
const MAJOR = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const MINOR = [
  'Abm',
  'Ebm',
  'Bbm',
  'Fm',
  'Cm',
  'Gm',
  'Dm',
  'Am',
  'Em',
  'Bm',
  'F#m',
  'C#m',
  'G#m',
  'D#m',
  'A#m',
];
export function keyAccidentals(key: MusicalKey): Record<string, number> {
  const count = (key.endsWith('m') ? MINOR : MAJOR).indexOf(key) - 7;
  return Object.fromEntries(
    (count < 0 ? FLATS : SHARPS)
      .slice(0, Math.abs(count))
      .map((letter) => [letter, count < 0 ? -1 : 1]),
  );
}
export function inputPitch(
  pitch: number,
  accidental: Accidental | 'key',
  key: MusicalKey,
): WrittenPitch {
  const written = spellMidi(pitch);
  return {
    ...written,
    accidental:
      accidental === 'key'
        ? ((keyAccidentals(key)[written.letter] ?? 0) as Accidental)
        : accidental,
  };
}
export const primary = (state: ScoreState) => state.selection[state.selection.length - 1] ?? null;
export const refKey = (ref: NoteRef) => JSON.stringify([ref.staffId, ref.eventId, ref.toneId]);
export function toneFor(score: Score, ref: NoteRef) {
  return eventTones(
    score.staffs
      .find((staff) => staff.id === ref.staffId)
      ?.events.find((event) => event.id === ref.eventId) ?? {
      id: '',
      midi: null,
      duration: 'quarter',
    },
  ).find((tone) => tone.id === ref.toneId);
}
export function initialScore(): Score {
  return {
    meter: { ...DEFAULT_METER },
    tempoBeat: { ...DEFAULT_TEMPO_BEAT },
    bpm: 120,
    key: 'C',
    staffs: [{ id: 'staff-1', clef: 'treble', events: initialEvents() }],
  };
}
export function emptyScore(): ScoreState {
  return {
    score: initialScore(),
    past: [],
    revision: 0,
    context: 0,
    mode: 'place',
    entryKind: 'note',
    active: 'staff-1',
    selection: [],
    rest: null,
    target: null,
    tick: 0,
    pitch: 64,
    duration: 'quarter',
    dotted: false,
    staccato: false,
    accidental: 0,
    message: 'Choose a value and fill a rest.',
  };
}
export const validStaffId = (id: unknown): id is string =>
  typeof id === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(id);
export function importScore(previous: Score, value: ImportedScore, seed: string): Score | null {
  if (
    !Number.isInteger(value.bpm) ||
    value.bpm < 20 ||
    value.bpm > 400 ||
    !MUSICAL_KEYS.includes(value.key) ||
    !value.staffs.length ||
    value.staffs.length > 4 ||
    new Set(value.staffs.map((s) => s.id)).size !== value.staffs.length
  )
    return null;
  const meter = value.meter ?? DEFAULT_METER, tempoBeat = value.tempoBeat ?? DEFAULT_TEMPO_BEAT;
  if (!validMeter(meter) || !validTempoBeat(tempoBeat)) return null;
  const bar = measureTicks(meter), staffs: Staff[] = [];
  for (const staff of value.staffs) {
    if (!validStaffId(staff.id) || !isClef(staff.clef)) return null;
    const events = importedScore(
      previous.staffs.find((s) => s.id === staff.id)?.events ?? [],
      staff.steps,
      seed + staff.id,
      bar,
    );
    if (!events) return null;
    staffs.push({ id: staff.id, clef: staff.clef, events });
  }
  if (staffs.some((s) => totalTicks(s.events) !== totalTicks(staffs[0].events))) return null;
  if (!totalTicks(staffs[0].events) || totalTicks(staffs[0].events) % bar) return null;
  return { bpm: value.bpm, key: value.key, meter: { ...meter }, tempoBeat: { ...tempoBeat }, staffs };
}
export function equalScore(a: Score, b: Score) {
  return (
    meterName(a.meter) === meterName(b.meter) &&
    (a.tempoBeat?.duration ?? 'quarter') === (b.tempoBeat?.duration ?? 'quarter') &&
    Boolean(a.tempoBeat?.dotted) === Boolean(b.tempoBeat?.dotted) &&
    a.bpm === b.bpm &&
    a.key === b.key &&
    a.staffs.length === b.staffs.length &&
    a.staffs.every(
      (s, i) =>
        s.id === b.staffs[i].id &&
        s.clef === b.staffs[i].clef &&
        sameScore(s.events, b.staffs[i].events),
    )
  );
}
function settings(state: ScoreState, score: Score, message: string) {
  const next = commit(state, score, message);
  return next === state ? state : { ...next, selection: state.selection, rest: state.rest };
}
function commit(state: ScoreState, score: Score, message: string): ScoreState {
  const cleaned = score.staffs.map((s) => ({ ...s, ...cleanRelations(s.events) }));
  const removed = cleaned.reduce((n, s) => n + s.removed, 0);
  if (removed) {
    score = {
      ...score,
      staffs: cleaned.map(({ removed: _removed, ...s }) => {
        void _removed;
        return s;
      }),
    };
    message += ' Invalidated ties removed.';
  }
  const lostArpeggios = state.score.staffs.reduce(
    (n, staff) =>
      n +
      staff.events.filter(
        (event) =>
          event.arpeggio &&
          score.staffs
            .find((s) => s.id === staff.id)
            ?.events.some((e) => e.id === event.id && eventTones(e).length < 2),
      ).length,
    0,
  );
  if (lostArpeggios) message += ' Arpeggio removed from a single note or rest.';
  if (equalScore(state.score, score)) return state;
  const active = score.staffs.some((s) => s.id === state.active)
    ? state.active
    : score.staffs[0].id;
  return {
    ...state,
    score,
    active,
    past: [...state.past.slice(-63), state.score],
    revision: state.revision + 1,
    context: state.context + 1,
    selection: [],
    rest: null,
    target: null,
    tick: rhythmTargets(score.staffs.find((s) => s.id === active)!.events, state.duration).reduce(
      (best, t) => (Math.abs(t - state.tick) < Math.abs(best - state.tick) ? t : best),
      0,
    ),
    message,
  };
}
// Extend every part together; a capacity failure in any part cancels the edit.
export function scoreWithPartEvents(score: Score, staffId: string, events: ScoreEvent[]): Score | null {
  if (!score.staffs.some(part => part.id === staffId) || totalTicks(events) < totalTicks(score.staffs[0].events)) return null;
  const capacity = totalTicks(events),
    staffs: Staff[] = [];
  for (const part of score.staffs) {
    const next =
      part.id === staffId
        ? events
        : capacity === totalTicks(part.events)
          ? part.events
          : composeScore(part.events, protectedSpans(part.events), capacity, `${staffId}:resize`, measureTicks(score.meter));
    if (!next) return null;
    staffs.push(next === part.events ? part : { ...part, events: next });
  }
  return { ...score, staffs };
}
function resizeEvent(state: ScoreState, staff: Staff, event: ScoreEvent): ScoreState {
  const events = resizedEvents(staff.events, event.id, event, measureTicks(state.score.meter)),
    score = events && scoreWithPartEvents(state.score, staff.id, events);
  if (!score)
    return reject(
      state,
      'This change cannot fit the group rules or the 64-event limit in every part. Nothing changed.',
    );
  const next = commit(
    state,
    score,
    'Duration updated. Available rests used; later notes carried forward where needed.',
  );
  if (next === state) return state;
  const span = timedEvents(events!).find((s) => s.event.id === event.id)!,
    targets = rhythmTargets(events!, state.duration);
  return {
    ...next,
    selection: state.selection.filter((r) => toneFor(next.score, r)),
    rest: eventTones(event).length ? null : { staffId: staff.id, eventId: event.id },
    active: staff.id,
    tick: state.mode === 'place' ? (targets.find((t) => t >= span.end) ?? span.end) : next.tick,
  };
}
const reject = (state: ScoreState, message: string) => ({ ...state, message });
// Validate every selected destination against the final chord, so selected notes
// may move into each other's old positions without allowing partial updates.
function batch(state: ScoreState, delta?: -1 | 1): ScoreState {
  if (!state.selection.length) return state;
  if (
    new Set(state.selection.map(refKey)).size !== state.selection.length ||
    state.selection.some((ref) => !toneFor(state.score, ref))
  )
    return reject(state, 'Selection changed. Select the notes again.');
  const refs = new Set(state.selection.map(refKey));
  const staffs: Staff[] = [];
  for (const staff of state.score.staffs) {
    let changed = false;
    const events = staff.events.map((event) => {
      const tones = eventTones(event),
        next = tones.flatMap((tone) => {
          if (!refs.has(refKey({ staffId: staff.id, eventId: event.id, toneId: tone.id })))
            return [tone];
          changed = true;
          return delta === undefined
            ? []
            : [{ ...tone, spelling: spellMidi(pitchMidi(tone.spelling) + delta, delta) }];
        });
      return next.length ? withTones(event, next) : withTones(event, []);
    });
    if (!changed) {
      staffs.push(staff);
      continue;
    }
    if (
      events.some(
        (event) =>
          eventTones(event).some((t) => !validPitch(t.spelling)) ||
          new Set(eventTones(event).map((t) => pitchMidi(t.spelling))).size !==
            eventTones(event).length,
      )
    )
      return reject(
        state,
        'All selected notes must fit MIDI 0–127 without colliding with a chordmate. Nothing changed.',
      );
    const normalized =
      delta === undefined
        ? composeScore(
            staff.events,
            protectedSpans(events),
            totalTicks(staff.events),
            `delete-${state.revision}`,
            measureTicks(state.score.meter),
          )
        : events;
    if (!normalized)
      return reject(
        state,
        'Deleting those notes would exceed 64 events in a staff. Nothing changed.',
      );
    staffs.push({ ...staff, events: normalized });
  }
  const next = commit(
    state,
    { ...state.score, staffs },
    delta === undefined
      ? 'Selected notes replaced with silence.'
      : 'Selected notes moved one semitone.',
  );
  return delta === undefined ? next : { ...next, selection: state.selection };
}
// Infer a written value that preserves the selected rest (or empty group's) time.
export function tupletValueForRest(score: Score, staffId: string, eventId: string, count: number): NoteValue | null {
  const staff = score.staffs.find(part => part.id === staffId);
  const rest = staff?.events.find(event => event.id === eventId);
  const ratio = TUPLET_RATIOS[count];
  if (!staff || !rest || !ratio || eventTones(rest).length) return null;
  const members = rest.tuplet ? staff.events.filter(event => event.tuplet?.id === rest.tuplet?.id) : [rest];
  if (members.some(event => eventTones(event).length)) return null;
  const ticks = totalTicks(members);
  return NOTE_VALUES.find(value => NOTE_TICKS[value] * ratio === ticks) ?? null;
}
// Targeted transaction shared by tuplet previews and commands.
export function scoreWithTuplet(score: Score, staffId: string, eventId: string, count: number, duration: NoteValue, id: string): Score | null {
  const staff = score.staffs.find(part => part.id === staffId);
  if (!staff) return null;
  const events = tupletEvents(staff.events, eventId, count, duration, id, measureTicks(score.meter));
  if (!events) return null;
  if (sameScore(events, staff.events)) return score;
  return { ...score, staffs: score.staffs.map(part => part.id === staffId ? { ...part, events } : part) };
}
export function scoreReducer(state: ScoreState, action: Action): ScoreState {
  const bar = measureTicks(state.score.meter);
  if (
    (action.revision !== undefined && action.revision !== state.revision) ||
    (action.context !== undefined && action.context !== state.context)
  )
    return state;
  const active = state.score.staffs.find((s) => s.id === state.active)!;
  switch (action.type) {
    case 'apply-tuplet': {
      if (state.mode !== 'edit') return reject(state, 'Switch to Edit melody to apply tuplets to a rest.');
      const score = scoreWithTuplet(state.score, action.staffId, action.eventId, action.count, action.duration, action.id);
      if (!score) return reject(state, 'Tuplets need an empty rest span within one bar, with no notes or occupied groups, and at most 64 events. Nothing changed.');
      const next = commit(state, score, 'Tuplet applied to the rest.');
      if (next === state) return state;
      const targetStaff = state.score.staffs.find(part => part.id === action.staffId)!;
      const groupId = targetStaff.events.find(event => event.id === action.eventId)?.tuplet?.id ?? action.id;
      const first = timedEvents(score.staffs.find(part => part.id === action.staffId)!.events).find(span => span.event.tuplet?.id === groupId)!;
      return { ...next, active: action.staffId, rest: { staffId: action.staffId, eventId: first.event.id }, tick: first.start };
    }
    case 'entry-kind': {
      if (!['note','rest'].includes(action.value)) return state;
      if (state.mode === 'place') return { ...state, entryKind: action.value };
      const choice = primary(state) ?? state.rest;
      const staff = choice && state.score.staffs.find(part => part.id === choice.staffId);
      const event = staff?.events.find(item => item.id === choice?.eventId);
      if (!staff || !event || state.selection.length > 1) return state;
      if ((eventTones(event).length ? 'note' : 'rest') === action.value) return state;
      const updated = action.value === 'rest'
        ? { ...withTones(event, []), authored: true }
        : withTones(event, [{ id: event.id + ':tone', spelling: inputPitch(state.pitch, state.accidental, state.score.key) }]);
      if (eventTones(updated).some(tone => !validPitch(tone.spelling))) return reject(state, 'This pitch is outside MIDI 0–127.');
      const score = { ...state.score, staffs: state.score.staffs.map(part => part.id === staff.id ? { ...part, events: part.events.map(item => item.id === event.id ? updated : item) } : part) };
      const next = commit(state, score, action.value === 'rest' ? 'Converted to a rest.' : 'Converted to the entry pitch.');
      const tone = eventTones(updated)[0];
      return { ...next, entryKind: action.value, rest: tone ? null : { staffId: staff.id, eventId: updated.id }, selection: tone ? [{ staffId: staff.id, eventId: updated.id, toneId: tone.id }] : [] };
    }
    case 'tempo':
      return Number.isInteger(action.bpm) && action.bpm >= 20 && action.bpm <= 400 && validTempoBeat(action.beat)
        ? settings(state, { ...state.score, bpm: action.bpm, tempoBeat: { ...action.beat } }, 'Tempo updated.') : reject(state, 'Use a supported beat and an integer BPM from 20 to 400.');
    case 'meter': {
      if (!validMeter(action.value)) return reject(state, 'Choose a numerator from 1 to 32 and a supported denominator.');
      if (meterName(state.score.meter) === meterName(action.value)) return state;
      const length = measureTicks(action.value);
      const changed = state.score.staffs.map(staff => ({ ...staff, events: rebarEvents(staff.events, length) }));
      if (changed.some(staff => !staff.events)) return reject(state, 'This meter cannot contain a tuplet group or fit the 64-event limit. Nothing changed.');
      const capacity = Math.max(...changed.map(staff => totalTicks(staff.events!)));
      const staffs: Staff[] = [];
      for (const staff of changed) {
        const events = composeScore(staff.events!, protectedSpans(staff.events!), capacity, 'meter-' + staff.id, length);
        if (!events) return reject(state, 'A staff would exceed 64 events. Nothing changed.');
        staffs.push({ ...staff, events });
      }
      return commit(state, { ...state.score, meter: { ...action.value }, staffs }, 'Time signature updated; written values preserved.');
    }
    case 'skip-rest': {
      if (
        state.mode !== 'place' ||
        !NOTE_VALUES.includes(action.duration as (typeof NOTE_VALUES)[number])
      )
        return state;
      const spans = timedEvents(active.events),
        slot = spans.find((s) => s.start <= state.tick && s.end > state.tick),
        end =
          state.tick +
          (slot?.event.tuplet
            ? eventTicks(slot.event)
            : eventTicks({ duration: action.duration, dotted: state.dotted }));
      if (
        !slot ||
        state.tick < 0 ||
        !Number.isSafeInteger(state.tick) ||
        (slot.event.tuplet && slot.start !== state.tick) ||
        end > totalTicks(active.events) ||
        spans.some(
          (s) =>
            s.start < end &&
            s.end > state.tick &&
            (eventTones(s.event).length || (s.event.tuplet && s !== slot)),
        )
      )
        return reject(state, 'Skip rest needs enough existing silence. No notes were changed.');
      return {
        ...state,
        tick: end,
        selection: [],
        rest: null,
        target: null,
        context: state.context + 1,
        message:
          end === totalTicks(active.events)
            ? 'End of score. Enter the next note to add a measure.'
            : 'Rest skipped. The score is unchanged.',
      };
    }
    case 'event-duration':
    case 'rest-value': {
      const choice = primary(state) ?? state.rest,
        staff = choice && state.score.staffs.find((s) => s.id === choice.staffId),
        event = staff?.events.find((e) => e.id === choice?.eventId);
      if (
        state.mode !== 'edit' ||
        state.selection.length > 1 ||
        !event ||
        !staff ||
        event.tuplet ||
        !NOTE_VALUES.includes(action.duration as (typeof NOTE_VALUES)[number])
      )
        return state;
      return resizeEvent(state, staff, {
        ...(action.type === 'rest-value' ? withTones(event, []) : event),
        duration: action.duration,
        ...(!eventTones(event).length || action.type === 'rest-value' ? { authored: true } : {}),
      });
    }
    case 'entry-dot':
      return state.mode === 'place' ? { ...state, dotted: action.value } : state;
    case 'entry-staccato':
      return state.mode === 'place' ? { ...state, staccato: action.value } : state;
    case 'staccato': {
      if (state.mode !== 'edit' || state.selection.length !== 1) return state;
      const ref = primary(state), staff = ref && state.score.staffs.find(part => part.id === ref.staffId);
      const event = staff?.events.find(event => event.id === ref?.eventId);
      if (!staff || !event || !eventTones(event).length || Boolean(event.staccato) === action.value) return state;
      const next = commit(state, { ...state.score, staffs: state.score.staffs.map(part => part.id === staff.id
        ? { ...part, events: part.events.map(item => item.id === event.id ? { ...item, staccato: action.value || undefined } : item) }
        : part) }, 'Staccato updated.');
      return { ...next, selection: state.selection };
    }
    case 'dot':
    case 'tie':
    case 'arpeggio':
    case 'tuplet':
    case 'remove-tuplet': {
      if ((action.type === 'tuplet' || action.type === 'remove-tuplet') && state.mode !== 'edit') return reject(state, 'Switch to Edit melody to edit tuplets.');
      const ref = primary(state),
        choice = ref ?? state.rest,
        staff = choice && state.score.staffs.find((s) => s.id === choice.staffId);
      if (!choice || !staff) return reject(state, 'Select a note or an Edit-mode rest first.');
      if (action.type !== 'tie' && state.selection.length > 1)
        return reject(state, 'Select one event for this action.');
      if (action.type === 'tie' && state.selection.some((r) => r.staffId !== staff.id))
        return reject(state, 'Ties stay within one part.');
      if (action.type === 'dot') {
        const event = staff.events.find((e) => e.id === choice.eventId);
        if (!event || event.tuplet || event.duration === 'thirty-second') return state;
        return resizeEvent(state, staff, {
          ...event,
          dotted: action.value,
          ...(!eventTones(event).length ? { authored: true } : {}),
        });
      }
      const events =
        action.type === 'tie'
          ? tiedEvents(staff.events, state.selection, action.value)
          : action.type === 'arpeggio'
            ? arpeggioEvents(staff.events, choice.eventId, action.value)
            : action.type === 'tuplet'
              ? tupletEvents(staff.events, choice.eventId, action.count, action.duration, action.id, bar)
              : removeTuplet(staff.events, choice.eventId, bar);
      if (!events)
        return reject(
          state,
          action.type === 'tie'
            ? 'Tie matching written pitches in touching adjacent events of one staff.'
            : 'This change must fit available silence, the group rules and the 64-event cap. Nothing changed.',
        );
      const next = commit(
        state,
        {
          ...state.score,
          staffs: state.score.staffs.map((s) => (s.id === staff.id ? { ...s, events } : s)),
        },
        'Notation updated.',
      );
      if (next === state) return state;
      const keptSelection = state.selection.filter((r) => toneFor(next.score, r));
      const first =
        action.type === 'tuplet'
          ? events.find(
              (e) =>
                e.tuplet?.id ===
                (staff.events.find((e) => e.id === choice.eventId)?.tuplet?.id ?? action.id),
            )
          : null;
      const rest = first
        ? { staffId: staff.id, eventId: first.id }
        : state.rest && events.some((e) => e.id === state.rest!.eventId)
          ? state.rest
          : null;
      const slot = first && timedEvents(events).find((s) => s.event.id === first.id);
      return {
        ...next,
        selection: keptSelection,
        rest,
        tick: slot ? slot.start : next.tick,
      };
    }

    case 'mode':
      return action.mode === state.mode
        ? state
        : {
            ...state,
            mode: action.mode,
            selection: [],
            target: null,
            rest: null,
            context: state.context + 1,
          };
    case 'activate':
      return !state.score.staffs.some((s) => s.id === action.staffId)
        ? state
        : {
            ...state,
            active: action.staffId,
            selection: [],
            target: null,
            rest: null,
            context: state.context + 1,
          };
    case 'clear-selection':
      return { ...state, selection: [], target: null, rest: null, context: state.context + 1 };
    case 'select': {
      const staff = state.score.staffs.find((s) => s.id === action.staffId),
        span = staff && timedEvents(staff.events).find((s) => s.event.id === action.eventId);
      if (!staff || !span) return state;
      const tones = eventTones(span.event),
        old = primary(state);
      const tone =
        tones.find(
          (t) =>
            t.id ===
            (action.toneId ??
              (old?.eventId === action.eventId && old.staffId === staff.id
                ? old.toneId
                : undefined)),
        ) ?? (!action.toneId ? tones[0] : undefined);
      if (action.toneId && !tone) return state;
      if (state.mode === 'place')
        return {
          ...state,
          active: staff.id,
          tick: span.start,
          selection: tone ? [{ staffId: staff.id, eventId: span.event.id, toneId: tone.id }] : [],
          rest: null,
          target: tones.length ? { staffId: staff.id, eventId: span.event.id } : null,
          context: state.context + 1,
        };
      if (!tone)
        return action.toggle
          ? state
          : {
              ...state,
              selection: [],
              target: null,
              rest: { staffId: staff.id, eventId: span.event.id },
              active: staff.id,
              context: state.context + 1,
            };
      const ref = { staffId: staff.id, eventId: span.event.id, toneId: tone.id },
        found = state.selection.some((r) => refKey(r) === refKey(ref));
      const selection = action.toggle
        ? found
          ? state.selection.filter((r) => refKey(r) !== refKey(ref))
          : [...state.selection, ref]
        : [ref];
      return {
        ...state,
        selection,
        active: selection[selection.length - 1]?.staffId ?? staff.id,
        rest: null,
        target: null,
        context: state.context + 1,
      };
    }
    case 'tool':
      return state.mode !== 'place' ? state : { ...state, duration: action.duration };
    case 'entry-accidental':
      return state.mode !== 'place' || ![-1, 0, 1].includes(action.value) ? state : { ...state, accidental: action.value };
    case 'caret': {
      const staff = state.score.staffs.find((s) => s.id === (action.staffId ?? state.active));
      return state.mode !== 'place' ||
        !staff ||
        !isNaturalPitch(action.pitch) ||
        !rhythmTargets(staff.events, state.duration).includes(action.tick)
        ? state
        : {
            ...state,
            tick: action.tick,
            pitch: action.pitch,
            active: staff.id,
            target: null,
            selection: [],
            rest: null,
          };
    }
    case 'pitch-step': {
      if (state.mode !== 'place' || state.selection.length) return state;
      const pitch = shiftPitch(state.pitch, action.delta);
      if (!validPitch(inputPitch(pitch, state.accidental, state.score.key)))
        return reject(state, 'Pitch boundary reached (MIDI 0–127).');
      return {
        ...state,
        pitch,
        message: pitch === state.pitch ? 'Pitch boundary reached (MIDI 0–127).' : state.message,
      };
    }
    case 'transpose':
      return state.mode === 'edit' || (state.mode === 'place' && state.selection.length === 1)
        ? batch(state, action.delta)
        : state;
    case 'delete-selection':
      return state.mode === 'edit' ? batch(state) : state;
    case 'bpm':
      return Number.isInteger(action.value) && action.value >= 20 && action.value <= 400
        ? settings(state, { ...state.score, bpm: action.value }, 'Tempo updated.')
        : reject(state, 'Use an integer BPM from 20 to 400.');
    case 'key':
      return MUSICAL_KEYS.includes(action.value)
        ? settings(
            state,
            { ...state.score, key: action.value },
            'Key signature updated; existing pitches preserved.',
          )
        : state;
    case 'clef':
      return isClef(action.value)
        ? settings(
            state,
            {
              ...state.score,
              staffs: state.score.staffs.map((s) =>
                s.id === action.staffId ? { ...s, clef: action.value } : s,
              ),
            },
            'Clef updated; pitches preserved.',
          )
        : state;
    case 'add-staff': {
      if (
        state.score.staffs.length >= 4 ||
        !validStaffId(action.id) ||
        state.score.staffs.some((s) => s.id === action.id) ||
        !isClef(action.clef)
      )
        return reject(state, 'Use one to four staffs with unique IDs.');
      const events = composeScore([], [], totalTicks(active.events), action.id, bar);
      if (!events) return reject(state, 'The new staff needs more than 64 rests.');
      return {
        ...commit(
          state,
          {
            ...state.score,
            staffs: [...state.score.staffs, { id: action.id, clef: action.clef, events }],
          },
          'Staff added.',
        ),
        active: action.id,
      };
    }
    case 'remove-staff':
      return state.score.staffs.length > 1
        ? commit(
            state,
            { ...state.score, staffs: state.score.staffs.filter((s) => s.id !== action.staffId) },
            'Staff removed. Undo restores it.',
          )
        : state;
    case 'add-measure': {
      const staffs: Staff[] = [];
      for (const staff of state.score.staffs) {
        const events = composeScore(
          staff.events,
          protectedSpans(staff.events),
          totalTicks(staff.events) + bar,
          `bar-${state.revision}-${staff.id}`,
          bar,
        );
        if (!events) return reject(state, 'A staff would exceed 64 events. No measures added.');
        staffs.push({ ...staff, events });
      }
      return commit(
        state,
        { ...state.score, staffs },
        'Added a rest-filled measure to every staff.',
      );
    }
    case 'reset': {
      const next = commit(state, initialScore(), 'Reset to one treble staff, C major, 120 BPM.');
      return next === state ? state : { ...next, tick: 0, pitch: 64, accidental: 0, duration: 'quarter', dotted: false, staccato: false, entryKind: 'note' };
    }
    case 'undo': {
      const score = state.past[state.past.length - 1];
      return !score
        ? state
        : {
            ...state,
            score,
            past: state.past.slice(0, -1),
            active: score.staffs.some((s) => s.id === state.active)
              ? state.active
              : score.staffs[0].id,
            revision: state.revision + 1,
            context: state.context + 1,
            selection: [],
            rest: null,
            target: null,
            tick: 0,
            message: 'Previous score restored.',
          };
    }
    case 'apply': {
      const score = importScore(state.score, action.value, action.seed);
      return score
        ? commit(state, score, 'Code applied as one score.')
        : reject(
            state,
            'Invalid score. Every staff must fit complete equal measures and the event cap.',
          );
    }
    case 'part': {
      if (
        !['fill', 'add-tone', 'update', 'duration', 'delete', 'accidental', 'remove-tone'].includes(
          action.action.type,
        )
      )
        return state;
      const staff = state.score.staffs.find((s) => s.id === (action.staffId ?? state.active));
      if (!staff) return state;
      const ref = primary(state),
        rest = state.rest;
      const singleton = state.selection.length === 1 && ref?.staffId === staff.id;
      if (
        state.selection.length > 1 &&
        ['update', 'duration', 'delete', 'accidental', 'remove-tone'].includes(action.action.type)
      )
        return state;
      if (action.action.type === 'duration') {
        if (
          !singleton ||
          action.action.id !== ref?.eventId ||
          !NOTE_VALUES.includes(action.action.duration as (typeof NOTE_VALUES)[number])
        )
          return state;
        const event = staff.events.find((e) => e.id === ref.eventId);
        return event && !event.tuplet
          ? resizeEvent(state, staff, { ...event, duration: action.action.duration })
          : state;
      }
      let partAction = action.action;
      if ('pitch' in partAction && !validMidi(partAction.pitch)) return reject(state, 'Choose a MIDI pitch from 0 to 127.');
      const accidental = inputPitch(
        'pitch' in partAction ? partAction.pitch : state.pitch,
        state.accidental,
        state.score.key,
      ).accidental;
      if (partAction.type === 'add-tone' && !partAction.spelling)
        partAction = {
          ...partAction,
          spelling: inputPitch(partAction.pitch, state.accidental, state.score.key),
        };
      // Reuse the pure single-part transition; only the complete score snapshot
      // below enters history. The temporary reducer's history is discarded.
      const temporary = {
        ...emptyEditor(),
        measureTicks: bar,
        meter: state.score.meter,
        entryKind: state.entryKind,
        events: staff.events,
        tick: state.tick,
        pitch: state.pitch,
        mode: state.mode,
        duration: state.duration,
        dotted: state.dotted,
        staccato: state.staccato,
        accidental,
        selectedId: singleton ? ref.eventId : rest?.staffId === staff.id ? rest.eventId : null,
        selectedToneId: singleton ? ref.toneId : null,
      };
      const result = editorReducer(temporary, partAction);
      if (result.events === staff.events)
        return result.message === temporary.message ? state : reject(state, result.message);
      const projected = scoreWithPartEvents(state.score, staff.id, result.events);
      if (!projected) return reject(state, 'A staff would exceed 64 events. Nothing changed.');
      const next = commit(state, projected, result.message);
      const placed =
        state.mode === 'place' && (partAction.type === 'fill' || partAction.type === 'add-tone')
          ? result.events.find((e) => e.id === partAction.id)
          : null;
      const placedTone =
        placed &&
        (partAction.type === 'add-tone'
          ? eventTones(placed).find((t) => t.id === partAction.toneId)
          : eventTones(placed)[0]);
      const selection =
        placed && placedTone
          ? [{ staffId: staff.id, eventId: placed.id, toneId: placedTone.id }]
          : result.selectedId && result.selectedToneId
            ? [{ staffId: staff.id, eventId: result.selectedId, toneId: result.selectedToneId }]
            : [];
      return {
        ...next,
        active: staff.id,
        selection,
        tick: result.tick,
        pitch: result.pitch,
        target: result.targetId ? { staffId: staff.id, eventId: result.targetId } : null,
      };
    }
  }
}
export function selectedPitches(state: ScoreState) {
  return [
    ...new Set(
      state.selection.flatMap((ref) => {
        const tone = toneFor(state.score, ref);
        return tone ? [pitchMidi(tone.spelling)] : [];
      }),
    ),
  ].sort((a, b) => a - b);
}
export const arrangement = (score: Score) => score.staffs.map((staff) => scoreSteps(staff.events));
export function isDefaultScore(score: Score) {
  return (
    score.bpm === 120 &&
    score.key === 'C' &&
    meterName(score.meter) === '4/4' &&
    (score.tempoBeat ?? DEFAULT_TEMPO_BEAT).duration === 'quarter' &&
    !(score.tempoBeat ?? DEFAULT_TEMPO_BEAT).dotted &&
    score.staffs.length === 1 &&
    score.staffs[0].clef === 'treble' &&
    isInitialScore(score.staffs[0].events)
  );
}
export function activeTargets(state: ScoreState) {
  return rhythmTargets(
    state.score.staffs.find((s) => s.id === state.active)!.events,
    state.duration,
  );
}
