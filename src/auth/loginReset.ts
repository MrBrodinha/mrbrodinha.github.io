export const BRODLE_RESET_EVENT = 'brodle:progress-reset';
const PROGRESS_PREFIX = 'brodle:progress:';

export function isNewSignIn(event: string, previousUserId: string | null | undefined, nextUserId: string | null): boolean {
  return (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY')
    && previousUserId !== undefined && nextUserId !== null && previousUserId !== nextUserId;
}

export function clearSavedBrodleProgress(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) if (key?.startsWith(PROGRESS_PREFIX)) storage.removeItem(key);
}
