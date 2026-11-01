import { useEffect, useRef, useState } from 'react';
import { getSchedule, listMelodies, melodyAction, melodyError } from '../services/melodyService';
import { displayDate, lisbonDate } from '../lib/melodyLibrary';
import type { MelodyRecord, ScheduledChallenge } from '../lib/melodyLibrary';
import BrodleIcon from '../components/BrodleIcon';

const shiftMonth = (month: string, amount: number) => { const date = new Date(month + '-01T12:00:00Z'); date.setUTCMonth(date.getUTCMonth() + amount); return date.toISOString().slice(0, 7); };
export default function ChallengeCalendar() {
  const today = lisbonDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<ScheduledChallenge[]>([]);
  const [approved, setApproved] = useState<MelodyRecord[]>([]);
  const [melody, setMelody] = useState('');
  const [selected, setSelected] = useState<ScheduledChallenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [more, setMore] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    const pending = request;
    const current = ++request.current;
    setLoading(true); setError('');
    void Promise.all([getSchedule(month + '-01', shiftMonth(month, 1) + '-01'), listMelodies(null, 'approved')]).then(([schedule, candidates]) => {
      if (current !== request.current) return;
      setRows(schedule); setApproved(candidates); setMore(candidates.length === 20);
      setMelody((previous) => candidates.some((row) => row.id === previous) ? previous : candidates[0]?.id ?? '');
    }).catch((problem) => { if (current === request.current) setError(melodyError(problem)); })
      .finally(() => { if (current === request.current) setLoading(false); });
    return () => { pending.current++; };
  }, [month, revision]);
  async function moreApproved() {
    setBusy(true);
    try { const next = await listMelodies(null, 'approved', approved.length); setApproved((previous) => [...previous, ...next]); setMore(next.length === 20); }
    catch (problem) { setError(melodyError(problem)); } finally { setBusy(false); }
  }
  async function act(action: 'schedule' | 'move' | 'cancel') {
    if (busy || loading) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (action === 'schedule') await melodyAction('schedule_brodle_melody', { melody_id: melody, play_date: date });
      else if (action === 'move' && selected) await melodyAction('reschedule_brodle_challenge', { challenge_id: selected.id, new_date: date });
      else if (selected) await melodyAction('cancel_brodle_challenge', { challenge_id: selected.id });
      setSelected(null); setMessage(action === 'cancel' ? 'Future challenge removed from the calendar.' : `Challenge scheduled for ${displayDate(date)}.`);
      setMonth(date.slice(0, 7)); setRevision((previous) => previous + 1);
    } catch (problem) { setError(melodyError(problem)); } finally { setBusy(false); }
  }
  const first = new Date(month + '-01T12:00:00Z');
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const padding = (first.getUTCDay() + 6) % 7;
  return <section className="brodle-panel" aria-labelledby="calendar-title">
    <div className="calendar-heading"><div><h2 id="calendar-title">Daily calendar · {first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><p className="library-muted">One challenge per date. Resets at midnight in Europe/Lisbon.</p></div>
      <div className="calendar-month-actions"><button className="library-button library-button--icon" disabled={busy} aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>←</button><button className="library-button library-button--icon" disabled={busy} aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>→</button></div></div>
    {loading && <p role="status">Loading calendar…</p>}
    <div className="calendar-grid">
      {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
      {Array.from({ length: padding }, (_, index) => <span key={'pad' + index} />)}
      {Array.from({ length: days }, (_, index) => { const day = `${month}-${String(index + 1).padStart(2,'0')}`; const entry = rows.find((row) => row.play_date === day);
        return <button key={day} type="button" className={`calendar-day ${entry ? 'is-scheduled' : 'is-open'} ${day === today ? 'is-today' : ''}`} aria-pressed={date === day} disabled={busy || loading}
          aria-label={`${displayDate(day)}: ${entry?.snapshot.title ?? 'No challenge scheduled'}`} onClick={() => { setDate(day); setSelected(entry ?? null); setMessage(''); }}>
          <span>{index + 1}</span><small>{entry?.snapshot.title ?? 'Open'}</small></button>;
      })}
    </div>
    <div className="calendar-form">
      {selected ? <label>Selected challenge<strong>{selected.snapshot.title}</strong><span>{displayDate(selected.play_date)}</span></label>
        : <label htmlFor="schedule-melody">Approved melody<select id="schedule-melody" value={melody} disabled={busy || loading} onChange={(event) => setMelody(event.target.value)}><option value="">Choose a melody</option>{approved.map((row) => <option key={row.id} value={row.id}>{row.title} · {row.author_username}</option>)}</select></label>}
      <label htmlFor="schedule-date">{selected ? 'Move to date' : 'Play date'}<input id="schedule-date" type="date" min={today} value={date} disabled={busy} onChange={(event) => setDate(event.target.value)} /></label>
      <div className="calendar-actions">{selected ? <>
        <button className="library-button library-button--primary" disabled={busy || selected.play_date <= today || !date} onClick={() => void act('move')}><BrodleIcon name="calendar" />Move challenge</button>
        <button className="library-button library-button--danger" disabled={busy || selected.play_date <= today} onClick={() => void act('cancel')}><BrodleIcon name="trash" />Cancel future challenge</button>
        <button className="library-button library-button--quiet" disabled={busy} onClick={() => setSelected(null)}>Schedule another melody</button>
      </> : <button className="library-button library-button--primary" disabled={busy || loading || !melody || !date} onClick={() => void act('schedule')}><BrodleIcon name="calendar" />{busy ? 'Scheduling…' : 'Schedule challenge'}</button>}</div>
    </div>
    {more && <div className="library-pagination"><button className="library-button" disabled={busy} onClick={() => void moreApproved()}>Load more approved melodies</button></div>}
    {!approved.length && !loading && <p className="library-muted">Approve a submission, or schedule your own melody directly in Studio.</p>}
    {error && <p className="progress-error" role="alert">{error}</p>}
    {message && <p className="library-success" role="status">{message}</p>}
  </section>;
}
