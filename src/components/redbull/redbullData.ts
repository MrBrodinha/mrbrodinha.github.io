export const REDBULL_IMAGE_BUCKET = 'redbull-images';
export const MIN_RATING = 0;
export const MAX_RATING = 10;
export const RATING_VALUES = Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, index) => MIN_RATING + index);
export function normalizeRating(value: unknown): number | '' {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return '';
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING ? rating : '';
}
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
export type RedbullDrink = { id: string; name: string; url: string | null; image_url: string | null; image_path: string | null; flavor: string | null };
export type SavedEntry = { rating: number | ''; opinion: string };
export type NewDrink = { name: string; flavour: string; sourceUrl: string; imageUrl: string; rating: number | ''; opinion: string };
export type CreatedDrink = { drink: RedbullDrink; rating: { rating: number; opinion: string } };
export const DRINK_COLUMNS = 'id,name,flavour,image_url,image_path,source_url';
export function readDrink(row: Record<string, unknown>): RedbullDrink {
  const safeUrl = (value: unknown, image = false) => {
    if (typeof value !== 'string') return null;
    try { return normalizedUrl(value, image); } catch { return null; }
  };
  return { id: row.id as string, name: row.name as string, flavor: row.flavour as string | null,
    url: safeUrl(row.source_url),
    image_url: safeUrl(row.image_url, true), image_path: row.image_path as string | null };
}
export function normalizedUrl(raw: string, image = false): string | null {
  if (!raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (!(image ? url.protocol === 'https:' : ['https:', 'http:'].includes(url.protocol)) || url.username || url.password || /\s/.test(raw.trim()) || raw.trim().length > 2048) throw new Error();
    return url.href;
  } catch { throw new Error(image ? 'Use an https:// image URL.' : 'Use an http:// or https:// source URL.'); }
}
export function validateImage(file: Pick<File, 'size' | 'type'>): void {
  if (!Object.prototype.hasOwnProperty.call(IMAGE_TYPES, file.type)) throw new Error('Choose a JPG, PNG, WebP, or GIF image.');
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error('Choose an image up to 5 MB.');
}
export function validateNewDrink(value: NewDrink) {
  const name = value.name.trim();
  const flavour = value.flavour.trim();
  if (!name) throw new Error('Give this Red Bull a name.');
  if (!flavour) throw new Error('Enter the flavour of this Red Bull.');
  if (name.length > 160 || flavour.length > 200 || value.opinion.trim().length > 2000) throw new Error('One of the fields is too long.');
  if (!Number.isInteger(value.rating) || Number(value.rating) < MIN_RATING || Number(value.rating) > MAX_RATING) throw new Error('Choose a rating from 0 to 10.');
  return { name, flavour,
    sourceUrl: normalizedUrl(value.sourceUrl), imageUrl: normalizedUrl(value.imageUrl, true), rating: Number(value.rating), opinion: value.opinion.trim() };
}
export function redbullError(error: unknown): string {
  const issue = error as { code?: string; message?: string; statusCode?: string } | null;
  const messages: Record<string, string> = {
    redbull_name_required: 'Give this Red Bull a name.', redbull_rating_required: 'Choose a rating from 0 to 10.',
    redbull_flavour_required: 'Enter the flavour of this Red Bull.',
    redbull_duplicate_source: 'A drink already uses that source link. Find it in the catalog to review it.',
    redbull_entry_already_created: 'This entry was already created with different details. Reload the catalog to find it.',
    redbull_entry_too_long: 'One of the fields is too long.', redbull_invalid_image_or_url: 'Check the source and image URLs.',
    redbull_invalid_upload: 'The uploaded image is unavailable. Choose the file and try again.',
    redbull_image_upload_failed: 'Image upload failed. Try again or use an image URL.',
  };
  if (issue?.message && Object.prototype.hasOwnProperty.call(messages, issue.message)) return messages[issue.message];
  if (issue?.code === '42501' || issue?.message === 'redbull_access_required') return 'Your account does not currently have Red Bull access.';
  if (['PGRST202','PGRST204','PGRST205','42P01','42703'].includes(issue?.code ?? '')) return 'Red Bull is being updated. Please try again shortly.';
  if (issue?.code === '23514' && issue.message?.includes('redbull_rating_rating_check')) return 'The database rejected this rating. The site owner needs to update the rating scale to 0–10. Your form is kept.';
  const reference = typeof issue?.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(issue.code) ? ` Reference: ${issue.code}.` : '';
  return 'Unable to save this drink. Your form is kept; please try again.' + reference;
}
