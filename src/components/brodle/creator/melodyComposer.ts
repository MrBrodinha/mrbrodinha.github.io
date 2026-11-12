import { abcLength, MUSICAL_KEYS, TIME_SIGNATURES } from '../lib/musicGame';
import { restoreVictoryNotes } from '../lib/victoryMusic';
import type { VictoryStep, Clef } from '../lib/victoryMusic';
import type { MelodyStep, MusicalKey, TimeSignature, TripletPosition } from '../lib/musicGame';

export const DURATIONS = [
  { id: 'thirty-second', label: 'Demisemiquaver', beats: .125, fraction: '1/32' },
  { id: 'sixteenth', label: 'Sixteenth', beats: .25, fraction: '1/16' },
  { id: 'eighth', label: 'Eighth', beats: .5, fraction: '1/8' },
  { id: 'quarter', label: 'Quarter', beats: 1, fraction: '1/4' },
  { id: 'half', label: 'Half', beats: 2, fraction: '1/2' },
  { id: 'whole', label: 'Whole', beats: 4, fraction: '1' },
] as const;
export type DurationId = typeof DURATIONS[number]['id'];
export type ComposerDraft = { title?: string; source?: string; hint?: string; finalMelody?: VictoryStep[]; finalBass?: VictoryStep[]; finalClef?: Clef; finalBassClef?: Clef; finalBpm?: number; finalKey?: MusicalKey; melody: MelodyStep[]; bpm: number; key: MusicalKey; timeSignature: TimeSignature };
export const COMPOSER_STORAGE_KEY = 'brodle:composer:v1';

export function makeStep(midi: number | null, duration: DurationId, dotted: boolean, triplet?: TripletPosition): MelodyStep {
  if (triplet && (dotted || !['eighth', 'quarter'].includes(duration))) throw new Error('Triplets use undotted eighth or quarter notes.');
  const option = DURATIONS.find((value) => value.id === duration)!;
  const beats = option.beats * (dotted ? 1.5 : 1);
  return { midi, length: abcLength(beats), beats, rhythm: `${dotted ? 'Dotted ' : ''}${dotted ? option.label.toLowerCase() : option.label}${triplet ? ' triplet' : ''} ${midi === null ? 'rest' : 'note'}`, ...(triplet ? { triplet } : {}) };
}

export function durationForStep(step: MelodyStep): { duration: DurationId; dotted: boolean } {
  for (const dotted of [false, true]) {
    const option = DURATIONS.find((value) => value.beats * (dotted ? 1.5 : 1) === step.beats);
    if (option) return { duration: option.id, dotted };
  }
  return { duration: 'quarter', dotted: false };
}

// Editing one member changes the written duration of its whole 3:2 group.
export function changeStepDuration(part: readonly VictoryStep[], index: number, duration: DurationId, dotted: boolean): VictoryStep[] {
  const selected = part[index];
  if (!selected) return [...part];
  const start = selected.triplet ? index - selected.triplet + 1 : index;
  const end = selected.triplet ? start + 3 : start + 1;
  return part.map((step, position) => position >= start && position < end
    ? makeVictoryStep(step.pitches ?? (step.midi === null ? [] : [step.midi]), duration, selected.triplet ? false : dotted, step.triplet)
    : step);
}

export function finishTriplet(part: readonly VictoryStep[]): VictoryStep[] {
  const last = part[part.length - 1];
  if (!last?.triplet || last.triplet === 3) return [...part];
  const duration = durationForStep(last).duration;
  const result = [...part];
  for (let position = last.triplet + 1; position <= 3; position++) result.push(makeStep(null, duration, false, position as TripletPosition));
  return result;
}

export function emptyComposerDraft(): ComposerDraft { return { melody: [], bpm: 120, key: 'C', finalBpm: 120, finalKey: 'C', timeSignature: '4/4' }; }

// Older drafts and published snapshots inherit the challenge settings.
export function victorySettings(draft: Pick<ComposerDraft, 'bpm' | 'key' | 'finalBpm' | 'finalKey'>) {
  return { bpm: draft.finalBpm ?? draft.bpm, key: draft.finalKey ?? draft.key };
}

export function parseComposerDraft(serialized: string | null): ComposerDraft {
  try {
    const value = JSON.parse(serialized ?? 'null');
    if (!value || !Array.isArray(value.melody) || !Number.isInteger(value.bpm) || value.bpm < 20 || value.bpm > 400 || !MUSICAL_KEYS.includes(value.key)) return emptyComposerDraft();
    const timeSignature = value.timeSignature ?? '4/4';
    if (!TIME_SIGNATURES.includes(timeSignature)) return emptyComposerDraft();
    if (value.melody.some((step: VictoryStep) => step && 'pitches' in step)) return emptyComposerDraft();
    const melody = restoreVictoryNotes(value.melody, Math.max(256, value.melody.length));
    const extras: Partial<ComposerDraft> = {};
    if (value.finalBpm !== undefined) {
      if (!Number.isInteger(value.finalBpm) || value.finalBpm < 20 || value.finalBpm > 400) return emptyComposerDraft();
      extras.finalBpm = value.finalBpm;
    }
    if (value.finalKey !== undefined) {
      if (!MUSICAL_KEYS.includes(value.finalKey)) return emptyComposerDraft();
      extras.finalKey = value.finalKey;
    }
    for (const [field, limit] of [['title', 160], ['source', 200], ['hint', 300]] as const) {
      if (value[field] !== undefined) {
        if (typeof value[field] !== 'string' || value[field].length > limit) return emptyComposerDraft();
        extras[field] = value[field];
      }
    }
    for (const field of ['finalMelody', 'finalBass'] as const) {
      if (value[field] !== undefined) extras[field] = restoreVictoryNotes(value[field]);
    }
    for (const field of ['finalClef', 'finalBassClef'] as const) {
      if (value[field] !== undefined) {
        if (value[field] !== 'treble' && value[field] !== 'bass') return emptyComposerDraft();
        extras[field] = value[field];
      }
    }
    return { melody, bpm: value.bpm, key: value.key, timeSignature, ...extras };
  } catch { return emptyComposerDraft(); }
}

export function exportMelodyCode(draft: ComposerDraft): string {
  return [
    `export const BPM = ${draft.bpm};`,
    `export const TIME_SIGNATURE: TimeSignature = '${draft.timeSignature ?? '4/4'}';`,
    `export const KEY: MusicalKey = '${draft.key}';`, '',
    ...(draft.finalBpm !== undefined ? [`export const FINAL_BPM = ${draft.finalBpm};`] : []),
    ...(draft.finalKey !== undefined ? [`export const FINAL_KEY: MusicalKey = '${draft.finalKey}';`] : []),
    'export const MELODY: MelodyStep[] = [',
    ...draft.melody.map(exportVictoryStep),
    '];',
    ...(draft.finalMelody?.length ? ['', 'export const MELODY_FINAL: (MelodyStep & { pitches?: number[] })[] = [', ...draft.finalMelody.map(exportVictoryStep), '];'] : []),
    ...(draft.finalBass?.length ? ['', 'export const MELODY_FINAL_BASS: (MelodyStep & { pitches?: number[] })[] = [', ...draft.finalBass.map(exportVictoryStep), '];'] : []),
    ...(draft.finalMelody?.length || draft.finalBass?.length || draft.finalClef || draft.finalBassClef ? [`export const FINAL_CLEF: 'treble' | 'bass' = '${draft.finalClef ?? 'treble'}';`, `export const FINAL_BASS_CLEF: 'treble' | 'bass' = '${draft.finalBassClef ?? 'bass'}';`] : []),
  ].join('\n');
}

function exportVictoryStep(step: VictoryStep) {
  return `  { midi: ${step.midi},${step.pitches ? ` pitches: [${step.pitches.join(', ')}],` : ''}${step.triplet ? ` triplet: ${step.triplet},` : ''} length: '${step.length}', beats: ${step.beats}, rhythm: '${step.rhythm}' },`;
}
export function makeVictoryStep(pitches: readonly number[], duration: DurationId, dotted: boolean, triplet?: TripletPosition): VictoryStep {
  const sorted = [...new Set(pitches)].sort((a,b) => a-b);
  const base = makeStep(sorted[0] ?? null, duration, dotted, triplet);
  // Validate the chord in isolation; its triplet position belongs to its part.
  const note = restoreVictoryNotes([{ midi: base.midi, beats: base.beats, ...(sorted.length > 1 ? { pitches: sorted } : {}) }])[0];
  return { ...note, rhythm: base.rhythm.replace('note', sorted.length > 1 ? 'chord' : 'note'), ...(triplet ? { triplet } : {}) };
}
