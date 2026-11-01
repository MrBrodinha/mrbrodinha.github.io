import { supabase } from '../../../lib/supabase';
import { MELODY_COLUMNS, melodyPayload } from '../lib/melodyLibrary';
import type { MelodyRecord, MelodyStatus, ScheduledChallenge } from '../lib/melodyLibrary';
import type { ComposerDraft } from '../creator/melodyComposer';

function client() { if (!supabase) throw { code: 'not_configured' }; return supabase; }
export function melodyError(error: unknown): string {
  const issue = error as { code?: string; message?: string } | null;
  const messages: Record<string, string> = {
    brodle_admin_required: 'Only a Brodle administrator can do that.', brodle_not_editable: 'This melody is no longer editable. Make a copy to continue.',
    brodle_not_deletable: 'This melody is no longer available or you do not have permission to delete it.',
    brodle_title_required: 'Add a title before submitting or scheduling.', brodle_notes_required: 'Add at least one note before submitting or scheduling.',
    brodle_not_approved: 'Approve this melody before scheduling it.', brodle_date_past: 'Choose today or a future date.',
    brodle_date_taken: 'That date already has a challenge. Choose another day.', brodle_published_locked: 'Published challenges are locked. Only future dates can be changed.',
    brodle_not_found: 'That melody or challenge is no longer available.', brodle_profile_missing: 'Your profile is not ready. Please sign in again.',
  };
  if (issue?.message && Object.prototype.hasOwnProperty.call(messages, issue.message)) return messages[issue.message];
  if (issue?.code === 'PGRST202' || issue?.code === '42P01' || issue?.code === 'PGRST205' || issue?.code === 'not_configured') return 'The melody library is not available yet. Please try again later.';
  if (issue?.code === 'PGRST204' || issue?.code === '42703') return 'The melody library is being updated. Please try again shortly.';
  if (issue?.code === '42501') return 'You do not have permission to make this change.';
  if (issue?.code === '23514') return 'Check the notes, tempo, and key, then try again.';
  return 'Unable to complete this request. Your local draft is kept. Please try again.';
}
export async function getMelody(id: string): Promise<MelodyRecord> {
  const { data, error } = await client().from('brodle_melodies').select(MELODY_COLUMNS).eq('id', id).single();
  if (error) throw error; return data as MelodyRecord;
}
export async function listMelodies(owner: string | null, status?: MelodyStatus, offset = 0): Promise<MelodyRecord[]> {
  let query = client().from('brodle_melodies').select(MELODY_COLUMNS).order('updated_at', { ascending: false }).order('id').range(offset, offset + 19);
  if (owner) query = query.eq('created_by', owner);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error; return data as MelodyRecord[];
}
export async function saveMelody(draft: ComposerDraft, owner: string, id?: string): Promise<MelodyRecord> {
  const payload = { ...melodyPayload(draft), created_by: owner, ...(id ? { id } : {}) };
  const query = id ? client().from('brodle_melodies').update(payload).eq('id', id) : client().from('brodle_melodies').insert(payload);
  const { data, error } = await query.select(MELODY_COLUMNS).single();
  if (error) throw error; return data as MelodyRecord;
}
export async function deleteMelody(id: string) {
  const { data, error } = await client().from('brodle_melodies').delete().eq('id', id).select('id');
  if (error) throw error; if (data.length !== 1) throw { message: 'brodle_not_deletable' };
}
export async function melodyAction(name: 'submit_brodle_melody' | 'review_brodle_melody' | 'schedule_brodle_melody' | 'reschedule_brodle_challenge' | 'cancel_brodle_challenge', args: Record<string, string>) {
  const { data, error } = await client().rpc(name, args); if (error) throw error; return data;
}
export async function getSchedule(start: string, end: string): Promise<ScheduledChallenge[]> {
  const { data, error } = await client().from('brodle_daily_challenges').select('id,play_date,melody_id,snapshot').gte('play_date', start).lt('play_date', end).order('play_date');
  if (error) throw error; return data as ScheduledChallenge[];
}
