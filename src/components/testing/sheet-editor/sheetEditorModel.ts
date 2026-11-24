export { CLEFS, isClef } from './sheetEditorClefs';
import {
  TICKS_PER_BEAT,
  MEASURE_TICKS,
  NOTE_TICKS,
  eventTicks,
  TUPLET_RATIOS,
  safeRhythmId,
  measureTicks,
  meterBeatTicks,
} from './sheetEditorRhythm';
import type { Tuplet, Meter } from './sheetEditorRhythm';
export {
  TICKS_PER_BEAT,
  MEASURE_TICKS,
  NOTE_TICKS,
  eventTicks,
  writtenTicks,
  TUPLET_RATIOS,
  TUPLET_NAMES,
  measureTicks, meterBeatTicks, meterName, tempoBeatTicks, secondsForTicks, beamTicks, validMeter, validTempoBeat, DEFAULT_METER, DEFAULT_TEMPO_BEAT,
} from './sheetEditorRhythm';
import { makeStep } from '../../brodle/creator/melodyComposer';

export const NOTE_VALUES = ['sixteenth', 'eighth', 'quarter', 'half', 'whole'] as const;
export type NoteValue = (typeof NOTE_VALUES)[number] | 'thirty-second';
export const MIN_MIDI = 0;
export const MAX_MIDI = 127;
export const POINTER_MIN = 53; // F3
export const POINTER_MAX = 89; // F6
export const NATURAL_PITCHES = Array.from({ length: 128 }, (_, midi) => midi).filter((midi) =>
  [0, 2, 4, 5, 7, 9, 11].includes(midi % 12),
);
export const validMidi = (midi: unknown): midi is number =>
  typeof midi === 'number' && Number.isInteger(midi) && midi >= MIN_MIDI && midi <= MAX_MIDI;
const DIATONIC = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export function staffStep(midi: number) {
  const pitch = spellMidi(midi);
  return pitch.octave * 7 + DIATONIC.indexOf(pitch.letter);
}
export function naturalAt(step: number) {
  const octave = Math.floor(step / 7),
    letter = DIATONIC[((step % 7) + 7) % 7] as WrittenPitch['letter'];
  return pitchMidi({ letter, octave, accidental: 0 });
}
export const MAX_EVENTS = 64;
export const MAX_TONES = 8;
export type Accidental = -1 | 0 | 1;
export type WrittenPitch = {
  letter: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  octave: number;
  accidental: Accidental;
};
// MIDI caches the lowest tone for compatibility; written tones are authoritative.
export type ScoreTone = { id: string; spelling: WrittenPitch; tieToNext?: boolean };
export type ScoreEvent = {
  id: string;
  midi: number | null;
  duration: NoteValue;
  spelling?: WrittenPitch;
  tones?: ScoreTone[];
  dotted?: boolean;
  staccato?: boolean;
  tuplet?: Tuplet;
  arpeggio?: 'up' | 'down';
  authored?: boolean;
};
export type EntryTool = { duration: NoteValue; accidental: Accidental; dotted?: boolean; staccato?: boolean; entryKind?: 'note' | 'rest' };
export type EditorMode = 'place' | 'edit';
export type Caret = { tick: number; pitch: number };
export type PlacementCommand =
  | ({ kind: 'fill' } & Caret)
  | { kind: 'add-tone'; eventId: string; pitch: number; spelling?: WrittenPitch };
export type EditorState = EntryTool & {
  mode: EditorMode;
  modeVersion: number;
  measureTicks?: number;
  meter?: Meter;
  revision: number;
  targetId: string | null;
  events: ScoreEvent[];
  past: ScoreEvent[][];
  selectedId: string | null;
  selectedToneId: string | null;
  tick: number;
  pitch: number;
  message: string;
};
export type EditorAction = (
  | { type: 'replace-score'; steps: readonly ImportedStep[]; seed: string }
  | { type: 'mode'; mode: EditorMode }
  | { type: 'clear-selection' }
  | { type: 'tool'; duration?: NoteValue }
  | { type: 'entry-accidental'; value: Accidental }
  | { type: 'accidental'; value: Accidental }
  | { type: 'transpose'; id: string; delta: -1 | 1 }
  | { type: 'caret'; tick: number; pitch: number }
  | { type: 'select'; id: string; toneId?: string }
  | { type: 'add-tone'; id: string; pitch: number; toneId: string; spelling?: WrittenPitch }
  | { type: 'remove-tone'; id: string; toneId?: string }
  | { type: 'duration'; id: string; duration: NoteValue }
  | { type: 'fill'; id: string; tick: number; pitch: number }
  | {
      type: 'update';
      id: string;
      midi: number | null;
      duration: NoteValue;
      spelling?: WrittenPitch;
    }
  | { type: 'delete'; id: string }
  | { type: 'undo' | 'clear' | 'add-measure' }
) & { modeVersion?: number; revision?: number };
const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function pitchMidi(pitch: WrittenPitch): number {
  return (pitch.octave + 1) * 12 + LETTERS[pitch.letter] + pitch.accidental;
}
export function validPitch(pitch: WrittenPitch) {
  const base = (pitch.octave + 1) * 12 + LETTERS[pitch.letter];
  return (
    Object.prototype.hasOwnProperty.call(LETTERS, pitch.letter) &&
    Number.isInteger(pitch.octave) &&
    Number.isFinite(base) &&
    [-1, 0, 1].includes(pitch.accidental) &&
    validMidi(pitchMidi(pitch))
  );
}
export function spellMidi(midi: number, preference: Accidental = 1): WrittenPitch {
  const names =
    preference < 0
      ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
      : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = names[((midi % 12) + 12) % 12];
  return {
    letter: name[0] as WrittenPitch['letter'],
    octave: Math.floor(midi / 12) - 1,
    accidental: name.includes('#') ? 1 : name.includes('b') ? -1 : 0,
  };
}
export function eventTones(event: ScoreEvent): ScoreTone[] {
  return (
    event.tones ??
    (event.midi === null
      ? []
      : [{ id: event.id + ':tone', spelling: event.spelling ?? spellMidi(event.midi) }])
  );
}
export function eventPitch(event: ScoreEvent): WrittenPitch | null {
  return eventTones(event)[0]?.spelling ?? null;
}
export function activeTone(state: EditorState): ScoreTone | null {
  const event = state.events.find((event) => event.id === state.selectedId);
  const tones = event ? eventTones(event) : [];
  return (
    tones.find((tone) => tone.id === state.selectedToneId) ??
    (state.selectedToneId ? null : (tones[0] ?? null))
  );
}
export function notationTones(event: ScoreEvent) {
  return [...eventTones(event)].sort(
    (a, b) =>
      pitchMidi({ ...a.spelling, accidental: 0 }) - pitchMidi({ ...b.spelling, accidental: 0 }) ||
      a.spelling.accidental - b.spelling.accidental,
  );
}
export function pitchKey(pitch: WrittenPitch) {
  return `${pitch.letter}${pitch.accidental === 1 ? '#' : pitch.accidental === -1 ? 'b' : ''}${pitch.octave}`;
}
export function pitchLabel(pitch: WrittenPitch | null) {
  return pitch ? pitchKey(pitch).replace('#', '♯').replace('b', '♭') : 'Rest';
}
export function entryPitch(pitch: number, accidental: Accidental): WrittenPitch {
  return { ...spellMidi(pitch), accidental };
}
function eventFor(id: string, pitch: WrittenPitch | null, duration: NoteValue): ScoreEvent {
  return pitch
    ? { id, midi: pitchMidi(pitch), duration, spelling: pitch }
    : { id, midi: null, duration };
}
export const PITCH_OPTIONS = NATURAL_PITCHES.filter(
  (midi) => midi >= POINTER_MIN && midi <= POINTER_MAX,
).flatMap((midi) =>
  ([-1, 0, 1] as const).map((accidental) => entryPitch(midi, accidental)).filter(validPitch),
);
export function timedEvents(events: readonly ScoreEvent[]) {
  let start = 0;
  return events.map((event, index) => {
    const span = { event, index, start, end: start + eventTicks(event) };
    start = span.end;
    return span;
  });
}
export function totalTicks(events: readonly ScoreEvent[]) {
  return events.reduce((sum, event) => sum + eventTicks(event), 0);
}
export function positionLabel(tick: number, meter?: Meter) {
  const bar = measureTicks(meter), beatTicks = meterBeatTicks(meter);
  const beat = (tick % bar) / beatTicks;
  return `Measure ${Math.floor(tick / bar) + 1}, beat ${Math.floor(beat) + 1}${beat % 1 ? ' + ' + Number(((tick % beatTicks) / beatTicks).toFixed(6)) : ''}`;
}
export function rhythmTargets(events: readonly ScoreEvent[], duration: NoteValue): number[] {
  const targets = new Set<number>([totalTicks(events)]),
    step = Math.min(TICKS_PER_BEAT, NOTE_TICKS[duration]);
  for (const span of timedEvents(events)) {
    targets.add(span.start);
    if (!eventTones(span.event).length && !span.event.tuplet)
      for (let tick = Math.ceil(span.start / step) * step; tick < span.end; tick += step)
        targets.add(tick);
  }
  return [...targets].sort((a, b) => a - b);
}
function nearestTarget(events: readonly ScoreEvent[], duration: NoteValue, tick: number) {
  return rhythmTargets(events, duration).reduce(
    (best, target) => (Math.abs(target - tick) < Math.abs(best - tick) ? target : best),
    0,
  );
}
// Rest padding is beat-aligned, so untouched measures keep four quarter rests.
function restPartition(
  start: number,
  end: number,
  previous: ReturnType<typeof timedEvents>,
  seed: string,
  bar = MEASURE_TICKS,
): ScoreEvent[] | null {
  const result: ScoreEvent[] = [];
  while (start < end) {
    const size = [TICKS_PER_BEAT, TICKS_PER_BEAT / 2, TICKS_PER_BEAT / 4, TICKS_PER_BEAT / 8].find(
      (n) =>
        start % n === 0 &&
        start + n <= end &&
        Math.floor(start / bar) === Math.floor((start + n - 1) / bar) &&
        Math.floor(start / TICKS_PER_BEAT) === Math.floor((start + n - 1) / TICKS_PER_BEAT),
    );
    if (!size) return null;
    const old = previous.find(
      (s) => s.start === start && s.end === start + size && !isProtected(s.event),
    );
    const duration = (Object.keys(NOTE_TICKS) as NoteValue[]).find((v) => NOTE_TICKS[v] === size)!;
    result.push(old?.event ?? eventFor(`${seed}:rest:${start}`, null, duration));
    start += size;
  }
  return result;
}
export const isProtected = (event: ScoreEvent) =>
  Boolean(eventTones(event).length || event.tuplet || event.dotted || event.authored);
export function protectedSpans(events: readonly ScoreEvent[]) {
  return timedEvents(events).filter((s) => isProtected(s.event));
}
type PitchedSpan = { start: number; event: ScoreEvent };
export function composeScore(
  previous: readonly ScoreEvent[],
  spans: PitchedSpan[],
  capacity: number,
  seed: string,
  bar = MEASURE_TICKS,
): ScoreEvent[] | null {
  if (!Number.isSafeInteger(capacity) || capacity < bar || capacity % bar)
    return null;
  const old = timedEvents(previous),
    result: ScoreEvent[] = [];
  let cursor = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const length = eventTicks(span.event),
      end = span.start + length;
    if (
      !Number.isSafeInteger(span.start) ||
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      span.start < cursor ||
      end > capacity
    )
      return null;
    const padding = restPartition(cursor, span.start, old, seed, bar);
    if (!padding) return null;
    result.push(...padding, span.event);
    cursor = end;
  }
  const padding = restPartition(cursor, capacity, old, seed, bar);
  if (!padding) return null;
  result.push(...padding);
  return result.length <= MAX_EVENTS &&
    new Set(result.map((e) => e.id)).size === result.length &&
    validGroups(result, bar)
    ? result
    : null;
}
export function validGroups(events: readonly ScoreEvent[], bar = MEASURE_TICKS): boolean {
  const seen = new Set<string>(),
    spans = timedEvents(events);
  for (let i = 0; i < events.length; i++) {
    const e = events[i],
      g = e.tuplet;
    if (!g) continue;
    if (
      !Number.isInteger(g.count) ||
      !Number.isInteger(g.inTimeOf) ||
      !safeRhythmId(g.id) ||
      seen.has(g.id) ||
      g.index !== 1 ||
      TUPLET_RATIOS[g.count] !== g.inTimeOf ||
      !NOTE_VALUES.includes(e.duration as (typeof NOTE_VALUES)[number])
    )
      return false;
    seen.add(g.id);
    for (let j = 0; j < g.count; j++) {
      const n = events[i + j],
        t = n?.tuplet;
      if (
        !n ||
        !t ||
        n.dotted ||
        n.duration !== e.duration ||
        t.id !== g.id ||
        t.count !== g.count ||
        t.inTimeOf !== g.inTimeOf ||
        t.index !== j + 1
      )
        return false;
    }
    if (
      Math.floor(spans[i].start / bar) !==
      Math.floor((spans[i + g.count - 1].end - 1) / bar)
    )
      return false;
    i += g.count - 1;
  }
  return true;
}
export function cleanRelations(events: readonly ScoreEvent[]) {
  let removed = 0;
  const result = events.map((e, i) => {
    let changed = false;
    const next = events[i + 1];
    const tones = eventTones(e).map((t) => {
      if (!t.tieToNext) return t;
      const matching =
        next && eventTones(next).some((n) => pitchKey(n.spelling) === pitchKey(t.spelling));
      if (matching) return t;
      changed = true;
      removed++;
      const copy = { ...t };
      delete copy.tieToNext;
      return copy;
    });
    return changed ? withTones(e, tones) : e;
  });
  return { events: removed ? result : (events as ScoreEvent[]), removed };
}
export function changedSpan(
  events: readonly ScoreEvent[],
  id: string,
  updated: ScoreEvent | null,
  bar = MEASURE_TICKS,
): ScoreEvent[] | null {
  const target = timedEvents(events).find((span) => span.event.id === id);
  if (!target) return null;
  const pitched = protectedSpans(events)
    .filter(
      (span) =>
        span.event.id !== id &&
        (!updated ||
          eventTones(span.event).length ||
          span.event.tuplet ||
          span.end <= target.start ||
          span.start >= target.start + eventTicks(updated)),
    )
    .map(({ start, event }) => ({ start, event }));
  if (updated) pitched.push({ start: target.start, event: updated });
  return composeScore(events, pitched, totalTicks(events), id, bar);
}
// Resize without overwriting music. Silence is consumed first; displaced events
// keep their identities and order. Tuplets move as complete, bar-contained groups.
export function resizedEvents(
  events: readonly ScoreEvent[],
  id: string,
  updated: ScoreEvent,
  bar = MEASURE_TICKS,
): ScoreEvent[] | null {
  const fixed = changedSpan(events, id, updated, bar);
  if (fixed) return fixed;
  const target = timedEvents(events).find((span) => span.event.id === id);
  if (!target || target.event.tuplet || eventTicks(updated) <= eventTicks(target.event))
    return null;
  return carriedEvents(events, target.start, updated, bar, id);
}

// Shared by resizing and new placement: use silence, then carry protected music.
function carriedEvents(events: readonly ScoreEvent[], start: number, updated: ScoreEvent, bar = MEASURE_TICKS, replacedId?: string): ScoreEvent[] | null {
  const timeline = protectedSpans(events);
  const spans: PitchedSpan[] = timeline
    .filter((span) => span.end <= start)
    .map(({ start, event }) => ({ start, event }));
  spans.push({ start, event: updated });
  let cursor = start + eventTicks(updated);
  for (let i = 0; i < timeline.length; i++) {
    const span = timeline[i];
    if (span.start < start || span.event.id === replacedId) continue;
    if (span.event.tuplet) {
      const members = timeline.slice(i, i + span.event.tuplet.count),
        length = members[members.length - 1].end - span.start;
      let start = Math.max(span.start, cursor);
      if (Math.floor(start / bar) !== Math.floor((start + length - 1) / bar))
        start = Math.ceil(start / bar) * bar;
      spans.push(
        ...members.map((member) => ({
          start: start + member.start - span.start,
          event: member.event,
        })),
      );
      cursor = start + length;
      i += members.length - 1;
    } else if (eventTones(span.event).length) {
      const start = Math.max(span.start, cursor);
      spans.push({ start, event: span.event });
      cursor = start + eventTicks(span.event);
    } else if (span.start >= cursor) {
      spans.push({ start: span.start, event: span.event });
      cursor = span.end;
    }
  }
  const capacity = Math.max(totalTicks(events), Math.ceil(cursor / bar) * bar);
  return composeScore(events, spans, capacity, updated.id, bar);
}
export function rebarEvents(events: readonly ScoreEvent[], bar: number): ScoreEvent[] | null {
  const timeline = protectedSpans(events), spans: PitchedSpan[] = [];
  let cursor = 0;
  for (let i = 0; i < timeline.length; i++) {
    const span = timeline[i];
    let start = Math.max(cursor, span.start);
    if (span.event.tuplet) {
      const members = timeline.slice(i, i + span.event.tuplet.count);
      const length = members[members.length - 1].end - span.start;
      if (length > bar) return null;
      if (Math.floor(start / bar) !== Math.floor((start + length - 1) / bar)) start = Math.ceil(start / bar) * bar;
      spans.push(...members.map(member => ({ start: start + member.start - span.start, event: member.event })));
      cursor = start + length; i += members.length - 1;
    } else { spans.push({ start, event: span.event }); cursor = start + eventTicks(span.event); }
  }
  const capacity = Math.ceil(Math.max(totalTicks(events), cursor) / bar) * bar;
  return composeScore(events, spans, capacity, 'rebar', bar);
}
export function initialEvents(bar = MEASURE_TICKS): ScoreEvent[] {
  return restPartition(0, bar, [], 'initial', bar)!;
}
export function emptyEditor(): EditorState {
  return {
    mode: 'place',
    modeVersion: 0,
    revision: 0,
    targetId: null,
    events: initialEvents(),
    past: [],
    selectedId: null,
    selectedToneId: null,
    tick: 0,
    pitch: 64,
    duration: 'quarter',
    accidental: 0,
    message: 'Choose a rest position to fill. Every measure stays four beats.',
  };
}
export function isInitialScore(events: readonly ScoreEvent[]) {
  return (
    events.length === 4 &&
    events.every(
      (event) =>
        !eventTones(event).length && event.duration === 'quarter' && !event.dotted && !event.tuplet && !event.authored,
    )
  );
}
export function isNaturalPitch(midi: number) {
  return (NATURAL_PITCHES as readonly number[]).includes(midi);
}
export function shiftPitch(midi: number, amount: number) {
  const next = naturalAt(staffStep(midi) + amount);
  return validMidi(next) ? next : midi;
}
export function eventLabel(event: ScoreEvent) {
  return (
    eventTones(event)
      .map((tone) => pitchLabel(tone.spelling))
      .join(' + ') || 'Rest'
  );
}
// Experimental pitches can exceed the production piano/score-restoration range.
export function scoreSteps(events: readonly ScoreEvent[]) {
  return events.map((event) => {
    const pitches = eventTones(event)
      .map((tone) => pitchMidi(tone.spelling))
      .sort((a, b) => a - b);
    const base = makeStep(pitches[0] ?? null, event.duration, Boolean(event.dotted));
    return {
      ...base,
      beats: eventTicks(event) / TICKS_PER_BEAT,
      ...(pitches.length > 1 ? { pitches, rhythm: base.rhythm.replace('note', 'chord') } : {}),
    };
  });
}
export function withTones(event: ScoreEvent, tones: ScoreTone[]): ScoreEvent {
  const sorted = [...tones].sort((a, b) => pitchMidi(a.spelling) - pitchMidi(b.spelling));
  const updated = {
    ...event,
    ...eventFor(event.id, sorted[0]?.spelling ?? null, event.duration),
    tones: sorted,
  };
  if (sorted.length < 2) delete updated.arpeggio;
  if (!sorted.length) { delete updated.spelling; delete updated.staccato; }
  else delete updated.authored;
  return updated;
}
function augmented(event: ScoreEvent, pitch: WrittenPitch, toneId: string): ScoreEvent | null {
  const tones = eventTones(event);
  if (
    !tones.length ||
    !validPitch(pitch) ||
    tones.length >= MAX_TONES ||
    tones.some((tone) => tone.id === toneId || pitchMidi(tone.spelling) === pitchMidi(pitch))
  )
    return null;
  return withTones(event, [...tones, { id: toneId, spelling: pitch }]);
}
export function commandAt(events: readonly ScoreEvent[], caret: Caret, entryKind: 'note' | 'rest' = 'note'): PlacementCommand {
  const span = timedEvents(events).find(
    (span) => span.start === caret.tick && eventTones(span.event).length,
  );
  return span && entryKind !== 'rest'
    ? { kind: 'add-tone', eventId: span.event.id, pitch: caret.pitch }
    : { kind: 'fill', ...caret };
}
export function tentativeFill(
  events: readonly ScoreEvent[],
  caret: Caret,
  tool: EntryTool,
  id = '__pending_note__',
  bar = MEASURE_TICKS,
): ScoreEvent[] | null {
  const pitch = entryPitch(caret.pitch, tool.accidental);
  if (
    !Number.isSafeInteger(caret.tick) ||
    caret.tick < 0 ||
    caret.tick > totalTicks(events) ||
    !isNaturalPitch(caret.pitch) ||
    (!validPitch(pitch) && tool.entryKind !== 'rest') ||
    events.some((e) => e.id === id)
  )
    return null;
  const slot = timedEvents(events).find(
    (s) => s.start === caret.tick && s.event.tuplet && !eventTones(s.event).length,
  );
  const event = eventFor(id, tool.entryKind === 'rest' ? null : pitch, slot?.event.duration ?? tool.duration);
  if (tool.entryKind === 'rest') event.authored = true;
  else if (tool.staccato) event.staccato = true;
  if (slot) event.tuplet = { ...slot.event.tuplet! };
  else if (tool.dotted) event.dotted = true;
  if (event.duration === 'thirty-second' && event.dotted) return null;
  if (!slot) {
    // Existing pitched events still use add-tone; protected slots keep their time.
    const covered = timedEvents(events).find(s => s.start <= caret.tick && s.end > caret.tick);
    if (covered && (covered.event.tuplet || (eventTones(covered.event).length && (tool.entryKind !== 'rest' || covered.start !== caret.tick)))) return null;
    return carriedEvents(events, caret.tick, event, bar);
  }
  const spans = protectedSpans(events).filter(
    (s) =>
      s.event.id !== slot?.event.id &&
      (eventTones(s.event).length ||
        s.event.tuplet ||
        s.end <= caret.tick ||
        s.start >= caret.tick + eventTicks(event)),
  );
  return composeScore(events, [...spans, { start: caret.tick, event }], totalTicks(events), id, bar);
}
export function tentativeOperation(
  events: readonly ScoreEvent[],
  command: PlacementCommand,
  tool: EntryTool,
  bar = MEASURE_TICKS,
): ScoreEvent[] | null {
  if (command.kind === 'fill') return tentativeFill(events, command, tool, '__pending_note__', bar);
  const target = events.find((event) => event.id === command.eventId);
  if (!target) return null;
  const updated = augmented(
    target,
    command.spelling ?? entryPitch(command.pitch, tool.accidental),
    '__pending_tone__',
  );
  return updated ? events.map((event) => (event.id === target.id ? updated : event)) : null;
}
function commit(state: EditorState, events: ScoreEvent[], message: string): EditorState {
  return {
    ...state,
    events,
    revision: state.revision + 1,
    past: [...state.past.slice(-63), state.events],
    targetId: null,
    selectedId: null,
    selectedToneId: null,
    tick: nearestTarget(events, state.duration, state.tick),
    message,
  };
}
function editPitch(state: EditorState, event: ScoreEvent, pitch: WrittenPitch, message: string) {
  const tones = eventTones(event);
  const selected =
    tones.find((tone) => tone.id === state.selectedToneId) ??
    (state.selectedToneId ? undefined : tones[0]);
  if (!selected) return state;
  if (!validPitch(pitch))
    return {
      ...state,
      message:
        'This experiment supports integer MIDI pitches 0–127. The selected tone was not changed.',
    };
  if (
    tones.some((tone) => tone.id !== selected.id && pitchMidi(tone.spelling) === pitchMidi(pitch))
  )
    return {
      ...state,
      message: 'Another tone already uses that pitch. The selected tone was not changed.',
    };
  if (pitchKey(selected.spelling) === pitchKey(pitch)) return state;
  const updated = withTones(
    event,
    tones.map((tone) => (tone.id === selected.id ? { ...tone, spelling: pitch } : tone)),
  );
  return {
    ...commit(
      state,
      state.events.map((item) => (item.id === event.id ? updated : item)),
      message,
    ),
    selectedId: event.id,
    selectedToneId: selected.id,
  };
}
const blocked = (state: EditorState) => ({
  ...state,
  message:
    'That span cannot fit the protected group rules or the 64-event limit. The score was not changed.',
});
export type ImportedStep = {
  midi: number | null;
  pitches?: number[];
  beats?: number;
  duration?: NoteValue;
  dotted?: boolean;
  staccato?: boolean;
  tuplet?: Tuplet;
  tieToNext?: number[];
  arpeggio?: 'up' | 'down' | true;
};
export function importedScore(
  previous: readonly ScoreEvent[],
  steps: readonly ImportedStep[],
  seed: string,
  bar = MEASURE_TICKS,
): ScoreEvent[] | null {
  if (!steps.length || steps.length > MAX_EVENTS) return null;
  const old = timedEvents(previous),
    spans: PitchedSpan[] = [];
  let tick = 0;
  for (const step of steps) {
    let duration = step.duration,
      dotted = Boolean(step.dotted);
    if (!duration) {
      const match = [false, true]
        .flatMap((dot) => (Object.keys(NOTE_TICKS) as NoteValue[]).map((value) => ({ value, dot })))
        .find(
          (v) => NOTE_TICKS[v.value] * (v.dot ? 1.5 : 1) === Number(step.beats) * TICKS_PER_BEAT,
        );
      if (!match) return null;
      duration = match.value;
      dotted = match.dot;
    }
    if (
      !Object.prototype.hasOwnProperty.call(NOTE_TICKS, duration) ||
      (duration === 'thirty-second' && dotted) ||
      (step.tuplet && dotted)
    )
      return null;
    const pitches = step.pitches ?? (step.midi === null ? [] : [step.midi]);
    if (
      (step.pitches !== undefined &&
        (!Array.isArray(step.pitches) || pitches.length < 2 || pitches.length > 8)) ||
      pitches.some((n, i) => !validMidi(n) || (i > 0 && pitches[i - 1] >= n)) ||
      (pitches.length && step.midi !== pitches[0]) ||
      (!pitches.length && step.midi !== null)
    )
      return null;
    const existing = old.find((s) => s.start === tick)?.event,
      id = existing?.id ?? `${seed}:event:${tick}`;
    let event: ScoreEvent = {
      id,
      midi: null,
      duration,
      ...(dotted ? { dotted: true } : {}),
      ...(step.tuplet ? { tuplet: { ...step.tuplet } } : {}),
      ...(!pitches.length && step.duration ? { authored: true } : {}),
    };
    const tones = pitches.map((n) => {
      const oldTone = existing && eventTones(existing).find((t) => pitchMidi(t.spelling) === n);
      return {
        id: oldTone?.id ?? `${id}:tone:${n}`,
        spelling: oldTone?.spelling ?? spellMidi(n),
        ...(step.tieToNext?.includes(n) ? { tieToNext: true } : {}),
      };
    });
    if (
      step.tieToNext &&
      (!Array.isArray(step.tieToNext) ||
        !step.tieToNext.length ||
        step.tieToNext.some(
          (n, i) => !pitches.includes(n) || (i > 0 && step.tieToNext![i - 1] >= n),
        ))
    )
      return null;
    if (step.staccato !== undefined && (typeof step.staccato !== 'boolean' || (step.staccato && !tones.length))) return null;
    if (tones.length) event = withTones(event, tones);
    if (step.staccato) event.staccato = true;
    if (step.arpeggio) {
      if (tones.length < 2 || ![true, 'up', 'down'].includes(step.arpeggio)) return null;
      event.arpeggio = step.arpeggio === true ? 'up' : step.arpeggio;
    }
    if (isProtected(event)) spans.push({ start: tick, event });
    tick += eventTicks(event);
    if (!Number.isSafeInteger(tick)) return null;
  }
  const result = composeScore(previous, spans, tick, seed, bar);
  if (!result || cleanRelations(result).removed) return null;
  // Canonical code includes generated padding too. An unchanged staff keeps its
  // existing authored/padding distinction; newly imported written rests are real
  // events, including quarter rests that happen to match initial placeholders.
  if (!sameScore(previous, result, false)) return result;
  return result.map((event, index) => {
    const restored = { ...event };
    if (previous[index].authored) restored.authored = true;
    else delete restored.authored;
    return restored;
  });
}
export function sameScore(a: readonly ScoreEvent[], b: readonly ScoreEvent[], compareAuthored = true) {
  const shape = (events: readonly ScoreEvent[]) =>
    events.map((event) => [
      event.duration,
      Boolean(event.dotted),
      Boolean(event.staccato),
      compareAuthored && Boolean(event.authored),
      event.tuplet ?? null,
      event.arpeggio ?? null,
      eventTones(event).map((tone) => [pitchKey(tone.spelling), Boolean(tone.tieToNext)]),
    ]);
  return JSON.stringify(shape(a)) === JSON.stringify(shape(b));
}
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const bar = state.measureTicks ?? MEASURE_TICKS;
  if (
    (action.modeVersion !== undefined && action.modeVersion !== state.modeVersion) ||
    (action.revision !== undefined && action.revision !== state.revision)
  )
    return state;
  if (
    state.mode !== 'place' &&
    ['tool', 'entry-accidental', 'caret', 'fill', 'add-tone', 'add-measure'].includes(action.type)
  )
    return state;
  if (
    state.mode !== 'edit' &&
    ['accidental', 'transpose', 'update', 'duration', 'remove-tone', 'delete'].includes(action.type)
  )
    return state;
  if (
    'id' in action &&
    ['transpose', 'update', 'duration', 'remove-tone', 'delete'].includes(action.type) &&
    action.id !== state.selectedId
  )
    return state;
  switch (action.type) {
    case 'replace-score': {
      const events = importedScore(state.events, action.steps, action.seed, bar);
      return !events
        ? blocked(state)
        : sameScore(state.events, events)
          ? state
          : commit(
              state,
              events,
              'Code applied as one complete score. Undo restores the previous score.',
            );
    }
    case 'mode':
      return state.mode === action.mode
        ? state
        : {
            ...state,
            mode: action.mode,
            modeVersion: state.modeVersion + 1,
            targetId: null,
            selectedId: null,
            selectedToneId: null,
            message:
              action.mode === 'place'
                ? 'Place notes: fill a rest position or add a chord tone.'
                : 'Edit notes: select a note or rest.',
          };
    case 'clear-selection':
      return {
        ...state,
        targetId: null,
        selectedId: null,
        selectedToneId: null,
        message: 'Target cleared. Your mode is unchanged.',
      };
    case 'tool': {
      const duration = action.duration ?? state.duration;
      return {
        ...state,
        duration,
        tick: nearestTarget(state.events, duration, state.tick),
        message: 'Choose a rhythmic position to fill with this note value.',
      };
    }
    case 'entry-accidental':
      return {
        ...state,
        accidental: action.value,
        message: 'Accidental selected for the next note.',
      };
    case 'accidental': {
      const selected = state.events.find((event) => event.id === state.selectedId),
        pitch = activeTone(state)?.spelling;
      return selected && pitch
        ? editPitch(
            state,
            selected,
            { ...pitch, accidental: action.value },
            'Selected accidental updated.',
          )
        : state;
    }
    case 'transpose': {
      const selected = state.events.find((event) => event.id === action.id),
        pitch = activeTone(state)?.spelling;
      return selected && pitch
        ? editPitch(
            state,
            selected,
            spellMidi(pitchMidi(pitch) + action.delta, action.delta),
            'Selected tone moved one semitone.',
          )
        : state;
    }
    case 'caret':
      return {
        ...state,
        targetId: null,
        selectedId: null,
        selectedToneId: null,
        tick: nearestTarget(state.events, state.duration, action.tick),
        pitch: shiftPitch(action.pitch, 0),
      };
    case 'select': {
      const span = timedEvents(state.events).find((span) => span.event.id === action.id);
      if (!span) return state;
      const tones = eventTones(span.event);
      if (state.mode === 'place')
        return {
          ...state,
          tick: span.start,
          targetId: tones.length ? span.event.id : null,
          message: `${positionLabel(span.start, state.meter)}: ${tones.length ? 'chord target chosen.' : 'rest position chosen. Enter fills it.'}`,
        };
      if (action.toneId && !tones.some((tone) => tone.id === action.toneId)) return state;
      const member =
        tones.find(
          (tone) =>
            tone.id ===
            (action.toneId ?? (state.selectedId === span.event.id ? state.selectedToneId : null)),
        ) ?? tones[0];
      return {
        ...state,
        selectedId: span.event.id,
        selectedToneId: member?.id ?? null,
        message: `${positionLabel(span.start, state.meter)} selected for editing.`,
      };
    }
    case 'fill': {
      const events = tentativeFill(state.events, action, state, action.id, bar);
      if (!events) return blocked(state);
      const targets = rhythmTargets(events, state.duration);
      return {
        ...commit(
          state,
          events,
          `${state.entryKind === 'rest' ? 'Rest' : 'Note'} placed at ${positionLabel(action.tick, state.meter)}. Available rests used; later notes carried forward where needed.`,
        ),
        tick:
          targets.find(
            (tick) => tick >= action.tick + eventTicks(events.find((e) => e.id === action.id)!),
          ) ?? targets[targets.length - 1],
        pitch: action.pitch,
      };
    }
    case 'add-tone': {
      const target = state.events.find((event) => event.id === action.id),
        pitch = action.spelling ?? entryPitch(action.pitch, state.accidental);
      if (!target || !eventTones(target).length)
        return { ...state, message: 'Choose a pitched event before adding a tone.' };
      if (eventTones(target).some((tone) => pitchMidi(tone.spelling) === pitchMidi(pitch)))
        return {
          ...state,
          targetId: target.id,
          message: 'That sounding pitch is already in this chord.',
        };
      const updated = augmented(target, pitch, action.toneId);
      if (!updated)
        return { ...state, message: 'Use up to 8 distinct tones with integer MIDI pitches 0–127.' };
      return {
        ...commit(
          state,
          state.events.map((event) => (event.id === target.id ? updated : event)),
          'Tone added. The onset and duration are unchanged.',
        ),
        targetId: target.id,
      };
    }
    case 'remove-tone': {
      const target = state.events.find((event) => event.id === action.id);
      if (!target) return state;
      const tones = eventTones(target),
        id = action.toneId ?? state.selectedToneId;
      if (!tones.some((tone) => tone.id === id)) return state;
      if (tones.length === 1) return editorReducer(state, { type: 'delete', id: target.id });
      const remaining = tones.filter((tone) => tone.id !== id);
      return {
        ...commit(
          state,
          state.events.map((event) =>
            event.id === target.id ? withTones(event, remaining) : event,
          ),
          'Tone removed. Event time is unchanged.',
        ),
        selectedId: target.id,
        selectedToneId: remaining[0].id,
      };
    }
    case 'duration': {
      const target = state.events.find((event) => event.id === action.id);
      if (
        !target ||
        !eventTones(target).length ||
        target.tuplet ||
        !NOTE_VALUES.includes(action.duration as (typeof NOTE_VALUES)[number]) ||
        target.duration === action.duration
      )
        return state;
      const events = changedSpan(state.events, target.id, { ...target, duration: action.duration }, bar);
      return events
        ? {
            ...commit(
              state,
              events,
              'Duration changed; remaining silence was adjusted without moving later notes.',
            ),
            selectedId: target.id,
            selectedToneId: state.selectedToneId,
          }
        : blocked(state);
    }
    case 'update': {
      const selected = state.events.find((event) => event.id === action.id),
        pitch = action.midi === null ? null : (action.spelling ?? spellMidi(action.midi));
      if (!selected || (pitch && !validPitch(pitch))) return state;
      if (!pitch) return editorReducer(state, { type: 'delete', id: selected.id });
      if (eventTones(selected).length)
        return editPitch(state, selected, pitch, 'Selected tone updated.');
      const updated = withTones(selected, [{ id: selected.id + ':tone', spelling: pitch }]),
        events = changedSpan(state.events, selected.id, updated, bar);
      return events
        ? {
            ...commit(state, events, 'Rest filled without changing its time.'),
            selectedId: selected.id,
            selectedToneId: eventTones(updated)[0].id,
          }
        : blocked(state);
    }
    case 'delete': {
      const target = state.events.find((event) => event.id === action.id);
      if (!target) return state;
      if (!eventTones(target).length)
        return { ...state, message: 'This position is already silent.' };
      const events = changedSpan(
        state.events,
        target.id,
        target.tuplet ? withTones(target, []) : null,
        bar,
      );
      return events
        ? commit(
            state,
            events,
            'Replaced with rests. Later notes keep their time; Undo restores it.',
          )
        : blocked(state);
    }
    case 'add-measure': {
      const events = composeScore(
        state.events,
        protectedSpans(state.events),
        totalTicks(state.events) + bar,
        `bar-${state.revision}`,
        bar,
      );
      return events
        ? {
            ...commit(state, events, 'Added one empty measure.'),
            tick: totalTicks(state.events),
          }
        : blocked(state);
    }
    case 'clear':
      return isInitialScore(state.events)
        ? state
        : {
            ...commit(
              state,
              initialEvents(),
              'Reset to one measure of four quarter rests. Undo restores your sketch.',
            ),
            tick: 0,
          };
    case 'undo': {
      const events = state.past[state.past.length - 1];
      return events
        ? {
            ...state,
            events,
            revision: state.revision + 1,
            past: state.past.slice(0, -1),
            targetId: null,
            selectedId: null,
            selectedToneId: null,
            tick: nearestTarget(events, state.duration, state.tick),
            message: 'Previous score and measure time restored.',
          }
        : state;
    }
  }
}

export type Point = { x: number; y: number };
export type Bounds = { left: number; right: number; top: number; bottom: number };
export type FragmentAnchor = { index: number; left: number; right: number };
export type StaffGeometry = { left: number; right: number; bottom: number; step: number };
export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

// Pass the inverse of getScreenCTM(), freshly measured for every pointer event.
export function svgPoint(point: Point, inverse: Matrix): Point {
  return {
    x: inverse.a * point.x + inverse.c * point.y + inverse.e,
    y: inverse.b * point.x + inverse.d * point.y + inverse.f,
  };
}
export function staffGeometry(
  lines: Bounds[],
  headerRight: number,
  fragments: FragmentAnchor[],
  count: number,
): StaffGeometry | null {
  if (lines.length !== 5) return null;
  const rows = lines.map((line) => (line.top + line.bottom) / 2).sort((a, b) => a - b);
  const step = (rows[4] - rows[0]) / 8;
  const left = Math.max(...lines.map((line) => line.left), headerRight + 14);
  const right = Math.min(...lines.map((line) => line.right)) - 12;
  if (
    ![left, right, step, ...rows].every(Number.isFinite) ||
    step <= 0 ||
    right <= left ||
    rows.some((y, i) => Math.abs(y - rows[0] - i * step * 2) > step / 3)
  )
    return null;
  const anchors = Array.from({ length: count }, (_, index) => {
    const group = fragments.filter((fragment) => fragment.index === index);
    return {
      left: Math.min(...group.map((fragment) => fragment.left)),
      right: Math.max(...group.map((fragment) => fragment.right)),
    };
  });
  if (anchors.some((anchor) => !Number.isFinite(anchor.left) || !Number.isFinite(anchor.right)))
    return null;
  return { left, right, bottom: rows[4], step };
}
export function pitchY(midi: number, geometry: StaffGeometry, bottomMidi = 64) {
  return geometry.bottom - (staffStep(midi) - staffStep(bottomMidi)) * geometry.step;
}
export function staffPitch(
  point: Point,
  geometry: StaffGeometry,
  bottomMidi = 64,
  minimum = POINTER_MIN,
): number | null {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < geometry.left ||
    point.x > geometry.right
  )
    return null;
  const midi = naturalAt(
    staffStep(bottomMidi) + Math.round((geometry.bottom - point.y) / geometry.step),
  );
  return midi >= minimum && midi <= POINTER_MAX ? midi : null;
}
export type Gesture = Point & { scroll: number };
export function isTap(start: Gesture, end: Gesture) {
  return (
    Math.hypot(end.x - start.x, end.y - start.y) <= 7 && Math.abs(end.scroll - start.scroll) < 1
  );
}
