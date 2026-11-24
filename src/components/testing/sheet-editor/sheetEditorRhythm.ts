// Experimental exact time. Production Brodle deliberately keeps its own grid.
export const TICKS_PER_BEAT = 1680;
export const MEASURE_TICKS = TICKS_PER_BEAT * 4;
export const NOTE_TICKS = {
  'thirty-second': 210,
  sixteenth: 420,
  eighth: 840,
  quarter: 1680,
  half: 3360,
  whole: 6720,
} as const;
export type Meter = { numerator: number; denominator: 1 | 2 | 4 | 8 | 16 | 32 };
export type TempoBeat = { duration: Exclude<keyof typeof NOTE_TICKS, 'thirty-second'>; dotted: boolean };
export const DEFAULT_METER: Meter = { numerator: 4, denominator: 4 };
export const DEFAULT_TEMPO_BEAT: TempoBeat = { duration: 'quarter', dotted: false };
export function validMeter(value: unknown): value is Meter {
  const meter = value as Meter | null;
  return Boolean(meter && Number.isInteger(meter.numerator) && meter.numerator >= 1 && meter.numerator <= 32 && [1,2,4,8,16,32].includes(meter.denominator));
}
export function validTempoBeat(value: unknown): value is TempoBeat {
  const beat = value as TempoBeat | null;
  return Boolean(beat && ['sixteenth','eighth','quarter','half','whole'].includes(beat.duration) && typeof beat.dotted === 'boolean');
}
export const meterBeatTicks = (meter: Meter = DEFAULT_METER) => TICKS_PER_BEAT * 4 / meter.denominator;
export const measureTicks = (meter: Meter = DEFAULT_METER) => meterBeatTicks(meter) * meter.numerator;
export const tempoBeatTicks = (beat: TempoBeat = DEFAULT_TEMPO_BEAT) => NOTE_TICKS[beat.duration] * (beat.dotted ? 1.5 : 1);
export const secondsForTicks = (tick: number, bpm: number, beat: TempoBeat = DEFAULT_TEMPO_BEAT) => tick / tempoBeatTicks(beat) * 60 / bpm;
export const meterName = (meter: Meter = DEFAULT_METER) => `${meter.numerator}/${meter.denominator}`;
export const beamTicks = (meter: Meter = DEFAULT_METER) => meterBeatTicks(meter) * (meter.denominator === 8 && [6,9,12].includes(meter.numerator) ? 3 : 1);
export type RhythmValue = keyof typeof NOTE_TICKS;
export type Tuplet = { id: string; count: number; inTimeOf: number; index: number };
export const TUPLET_RATIOS: Record<number, number> = { 2: 3, 3: 2, 4: 3, 5: 4, 6: 4, 7: 4, 8: 6 };
export const TUPLET_NAMES: Record<number, string> = { 2: 'Duplet', 3: 'Triplet', 4: 'Quadruplet', 5: 'Quintuplet', 6: 'Sextuplet', 7: 'Septuplet', 8: 'Octuplet' };
export const safeRhythmId = (id: unknown): id is string =>
  typeof id === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(id);
export function writtenTicks(event: { duration: RhythmValue; dotted?: boolean }) {
  return NOTE_TICKS[event.duration] * (event.dotted ? 1.5 : 1);
}
export function eventTicks(event: { duration: RhythmValue; dotted?: boolean; tuplet?: Tuplet }) {
  return event.tuplet
    ? (writtenTicks(event) * event.tuplet.inTimeOf) / event.tuplet.count
    : writtenTicks(event);
}
export const beatLabel = (ticks: number) => {
  const value = ticks / TICKS_PER_BEAT;
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(6)).toString();
};
