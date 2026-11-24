import { MUSICAL_KEYS } from '../../brodle/lib/musicGame';
import type { MusicalKey } from '../../brodle/lib/musicGame';
import {
  codeRange,
  SCORE_STEP_TYPE,
  SCORE_STAFF_TYPE,
  TUPLET_TYPE,
  SCORE_EVENT_TYPE,
  RICH_SCORE_STAFF_TYPE,
  LEGACY_SCORE_STAFF_TYPE,
  LEGACY_RICH_SCORE_STAFF_TYPE,
  eventData,
} from './sheetEditorCode';
import type { CodeRange } from './sheetEditorCode';
import {
  importedScore,
  isClef,
  timedEvents,
  validMidi,
  totalTicks,
  eventTicks,
  TICKS_PER_BEAT,
  measureTicks, validMeter, validTempoBeat, DEFAULT_TEMPO_BEAT,
  NOTE_TICKS,
} from './sheetEditorModel';
import type { ImportedStep, ScoreEvent } from './sheetEditorModel';
import { initialScore, importScore, validStaffId } from './scoreModel';
import type { Clef, ImportedScore, Score } from './scoreModel';

type Kind = 'value' | 'staffs' | 'staff' | 'events' | 'event' | 'pitches' | 'tuplet';
// This bounded literal reader never evaluates submitted JavaScript/TypeScript.
class Reader {
  position = 0;
  locations = new WeakMap<object, CodeRange>();
  constructor(readonly text: string) {}
  fail(message: string, at = this.position): never {
    throw new Error(`${message} (line ${this.text.slice(0, at).split('\n').length}).`);
  }
  space() {
    for (;;) {
      const start = this.position;
      while (this.position < this.text.length && /\s/.test(this.text[this.position]))
        this.position++;
      if (this.text.startsWith('//', this.position)) {
        const end = this.text.indexOf('\n', this.position);
        this.position = end < 0 ? this.text.length : end + 1;
      } else if (this.text.startsWith('/*', this.position)) {
        const end = this.text.indexOf('*/', this.position + 2);
        if (end < 0) this.fail('Close the comment');
        this.position = end + 2;
      }
      if (start === this.position) return;
    }
  }
  take(value: string) {
    this.space();
    if (!this.text.startsWith(value, this.position)) return false;
    this.position += value.length;
    return true;
  }
  identifier() {
    this.space();
    const name = this.text.slice(this.position).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (!name) this.fail('Expected a name');
    this.position += name.length;
    return name;
  }
  literal(depth = 0, kind: Kind = 'value'): unknown {
    this.space();
    const start = this.position;
    if (depth > 8) this.fail('The data is nested too deeply');
    if (this.take('[')) {
      const result: unknown[] = [];
      const limit = kind === 'staffs' ? 4 : kind === 'events' ? 64 : 8;
      while (!this.take(']')) {
        if (result.length >= limit)
          this.fail(
            `Use at most ${limit} ${kind === 'staffs' ? 'staffs' : kind === 'events' ? 'score events' : 'chord pitches'}`,
          );
        result.push(
          this.literal(
            depth + 1,
            kind === 'staffs' ? 'staff' : kind === 'events' ? 'event' : 'value',
          ),
        );
        if (!this.take(',')) {
          if (!this.take(']')) this.fail('Expected , or ]');
          break;
        }
      }
      this.locations.set(result, codeRange(this.text, start, this.position));
      return result;
    }
    if (this.take('{')) {
      const result: Record<string, unknown> = Object.create(null),
        allowed =
          kind === 'staff'
            ? ['id', 'clef', 'steps']
            : kind === 'tuplet'
              ? ['id', 'count', 'inTimeOf', 'index']
              : [
                  'midi',
                  'pitches',
                  'beats',
                  'length',
                  'rhythm',
                  'duration',
                  'dotted',
                  'staccato',
                  'tuplet',
                  'tieToNext',
                  'arpeggio',
                ];
      while (!this.take('}')) {
        this.space();
        const name = /['"]/.test(this.text[this.position] ?? '')
          ? this.literal(depth + 1)
          : this.identifier();
        if (typeof name !== 'string' || !allowed.includes(name)) this.fail('Unknown score field');
        if (Object.prototype.hasOwnProperty.call(result, name)) this.fail(`Duplicate ${name}`);
        if (!this.take(':')) this.fail('Expected :');
        result[name] = this.literal(
          depth + 1,
          name === 'steps'
            ? 'events'
            : name === 'pitches' || name === 'tieToNext'
              ? 'pitches'
              : name === 'tuplet'
                ? 'tuplet'
                : 'value',
        );
        if (!this.take(',')) {
          if (!this.take('}')) this.fail('Expected , or }');
          break;
        }
      }
      this.locations.set(result, codeRange(this.text, start, this.position));
      return result;
    }
    const quote = this.text[this.position];
    if (quote === '"' || quote === "'") {
      this.position++;
      let result = '';
      while (this.position < this.text.length) {
        const c = this.text[this.position++];
        if (c === quote) return result;
        if (c === '\n' || c === '\r') this.fail('Close the string');
        if (c !== '\\') {
          result += c;
          continue;
        }
        const escapes: Record<string, string> = {
            n: '\n',
            r: '\r',
            t: '\t',
            '\\': '\\',
            "'": "'",
            '"': '"',
          },
          e = this.text[this.position++];
        if (!Object.prototype.hasOwnProperty.call(escapes, e)) this.fail('Unsupported escape');
        result += escapes[e];
      }
      this.fail('Close the string');
    }
    const number = this.text
      .slice(this.position)
      .match(/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?\b/)?.[0];
    if (number) {
      this.position += number.length;
      return Number(number);
    }
    if (this.take('null')) return null;
    if (this.take('true')) return true;
    if (this.take('false')) return false;
    return this.fail('Use literal numbers, strings, arrays, objects or null');
  }
  typeDeclaration() {
    const match = this.text
      .slice(this.position)
      .match(/^type\s+(ScoreStep|ScoreStaff|ScoreEventData|TupletSpec)\s*=\s*\{[^{}]*\}\s*;/);
    if (
      !match ||
      ![
        SCORE_STEP_TYPE,
        SCORE_STAFF_TYPE,
        TUPLET_TYPE,
        SCORE_EVENT_TYPE,
        RICH_SCORE_STAFF_TYPE,
        LEGACY_SCORE_STAFF_TYPE,
        LEGACY_RICH_SCORE_STAFF_TYPE,
      ].some((type) => type.replace(/\s/g, '') === match[0].replace(/\s/g, ''))
    )
      this.fail('Keep the generated score types');
    this.position += match[0].length;
    return match[1];
  }
  at(value: unknown) {
    return value && typeof value === 'object' ? (this.locations.get(value)?.start ?? 0) : 0;
  }
}
export type ParsedScore = ImportedScore & {
  steps: ImportedStep[];
  ranges: CodeRange[];
  staffRanges: Record<string, CodeRange[]>;
};
export function parseSheetCode(text: string): ParsedScore {
  if (text.length > 250000) throw new Error('Use at most 250,000 characters (line 1).');
  const r = new Reader(text),
    constants: Record<string, unknown> = Object.create(null),
    types = new Set<string>();
  r.space();
  while (r.position < text.length) {
    if (/^type\b/.test(text.slice(r.position))) {
      const name = r.typeDeclaration();
      if (types.has(name)) r.fail('Duplicate score type');
      types.add(name);
      r.space();
      continue;
    }
    const declaration = text
      .slice(r.position)
      .match(
        /^(?:export\s+)?const\s+(BPM|KEY|TIME_SIGNATURE|TEMPO_BEAT|MELODY|STAVES)\b\s*(?::\s*(ScoreStep|ScoreStaff)\s*\[\s*\]\s*)?=/,
      );
    if (!declaration) return r.fail('Expected a supported score constant');
    const name = declaration[1],
      annotation = declaration[2];
    if (
      annotation &&
      annotation !== (name === 'STAVES' ? 'ScoreStaff' : name === 'MELODY' ? 'ScoreStep' : '')
    )
      r.fail('Keep the generated constant types');
    if (Object.prototype.hasOwnProperty.call(constants, name)) r.fail(`Duplicate ${name}`);
    r.position += declaration[0].length;
    constants[name] = r.literal(
      0,
      name === 'MELODY' ? 'events' : name === 'STAVES' ? 'staffs' : 'value',
    );
    r.take(';');
    r.space();
  }
  for (const name of ['BPM', 'KEY', 'TIME_SIGNATURE'])
    if (!Object.prototype.hasOwnProperty.call(constants, name)) r.fail(`Missing ${name}`, 0);
  if (!Number.isInteger(constants.BPM) || Number(constants.BPM) < 20 || Number(constants.BPM) > 400)
    r.fail('BPM must be an integer from 20 to 400', 0);
  if (!MUSICAL_KEYS.includes(constants.KEY as MusicalKey)) r.fail('Choose a supported KEY', 0);
  const match = typeof constants.TIME_SIGNATURE === 'string' && /^(\d{1,2})\/(1|2|4|8|16|32)$/.exec(constants.TIME_SIGNATURE);
  const meter = match ? { numerator: Number(match[1]), denominator: Number(match[2]) } : null;
  if (!validMeter(meter)) return r.fail('Use a supported TIME_SIGNATURE (numerator 1–32)', 0);
  const tempoBeat = Object.prototype.hasOwnProperty.call(constants, 'TEMPO_BEAT') ? constants.TEMPO_BEAT : DEFAULT_TEMPO_BEAT;
  if (!validTempoBeat(tempoBeat) || Object.keys(tempoBeat).some(key => !['duration','dotted'].includes(key))) return r.fail('Use a supported TEMPO_BEAT duration and boolean dotted flag', 0);
  const bar = measureTicks(meter);
  const legacy = Object.prototype.hasOwnProperty.call(constants, 'MELODY');
  if (legacy && Object.prototype.hasOwnProperty.call(constants, 'STAVES'))
    r.fail('Use MELODY or STAVES, not both', 0);
  const rawStaffs = legacy
    ? [{ id: 'staff-1', clef: 'treble', steps: constants.MELODY }]
    : constants.STAVES;
  if (!Array.isArray(rawStaffs) || rawStaffs.length < 1 || rawStaffs.length > 4)
    return r.fail('Use one to four staffs', 0);
  const staffs: ImportedScore['staffs'] = [],
    staffRanges: Record<string, CodeRange[]> = Object.create(null);
  for (const value of rawStaffs) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      r.fail('Each staff must be an object', r.at(value));
    const staff = value as Record<string, unknown>,
      at = r.at(value);
    if (!validStaffId(staff.id) || staffRanges[staff.id])
      return r.fail('Use unique safe staff IDs (1–80 characters)', at);
    if (!isClef(staff.clef))
      r.fail('Choose treble, bass, alto or tenor clef', at);
    if (!Array.isArray(staff.steps) || !staff.steps.length || staff.steps.length > 64)
      return r.fail('Each staff needs 1–64 events and complete measures', at);
    const steps: ImportedStep[] = [],
      ranges: CodeRange[] = [];
    for (const value of staff.steps) {
      const at = r.at(value);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        r.fail('Each event must be an object', at);
      const note = value as Record<string, unknown>,
        midi = note.midi,
        pitches = note.pitches;
      if (
        !Object.prototype.hasOwnProperty.call(note, 'midi') ||
        (midi !== null && !validMidi(midi))
      )
        r.fail('Use integer MIDI pitches 0–127 or null', at);
      if (
        pitches !== undefined &&
        (!Array.isArray(pitches) ||
          pitches.length < 2 ||
          pitches.length > 8 ||
          pitches.some((n, i) => !validMidi(n) || (i > 0 && pitches[i - 1] >= n)) ||
          midi !== pitches[0])
      )
        r.fail('Use 2–8 ascending unique chord pitches; midi must be the lowest', at);
      if (
        note.duration !== undefined &&
        (typeof note.duration !== 'string' ||
          !Object.prototype.hasOwnProperty.call(NOTE_TICKS, note.duration))
      )
        r.fail('Choose a supported duration', at);
      if (
        note.duration === undefined &&
        (typeof note.beats !== 'number' || !Number.isFinite(note.beats) || note.beats <= 0)
      )
        r.fail('Use a duration or supported legacy beats', at);
      if (note.dotted !== undefined && typeof note.dotted !== 'boolean')
        r.fail('Dotted must be true or false', at);
      if (note.staccato !== undefined && typeof note.staccato !== 'boolean')
        r.fail('Staccato must be true or false', at);
      if (note.arpeggio !== undefined && ![true, 'up', 'down'].includes(note.arpeggio as string))
        r.fail('Arpeggio must be up or down on a chord', at);
      if (
        note.tuplet !== undefined &&
        (!note.tuplet || typeof note.tuplet !== 'object' || Array.isArray(note.tuplet))
      )
        r.fail('Use a complete tuplet descriptor', at);
      if (
        note.tieToNext !== undefined &&
        (!Array.isArray(note.tieToNext) || !note.tieToNext.length || note.tieToNext.length > 8)
      )
        r.fail('Use 1–8 outgoing tied MIDI pitches', at);
      if (
        (note.length !== undefined && typeof note.length !== 'string') ||
        (note.rhythm !== undefined && typeof note.rhythm !== 'string')
      )
        r.fail('Length and rhythm are generated strings', at);
      const sounding = Array.isArray(pitches) ? pitches : midi === null ? [] : [midi];
      if (note.staccato && !sounding.length) r.fail('Staccato requires a note or chord', at);
      if (
        Array.isArray(note.tieToNext) &&
        note.tieToNext.some(
          (n, i) =>
            !validMidi(n) ||
            !sounding.includes(n) ||
            (i > 0 && (note.tieToNext as number[])[i - 1] >= n),
        )
      )
        r.fail('Outgoing ties must be ascending unique pitches of this event', at);
      if (note.arpeggio && sounding.length < 2) r.fail('Arpeggios require a chord', at);
      if (note.dotted && (note.duration === 'thirty-second' || note.tuplet))
        r.fail('Dots require an ordinary sixteenth or longer value', at);
      steps.push({
        midi: note.midi as number | null,
        ...(pitches ? { pitches: pitches as number[] } : {}),
        ...(note.duration
          ? {
              duration: note.duration as ImportedStep['duration'],
              ...(note.dotted !== undefined ? { dotted: note.dotted as boolean } : {}),
              ...(note.tuplet ? { tuplet: note.tuplet as ImportedStep['tuplet'] } : {}),
            }
          : { beats: note.beats as number }),
        ...(note.tieToNext ? { tieToNext: note.tieToNext as number[] } : {}),
        ...(note.staccato ? { staccato: true } : {}),
        ...(note.arpeggio ? { arpeggio: note.arpeggio as ImportedStep['arpeggio'] } : {}),
      });
      ranges.push(r.locations.get(value as object)!);
    }
    const normalized = importedScore([], steps, 'check', bar);
    if (!normalized)
      return r.fail(
        `Staff ${staff.id}: rhythm, complete tuplets, ties and arpeggios must fit equal complete measures and the 64-event cap`,
        at,
      );
    const tick = totalTicks(normalized);
    if (tick % bar) r.fail('Include rests to complete measures in TIME_SIGNATURE', at);
    staffs.push({ id: staff.id, clef: staff.clef as Clef, steps });
    staffRanges[staff.id] = ranges;
  }
  const result = { bpm: constants.BPM as number, key: constants.KEY as MusicalKey, meter, tempoBeat, staffs };
  if (!importScore(initialScore(), result, 'check'))
    r.fail('All staffs must have equal complete measure lengths', 0);
  return { ...result, steps: staffs[0].steps, ranges: staffRanges[staffs[0].id], staffRanges };
}
export function linkedDraftRange(
  parsed: ParsedScore,
  events: readonly ScoreEvent[],
  id: string,
  staffId = parsed.staffs[0].id,
): CodeRange | null {
  const target = timedEvents(events).find((span) => span.event.id === id),
    staff = parsed.staffs.find((s) => s.id === staffId);
  if (!target || !staff) return null;
  const expected = eventData(target.event);
  let tick = 0;
  const normalized = importScore(
    initialScore(),
    { bpm: parsed.bpm, key: parsed.key, meter: parsed.meter, tempoBeat: parsed.tempoBeat, staffs: [staff] },
    'link',
  )?.staffs[0].events;
  for (const [index, step] of staff.steps.entries()) {
    const duration = step.duration
      ? eventTicks({ duration: step.duration, dotted: step.dotted, tuplet: step.tuplet })
      : Number(step.beats) * TICKS_PER_BEAT;
    const candidate = normalized && timedEvents(normalized).find((s) => s.start === tick);
    if (
      candidate &&
      tick === target.start &&
      duration === eventTicks(target.event) &&
      JSON.stringify(eventData(candidate.event)) === JSON.stringify(expected)
    )
      return parsed.staffRanges[staffId][index];
    tick += duration;
  }
  return null;
}
export function linkedScoreRange(
  parsed: ParsedScore,
  score: Score,
  staffId: string,
  eventId: string,
) {
  const staff = score.staffs.find((s) => s.id === staffId);
  return staff ? linkedDraftRange(parsed, staff.events, eventId, staffId) : null;
}
