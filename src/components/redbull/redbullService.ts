import { supabase } from '../../lib/supabase';
import { IMAGE_TYPES, REDBULL_IMAGE_BUCKET, readDrink, validateImage, validateNewDrink } from './redbullData';
import type { CreatedDrink, NewDrink } from './redbullData';

export async function createRedbullEntry(id: string, userId: string, draft: NewDrink, file: File | null,
  onStatus: (message: string) => void): Promise<CreatedDrink> {
  if (!supabase) throw { code: 'PGRST202' };
  const value = validateNewDrink(draft);
  let imagePath: string | null = null;
  if (file) {
    validateImage(file);
    onStatus('Uploading image…');
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    imagePath = `${userId}/${id}/${hash}.${IMAGE_TYPES[file.type]}`;
    const { error } = await supabase.storage.from(REDBULL_IMAGE_BUCKET).upload(imagePath, file, { contentType: file.type, upsert: false });
    // Reuse the identical content-addressed upload after an interrupted retry.
    if (error && String((error as { statusCode?: string }).statusCode) !== '409') throw { message: 'redbull_image_upload_failed' };
  }
  onStatus('Saving drink and rating…');
  const { data, error } = await supabase.rpc('create_redbull_entry', {
    p_id: id, p_name: value.name, p_flavour: value.flavour,
    p_source_url: value.sourceUrl, p_image_url: file ? null : value.imageUrl,
    p_image_path: imagePath, p_rating: value.rating, p_opinion: value.opinion,
  });
  if (error) {
    // Storage RLS prevents deleting an image referenced by a committed drink,
    // including when the RPC committed but the response was interrupted.
    if (imagePath) await supabase.storage.from(REDBULL_IMAGE_BUCKET).remove([imagePath]).catch(() => {});
    throw error;
  }
  return { drink: readDrink(data.drink), rating: data.rating };
}
