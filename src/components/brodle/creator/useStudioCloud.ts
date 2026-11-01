import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../auth/authContext';
import { useBrodleAdmin } from '../hooks/useBrodleAdmin';
import { melodyPayload, recordDraft, MAX_MELODY_STEPS, MAX_FINAL_STEPS } from '../lib/melodyLibrary';
import type { MelodyRecord } from '../lib/melodyLibrary';
import { getMelody, saveMelody, melodyAction, melodyError } from '../services/melodyService';
import type { ComposerDraft } from './melodyComposer';
import { emptyComposerDraft } from './melodyComposer';

export function useStudioCloud(draft: ComposerDraft, setDraft: Dispatch<SetStateAction<ComposerDraft>>, stopAudio: () => void) {
  const { user } = useAuth();
  const { admin } = useBrodleAdmin();
  const [params] = useSearchParams();
  const id = params.get('id'); const copy = params.get('copy');
  const fresh = params.get('new') === '1';
  const navigate = useNavigate();
  const [record, setRecord] = useState<MelodyRecord | null>(null);
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draftVersion, setDraftVersion] = useState(0);
  const loaded = useRef('');
  const request = useRef(0);
  const loadRequest = useRef(0);
  useEffect(() => {
    const pendingAction = request, pendingLoad = loadRequest;
    return () => { pendingAction.current++; pendingLoad.current++; };
  }, []);
  useLayoutEffect(() => {
    if (!fresh) return;
    request.current++; loadRequest.current++;
    stopAudio(); setDraft(emptyComposerDraft()); setDraftVersion((version) => version + 1);
    setRecord(null); setSaved(''); loaded.current = '';
    setLoading(false); setBusy(false); setError(''); setMessage('');
    // Consume the new-melody action: a subsequent refresh restores this draft.
    navigate('/brodle/create', { replace: true });
  }, [fresh, navigate, setDraft, stopAudio]);
  const userId = user?.id;
  useEffect(() => {
    const pending = loadRequest;
    const source = id ?? copy;
    if (fresh || !source || !userId || loaded.current === (copy ? 'copy:' + copy : id)) return;
    const current = ++loadRequest.current;
    setLoading(true); setError(''); stopAudio();
    void getMelody(source).then((row) => {
      if (current !== loadRequest.current) return;
      const content = recordDraft(row);
      if (copy) content.title = content.title ? content.title.slice(0, 153) + ' (copy)' : '';
      setDraft(content); setDraftVersion((version) => version + 1); setRecord(copy ? null : row); setSaved(copy ? '' : JSON.stringify(melodyPayload(content)));
      loaded.current = copy ? 'copy:' + copy : row.id;
      setMessage(copy ? 'An editable copy is ready. Save it to your melodies.' : 'Cloud melody loaded.');
    }).catch((problem) => { if (current === loadRequest.current) setError(melodyError(problem)); })
      .finally(() => { if (current === loadRequest.current) setLoading(false); });
    return () => { pending.current++; };
  }, [id, copy, fresh, userId, setDraft, stopAudio]);
  const locked = Boolean(record && (record.created_by !== user?.id || !['draft', 'rejected'].includes(record.status)));
  let version = '';
  try { version = JSON.stringify(melodyPayload(draft)); } catch { /* A legacy long draft is still exportable. */ }
  const dirty = version !== saved;
  async function persist(current: number) {
    if (!user) throw { code: '42501' };
    const row = await saveMelody(draft, user.id, record?.id);
    if (current !== request.current) throw new Error('Cancelled');
    setRecord(row); setSaved(version); loaded.current = row.id;
    navigate('/brodle/create?id=' + row.id, { replace: true });
    return row;
  }
  async function run(action: 'save' | 'submit' | 'schedule', date?: string) {
    if (!user || busy || loading) return;
    if (draft.melody.length > MAX_MELODY_STEPS || (draft.finalMelody?.length ?? 0) > MAX_FINAL_STEPS || (draft.finalBass?.length ?? 0) > MAX_FINAL_STEPS) { setError('Use up to 256 steps for the challenge and 512 for each victory part.'); return; }
    if (action !== 'save' && !(draft.title ?? '').trim()) { setError('Add a title before submitting or scheduling.'); return; }
    if (action !== 'save' && !draft.melody.some((step) => step.midi !== null)) { setError('Add at least one note before submitting or scheduling.'); return; }
    const current = ++request.current;
    setBusy(true); setError(''); setMessage('');
    try {
      const row = action === 'schedule' && record && !dirty ? record : await persist(current);
      if (current !== request.current) return;
      if (action === 'submit') {
        await melodyAction('submit_brodle_melody', { melody_id: row.id });
        if (current === request.current) { setRecord({ ...row, status: 'submitted' }); setMessage('Submitted for review. You can follow its status in My melodies.'); }
      } else if (action === 'schedule') {
        await melodyAction('schedule_brodle_melody', { melody_id: row.id, play_date: date ?? '' });
        if (current === request.current) { setRecord({ ...row, status: 'approved' }); setMessage(`Scheduled for ${date}. The calendar now has a fixed copy.`); }
      } else setMessage('Saved to your account.');
    } catch (problem) { if (current === request.current) setError(melodyError(problem)); }
    finally { if (current === request.current) setBusy(false); }
  }
  function newDraft() {
    if (busy || loading) return;
    navigate('/brodle/create?new=1');
  }
  return { newDraft, draftVersion, user, admin, record, loading, busy, locked, dirty, error, message, run,
    makeCopy: () => { if (record) navigate('/brodle/create?copy=' + record.id); } };
}
