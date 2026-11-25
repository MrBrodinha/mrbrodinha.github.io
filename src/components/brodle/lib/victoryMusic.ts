import { abcLength, melodyNotation, melodyBeats, stepTicks, RHYTHM_TICKS, validateTriplets, PIANO_MIN_MIDI, PIANO_MAX_MIDI } from './musicGame';
import type { MelodyStep, MusicalKey, NoteNaming, TimeSignature } from './musicGame';

export type Clef = 'treble' | 'bass';
export type VictoryStep = MelodyStep & { pitches?: number[] };
export type PlayableStep = Pick<VictoryStep, 'midi' | 'beats' | 'pitches' | 'triplet' | 'staccato' | 'arpeggio' | 'tieToNext'>;
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
  const notes = raw.map((step) => {
    const validPitch = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= VICTORY_MIN_MIDI && Number(value) <= VICTORY_MAX_MIDI;
    if (!step || (step.midi !== null && !validPitch(step.midi)) || !Object.prototype.hasOwnProperty.call(rhythms, step.beats) || typeof step.beats !== 'number') throw new Error('Invalid victory note');
    let pitches: number[] | undefined;
    if (Object.prototype.hasOwnProperty.call(step, 'pitches')) {
      if (!Array.isArray(step.pitches) || step.pitches.length < 2 || step.pitches.length > 8 || !step.pitches.every(validPitch)) throw new Error('Invalid chord');
      pitches = [...step.pitches];
      if (pitches.some((pitch, index) => index > 0 && pitch <= pitches![index - 1]) || step.midi !== pitches[0]) throw new Error('Invalid chord pitches');
    }
    return { midi: step.midi, beats: step.beats, length: abcLength(step.beats), rhythm: `${rhythms[step.beats]}${step.triplet !== undefined ? ' triplet' : ''} ${pitches ? 'chord' : step.midi === null ? 'rest' : 'note'}`, ...(pitches ? { pitches } : {}), ...(step.staccato !== undefined ? {staccato:step.staccato} : {}), ...(step.arpeggio !== undefined ? {arpeggio:step.arpeggio} : {}), ...(step.tieToNext !== undefined ? {tieToNext:Array.isArray(step.tieToNext)?[...step.tieToNext]:step.tieToNext} : {}), ...(Object.prototype.hasOwnProperty.call(step, 'triplet') ? { triplet: step.triplet } : {}) };
  });
  validateTriplets(notes);
  validateExpressions(notes);
  return notes;
}
export function transposeVictory(part: readonly VictoryStep[], offset: number): VictoryStep[] {
  return part.map((step) => ({ ...step, midi: step.midi === null ? null : step.midi + offset, ...(step.pitches ? { pitches: step.pitches.map((pitch) => pitch + offset) } : {}), ...(step.tieToNext ? {tieToNext:step.tieToNext.map(pitch=>pitch+offset)} : {}) }));
}
export function validateExpressions(notes: readonly PlayableStep[]) {
  for (const [i, step] of notes.entries()) {
    const pitches = stepPitches(step);
    if (step.staccato !== undefined && (typeof step.staccato !== 'boolean' || !pitches.length)) throw new Error('Invalid staccato');
    if (step.arpeggio !== undefined && (!['up','down'].includes(step.arpeggio) || pitches.length < 2)) throw new Error('Invalid arpeggio');
    if (step.tieToNext !== undefined) {
      if (!Array.isArray(step.tieToNext) || !step.tieToNext.length || step.tieToNext.length > 8 || step.tieToNext.some((pitch,j,a) => !Number.isInteger(pitch) || (j>0 && pitch<=a[j-1]) || !pitches.includes(pitch) || !stepPitches(notes[i+1] ?? {midi:null,beats:1}).includes(pitch))) throw new Error('Invalid tie destination');
    }
  }
}
export function arrangementTimeline(parts: readonly (readonly PlayableStep[])[], bpm: number) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('Invalid tempo');
  const events: { pitches: readonly number[]; time: number; duration: number; sustain?: boolean }[] = [];
  let totalDuration = 0;
  for (const part of parts) {
    let ticks = 0;
    const starts = part.map(step => {const start=ticks;ticks+=stepTicks(step);return start;});
    const seconds = (ticks:number) => ticks/RHYTHM_TICKS*60/bpm;
    for (const [i,step] of part.entries()) {
      const pitches=stepPitches(step),attacks=pitches.filter(pitch => !part[i-1]?.tieToNext?.includes(pitch));
      const ordered=[...attacks].sort((a,b)=>(a-b)*(step.arpeggio==='down'?-1:1));
      const spread=step.arpeggio&&ordered.length>1?Math.min(.12,seconds(stepTicks(step))/3):0;
      if (!step.staccato && !step.arpeggio && !step.tieToNext && attacks.length===pitches.length) {
        if(pitches.length)events.push({pitches,time:seconds(starts[i]),duration:seconds(stepTicks(step))});
        continue;
      }
      for(const pitch of attacks){
        let end=starts[i]+stepTicks(step),cursor=i,tied=false;
        while(part[cursor]?.tieToNext?.includes(pitch)&&part[cursor+1]&&stepPitches(part[cursor+1]).includes(pitch)){cursor++;end=starts[cursor]+stepTicks(part[cursor]);tied=true;}
        const time=seconds(starts[i])+(ordered.length>1?ordered.indexOf(pitch)*spread/(ordered.length-1):0);
        events.push({pitches:[pitch],time,duration:(seconds(end)-time)*(step.staccato && !tied ? .5 : 1),sustain:true});
      }
    }
    totalDuration=Math.max(totalDuration,seconds(ticks));
  }
  return {events:events.sort((a,b)=>a.time-b.time),totalDuration};
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
  const length = Math.max(...[main,second].map(melodyBeats));
  const unfinished = [main, second].some((part) => {
    const last = part[part.length - 1];
    return last?.triplet && last.triplet < 3;
  });
  const padded = (part: readonly VictoryStep[]) => {
    // While entering a group, show only the authored entries. Complete parts
    // can use ordinary padding rests once the triplet's rhythm is settled.
    if (unfinished) return part;
    const gap = length - melodyBeats(part);
    return gap > 0 ? [...part,{midi:null,beats:gap,length:abcLength(gap),rhythm:'Rest'}] : part;
  };
  const scores = [melodyNotation(padded(main), naming, key, bpm, meter, false, mainClef), melodyNotation(padded(second), naming, key, bpm, meter, false, secondClef)];
  const body = (index: number) => scores[index].abc.split('\n').slice(5).join('\n').trim();
  return {
    abc: `X:1\nM:${meter}\nL:1/4\nQ:1/4=${bpm}\n%%score { upper lower }\nV:upper clef=${mainClef}\nV:lower clef=${secondClef}\nK:${key}\n[V:upper] ${body(0)}\n[V:lower] ${body(1)}`,
    stepIndices: scores.map((score, voice) => score.stepIndices.map((index) => index < [main, second][voice].length ? index : null)),
  };
}
