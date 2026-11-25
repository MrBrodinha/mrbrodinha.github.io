import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { getMelody, melodyAction, melodyError } from '../../brodle/services/melodyService';
import type { MelodyRecord } from '../../brodle/lib/melodyLibrary';
import { emptyStudioDraft, parseStudioDraft, studioFromRecord, studioSubmissionIssue } from './studioDocument';
import type { StudioDraft } from './studioDocument';
import { saveStudioDraft } from './studioService';

export const STUDIO_AUTOSAVE_MS = 5000;
const storageKey = (owner: string | null, id: string) => `brodle.studio.v1:${owner ?? 'guest'}:${id}`;
const version = (draft: StudioDraft) => JSON.stringify(draft);
type Recovery = { id: string; draft: StudioDraft; expected: string | null; saved: string };
type State = Recovery & { record: MelodyRecord | null; loading: boolean; error: string; conflict: boolean; revision: number };
function recover(owner: string | null, requested: string | null, fresh: boolean): Recovery {
  const id = crypto.randomUUID();
  const empty = { id, draft: emptyStudioDraft(), expected: null, saved: '' };
  if (fresh) return { ...empty, saved: version(empty.draft) };
  const last = requested ?? localStorage.getItem(storageKey(owner, 'last'));
  if (!last) return { ...empty, saved: version(empty.draft) };
  const raw = localStorage.getItem(storageKey(owner, last));
  if (!raw) return { ...empty, id: requested ?? id, saved: version(empty.draft) };
  try {
    const cache = JSON.parse(raw) as Recovery;
    if (cache.id !== last || (cache.expected !== null && typeof cache.expected !== 'string') || typeof cache.saved !== 'string') throw new Error('Invalid recovery');
    return { ...cache, draft: parseStudioDraft(cache.draft) };
  } catch (problem) {
    // Keep the unreadable bytes recoverable instead of replacing the only copy.
    localStorage.setItem(storageKey(owner, last+':unreadable'), raw);
    throw problem;
  }
}
export function useMelodyStudio(owner: string | null) {
  const [params] = useSearchParams(), navigate = useNavigate(), { pathname } = useLocation();
  const id = params.get('id'), copy = params.get('copy'), fresh = params.get('new') === '1';
  const routeKey = `${id ?? ''}|${copy ?? ''}|${fresh}`;
  const [state, setState] = useState<State>(() => {
    try { return { ...recover(owner, id, fresh || Boolean(copy)), record: null, loading: Boolean(owner), error: '', conflict: false, revision: 0 }; }
    catch { const draft = emptyStudioDraft(); return { id: id ?? crypto.randomUUID(), draft, expected: null, saved: version(draft), record: null, loading: Boolean(owner && id), error: 'The browser draft could not be restored. Saved account melodies are still available in My melodies.', conflict: false, revision: 0 }; }
  });
  const [saving, setSaving] = useState(false), [submitting, setSubmitting] = useState(false), [localError, setLocalError] = useState('');
  const latest = useRef(state); latest.current = state;
  const alive = useRef(true), context = useRef(0), loaded = useRef<string | null>(null), flight = useRef<Promise<MelodyRecord | null> | null>(null);
  useEffect(() => {
    const lifetime = alive, scope = context, source = loaded;
    lifetime.current = true;
    return () => {
      lifetime.current = false; scope.current++;
      // StrictMode replays setup after cleanup; invalidated loads must restart.
      source.current = null;
    };
  }, []);
  const load = useCallback(async (force = false) => {
    if (!force && loaded.current === routeKey) return;
    loaded.current = routeKey;
    const token = ++context.current;
    let recovery: Recovery;
    let recoveryError = '';
    try { recovery = recover(owner, id, fresh || Boolean(copy)); }
    catch { const draft = emptyStudioDraft(); recovery = { id: id ?? crypto.randomUUID(), draft, expected: null, saved: version(draft) }; recoveryError = 'The browser draft could not be restored. Its unreadable backup was kept. Open a saved melody from My melodies or start a new one.'; }
    const source = copy ?? (fresh ? null : id ?? (recovery.expected !== null || recovery.saved !== version(recovery.draft) ? recovery.id : null));
    setState(previous => ({ ...recovery, record: null, loading: Boolean(owner && source), error: recoveryError, conflict: false, revision: previous.revision + 1 }));
    setSaving(false); setSubmitting(false);
    if (fresh) {
      // Consume the sidebar's one-time action so refresh restores later edits.
      loaded.current = '||false';
      navigate(pathname, { replace: true });
    }
    if (!owner || !source) return;
    try {
      const row = await getMelody(source), remote = studioFromRecord(row);
      if (!alive.current || token !== context.current) return;
      const recoverPending = !copy && recovery.id === row.id && recovery.saved !== version(recovery.draft);
      const conflict = !force && recoverPending && recovery.expected !== row.updated_at && version(recovery.draft) !== version(remote);
      const draft = copy ? { ...remote, title: remote.title.slice(0,153) + ' (copy)' } : !force && recoverPending ? recovery.draft : remote;
      setState(previous => ({ ...previous, id: copy ? crypto.randomUUID() : row.id, draft, expected: copy ? null : conflict ? recovery.expected : row.updated_at,
        saved: copy ? '' : version(remote), record: copy ? null : row, loading: false, conflict, revision: previous.revision + 1,
        error: conflict ? 'This melody changed in another tab or device. Your browser draft is safe. Reload the account version or save your work as a copy.' : '' }));
    } catch (problem) {
      if (!alive.current || token !== context.current) return;
      // A first save may not have reached the server before a previous tab closed.
      if (!copy && !id && recovery.expected === null && (problem as { code?: string })?.code === 'PGRST116') setState(previous => ({ ...previous, loading: false }));
      else setState(previous => ({ ...previous, loading: false, conflict: true, error: melodyError(problem) }));
    }
  }, [owner, id, copy, fresh, routeKey, navigate, pathname]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (state.loading) return;
    try {
      localStorage.setItem(storageKey(owner, state.id), JSON.stringify({ id: state.id, draft: state.draft, expected: state.expected, saved: state.saved }));
      localStorage.setItem(storageKey(owner, 'last'), state.id); setLocalError('');
    } catch { setLocalError('Browser backup is unavailable. Save to your account before leaving this page.'); }
  }, [owner, state.id, state.draft, state.expected, state.saved, state.loading]);
  const locked = Boolean(state.record && (state.record.created_by !== owner || !['draft','rejected'].includes(state.record.status)));
  const dirty = version(state.draft) !== state.saved;
  const save = useCallback(async function persist(): Promise<MelodyRecord | null> {
    if (flight.current) { const pending = flight.current; await pending; if (flight.current === pending) flight.current = null; return persist(); }
    const snapshot = latest.current, token = context.current;
    if (!owner || snapshot.loading || snapshot.conflict || (snapshot.record && (snapshot.record.created_by !== owner || !['draft','rejected'].includes(snapshot.record.status)))) return null;
    if (version(snapshot.draft) === snapshot.saved) return snapshot.record;
    setSaving(true);
    const task = (async () => {
      try {
        const row = await saveStudioDraft(snapshot.id, snapshot.expected, snapshot.draft);
        if (!alive.current || token !== context.current) return null;
        setState(previous => ({ ...previous, record: row, expected: row.updated_at, saved: version(snapshot.draft), error: '' }));
        // Refs are updated immediately so a queued explicit Save cannot use a stale timestamp.
        latest.current = { ...latest.current, record: row, expected: row.updated_at, saved: version(snapshot.draft), error: '' };
        if (id !== row.id || copy || fresh) { loaded.current = `${row.id}||false`; navigate(pathname+'?id='+row.id, { replace: true }); }
        return row;
      } catch (problem) {
        if (alive.current && token === context.current) {
          const conflict = (problem as { message?: string })?.message === 'brodle_studio_conflict' || (problem as { message?: string })?.message === 'brodle_not_editable';
          setState(previous => ({ ...previous, conflict, error: melodyError(problem) }));
        }
        return null;
      } finally { if (alive.current && token === context.current) setSaving(false); }
    })();
    flight.current = task;
    try { return await task; } finally { if (flight.current === task) flight.current = null; }
  }, [owner, navigate, pathname, id, copy, fresh]);
  useEffect(() => {
    const timer = setInterval(() => { if (!flight.current) void save(); }, STUDIO_AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [save]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (version(latest.current.draft) !== latest.current.saved) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const updateDraft = useCallback((next: StudioDraft | ((previous: StudioDraft) => StudioDraft)) => {
    if (locked || state.loading || submitting) return;
    setState(previous => { const draft = typeof next === 'function' ? next(previous.draft) : next; return draft === previous.draft ? previous : { ...previous, draft }; });
  }, [locked, state.loading, submitting]);
  async function submit() {
    if (!owner || locked || submitting || state.loading || state.conflict) return;
    const issue = studioSubmissionIssue(latest.current.draft);
    if (issue) { setState(previous => ({ ...previous, error: issue })); return; }
    setSubmitting(true); const token = context.current;
    try {
      if (flight.current) await flight.current;
      const row = await save();
      if (!row || !alive.current || token !== context.current) return;
      await melodyAction('submit_brodle_melody', { melody_id: row.id });
      if (alive.current && token === context.current) setState(previous => ({ ...previous, record: { ...row, status: 'submitted', review_note: '' }, error: '' }));
    } catch (problem) { if (alive.current && token === context.current) setState(previous => ({ ...previous, error: melodyError(problem) })); }
    finally { if (alive.current && token === context.current) setSubmitting(false); }
  }
  function makeCopy() {
    if (saving || submitting || state.loading) return;
    context.current++;
    const draft = { ...state.draft, title: state.draft.title.slice(0,153) + ' (copy)' };
    loaded.current = '||false'; navigate(pathname, { replace: true });
    setState(previous => ({ ...previous, id: crypto.randomUUID(), draft, record: null, expected: null, saved: '', conflict: false, error: '', revision: previous.revision + 1 }));
  }
  function newDraft() {
    if (saving || submitting || state.loading) return;
    context.current++;
    const draft = emptyStudioDraft(); loaded.current = '||false'; navigate(pathname, { replace: true });
    setState(previous => ({ ...previous, id: crypto.randomUUID(), draft, record: null, expected: null, saved: version(draft), conflict: false, error: '', revision: previous.revision + 1 }));
  }
  return { ...state, dirty, locked, saving, submitting, localError, updateDraft, save, submit, reload: () => void load(true), makeCopy, newDraft, issue: studioSubmissionIssue(state.draft) };
}
