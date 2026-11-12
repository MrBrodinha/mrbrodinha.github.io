import { MUSICAL_KEYS, TIME_SIGNATURES, validateTriplets } from './musicGame';
import type { MelodyStep, MusicalKey, TimeSignature } from './musicGame';
import { restoreVictoryNotes } from './victoryMusic';
import type { VictoryStep, Clef } from './victoryMusic';
import { victorySettings } from '../creator/melodyComposer';
import type { ComposerDraft } from '../creator/melodyComposer';

export type MelodyStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type MelodyRecord = {
  id: string; created_by: string; author_username: string; title: string; source: string; hint: string;
  bpm: number; key_signature: MusicalKey; time_signature: TimeSignature;
  final_bpm?: number | null; final_key_signature?: MusicalKey | null;
  notes: StoredNote[]; final_notes: StoredVictoryNote[] | null; final_bass_notes?: StoredVictoryNote[] | null; final_clef?: Clef; final_bass_clef?: Clef; status: MelodyStatus; review_note: string;
  created_at: string; updated_at: string;
};
export type StoredNote = Pick<MelodyStep, 'midi' | 'beats' | 'triplet'>;
export type StoredVictoryNote = StoredNote & { pitches?: number[] };
export type ChallengeSnapshot = {
  title: string; source: string; hint: string; bpm: number; key: MusicalKey; timeSignature: TimeSignature;
  finalBpm?: number; finalKey?: MusicalKey;
  melody: StoredNote[]; finalMelody: StoredVictoryNote[]; finalBass?: StoredVictoryNote[]; finalClef?: Clef; finalBassClef?: Clef; author: string;
};
export type ScheduledChallenge = { id: string; play_date: string; melody_id: string | null; snapshot: ChallengeSnapshot };
export type GameChallenge = Omit<ChallengeSnapshot, 'melody' | 'finalMelody' | 'finalBass'> & {
  id: string; date?: string; melody: MelodyStep[]; finalMelody: VictoryStep[]; finalBass?: VictoryStep[];
};
export const MAX_MELODY_STEPS = 256;
export const MAX_FINAL_STEPS = 512;
export const MELODY_COLUMNS = 'id,created_by,author_username,title,source,hint,bpm,key_signature,final_bpm,final_key_signature,time_signature,notes,final_notes,final_bass_notes,final_clef,final_bass_clef,status,review_note,created_at,updated_at';

export function restoreNotes(raw: unknown, limit = MAX_MELODY_STEPS): MelodyStep[] {
  if (!Array.isArray(raw) || raw.length > limit) throw new Error('Invalid melody');
  if (raw.some((step) => step && 'pitches' in step)) throw new Error('Invalid pitch');
  return restoreVictoryNotes(raw, limit);
}
export const storeNotes = (notes: readonly MelodyStep[]): StoredNote[] => notes.map(({ midi, beats, triplet }) => ({ midi, beats, ...(triplet ? { triplet } : {}) }));
export function recordDraft(row: Pick<MelodyRecord, 'title' | 'source' | 'hint' | 'bpm' | 'key_signature' | 'final_bpm' | 'final_key_signature' | 'time_signature' | 'notes' | 'final_notes' | 'final_bass_notes' | 'final_clef' | 'final_bass_clef'>): ComposerDraft {
  if (!MUSICAL_KEYS.includes(row.key_signature) || !TIME_SIGNATURES.includes(row.time_signature)
    || !Number.isInteger(row.bpm) || row.bpm < 20 || row.bpm > 400) throw new Error('Invalid melody settings');
  if (row.final_bpm != null && (!Number.isInteger(row.final_bpm) || row.final_bpm < 20 || row.final_bpm > 400)) throw new Error('Invalid victory tempo');
  if (row.final_key_signature != null && !MUSICAL_KEYS.includes(row.final_key_signature)) throw new Error('Invalid victory key');
  return { title: row.title, source: row.source, hint: row.hint, bpm: row.bpm, key: row.key_signature,
    ...(row.final_bpm != null ? { finalBpm: row.final_bpm } : {}), ...(row.final_key_signature != null ? { finalKey: row.final_key_signature } : {}),
    timeSignature: row.time_signature, melody: restoreNotes(row.notes), finalMelody: restoreVictoryNotes(row.final_notes ?? []), finalBass: restoreVictoryNotes(row.final_bass_notes ?? []), finalClef: row.final_clef ?? 'treble', finalBassClef: row.final_bass_clef ?? 'bass' };
}
export function melodyPayload(draft: ComposerDraft) {
  const final = victorySettings(draft);
  if (!Number.isInteger(final.bpm) || final.bpm < 20 || final.bpm > 400 || !MUSICAL_KEYS.includes(final.key)) throw new Error('Invalid victory settings');
  restoreNotes(draft.melody);
  restoreVictoryNotes(draft.finalMelody ?? []);
  restoreVictoryNotes(draft.finalBass ?? []);
  [draft.melody, draft.finalMelody ?? [], draft.finalBass ?? []].forEach((part) => validateTriplets(part, true));
  return { title: (draft.title ?? '').trim(), source: (draft.source ?? '').trim(), hint: (draft.hint ?? '').trim(),
    bpm: draft.bpm, key_signature: draft.key, time_signature: draft.timeSignature,
    final_bpm: final.bpm, final_key_signature: final.key,
    notes: storeNotes(draft.melody), final_notes: draft.finalMelody?.length ? storeVictoryNotes(draft.finalMelody) : null,
    final_bass_notes: draft.finalBass?.length ? storeVictoryNotes(draft.finalBass) : null, final_clef: draft.finalClef ?? 'treble', final_bass_clef: draft.finalBassClef ?? 'bass' };
}
export function publishedChallenge(id: string, date: string, snapshot: ChallengeSnapshot): GameChallenge {
  if (!snapshot || typeof id !== 'string' || !id || ['title','source','hint','author'].some((field) => typeof snapshot[field as keyof ChallengeSnapshot] !== 'string')) throw new Error('Invalid challenge metadata');
  const draft = recordDraft({ ...snapshot, key_signature: snapshot.key, time_signature: snapshot.timeSignature,
    final_bpm: snapshot.finalBpm, final_key_signature: snapshot.finalKey,
    notes: snapshot.melody, final_notes: snapshot.finalMelody, final_bass_notes: snapshot.finalBass, final_clef: snapshot.finalClef, final_bass_clef: snapshot.finalBassClef });
  if (!draft.melody.some((step) => step.midi !== null) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid challenge');
  const final = victorySettings(draft);
  return { ...snapshot, id, date, finalBpm: final.bpm, finalKey: final.key, melody: draft.melody, finalMelody: draft.finalMelody?.length ? draft.finalMelody : draft.melody, finalBass: draft.finalBass, finalClef: draft.finalClef, finalBassClef: draft.finalBassClef };
}
export function lisbonDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export const displayDate = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));

export const storeVictoryNotes = (notes: readonly VictoryStep[]): StoredVictoryNote[] => notes.map(({ midi, beats, pitches, triplet }) => ({ midi, beats, ...(pitches ? { pitches: [...pitches] } : {}), ...(triplet ? { triplet } : {}) }));
