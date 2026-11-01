import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { useStudioCloud } from './useStudioCloud';
import { lisbonDate } from '../lib/melodyLibrary';

export default function StudioCloudPanel({ cloud, valid }: { cloud: ReturnType<typeof useStudioCloud>; valid: boolean }) {
  const [date, setDate] = useState(lisbonDate);
  return <section className="brodle-panel studio-cloud" aria-labelledby="cloud-title">
    <div className="composer-score-heading"><div><h2 id="cloud-title">Your melody library</h2><p className="library-muted">Save privately, or submit your melody for a future Brodle.</p></div>
      {cloud.record && <span className={'melody-status status-' + cloud.record.status}>{cloud.record.status}</span>}</div>
    <div className="game-controls"><button type="button" disabled={cloud.busy || cloud.loading} onClick={cloud.newDraft}>New melody</button></div>
    {!cloud.user ? <p className="library-muted"><Link to="/login?next=%2Fbrodle%2Fcreate">Log in or create an account</Link> to save and submit. Your browser draft is kept.</p> : <>
      {cloud.loading && <p role="status">Loading your melody…</p>}
      {cloud.locked && <p className="library-muted">Submitted and approved versions are locked. Make a copy to keep composing.</p>}
      {cloud.record?.review_note && <p className="review-note">Review: {cloud.record.review_note}</p>}
      <div className="game-controls">
        <button className="primary-button cloud-save" type="button" disabled={!valid || cloud.busy || cloud.loading || cloud.locked} onClick={() => void cloud.run('save')}>{cloud.busy ? 'Working…' : 'Save draft to account'}</button>
        <button className="cloud-submit" type="button" disabled={!valid || cloud.busy || cloud.loading || cloud.locked} onClick={() => void cloud.run('submit')}>Submit for Brodle</button>
        {cloud.record && <button type="button" disabled={cloud.busy || cloud.loading} onClick={cloud.makeCopy}>Make editable copy</button>}
        <Link className="creator-link" to="/brodle/melodies">My melodies →</Link>
      </div>
      {cloud.admin && <div className="studio-schedule"><label htmlFor="studio-date">Daily challenge date <span>Midnight, Europe/Lisbon</span></label>
        <input id="studio-date" type="date" value={date} min={lisbonDate()} onChange={(event) => setDate(event.target.value)} disabled={cloud.busy} />
        <div className="game-controls"><button type="button" className="primary-button" disabled={!valid || cloud.busy || cloud.loading || !date || (cloud.locked && cloud.record?.status !== 'approved')} onClick={() => void cloud.run('schedule', date)}>Schedule daily challenge</button></div>
      </div>}
      {cloud.dirty && !cloud.locked && <p className="library-muted">You have changes not yet saved to your account.</p>}
    </>}
    {cloud.error && <p className="progress-error" role="alert">{cloud.error}</p>}
    {cloud.message && <p className="library-success" role="status">{cloud.message}</p>}
  </section>;
}
