import { abcLength, MUSICAL_KEYS, TIME_SIGNATURES, PIANO_MIN_MIDI, PIANO_MAX_MIDI } from '../lib/musicGame';
import { restoreVictoryNotes } from '../lib/victoryMusic';
import type { VictoryStep, Clef } from '../lib/victoryMusic';
import type { MelodyStep, MusicalKey, TimeSignature } from '../lib/musicGame';

export const DURATIONS = [
  { id: 'sixteenth', label: 'Sixteenth', beats: .25, fraction: '1/16' },
  { id: 'eighth', label: 'Eighth', beats: .5, fraction: '1/8' },
  { id: 'quarter', label: 'Quarter', beats: 1, fraction: '1/4' },
  { id: 'half', label: 'Half', beats: 2, fraction: '1/2' },
  { id: 'whole', label: 'Whole', beats: 4, fraction: '1' },
] as const;
export type DurationId = typeof DURATIONS[number]['id'];
export type ComposerDraft = { title?: string; source?: string; hint?: string; finalMelody?: VictoryStep[]; finalBass?: VictoryStep[]; finalClef?: Clef; finalBassClef?: Clef; melody: MelodyStep[]; bpm: number; key: MusicalKey; timeSignature: TimeSignature };
export const COMPOSER_STORAGE_KEY = 'brodle:composer:v1';

export function makeStep(midi: number | null, duration: DurationId, dotted: boolean): MelodyStep {
  const option = DURATIONS.find((value) => value.id === duration)!;
  const beats = option.beats * (dotted ? 1.5 : 1);
  return { midi, length: abcLength(beats), beats, rhythm: `${dotted ? 'Dotted ' : ''}${dotted ? option.label.toLowerCase() : option.label} ${midi === null ? 'rest' : 'note'}` };
}

export function durationForStep(step: MelodyStep): { duration: DurationId; dotted: boolean } {
  for (const dotted of [false, true]) {
    const option = DURATIONS.find((value) => value.beats * (dotted ? 1.5 : 1) === step.beats);
    if (option) return { duration: option.id, dotted };
  }
  return { duration: 'quarter', dotted: false };
}

export function emptyComposerDraft(): ComposerDraft { return { melody: [], bpm: 120, key: 'C', timeSignature: '4/4' }; }

export function parseComposerDraft(serialized: string | null): ComposerDraft {
  try {
    const value = JSON.parse(serialized ?? 'null');
    if (!value || !Array.isArray(value.melody) || !Number.isInteger(value.bpm) || value.bpm < 20 || value.bpm > 400 || !MUSICAL_KEYS.includes(value.key)) return emptyComposerDraft();
    const timeSignature = value.timeSignature ?? '4/4';
    if (!TIME_SIGNATURES.includes(timeSignature)) return emptyComposerDraft();
    const melody: MelodyStep[] = [];
    for (const step of value.melody) {
      if (!step || 'pitches' in step || (step.midi !== null && (!Number.isInteger(step.midi) || step.midi < PIANO_MIN_MIDI || step.midi > PIANO_MAX_MIDI))) return emptyComposerDraft();
      const { duration, dotted } = durationForStep(step);
      const restored = makeStep(step.midi, duration, dotted);
      if (restored.beats !== step.beats) return emptyComposerDraft();
      melody.push(restored);
    }
    const extras: Partial<ComposerDraft> = {};
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
    'export const MELODY: MelodyStep[] = [',
    ...draft.melody.map((step) => `  { midi: ${step.midi}, length: '${step.length}', beats: ${step.beats}, rhythm: '${step.rhythm}' },`),
    '];',
    ...(draft.finalMelody?.length ? ['', 'export const MELODY_FINAL: (MelodyStep & { pitches?: number[] })[] = [', ...draft.finalMelody.map(exportVictoryStep), '];'] : []),
    ...(draft.finalBass?.length ? ['', 'export const MELODY_FINAL_BASS: (MelodyStep & { pitches?: number[] })[] = [', ...draft.finalBass.map(exportVictoryStep), '];'] : []),
    ...(draft.finalMelody?.length || draft.finalBass?.length || draft.finalClef || draft.finalBassClef ? [`export const FINAL_CLEF: 'treble' | 'bass' = '${draft.finalClef ?? 'treble'}';`, `export const FINAL_BASS_CLEF: 'treble' | 'bass' = '${draft.finalBassClef ?? 'bass'}';`] : []),
  ].join('\n');
}

function exportVictoryStep(step: VictoryStep) {
  return `  { midi: ${step.midi},${step.pitches ? ` pitches: [${step.pitches.join(', ')}],` : ''} length: '${step.length}', beats: ${step.beats}, rhythm: '${step.rhythm}' },`;
}
export function makeVictoryStep(pitches: readonly number[], duration: DurationId, dotted: boolean): VictoryStep {
  const sorted = [...new Set(pitches)].sort((a,b) => a-b);
  const base = makeStep(sorted[0] ?? null, duration, dotted);
  return restoreVictoryNotes([{ ...base, ...(sorted.length > 1 ? { pitches: sorted } : {}) }])[0];
}
