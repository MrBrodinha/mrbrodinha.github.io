import { melodyPayload, recordDraft } from '../../brodle/lib/melodyLibrary';
import type { MelodyRecord, StudioDocument } from '../../brodle/lib/melodyLibrary';
import { TIME_SIGNATURES, validateTriplets } from '../../brodle/lib/musicGame';
import type { TimeSignature } from '../../brodle/lib/musicGame';
import type { ComposerDraft } from '../../brodle/creator/melodyComposer';
import type { VictoryStep } from '../../brodle/lib/victoryMusic';
import { restoreVictoryNotes } from '../../brodle/lib/victoryMusic';
import { emptyScore, importScore, initialScore } from './scoreModel';
import type { Meter } from './sheetEditorRhythm';
import type { Score, ScoreState } from './scoreModel';
import { parseSheetCode } from './sheetEditorCodeParser';
import { scoreCodeSnapshot } from './sheetEditorCode';
import { eventTones, eventTicks, pitchMidi, NOTE_TICKS, TICKS_PER_BEAT, meterName, tempoBeatTicks, validPitch } from './sheetEditorModel';

export type StudioTrack = 'main' | 'final';
export type StudioDraft = { title: string; source: string; hint: string; document: StudioDocument };
export type StudioSession = { state: ScoreState; codeDraft: string | null };
export const emptyStudioDraft = (): StudioDraft => {
  return { title: '', source: '', hint: '', document: { version: 1, main: studioScoreDocument(initialScore(), null), final: studioScoreDocument(initialScore(), null) } };
};
export function studioSession(value: StudioDocument['main']): StudioSession {
  const score = importScore(initialScore(), parseSheetCode(value.score), 'restore:');
  if (!score) throw new Error('Unable to restore this score.');
  if (value.notation !== undefined) {
    if (!Array.isArray(value.notation) || value.notation.length !== score.staffs.length) throw new Error('Invalid saved notation.');
    score.staffs = score.staffs.map((staff, partIndex) => {
      const part = value.notation![partIndex];
      if (!Array.isArray(part) || part.length !== staff.events.length) throw new Error('Invalid saved notation.');
      return { ...staff, events: staff.events.map((event, eventIndex) => {
        const written = part[eventIndex], tones = eventTones(event);
        if (!written || typeof written.authored !== 'boolean' || !Array.isArray(written.pitches) || written.pitches.length !== tones.length || written.pitches.some((pitch, index) => !pitch || !validPitch(pitch) || pitchMidi(pitch) !== pitchMidi(tones[index].spelling))) throw new Error('Invalid saved notation.');
        return { ...event, authored: written.authored, ...(tones.length ? { spelling: { ...written.pitches[0] }, tones: tones.map((tone, index) => ({ ...tone, spelling: { ...written.pitches[index] } })) } : {}) };
      }) };
    });
  }
  return { state: { ...emptyScore(), score, active: score.staffs[0].id }, codeDraft: value.codeDraft };
}
export function studioScoreDocument(score: Score, codeDraft: string | null): StudioDocument['main'] {
  return { score: scoreCodeSnapshot(score).code, codeDraft, notation: score.staffs.map(staff => staff.events.map(event => ({ authored: Boolean(event.authored), pitches: eventTones(event).map(tone => ({ ...tone.spelling })).sort((a,b) => pitchMidi(a)-pitchMidi(b)) }))) };
}
export function parseStudioDraft(raw: unknown): StudioDraft {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid studio draft.');
  const value = raw as StudioDraft;
  if (typeof value.title !== 'string' || value.title.length > 160 || typeof value.source !== 'string' || value.source.length > 200 || typeof value.hint !== 'string' || value.hint.length > 300 || value.document?.version !== 1) throw new Error('Invalid studio draft.');
  for (const track of ['main', 'final'] as const) {
    const part = value.document[track];
    if (!part || typeof part.score !== 'string' || part.score.length > 100000 || (part.codeDraft !== null && (typeof part.codeDraft !== 'string' || part.codeDraft.length > 100000))) throw new Error('Invalid studio score.');
    studioSession(part);
  }
  const part = (track: StudioTrack): StudioDocument['main'] => {
    const data = value.document[track];
    return { score: data.score, codeDraft: data.codeDraft, ...(data.notation ? { notation: data.notation.map(staff => staff.map(event => ({ authored: event.authored, pitches: event.pitches.map(pitch => ({ letter: pitch.letter, octave: pitch.octave, accidental: pitch.accidental })) }))) } : {}) };
  };
  return { title: value.title, source: value.source, hint: value.hint, document: { version: 1, main: part('main'), final: part('final') } };
}
function partNotes(score: Score, staffIndex: number, challenge: boolean) {
  const events = score.staffs[staffIndex].events;
  const stored = events.map(event => {
    const tones = eventTones(event), pitches = tones.map(t => pitchMidi(t.spelling)).sort((a,b) => a-b);
    if (challenge && pitches.length > 1) throw new Error('Game melody must use single notes. Chords can go in Victory melody.');
    if (pitches.some(p => p < 31 || p > 103)) throw new Error('For Brodle, keep notes between G1 and G7.');
    if (event.tuplet && (event.tuplet.count !== 3 || event.tuplet.inTimeOf !== 2 || !['eighth','quarter'].includes(event.duration))) throw new Error('For Brodle, tuplets must be eighth-note or quarter-note triplets. Other tuplets remain saved in your draft.');
    return { midi: pitches[0] ?? null, ...(pitches.length > 1 ? { pitches } : {}), ...(event.staccato ? {staccato:true} : {}), ...(event.arpeggio ? {arpeggio:event.arpeggio} : {}), ...(tones.some(t=>t.tieToNext)?{tieToNext:tones.filter(t=>t.tieToNext).map(t=>pitchMidi(t.spelling)).sort((a,b)=>a-b)}:{}), beats: NOTE_TICKS[event.duration] / TICKS_PER_BEAT * (event.dotted ? 1.5 : 1), ...(event.tuplet ? { triplet: event.tuplet.index } : {}) };
  });
  const notes = restoreVictoryNotes(stored);
  validateTriplets(notes, true);
  // Prove that the adapter did not change performed timing.
  const ticks = stored.reduce((sum, step) => sum + step.beats * TICKS_PER_BEAT * (step.triplet ? 2/3 : 1), 0);
  const sourceTicks = events.slice(0, stored.length).reduce((sum, event) => sum + eventTicks(event), 0);
  if (ticks !== sourceTicks) throw new Error('This rhythm cannot yet be used in Brodle.');
  return notes;
}
export function studioComposer(draft: StudioDraft): ComposerDraft {
  const main = studioSession(draft.document.main).state.score, final = studioSession(draft.document.final).state.score;
  if (main.staffs.length !== 1 || main.staffs[0].clef !== 'treble') throw new Error('Game melody needs exactly one staff in Treble clef.');
  if (final.staffs.length > 2) throw new Error('Victory melody currently supports up to two staffs in Brodle.');
  const timeSignature = meterName(main.meter);
  if (!TIME_SIGNATURES.includes(timeSignature as TimeSignature)) throw new Error('Choose a time signature supported by Brodle before submitting.');
  const hasFinal = final.staffs.some(staff => staff.events.some(event => eventTones(event).length));
  if (hasFinal && meterName(final.meter) !== timeSignature) throw new Error('Use the same time signature for Main and Victory melody before submitting.');
  const bpm = (score: Score) => {
    const value = score.bpm * tempoBeatTicks(score.tempoBeat) / TICKS_PER_BEAT;
    if (!Number.isInteger(value) || value < 20 || value > 400) throw new Error('This tempo beat needs a whole-number equivalent between 20 and 400 quarter-note BPM for Brodle.');
    return value;
  };
  if (hasFinal && final.staffs.some(staff => !['treble','bass'].includes(staff.clef))) throw new Error('Use Treble or Bass clefs for Victory melody before submitting.');
  return { title: draft.title, source: draft.source, hint: draft.hint, melody: partNotes(main, 0, true), bpm: bpm(main), key: main.key, timeSignature: timeSignature as TimeSignature,
    ...(hasFinal ? { finalMelody: partNotes(final, 0, false), finalBass: final.staffs[1] ? partNotes(final, 1, false) : [], finalBpm: bpm(final), finalKey: final.key, finalClef: final.staffs[0].clef as 'treble' | 'bass', finalBassClef: (final.staffs[1]?.clef ?? 'bass') as 'treble' | 'bass' } : {}) };
}
export function studioSubmissionIssue(draft: StudioDraft): string {
  if (!draft.title.trim()) return 'Add a title before submitting.';
  if (draft.document.main.codeDraft !== null || draft.document.final.codeDraft !== null) return 'Apply or reset the code draft in both melodies before submitting.';
  try {
    const composer = studioComposer(draft);
    if (!composer.melody.some(step => step.midi !== null)) return 'Add a note to Game melody before submitting.';
    melodyPayload(composer); return '';
  } catch (error) { return error instanceof Error ? error.message : 'This melody cannot yet be used in Brodle.'; }
}
export function studioPayload(draft: StudioDraft) {
  let payload;
  try { payload = melodyPayload(studioComposer(draft)); }
  catch { payload = melodyPayload({ melody: [], bpm: 120, key: 'C', timeSignature: '4/4' }); }
  return { ...payload, title: draft.title.trim(), source: draft.source.trim(), hint: draft.hint.trim(), studio_document: draft.document };
}
export function studioFromRecord(row: MelodyRecord): StudioDraft {
  if (row.studio_document) return parseStudioDraft({ title: row.title, source: row.source, hint: row.hint, document: row.studio_document });
  const old = recordDraft(row), result = emptyStudioDraft();
  const convert = (main: boolean) => {
    const parts: VictoryStep[][] = main ? [old.melody] : [old.finalMelody ?? [], old.finalBass ?? []].filter(part => part.length);
    if (!parts.length || !parts.some(part => part.some(step => step.midi !== null))) return result.document.final;
    const input = { bpm: main ? old.bpm : old.finalBpm ?? old.bpm, key: main ? old.key : old.finalKey ?? old.key, meter: { numerator: Number(old.timeSignature.split('/')[0]), denominator: Number(old.timeSignature.split('/')[1]) as Meter['denominator'] }, staffs: parts.map((steps, index) => ({ id: 'staff-'+(index+1), clef: main ? 'treble' as const : index ? old.finalBassClef ?? 'bass' : old.finalClef ?? 'treble', steps: steps.map((step, stepIndex) => ({ midi: step.midi, ...(step.pitches ? { pitches: step.pitches } : {}), beats: step.beats, ...(step.staccato ? {staccato:true} : {}), ...(step.arpeggio ? {arpeggio:step.arpeggio} : {}), ...(step.tieToNext ? {tieToNext:step.tieToNext} : {}), ...(step.triplet ? { duration: step.beats === .5 ? 'eighth' as const : 'quarter' as const, tuplet: { id: 'legacy-'+(stepIndex - (step.triplet - 1)), count: 3, inTimeOf: 2, index: step.triplet } } : {}) })) })) };
    // Legacy scores may stop inside a bar; the editor import pads them.
    const score = importScore(initialScore(), input, 'legacy:');
    if (!score) throw new Error('This older melody cannot be opened losslessly in Studio. Open it in the classic composer.');
    return studioScoreDocument(score, null);
  };
  return { title: row.title, source: row.source, hint: row.hint, document: { version: 1, main: convert(true), final: convert(false) } };
}
