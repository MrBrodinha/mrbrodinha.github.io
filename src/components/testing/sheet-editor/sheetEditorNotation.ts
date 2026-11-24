import { abcLength } from '../../brodle/lib/musicGame';
import {
  notationTones,
  pitchKey,
  totalTicks,
  timedEvents,
  NOTE_TICKS,
  TICKS_PER_BEAT,
  measureTicks, beamTicks, meterName, DEFAULT_METER, DEFAULT_TEMPO_BEAT,
  eventTicks,
} from './sheetEditorModel';
import { keyAccidentals } from './scoreModel';
import { eventData } from './sheetEditorCode';
import type { ScoreEvent } from './sheetEditorModel';
import type { Score } from './scoreModel';
import type { TuneObject, VoiceItemNote } from 'abcjs';
export const scoreSignature = (events: readonly ScoreEvent[]) =>
  JSON.stringify(events.map(eventData));
export type ScoreFragment = {
  staffIndex: number;
  eventIndex: number;
  row: number;
  start: number;
  end: number;
};
export function protectedRanges(score: Score) {
  return score.staffs.flatMap((staff) => {
    const spans = timedEvents(staff.events);
    return spans
      .filter((s) => s.event.tuplet?.index === 1)
      .map((s) => ({ start: s.start, end: s.start + eventTicks(s.event) * s.event.tuplet!.count }));
  });
}
export const legalCut = (score: Score, tick: number) =>
  !protectedRanges(score).some((g) => tick > g.start && tick < g.end);
function restoreTies(tune: TuneObject, score: Score, fragments: readonly ScoreFragment[]) {
  // abcjs tracks partial chord ties by chord index, so changing chord shapes
  // can lose an endpoint or attach it to an unrelated pitch. The score owns
  // the actual per-pitch links; restore both endpoints before engraving.
  const notes = tune.lines.flatMap((line) =>
    (line.staff ?? []).flatMap((staff) =>
      (staff.voices ?? [])
        .flat()
        .filter(
          (item): item is VoiceItemNote =>
            item.el_type === 'note' && !['spacer', 'invisible'].includes(item.rest?.type ?? ''),
        ),
    ),
  );
  if (notes.length !== fragments.length) throw new Error('Score fragment mapping is incomplete');
  const spans = score.staffs.map((staff) => timedEvents(staff.events));
  notes.forEach((note, index) => {
    const fragment = fragments[index],
      part = spans[fragment.staffIndex],
      span = part[fragment.eventIndex],
      tones = notationTones(span.event),
      previous = part[fragment.eventIndex - 1];
    note.pitches?.forEach((pitch, toneIndex) => {
      delete pitch.startTie;
      delete pitch.endTie;
      const tone = tones[toneIndex];
      if (!tone) return;
      if (fragment.end < span.end || tone.tieToNext) pitch.startTie = {};
      if (
        fragment.start > span.start ||
        (previous &&
          notationTones(previous.event).some(
            (from) => from.tieToNext && pitchKey(from.spelling) === pitchKey(tone.spelling),
          ))
      )
        pitch.endTie = true;
    });
  });
  return tune;
}
export function scoreNotation(score: Score, cuts: readonly number[] = [], separation = 140) {
  const barTicks = measureTicks(score.meter), beamLength = beamTicks(score.meter), tempoBeat = score.tempoBeat ?? DEFAULT_TEMPO_BEAT;
  const tempoDenominator = 4 * TICKS_PER_BEAT / NOTE_TICKS[tempoBeat.duration];
  const tempoFraction = tempoBeat.dotted ? `3/${tempoDenominator * 2}` : `1/${tempoDenominator}`;
  const end = totalTicks(score.staffs[0].events),
    starts = [0, ...new Set(cuts.filter((t) => t > 0 && t < end && legalCut(score, t))), end].sort(
      (a, b) => a - b,
    );
  const bodies: string[][] = score.staffs.map(() => []),
    mapped: ScoreFragment[][] = score.staffs.map(() => []),
    signature = keyAccidentals(score.key);
  score.staffs.forEach((staff, staffIndex) => {
    const alterations = new Map<string, number>();
    let lastBar = -1;
    for (let system = 0; system < starts.length - 1; system++) {
      const from = starts[system],
        until = starts[system + 1],
        seen = new Set<string>();
      let body = 'y0',
        lastBeam = false;
      for (const span of timedEvents(staff.events)) {
        let tick = Math.max(from, span.start),
          remaining = Math.min(until, span.end) - tick;
        if (remaining <= 0) continue;
        while (remaining > 0) {
          const bar = Math.floor(tick / barTicks);
          if (bar !== lastBar) {
            alterations.clear();
            lastBar = bar;
          }
          const available = Math.min(remaining, barTicks - (tick % barTicks));
          const ticks = span.event.tuplet
            ? available
            : [6720, 5040, 3360, 2520, 1680, 1260, 840, 630, 420, 210].find((n) => n <= available);
          if (!ticks) throw new Error('Unsupported display subdivision');
          const continuation = tick + ticks < span.end;
          const tones = notationTones(span.event),
            pitches = tones.map((tone) => {
              const pitch = tone.spelling,
                key = `${pitch.letter}${pitch.octave}`,
                baseline = signature[pitch.letter] ?? 0,
                previous = alterations.get(key) ?? baseline;
              const caution =
                system > 0 &&
                !seen.has(key) &&
                (previous !== baseline || pitch.accidental !== baseline);
              const prefix =
                !caution && previous === pitch.accidental
                  ? ''
                  : pitch.accidental === 1
                    ? '^'
                    : pitch.accidental === -1
                      ? '_'
                      : '=';
              seen.add(key);
              alterations.set(key, pitch.accidental);
              return (
                prefix +
                (pitch.octave >= 5
                  ? pitch.letter.toLowerCase() + "'".repeat(pitch.octave - 5)
                  : pitch.letter + ','.repeat(4 - pitch.octave))
              );
            });
          const length = abcLength(
            (span.event.tuplet ? NOTE_TICKS[span.event.duration] : ticks) / TICKS_PER_BEAT,
          );
          const ties = tones.map((t) => continuation || Boolean(t.tieToNext));
          const symbol =
            pitches.length > 1
              ? '[' + pitches.map((p, i) => p + (ties[i] ? '-' : '')).join('') + ']'
              : (pitches[0] ?? 'z');
          const beam =
            pitches.length > 0 &&
            NOTE_TICKS[span.event.duration] < TICKS_PER_BEAT &&
            (!span.event.tuplet || span.event.tuplet.index > 1) && tick % beamLength !== 0;
          const group =
            span.event.tuplet?.index === 1
              ? `(${span.event.tuplet.count}:${span.event.tuplet.inTimeOf}:${span.event.tuplet.count}`
              : '';
          const ornament =
            tick === span.start && span.event.arpeggio
              ? (span.event.arpeggio === 'down' ? '"^↓"' : '') + '!arpeggio!'
              : '';
          body +=
            (beam && lastBeam ? '' : ' ') +
            group +
            ornament +
            (tick === span.start && span.event.staccato && pitches.length ? '.' : '') +
            symbol +
            length +
            (pitches.length === 1 && ties[0] ? '-' : '');
          mapped[staffIndex].push({
            staffIndex,
            eventIndex: span.index,
            row: system * score.staffs.length + staffIndex,
            start: tick,
            end: tick + ticks,
          });
          lastBeam = pitches.length > 0 && NOTE_TICKS[span.event.duration] < TICKS_PER_BEAT;
          tick += ticks;
          remaining -= ticks;
          if (span.event.tuplet && span.event.tuplet.index === span.event.tuplet.count)
            lastBeam = false;
          if (tick % barTicks === 0) {
            if (tick < end) body += ' |';
            lastBeam = false;
          }
        }
      }
      bodies[staffIndex].push(body + (system === starts.length - 2 ? ' y0 |]' : ''));
    }
  });
  const fragments = mapped.flat().sort((a, b) => a.row - b.row || a.start - b.start);
  const voices = score.staffs.map((s, i) => `V:s${i} clef=${s.clef}`).join('\n');
  const music = score.staffs.map((_, i) => `[V:s${i}] ` + bodies[i].join('\n')).join('\n');
  return {
    abc: `X:1\nM:${meterName(score.meter)}\nL:1/4\nQ:${tempoFraction}=${score.bpm}\n%%staffsep ${separation}\n%%sysstaffsep ${separation}\n%%stretchlast 1\n%%score { ${score.staffs.map((_, i) => 's' + i).join(' ')} }\n${voices}\nK:${score.key}\n${music}\n`,
    fragments,
    afterParsing: (tune: TuneObject) => restoreTies(tune, score, fragments),
    stepIndices: fragments.map((f) => f.eventIndex),
    fragmentRows: fragments.map((f) => f.row),
  };
}
export function sheetNotation(
  events: readonly ScoreEvent[],
  _leadingSpaces = 1,
  breaks: readonly number[] = [],
  separation = 140,
) {
  const spans = timedEvents(events);
  void _leadingSpaces;
  return scoreNotation(
    {
      meter: DEFAULT_METER, tempoBeat: DEFAULT_TEMPO_BEAT,
      bpm: 120,
      key: 'C',
      staffs: [{ id: 'staff-1', clef: 'treble', events: events as ScoreEvent[] }],
    },
    breaks.map((i) => spans[i]?.start).filter((n): n is number => n !== undefined),
    separation,
  );
}
