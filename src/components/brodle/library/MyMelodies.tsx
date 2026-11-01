import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth/authContext';
import { usePianoAudio } from '../hooks/usePianoAudio';
import { listMelodies, deleteMelody, melodyError } from '../services/melodyService';
import type { MelodyRecord } from '../lib/melodyLibrary';
import type { NoteNaming } from '../lib/musicGame';
import PianoControls from '../components/PianoControls';
import LibraryShell from './LibraryShell';
import MelodyCard from './MelodyCard';
import BrodleIcon from '../components/BrodleIcon';

export default function MyMelodiesPage() { const { user } = useAuth(); return <MyMelodies key={user?.id ?? 'guest'} />; }
function MyMelodies() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<MelodyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState('');
  const request = useRef(0);
  const audio = usePianoAudio();
  const [naming, setNaming] = useState<NoteNaming>('letters');
  const userId = user?.id;
  const load = useCallback(async (offset = 0) => {
    if (!userId) return;
    const current = ++request.current;
    setLoading(true); setError('');
    try {
      const result = await listMelodies(userId, undefined, offset);
      if (current !== request.current) return;
      setRows((previous) => offset ? [...previous, ...result] : result); setMore(result.length === 20);
    } catch (problem) { if (current === request.current) setError(melodyError(problem)); }
    finally { if (current === request.current) setLoading(false); }
  }, [userId]);
  useEffect(() => {
    const pending = request;
    if (userId) void load();
    return () => { pending.current++; };
  }, [load, userId]);
  async function remove(id: string) {
    setDeleting(id); setError(''); audio.stopAudio();
    try { await deleteMelody(id); await load(); } catch (problem) { setError(melodyError(problem)); }
    finally { setDeleting(''); }
  }
  return <LibraryShell title="My melodies" intro="Your drafts, submissions, and reviewed melodies.">
    {authLoading ? <p role="status">Restoring your account…</p> : !user ? <section className="brodle-panel"><p className="library-muted">Log in to save and manage your melodies.</p><Link className="creator-link" to="/login?next=%2Fbrodle%2Fmelodies">Log in / Sign up</Link></section> : <>
      <section className="brodle-panel library-toolbar" aria-label="Melody library controls"><div className="library-toolbar-actions"><button className="library-button library-button--quiet" disabled={loading || Boolean(deleting)} onClick={() => void load()}><BrodleIcon name="restart" />Refresh</button></div>
        <div className="library-sound-controls"><PianoControls audio={audio} naming={naming} onNaming={setNaming} /></div></section>
      {error && <p className="progress-error" role="alert">{error}</p>}
      {loading && <p role="status">Loading melodies…</p>}
      {!rows.length && !loading && !error && <p className="library-muted">No cloud melodies yet. Start in Melody Studio and save a draft.</p>}
      {rows.map((row) => <MelodyCard key={row.id} row={row} audio={audio} naming={naming}
        dangerAction={['draft','rejected','approved'].includes(row.status) ? <button type="button" className="library-button library-button--danger delete-melody" disabled={Boolean(deleting) || loading} aria-label={'Delete melody: ' + (row.title || 'Untitled melody')} onClick={() => void remove(row.id)}><BrodleIcon name="trash" />{deleting === row.id ? 'Deleting…' : 'Delete melody'}</button> : undefined}>
        <Link className="library-button library-button--primary" aria-label={['draft','rejected'].includes(row.status) ? 'Edit melody' : 'View melody'} to={'/brodle/create?id=' + row.id}><BrodleIcon name={['draft','rejected'].includes(row.status) ? 'edit' : 'eye'} />{['draft','rejected'].includes(row.status) ? 'Edit melody' : 'View'}</Link>
        <Link className="library-button" to={'/brodle/create?copy=' + row.id}><BrodleIcon name="copy" />Duplicate</Link>
      </MelodyCard>)}
      {more && <div className="library-pagination"><button className="library-button" disabled={loading || Boolean(deleting)} onClick={() => void load(rows.length)}>Load more melodies</button></div>}
      {audio.audioError && <p className="progress-error" role="status">{audio.audioError}</p>}
    </>}
  </LibraryShell>;
}
