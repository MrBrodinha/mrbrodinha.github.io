import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../auth/authContext';
import SheetEditor from './SheetEditor';
import { studioScoreDocument, studioSession } from './studioDocument';
import type { StudioSession, StudioTrack } from './studioDocument';
import { useMelodyStudio } from './useMelodyStudio';
import '../Testing.css';

export default function MelodyStudioPage({ previousDraft = false }: { previousDraft?: boolean } = {}) {
  const { user, loading } = useAuth();
  if (loading) return <main className="testing-page"><h1>Melody Studio</h1><p role="status">Restoring your account…</p></main>;
  return <MelodyStudio key={user?.id ?? 'guest'} owner={user?.id ?? null} previousDraft={previousDraft} />;
}
function MelodyStudio({ owner, previousDraft }: { owner: string | null; previousDraft: boolean }) {
  const cloud = useMelodyStudio(owner), { pathname } = useLocation();
  const { updateDraft } = cloud;
  const [track, setTrack] = useState<StudioTrack>('main');
  const focusTab = useRef(false);
  useEffect(() => {
    if (focusTab.current) { document.getElementById('studio-track-'+track)?.focus({ preventScroll: true }); focusTab.current = false; }
  }, [track]);
  function selectTrack(value: StudioTrack) { focusTab.current = true; setTrack(value); }
  const sessions = useRef<{ revision: number; main?: StudioSession; final?: StudioSession }>({ revision: cloud.revision });
  if (sessions.current.revision !== cloud.revision) sessions.current = { revision: cloud.revision };
  const onSessionChange = useCallback((session: StudioSession) => {
    sessions.current[track] = session;
    const next = studioScoreDocument(session.state.score, session.codeDraft);
    updateDraft(previous => {
      const old = previous.document[track];
      if (JSON.stringify(old) === JSON.stringify(next)) return previous;
      return { ...previous, document: { ...previous.document, [track]: next } };
    });
  }, [track, updateDraft]);
  const inTesting = pathname.startsWith('/testing');
  return <SheetEditor key={cloud.revision+':'+track} initialSession={sessions.current[track] ?? studioSession(cloud.draft.document[track])}
    onSessionChange={onSessionChange} gameMelody={track === 'main'} labelledBy={'studio-track-'+track} readOnly={cloud.loading || cloud.locked || cloud.submitting}
    backTo={inTesting ? '/testing' : '/brodle'} backLabel={inTesting ? 'Testing' : 'Brodle'}>
    <section className="studio-composition" aria-label="Melody details">
      <div className="studio-metadata">
        <label htmlFor="studio-title">Title<input id="studio-title" maxLength={160} autoComplete="off" value={cloud.draft.title} disabled={cloud.loading || cloud.locked || cloud.submitting} onChange={event => cloud.updateDraft(previous => ({ ...previous, title: event.target.value }))} placeholder="Name your melody" /></label>
        <label htmlFor="studio-source">Source / Artist<input id="studio-source" maxLength={200} autoComplete="off" value={cloud.draft.source} disabled={cloud.loading || cloud.locked || cloud.submitting} onChange={event => cloud.updateDraft(previous => ({ ...previous, source: event.target.value }))} placeholder="Song, film, game or artist" /></label>
      </div>
      <div className="studio-save-row">
        <p role="status">{cloud.loading ? 'Loading melody…' : cloud.submitting ? 'Submitting for review…' : cloud.saving ? 'Saving…' : cloud.locked ? cloud.record?.status === 'submitted' ? 'Submitted for review' : 'Approved · Read only' : owner ? cloud.dirty ? 'Changes saved in this browser · Account autosave every 5 seconds' : cloud.record ? 'Saved to your account' : 'Draft ready · Autosave starts when you edit' : 'Draft saved in this browser'}</p>
        <div className="studio-save-actions">
          {owner ? <>
            <button type="button" disabled={!cloud.dirty || cloud.locked || cloud.loading || cloud.saving || cloud.submitting || cloud.conflict} onClick={() => void cloud.save()}>Save now</button>
            <button type="button" className="studio-submit" aria-label="Submit for review" data-tooltip="For future Brodles" aria-description="For future Brodles" disabled={cloud.locked || cloud.loading || cloud.saving || cloud.submitting || cloud.conflict || Boolean(cloud.issue)} onClick={() => void cloud.submit()}>Submit for review</button>
          </> : <Link to={'/login?next='+encodeURIComponent(pathname)}>Log in to save to your account</Link>}
        </div>
      </div>
      {cloud.record?.review_note && <p className="studio-review"><strong>Review from the administrator</strong><br />{cloud.record.review_note}</p>}
      {cloud.record?.status === 'rejected' && <p className="studio-save-help">Returned for changes. Update your melody, then submit it for review again.</p>}
      {cloud.locked && <p className="studio-save-help">This version is locked for review. You can switch melodies and inspect the code.</p>}
      {!cloud.locked && cloud.issue && <p className="studio-save-help">{cloud.issue} Your draft can still be saved.</p>}
      {cloud.localError && <p role="alert" className="studio-save-error">{cloud.localError}</p>}
      {cloud.error && <p role="alert" className="studio-save-error">{cloud.error}</p>}
      {cloud.conflict && <button type="button" disabled={cloud.saving || cloud.submitting} onClick={cloud.reload}>Reload account version</button>}
      {previousDraft && <p className="studio-save-help"><Link to="/brodle/create/classic">Open your draft from the previous editor</Link></p>}
    </section>
    <p className="studio-track-help">{track === 'main' ? 'The melody players guess in Brodle · One Treble staff.' : 'Played after a win. Leave it empty to reuse Game melody.'}</p>
    <div className="studio-track-switch" role="tablist" aria-label="Melody section">
      {(['main','final'] as const).map(value => <button key={value} id={'studio-track-'+value} type="button" role="tab" aria-controls="studio-score-panel" aria-selected={track === value} tabIndex={track === value ? 0 : -1} disabled={cloud.loading || cloud.submitting}
        onClick={() => selectTrack(value)} onKeyDown={event => {
          if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
            event.preventDefault(); selectTrack(event.key === 'Home' ? 'main' : event.key === 'End' ? 'final' : value === 'main' ? 'final' : 'main');
          }
        }}>{value === 'main' ? 'Game melody' : 'Victory melody'}</button>)}
    </div>
  </SheetEditor>;
}
