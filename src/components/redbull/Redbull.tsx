import { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/authContext';
import { BEFORE_SITE_NAVIGATION } from '../layout/navigation';
import { supabase } from '../../lib/supabase';
import { validUsername } from '../../auth/authUtils';
import { useRedbullAccess } from './useRedbullAccess';
import { DRINK_COLUMNS, MAX_RATING, RATING_VALUES, normalizeRating, readDrink } from './redbullData';
import type { CreatedDrink, RedbullDrink, SavedEntry } from './redbullData';
import AddDrinkForm from './AddDrinkForm';
import DrinkImage from './DrinkImage';
import './Redbull.css';

type RatingRow = { user_id: string; redbull_id: string; rating: number; opinion: string; users: { username: string } | null };
type ExistingResultsByDrink = Record<string, Record<string, SavedEntry & { username: string }>>;
const ratingColumns = 'user_id, redbull_id, rating, opinion, users(username)';
const draftKey = (id: string) => `redbull:draft:v1:${id}`;
function readDraft(id?: string): Record<string, SavedEntry> {
  if (!id) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(draftKey(id)) ?? '{}');
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, raw]) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key) || !raw || typeof raw !== 'object') return [];
      const value = raw as SavedEntry;
      if (typeof value.opinion !== 'string' || value.opinion.length > 2000 || (value.rating !== '' && normalizeRating(value.rating) === '')) return [];
      return [[key, { rating: normalizeRating(value.rating), opinion: value.opinion }]];
    }));
  } catch { return {}; }
}

// Remount rating state when the account changes, so drafts never cross accounts.
export default function Redbull() {
  const { user } = useAuth();
  return <RedbullAccess key={user?.id ?? 'guest'} />;
}
function RedbullAccess() {
  const { user, loading } = useAuth();
  const access = useRedbullAccess(user?.id);
  if (supabase && !loading && user && access.allowed === true) return <RatingCatalog />;
  const checking = loading || Boolean(user && access.allowed === null && supabase);
  return <main className="redbull-page redbull-gate-page"><section className="redbull-access-card">
    <p className="redbull-add-eyebrow">Private tasting club</p><h1>Red Bull Rater</h1>
    {checking ? <p role="status">Checking access…</p> : !supabase ? <p role="alert">Red Bull is not configured yet. Please try again later.</p> : !user ? <><p>Log in with an invited account to browse and rate drinks.</p><Link className="save-button" to="/login?next=%2Fredbull">Log in</Link></> : <><p>{access.error || 'Your account does not have Red Bull access. The site owner can enable it for you.'}</p><button className="save-button" type="button" disabled={access.checking} onClick={() => void access.check()}>{access.checking ? 'Checking…' : 'Check access'}</button></>}
  </section></main>;
}

function RatingCatalog() {
  const { user, username, loading: authLoading } = useAuth();
  const [drinks, setDrinks] = useState<RedbullDrink[]>([]);
  const [drinksLoading, setDrinksLoading] = useState(true);
  const [drinksError, setDrinksError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [entries, setEntries] = useState<Record<string, SavedEntry>>({});
  const [savedState, setSavedState] = useState<Record<string, SavedEntry>>({});
  const [existingResultsByDrink, setExistingResultsByDrink] = useState<ExistingResultsByDrink>({});
  const [savingState, setSavingState] = useState('IDLE');
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState('');
  const [resultsLoaded, setResultsLoaded] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newEntryDirty, setNewEntryDirty] = useState(false);
  const initialDraft = useRef(readDraft(user?.id));
  const alive = useRef(true);
  const loadingRequest = useRef(0);
  const isAuthorized = Boolean(user && !authLoading && resultsLoaded);
  const opinions = Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, entry.opinion]));
  const getDrinkKey = (drink: RedbullDrink) => String(drink.id);

  useEffect(() => {
    const pending = loadingRequest;
    alive.current = true;
    return () => { alive.current = false; pending.current++; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const loadCatalog = async () => {
      const catalog: RedbullDrink[] = [];
      for (let start = 0; ; start += 500) {
        const { data, error } = await supabase!.from('redbull').select(DRINK_COLUMNS).order('name').order('id').range(start, start + 499).abortSignal(controller.signal);
        if (error) throw new Error('catalog');
        catalog.push(...data.map(readDrink));
        if (data.length < 500) break;
      }
      return catalog;
    };
    void loadCatalog().then((data) => { if (!controller.signal.aborted && alive.current) setDrinks(data); })
      .catch(() => { if (!controller.signal.aborted && alive.current) setDrinksError('Failed to load the drink catalog. Please refresh to try again.'); })
      .finally(() => { if (!controller.signal.aborted && alive.current) setDrinksLoading(false); });
    return () => controller.abort();
  }, []);

  const changed = useCallback((key: string) => {
    const entry = entries[key] ?? { rating: '', opinion: '' };
    const baseline = savedState[key] ?? { rating: '', opinion: '' };
    return entry.rating !== baseline.rating || entry.opinion.trim() !== baseline.opinion;
  }, [entries, savedState]);
  const hasUnsavedChanges = Boolean(user) && (newEntryDirty || Object.keys(entries).some(changed));
  useEffect(() => {
    const beforeNavigation = (event: Event) => {
      if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Leave this page anyway?')) event.preventDefault();
    };
    window.addEventListener(BEFORE_SITE_NAVIGATION, beforeNavigation);
    return () => window.removeEventListener(BEFORE_SITE_NAVIGATION, beforeNavigation);
  }, [hasUnsavedChanges]);
  const userId = user?.id;
  useEffect(() => {
    if (!userId || !resultsLoaded) return;
    const draft = Object.fromEntries(Object.entries(entries).filter(([key]) => changed(key)));
    try { localStorage.setItem(draftKey(userId), JSON.stringify(draft)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [entries, savedState, resultsLoaded, userId, changed]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasUnsavedChanges) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  const loadResults = useCallback(async () => {
    if (!supabase) return;
    const request = ++loadingRequest.current;
    setIsLoadingResults(true);
    setResultsError('');
    try {
      const rows: RatingRow[] = [];
      for (let start = 0; ; start += 500) {
        const { data, error } = await supabase.from('redbull_rating').select(ratingColumns).order('user_id').order('redbull_id').range(start, start + 499);
        if (error) throw new Error('ratings');
        if (!alive.current || request !== loadingRequest.current) return;
        rows.push(...(data as unknown as RatingRow[]));
        if (data.length < 500) break;
      }
      const next: ExistingResultsByDrink = {};
      const baseline: Record<string, SavedEntry> = {};
      for (const row of rows) {
        const key = row.redbull_id;
        const entry = { rating: normalizeRating(row.rating), opinion: row.opinion ?? '' };
        (next[key] ??= {})[row.user_id] = { ...entry, username: validUsername(row.users?.username) ? row.users.username : 'Member' };
        if (row.user_id === userId) baseline[key] = entry;
      }
      setExistingResultsByDrink(next); setSavedState(baseline);
      setEntries(userId ? { ...baseline, ...initialDraft.current } : {});
      setResultsLoaded(true);
    } catch { if (alive.current && request === loadingRequest.current) setResultsError('Unable to load ratings. Please try again.'); }
    finally { if (alive.current && request === loadingRequest.current) setIsLoadingResults(false); }
  }, [userId]);
  useEffect(() => {
    if (!authLoading) void loadResults();
  }, [authLoading, loadResults]);

  function updateEntry(drink: RedbullDrink, update: Partial<SavedEntry>) {
    if (!isAuthorized || savingState !== 'IDLE' || isLoadingResults) return;
    const key = getDrinkKey(drink);
    setEntries((current) => ({ ...current, [key]: { ...(current[key] ?? { rating: '', opinion: '' }), ...update } }));
  }
  const updateRating = (drink: RedbullDrink, score: number) => updateEntry(drink, { rating: normalizeRating(score) });
  const clearRating = (drink: RedbullDrink) => updateEntry(drink, { rating: '' });
  const updateOpinion = (drink: RedbullDrink, opinion: string) => updateEntry(drink, { opinion });

  function applySaved(key: string, entry: SavedEntry | null) {
    setSavedState((current) => {
      const next = { ...current }; if (entry) next[key] = entry; else delete next[key]; return next;
    });
    setExistingResultsByDrink((current) => {
      const next = { ...current, [key]: { ...current[key] } };
      if (entry) next[key][user!.id] = { ...entry, username: username ?? 'Member' }; else delete next[key][user!.id];
      return next;
    });
  }
  function created(result: CreatedDrink) {
    setDrinks((previous) => [...previous.filter((drink) => drink.id !== result.drink.id), result.drink]);
    setEntries((previous) => ({ ...previous, [result.drink.id]: result.rating }));
    applySaved(result.drink.id, result.rating);
    setAdding(false); setNewEntryDirty(false); setSearchQuery('');
    setSaveMessage(`${result.drink.name} added. Your rating is saved.`);
  }
  async function deleteOwnRow(key: string) {
    const { data, error } = await supabase!.from('redbull_rating').delete().eq('user_id', user!.id).eq('redbull_id', key).select('redbull_id');
    if (error || data.length !== 1) throw new Error('delete');
    if (alive.current) applySaved(key, null);
  }
  async function saveRating(key: string) {
    if (!isAuthorized || !user || !supabase || savingState !== 'IDLE' || isLoadingResults) return;
    if (!changed(key)) { setSaveMessage('No changes to save.'); return; }
    const entry = { rating: entries[key]?.rating ?? '', opinion: (entries[key]?.opinion ?? '').trim() };
    if (entry.rating === '' && entry.opinion) {
      setSaveMessage('Choose a score from 0 to 10 before saving your opinion.'); return;
    }
    setSavingState(key); setSaveMessage('Saving…');
    try {
      if (entry.rating === '' && !entry.opinion) {
        if (savedState[key]) await deleteOwnRow(key);
      } else {
        const { data, error } = await supabase.from('redbull_rating').upsert({ user_id: user.id, redbull_id: key, rating: entry.rating, opinion: entry.opinion }, { onConflict: 'user_id,redbull_id' }).select('redbull_id');
        if (error || data.length !== 1) throw new Error('save');
        if (!alive.current) return;
        applySaved(key, entry);
      }
      if (alive.current) setSaveMessage('Drink saved!');
    } catch { if (alive.current) setSaveMessage('Unable to save this rating. Your changes are kept; please try again.'); }
    finally { if (alive.current) setSavingState('IDLE'); }
  }
  async function deleteRating(key: string) {
    if (!isAuthorized || !user || !savedState[key] || savingState !== 'IDLE' || isLoadingResults) return;
    setSavingState(key); setSaveMessage('Deleting your rating…');
    try {
      await deleteOwnRow(key);
      if (alive.current) { setEntries((current) => { const next = { ...current }; delete next[key]; return next; }); setSaveMessage('Your rating was deleted.'); }
    } catch { if (alive.current) setSaveMessage('Unable to delete your rating. Please try again.'); }
    finally { if (alive.current) setSavingState('IDLE'); }
  }

  const processedDrinks = drinks.map((drink, originalIndex) => {
    const key = getDrinkKey(drink);
    const values = Object.values(existingResultsByDrink[key] ?? {}).map((entry) => entry.rating).filter((rating): rating is number => rating !== '');
    return { drink, originalIndex, key, averageRating: values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null };
  }).filter(({ drink }) => !searchQuery || `${drink.name} ${drink.flavor ?? ''}`.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => (b.averageRating ?? -1) - (a.averageRating ?? -1) || a.originalIndex - b.originalIndex);

  return (
    <main className="redbull-page">
      <header className="json-header">
        <div className="hero-copy">
          <p className="eyebrow">Taste test</p>
          <h1>Red Bull<br />Rater</h1>
          <p className="json-meta">{drinksLoading ? 'Loading catalog...' : drinksError || 'Rate every flavour, leave your verdict, and compare notes.'}</p>
        </div>
        <div className="control-panel">
          <div className="search-panel">
            <label htmlFor="search-drinks">Find a drink</label>
            <input id="search-drinks" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name or flavour..." autoComplete="off" />
          </div>
          <div className="save-panel">
            <button className="save-button redbull-add-toggle" type="button" disabled={adding || !isAuthorized || savingState !== 'IDLE'} onClick={() => setAdding(true)}>Add a drink</button>
          </div>
          {isLoadingResults && <p className="save-status" role="status">Loading ratings…</p>}
          {resultsError && <div className="redbull-results-error" role="alert"><p>{resultsError}</p><button className="save-button secondary" type="button" onClick={() => void loadResults()} disabled={isLoadingResults}>Try again</button></div>}
          {saveMessage && <p className="save-status" role="status">{saveMessage}</p>}
          {hasUnsavedChanges && <p className="save-status unsaved-status">You have unsaved changes.</p>}
          {storageError && <p className="save-status" role="status">Draft could not be saved in this browser. Keep this tab open.</p>}
        </div>
      </header>

      {adding && user && <AddDrinkForm userId={user.id} onCreated={created} onClose={() => { setAdding(false); setNewEntryDirty(false); }} onDirty={setNewEntryDirty} />}

      {!drinksLoading && !drinksError && (
        <section className="catalog" aria-label="Red Bull drinks">
          <div className="drinks-grid">
          {processedDrinks.map(({ drink, originalIndex, key, averageRating }) => {
            const currentRating = entries[key]?.rating ?? '';
            const currentOpinion = opinions[key] || '';

            const hasChanges = changed(key);

            const isSavingThis = savingState === key;

          return (
            <article className="drink-card" key={key}>
              <DrinkImage drink={drink} />
              <div className="drink-content">
                <p className="drink-flavor">{drink.flavor || 'Unknown flavour'}</p>
                <h2>{drink.name}</h2>
                {averageRating !== null && <p className="drink-average">Average: {averageRating.toFixed(1)} / {MAX_RATING}</p>}
                {hasChanges && <span className="unsaved-badge">Unsaved</span>}

                <ul className="existing-results-list" aria-label={`Existing results for ${drink.name}`}>
                  {Object.entries(existingResultsByDrink[key] ?? {}).map(([userId, result]) => <li key={userId}>
                    <strong>{result.username}</strong><span>Rating: {result.rating === '' ? '–' : result.rating} / {MAX_RATING}</span><span>Opinion: {result.opinion || '–'}</span>
                  </li>)}
                  {!Object.keys(existingResultsByDrink[key] ?? {}).length && <li>No ratings yet.</li>}
                </ul>
                <div className="rating-group"><div className="rating-heading"><p className="field-label">Your rating</p>
                  {currentRating !== '' && <button type="button" className="clear-rating-button" onClick={() => clearRating(drink)} disabled={!isAuthorized || savingState !== 'IDLE' || isLoadingResults}>Clear</button>}
                </div><div className="rating-row" role="group" aria-label={`Rating for ${drink.name}`}>
                  {RATING_VALUES.map((score) => (
                    <button
                      key={score}
                      type="button"
                      className={currentRating !== '' && score <= currentRating ? 'rating-button active' : 'rating-button'}
                      onClick={() => updateRating(drink, score)}
                      aria-label={`Rate ${drink.name} ${score} out of ${MAX_RATING}`}
                      aria-pressed={currentRating === score}
                      disabled={!isAuthorized || savingState !== 'IDLE' || isLoadingResults}
                    >
                      {score}
                    </button>
                  ))}
                </div></div>
                <label className="field-label" htmlFor={`opinion-${originalIndex}`}>Your opinion</label>
                <textarea
                  id={`opinion-${originalIndex}`}
                  className="opinion-input"
                  value={currentOpinion}
                  onChange={(event) => updateOpinion(drink, event.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Write your opinion..."
                  disabled={!isAuthorized || savingState !== 'IDLE' || isLoadingResults}
                />

                {savedState[key] && <button type="button" className="clear-rating-button delete-own-rating" disabled={!isAuthorized || savingState !== 'IDLE' || isLoadingResults} onClick={() => void deleteRating(key)}>Delete my rating</button>}
                <div className="card-actions">
                  {drink.url && <a className="drink-link" href={drink.url} target="_blank" rel="noopener noreferrer">Visit source</a>}
                  <button
                    className="save-button card-save"
                    type="button"
                    onClick={() => saveRating(key)}
                    disabled={!isAuthorized || savingState !== 'IDLE' || isLoadingResults || !hasChanges}
                  >
                    {isSavingThis ? 'Saving...' : 'Save drink'}
                  </button>
                </div>

              </div>
            </article>
          );
          })}
          {processedDrinks.length === 0 && <p className="empty-state">No drinks match “{searchQuery}”.</p>}
          </div>
        </section>
      )}
    </main>
  );
}
