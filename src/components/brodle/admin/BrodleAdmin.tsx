import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth/authContext';
import { useBrodleAdmin } from '../hooks/useBrodleAdmin';
import { usePianoAudio } from '../hooks/usePianoAudio';
import { listMelodies, deleteMelody, melodyAction, melodyError } from '../services/melodyService';
import type { MelodyRecord, MelodyStatus } from '../lib/melodyLibrary';
import LibraryShell from '../library/LibraryShell';
import MelodyCard from '../library/MelodyCard';
import type { NoteNaming } from '../lib/musicGame';
import PianoControls from '../components/PianoControls';
import ChallengeCalendar from './ChallengeCalendar';
import BrodleIcon from '../components/BrodleIcon';

export default function BrodleAdminPage() { const { user } = useAuth(); return <BrodleAdmin key={user?.id ?? 'guest'} />; }
function BrodleAdmin() {
  const { user } = useAuth();
  const { admin, loading: adminLoading, error: adminError } = useBrodleAdmin();
  const [tab, setTab] = useState<MelodyStatus | 'calendar'>('submitted');
  const [rows, setRows] = useState<MelodyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const request = useRef(0);
  const audio = usePianoAudio();
  const [naming, setNaming] = useState<NoteNaming>('letters');
  const load = useCallback(async (offset = 0) => {
    if (!admin || tab === 'calendar') return;
    const current = ++request.current;
    setLoading(true); setError('');
    try {
      const next = await listMelodies(null, tab, offset);
      if (current !== request.current) return;
      setRows((previous) => offset ? [...previous, ...next] : next); setMore(next.length === 20);
    } catch (problem) { if (current === request.current) setError(melodyError(problem)); }
    finally { if (current === request.current) setLoading(false); }
  }, [admin, tab]);
  useEffect(() => {
    const pending = request;
    setRows([]); setMessage('');
    if (admin) void load();
    return () => { pending.current++; };
  }, [admin, tab, load]);
  async function review(row: MelodyRecord, decision: 'approved' | 'rejected') {
    if (busy || loading) return;
    setBusy(row.id); setError(''); setMessage(''); audio.stopAudio();
    try { await melodyAction('review_brodle_melody', { melody_id: row.id, decision, note: notes[row.id] ?? '' }); await load(); setMessage(decision === 'approved' ? 'Melody approved. It is ready to schedule in the calendar.' : 'Melody returned to its creator with your review.'); }
    catch (problem) { setError(melodyError(problem)); } finally { setBusy(''); }
  }
  async function remove(row: MelodyRecord) {
    if (busy || loading) return;
    setBusy(row.id); setError(''); setMessage(''); audio.stopAudio();
    try { await deleteMelody(row.id); await load(); setMessage('Approved melody deleted. Scheduled daily copies are kept.'); }
    catch (problem) { setError(melodyError(problem)); } finally { setBusy(''); }
  }
  return <LibraryShell title="Manage Brodle" intro="Review submissions and prepare the daily calendar.">
    {adminLoading ? <p role="status">Checking administrator access…</p> : !admin ? <section className="brodle-panel"><h2>Administrator access required</h2><p className="library-muted">{adminError ?? 'This area is reserved for Brodle administrators.'}</p>{!user && <Link className="creator-link" to="/login?next=%2Fbrodle%2Fadmin">Log in</Link>}</section> : <>
      <div className="library-tabs" role="group" aria-label="Manage melodies">{[['submitted','Submission inbox'],['approved','Approved'],['rejected','Returned'],['calendar','Daily calendar']].map(([value,label]) => <button key={value} aria-pressed={tab === value} disabled={Boolean(busy)} onClick={() => { audio.stopAudio(); setTab(value as MelodyStatus | 'calendar'); }}>{label}</button>)}</div>
      {tab === 'calendar' ? <ChallengeCalendar /> : <>
        <section className="brodle-panel library-toolbar" aria-label="Review controls"><div className="library-toolbar-actions"><button className="library-button library-button--quiet" disabled={loading || Boolean(busy)} onClick={() => void load()}><BrodleIcon name="restart" />Refresh submissions</button></div><div className="library-sound-controls"><PianoControls audio={audio} naming={naming} onNaming={setNaming} /></div></section>
        {error && <p className="progress-error" role="alert">{error}</p>}
        {message && <p className="library-success" role="status">{message}</p>}
        {loading && <p role="status">Loading submissions…</p>}
        {!rows.length && !loading && !error && <p className="library-muted">No melodies in this view yet.</p>}
        {tab === 'approved' && rows.length > 0 && <p className="library-muted">Return a melody to let its creator edit the original again. Returning or deleting a melody keeps its scheduled daily copies.</p>}
        {rows.map((row) => <MelodyCard key={row.id} row={row} audio={audio} naming={naming}
          reviewForm={['submitted','approved'].includes(row.status) ? <label className="melody-review-field" htmlFor={'review-' + row.id}>Review note <span>Optional</span><textarea id={'review-' + row.id} maxLength={1000} value={notes[row.id] ?? ''} disabled={Boolean(busy) || loading} placeholder="Feedback for the creator" onChange={(event) => setNotes((previous) => ({ ...previous, [row.id]: event.target.value }))} /></label> : undefined}
          dangerAction={row.status === 'approved' ? <button type="button" className="library-button library-button--danger delete-melody" disabled={Boolean(busy) || loading} aria-label={'Delete melody: ' + (row.title || 'Untitled melody')} onClick={() => void remove(row)}><BrodleIcon name="trash" />{busy === row.id ? 'Working…' : 'Delete melody'}</button> : undefined}>
          {row.status === 'submitted' && <><button className="library-button library-button--primary" disabled={Boolean(busy) || loading} onClick={() => void review(row, 'approved')}><BrodleIcon name="check" />{busy === row.id ? 'Working…' : 'Approve melody'}</button><button className="library-button" disabled={Boolean(busy) || loading} onClick={() => void review(row, 'rejected')}><BrodleIcon name="undo" />Return to creator</button></>}
          {row.status === 'approved' && <><button className="library-button library-button--primary" disabled={Boolean(busy) || loading} onClick={() => setTab('calendar')}><BrodleIcon name="calendar" />Schedule melody</button><button type="button" className="library-button" disabled={Boolean(busy) || loading} onClick={() => void review(row, 'rejected')}><BrodleIcon name="undo" />{busy === row.id ? 'Working…' : 'Return for editing'}</button></>}
          <Link className="library-button" to={'/brodle/create?copy=' + row.id}><BrodleIcon name="copy" />Edit a copy</Link>
        </MelodyCard>)}
        {more && <div className="library-pagination"><button className="library-button" disabled={loading || Boolean(busy)} onClick={() => void load(rows.length)}>Load more submissions</button></div>}
        {audio.audioError && <p className="progress-error" role="status">{audio.audioError}</p>}
      </>}
    </>}
  </LibraryShell>;
}
