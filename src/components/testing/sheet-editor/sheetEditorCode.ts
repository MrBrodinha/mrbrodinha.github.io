import { scoreSteps, eventTones, pitchMidi, meterName, DEFAULT_TEMPO_BEAT } from './sheetEditorModel';
import type { ScoreEvent } from './sheetEditorModel';

export const SCORE_STEP_TYPE =
  'type ScoreStep = { midi: number | null; pitches?: number[]; length: string; beats: number; rhythm: string };';
export type CodeRange = { start: number; end: number; startLine: number; endLine: number };
export function codeRange(text: string, start: number, end: number): CodeRange {
  return {
    start,
    end,
    startLine: text.slice(0, start).split('\n').length,
    endLine: text.slice(0, end).split('\n').length,
  };
}
// Map by stable event ID; line/offsets come from the actual serialized document.
export function codeSnapshot(events: readonly ScoreEvent[]) {
  let code =
    [
      'export const BPM = 120;',
      "export const KEY = 'C';",
      "export const TIME_SIGNATURE = '4/4';",
      '',
      SCORE_STEP_TYPE,
      'export const MELODY: ScoreStep[] = [',
    ].join('\n') + '\n';
  const ranges: Record<string, CodeRange> = {};
  for (const [index, step] of scoreSteps(events).entries()) {
    const start = code.length;
    code += `  ${JSON.stringify(step)},\n`;
    ranges[events[index].id] = codeRange(code, start + 2, code.length - 2);
  }
  return { code: code + '];', ranges };
}
export function sheetEditorCode(events: readonly ScoreEvent[]): string {
  return codeSnapshot(events).code;
}

export const LEGACY_SCORE_STAFF_TYPE =
  "type ScoreStaff = { id: string; clef: 'treble' | 'bass'; steps: ScoreStep[] };";
export const sourceKey = (staffId: string, eventId: string) => JSON.stringify([staffId, eventId]);
export const TUPLET_TYPE =
  'type TupletSpec = { id: string; count: number; inTimeOf: number; index: number };';
export const SCORE_EVENT_TYPE =
  "type ScoreEventData = { midi: number | null; pitches?: number[]; duration: string; dotted?: boolean; staccato?: boolean; tuplet?: TupletSpec; tieToNext?: number[]; arpeggio?: 'up' | 'down' };";
export const LEGACY_RICH_SCORE_STAFF_TYPE =
  "type ScoreStaff = { id: string; clef: 'treble' | 'bass'; steps: ScoreEventData[] };";
export const SCORE_STAFF_TYPE = LEGACY_SCORE_STAFF_TYPE.replace("'treble' | 'bass'", "'treble' | 'bass' | 'alto' | 'tenor'");
export const RICH_SCORE_STAFF_TYPE = LEGACY_RICH_SCORE_STAFF_TYPE.replace("'treble' | 'bass'", "'treble' | 'bass' | 'alto' | 'tenor'");
export function eventData(event: ScoreEvent) {
  const tones = eventTones(event),
    pitches = tones.map((t) => pitchMidi(t.spelling)).sort((a, b) => a - b),
    ties = tones
      .filter((t) => t.tieToNext)
      .map((t) => pitchMidi(t.spelling))
      .sort((a, b) => a - b);
  return {
    midi: pitches[0] ?? null,
    ...(pitches.length > 1 ? { pitches } : {}),
    duration: event.duration,
    ...(event.dotted ? { dotted: true } : {}),
    ...(event.staccato ? { staccato: true } : {}),
    ...(event.tuplet ? { tuplet: event.tuplet } : {}),
    ...(ties.length ? { tieToNext: ties } : {}),
    ...(event.arpeggio ? { arpeggio: event.arpeggio } : {}),
  };
}
export function scoreCodeSnapshot(score: import('./scoreModel').Score) {
  let code = `export const BPM = ${score.bpm};\nexport const KEY = ${JSON.stringify(score.key)};\nexport const TIME_SIGNATURE = '${meterName(score.meter)}';\nexport const TEMPO_BEAT = ${JSON.stringify(score.tempoBeat ?? DEFAULT_TEMPO_BEAT)};\n\n${TUPLET_TYPE}\n${SCORE_EVENT_TYPE}\n${RICH_SCORE_STAFF_TYPE}\nexport const STAVES: ScoreStaff[] = [\n`;
  const ranges: Record<string, CodeRange> = {};
  for (const staff of score.staffs) {
    code += `  { id: ${JSON.stringify(staff.id)}, clef: ${JSON.stringify(staff.clef)}, steps: [\n`;
    for (const event of staff.events) {
      const start = code.length + 4;
      code += `    ${JSON.stringify(eventData(event))},\n`;
      ranges[sourceKey(staff.id, event.id)] = codeRange(code, start, code.length - 2);
    }
    code += '  ] },\n';
  }
  return { code: code + '];', ranges };
}
