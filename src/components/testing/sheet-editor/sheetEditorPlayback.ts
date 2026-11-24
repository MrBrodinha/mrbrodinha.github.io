import {
  eventTones,
  eventTicks,
  pitchMidi,
  pitchKey,
  timedEvents,
  totalTicks,
  TICKS_PER_BEAT,
  secondsForTicks,
} from './sheetEditorModel';
import type { TempoBeat } from './sheetEditorRhythm';
import type { ScoreEvent } from './sheetEditorModel';
import type { Score } from './scoreModel';
import type { AudioTimeline } from '../../brodle/hooks/usePianoAudio';
export function performanceTimeline(score: Score): AudioTimeline {
  const seconds = (tick: number) => secondsForTicks(tick, score.bpm, score.tempoBeat);
  const totalDuration = seconds(totalTicks(score.staffs[0].events)),
    events: AudioTimeline['events'] = [];
  for (const staff of score.staffs) {
    const spans = timedEvents(staff.events);
    const incoming = new Set<string>();
    for (const [index, span] of spans.entries()) {
      const attacks = eventTones(span.event).filter(
        (t) => !incoming.has(JSON.stringify([span.event.id, t.id])),
      );
      const ordered = [...attacks].sort(
        (a, b) =>
          (pitchMidi(a.spelling) - pitchMidi(b.spelling)) *
          (span.event.arpeggio === 'down' ? -1 : 1),
      );
      const spread =
        span.event.arpeggio && ordered.length > 1
          ? Math.min(0.12, seconds(eventTicks(span.event)) / 3)
          : 0;
      for (const tone of attacks) {
        const time =
          seconds(span.start) +
          (ordered.length > 1 ? (ordered.indexOf(tone) * spread) / (ordered.length - 1) : 0);
        let current = tone,
          end = span.end,
          nextIndex = index + 1,
          tied = false;
        while (current.tieToNext && spans[nextIndex]) {
          const next = eventTones(spans[nextIndex].event).find(
            (t) => pitchKey(t.spelling) === pitchKey(current.spelling),
          );
          if (!next) break;
          incoming.add(JSON.stringify([spans[nextIndex].event.id, next.id]));
          tied = true;
          end = spans[nextIndex].end;
          current = next;
          nextIndex++;
        }
        events.push({
          midi: pitchMidi(tone.spelling),
          time,
          duration: (seconds(end) - time) * (span.event.staccato && !tied ? .5 : 1),
          ...(tied || span.event.arpeggio || span.event.staccato ? { sustain: true } : {}),
        });
      }
    }
  }
  return { events: events.sort((a, b) => a.time - b.time), totalDuration };
}
export function auditionTimeline(
  pitches: readonly number[],
  bpm: number,
  beats = 1,
  arpeggio?: ScoreEvent['arpeggio'],
  tempoBeat?: TempoBeat,
  staccato = false,
): AudioTimeline {
  const totalDuration = Math.min(0.5, secondsForTicks(Math.min(beats, 1) * TICKS_PER_BEAT, bpm, tempoBeat)),
    ordered = [...new Set(pitches)].sort((a, b) => (a - b) * (arpeggio === 'down' ? -1 : 1)),
    spread = arpeggio && ordered.length > 1 ? Math.min(0.12, totalDuration / 3) : 0;
  return {
    totalDuration,
    events: ordered.map((midi, i) => {
      const time = ordered.length > 1 ? (spread * i) / (ordered.length - 1) : 0;
      return {
        midi,
        time,
        duration: (totalDuration - time) * (staccato ? .5 : 1),
        ...(arpeggio || staccato ? { sustain: true } : {}),
      };
    }),
  };
}
