import { supabase } from '../../../lib/supabase';
import type { MelodyRecord } from '../../brodle/lib/melodyLibrary';
import { studioPayload } from './studioDocument';
import type { StudioDraft } from './studioDocument';
export async function saveStudioDraft(id: string, updatedAt: string | null, draft: StudioDraft): Promise<MelodyRecord> {
  if (!supabase) throw { code: 'not_configured' };
  const { data, error } = await supabase.rpc('save_brodle_studio', { melody_id: id, expected_updated_at: updatedAt, content: studioPayload(draft) });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id || row.id !== id) throw new Error('Invalid save response');
  return row as MelodyRecord;
}
