import { abcLength, melodyNotation, PIANO_MIN_MIDI, PIANO_MAX_MIDI } from './musicGame';
import type { MelodyStep, MusicalKey, NoteNaming, TimeSignature } from './musicGame';

export type Clef = 'treble' | 'bass';
export type VictoryStep = MelodyStep & { pitches?: number[] };
export type PlayableStep = Pick<VictoryStep, 'midi' | 'beats' | 'pitches'>;
export const VICTORY_MIN_MIDI = PIANO_MIN_MIDI;
export const VICTORY_MAX_MIDI = PIANO_MAX_MIDI;
export const stepPitches = (step: PlayableStep): readonly number[] => step.pitches ?? (step.midi === null ? [] : [step.midi]);

export function victoryPianoRange(parts: readonly (readonly PlayableStep[])[]) {
  const pitches = parts.flatMap((part) => part.flatMap(stepPitches));
  if (!pitches.length) return null;
  const lowest = Math.min(...pitches);
  const highest = Math.max(...pitches);
  const black = [1, 3, 6, 8, 10];
  return {
    minMidi: lowest - (black.includes((lowest % 12 + 12) % 12) ? 1 : 0),
    maxMidi: highest + (black.includes((highest % 12 + 12) % 12) ? 1 : 0),
  };
}

const rhythms: Record<number, string> = { .125:'Demisemiquaver', .1875:'Dotted demisemiquaver', .25:'Sixteenth', .375:'Dotted sixteenth', .5:'Eighth', .75:'Dotted eighth', 1:'Quarter', 1.5:'Dotted quarter', 2:'Half', 3:'Dotted half', 4:'Whole', 6:'Dotted whole' };
export function restoreVictoryNotes(raw: unknown, limit = 512): VictoryStep[] {
  if (!Array.isArray(raw) || raw.length > limit) throw new Error('Invalid victory part');
  return raw.map((step) => {
    const validPitch = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= VICTORY_MIN_MIDI && Number(value) <= VICTORY_MAX_MIDI;
    if (!step || (step.midi !== null && !validPitch(step.midi)) || !Object.prototype.hasOwnProperty.call(rhythms, step.beats) || typeof step.beats !== 'number') throw new Error('Invalid victory note');
    let pitches: number[] | undefined;
    if (Object.prototype.hasOwnProperty.call(step, 'pitches')) {
      if (!Array.isArray(step.pitches) || step.pitches.length < 2 || step.pitches.length > 8 || !step.pitches.every(validPitch)) throw new Error('Invalid chord');
      pitches = [...step.pitches];
      if (pitches.some((pitch, index) => index > 0 && pitch <= pitches![index - 1]) || step.midi !== pitches[0]) throw new Error('Invalid chord pitches');
    }
    return { midi: step.midi, beats: step.beats, length: abcLength(step.beats), rhythm: `${rhythms[step.beats]} ${pitches ? 'chord' : step.midi === null ? 'rest' : 'note'}`, ...(pitches ? { pitches } : {}) };
  });
}
export function transposeVictory(part: readonly VictoryStep[], offset: number): VictoryStep[] {
  return part.map((step) => ({ ...step, midi: step.midi === null ? null : step.midi + offset, ...(step.pitches ? { pitches: step.pitches.map((pitch) => pitch + offset) } : {}) }));
}
export function arrangementTimeline(parts: readonly (readonly PlayableStep[])[], bpm: number) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('Invalid tempo');
  const events: { pitches: readonly number[]; time: number; duration: number }[] = [];
  let totalDuration = 0;
  for (const part of parts) {
    let time = 0;
    for (const step of part) {
      const duration = step.beats * 60 / bpm;
      const pitches = stepPitches(step);
      if (pitches.length) events.push({ pitches, time, duration });
      time += duration;
    }
    totalDuration = Math.max(totalDuration, time);
  }
  return { events: events.sort((a,b) => a.time-b.time), totalDuration };
}
export function victoryNotation(main: readonly VictoryStep[], second: readonly VictoryStep[], naming: NoteNaming,
  key: MusicalKey, bpm: number, meter: TimeSignature, mainClef: Clef = 'treble', secondClef: Clef = 'bass', showSecond = second.length > 0): string {
  return victoryScore(main, second, naming, key, bpm, meter, mainClef, secondClef, showSecond).abc;
}
// Preserve authored indices through ties and the display-only rests which align parts.
export function victoryScore(main: readonly VictoryStep[], second: readonly VictoryStep[], naming: NoteNaming,
  key: MusicalKey, bpm: number, meter: TimeSignature, mainClef: Clef = 'treble', secondClef: Clef = 'bass', showSecond = second.length > 0) {
  if (!showSecond) {
    const score = melodyNotation(main, naming, key, bpm, meter, false, mainClef);
    return { abc: score.abc, stepIndices: [score.stepIndices] as (number | null)[][] };
  }
  const length = Math.max(...[main,second].map((part) => part.reduce((sum,step) => sum + step.beats,0)));
  const padded = (part: readonly VictoryStep[]) => {
    const gap = length - part.reduce((sum,step) => sum + step.beats,0);
    return gap > 0 ? [...part,{midi:null,beats:gap,length:abcLength(gap),rhythm:'Rest'}] : part;
  };
  const scores = [melodyNotation(padded(main), naming, key, bpm, meter, false, mainClef), melodyNotation(padded(second), naming, key, bpm, meter, false, secondClef)];
  const body = (index: number) => scores[index].abc.split('\n').slice(5).join('\n').trim();
  return {
    abc: `X:1\nM:${meter}\nL:1/4\nQ:1/4=${bpm}\n%%score { upper lower }\nV:upper clef=${mainClef}\nV:lower clef=${secondClef}\nK:${key}\n[V:upper] ${body(0)}\n[V:lower] ${body(1)}`,
    stepIndices: scores.map((score, voice) => score.stepIndices.map((index) => index < [main, second][voice].length ? index : null)),
  };
}
