import { abcLength, MUSICAL_KEYS } from './musicGame';
import type { MelodyStep, MusicalKey } from './musicGame';

export const DURATIONS = [
  { id: 'sixteenth', label: 'Sixteenth', beats: .25, fraction: '1/16' },
  { id: 'eighth', label: 'Eighth', beats: .5, fraction: '1/8' },
  { id: 'quarter', label: 'Quarter', beats: 1, fraction: '1/4' },
  { id: 'half', label: 'Half', beats: 2, fraction: '1/2' },
  { id: 'whole', label: 'Whole', beats: 4, fraction: '1' },
] as const;
export type DurationId = typeof DURATIONS[number]['id'];
export type ComposerDraft = { melody: MelodyStep[]; bpm: number; key: MusicalKey };
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

export function emptyComposerDraft(): ComposerDraft { return { melody: [], bpm: 120, key: 'C' }; }

export function parseComposerDraft(serialized: string | null): ComposerDraft {
  try {
    const value = JSON.parse(serialized ?? 'null');
    if (!value || !Array.isArray(value.melody) || !Number.isInteger(value.bpm) || value.bpm < 20 || value.bpm > 400 || !MUSICAL_KEYS.includes(value.key)) return emptyComposerDraft();
    const melody: MelodyStep[] = [];
    for (const step of value.melody) {
      if (!step || (step.midi !== null && (!Number.isInteger(step.midi) || step.midi < 48 || step.midi > 84))) return emptyComposerDraft();
      const { duration, dotted } = durationForStep(step);
      const restored = makeStep(step.midi, duration, dotted);
      if (restored.beats !== step.beats) return emptyComposerDraft();
      melody.push(restored);
    }
    return { melody, bpm: value.bpm, key: value.key };
  } catch { return emptyComposerDraft(); }
}

export function exportMelodyCode(draft: ComposerDraft): string {
  return [
    `export const BPM = ${draft.bpm};`,
    `export const KEY: MusicalKey = '${draft.key}';`, '',
    'export const MELODY: MelodyStep[] = [',
    ...draft.melody.map((step) => `  { midi: ${step.midi}, length: '${step.length}', beats: ${step.beats}, rhythm: '${step.rhythm}' },`),
    '];',
  ].join('\n');
}
