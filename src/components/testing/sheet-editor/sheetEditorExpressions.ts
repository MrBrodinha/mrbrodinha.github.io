import {
  changedSpan,
  composeScore,
  eventTones,
  eventTicks,
  MEASURE_TICKS,
  NOTE_TICKS,
  NOTE_VALUES,
  pitchKey,
  protectedSpans,
  timedEvents,
  totalTicks,
  withTones,
} from './sheetEditorModel';
import type { NoteValue, ScoreEvent } from './sheetEditorModel';
import { TUPLET_RATIOS, safeRhythmId } from './sheetEditorRhythm';
export function dottedEvents(events: readonly ScoreEvent[], id: string, value: boolean) {
  const event = events.find((e) => e.id === id);
  if (!event || event.tuplet || event.duration === 'thirty-second') return null;
  if (Boolean(event.dotted) === value) return events as ScoreEvent[];
  return changedSpan(events, id, {
    ...event,
    dotted: value,
    ...(!eventTones(event).length ? { authored: true } : {}),
  });
}
export function tupletEvents(
  events: readonly ScoreEvent[],
  id: string,
  count: number,
  duration: NoteValue,
  groupId: string,
  bar = MEASURE_TICKS,
) {
  const spans = timedEvents(events),
    target = spans.find((s) => s.event.id === id),
    ratio = TUPLET_RATIOS[count];
  if (
    !target ||
    eventTones(target.event).length ||
    !ratio ||
    !NOTE_VALUES.includes(duration as (typeof NOTE_VALUES)[number]) ||
    !safeRhythmId(groupId)
  )
    return null;
  const oldGroup = target.event.tuplet,
    group = oldGroup ? spans.filter((s) => s.event.tuplet?.id === oldGroup.id) : [];
  if (group.some((s) => eventTones(s.event).length)) return null;
  if (oldGroup?.count === count && target.event.duration === duration) return events as ScoreEvent[];
  const from = group[0]?.start ?? target.start,
    end = from + NOTE_TICKS[duration] * ratio;
  if (
    end > totalTicks(events) ||
    Math.floor(from / bar) !== Math.floor((end - 1) / bar)
  )
    return null;
  if (
    spans.some(
      (s) =>
        s.start < end &&
        s.end > from &&
        (eventTones(s.event).length || (s.event.tuplet && s.event.tuplet.id !== oldGroup?.id)),
    )
  )
    return null;
  const keep = protectedSpans(events).filter(
    (s) => !(s.start < end && s.end > from) && (!oldGroup || s.event.tuplet?.id !== oldGroup.id),
  );
  const gid = oldGroup?.id ?? groupId;
  const slots = Array.from({ length: count }, (_, index) => ({
    start: from + (NOTE_TICKS[duration] * ratio * index) / count,
    event: {
      id: `${groupId}:slot:${index + 1}`,
      midi: null,
      duration,
      tuplet: { id: gid, count, inTimeOf: ratio, index: index + 1 },
    } as ScoreEvent,
  }));
  return composeScore(events, [...keep, ...slots], totalTicks(events), groupId, bar);
}
export function removeTuplet(events: readonly ScoreEvent[], id: string, bar = MEASURE_TICKS) {
  const group = events.find((e) => e.id === id)?.tuplet;
  if (!group || events.some((e) => e.tuplet?.id === group.id && eventTones(e).length)) return null;
  return composeScore(
    events,
    protectedSpans(events).filter((s) => s.event.tuplet?.id !== group.id),
    totalTicks(events),
    `remove-${group.id}`,
    bar,
  );
}
export type ToneChoice = { eventId: string; toneId: string };
export function tieChoice(events: readonly ScoreEvent[], selection: readonly ToneChoice[]) {
  if (selection.length < 1 || selection.length > 2) return null;
  const ordered = [...selection].sort(
    (a, b) =>
      events.findIndex((e) => e.id === a.eventId) - events.findIndex((e) => e.id === b.eventId),
  );
  const from = ordered[0],
    index = events.findIndex((e) => e.id === from.eventId),
    source = events[index],
    tone = source && eventTones(source).find((t) => t.id === from.toneId),
    next = events[index + 1];
  if (!tone || !next) return null;
  const destination = eventTones(next).find(
    (t) => pitchKey(t.spelling) === pitchKey(tone.spelling),
  );
  if (
    !destination ||
    (ordered.length === 2 &&
      (ordered[1].eventId !== next.id || ordered[1].toneId !== destination.id))
  )
    return null;
  return { from, index, source, tone, destination };
}
export function tiedEvents(
  events: readonly ScoreEvent[],
  selection: readonly ToneChoice[],
  value?: boolean,
) {
  const choice = tieChoice(events, selection);
  if (!choice) return null;
  const on = value ?? !choice.tone.tieToNext;
  if (Boolean(choice.tone.tieToNext) === on) return events as ScoreEvent[];
  return events.map((e) =>
    e.id !== choice.source.id
      ? e
      : withTones(
          e,
          eventTones(e).map((t) => (t.id === choice.tone.id ? { ...t, tieToNext: on } : t)),
        ),
  );
}
export function arpeggioEvents(
  events: readonly ScoreEvent[],
  id: string,
  value: 'up' | 'down' | null,
) {
  const event = events.find((e) => e.id === id);
  if (!event || eventTones(event).length < 2) return null;
  if ((event.arpeggio ?? null) === value) return events as ScoreEvent[];
  return events.map((e) => (e.id !== id ? e : { ...e, arpeggio: value ?? undefined }));
}
export const groupTicks = (event: ScoreEvent) =>
  event.tuplet ? eventTicks(event) * event.tuplet.count : eventTicks(event);
