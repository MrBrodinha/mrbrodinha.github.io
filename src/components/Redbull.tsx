import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';

type RedbullDrink = {
  id: number;
  name: string;
  url: string;
  image_url: string;
  flavor: string;
};

type RemoteResultRow = {
  id?: number | string;
  drink_id?: number | string;
  participant?: string;
  flavour?: string;
  rating?: number | string;
  opinion?: string;
};

type SavedEntry = {
  rating: number | '';
  opinion: string;
};

type ExistingResultsByDrink = Record<string, Record<string, SavedEntry>>;

type RemoteFetchResult = {
  participantName: string;
  rows: RemoteResultRow[];
  error?: string;
};

const MIN_RATING = 1;
const MAX_RATING = 10;

const normalizeRating = (value: unknown): number | '' => {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING
    ? rating
    : '';
};

// 1. Parse Keys (used for logging in)
const configuredKeys = (import.meta.env.VITE_REDBULL_KEYS || '')
  .split(',')
  .map((key: string) => key.trim().toLowerCase())
  .filter(Boolean);

// 2. Parse Names (used for display and database)
const rawNames = (import.meta.env.VITE_REDBULL_NAMES || '')
  .split(',')
  .map((name: string) => name.trim());

// 3. Create maps for tying a Key to a Name
const keyToNameMap: Record<string, string> = {};
const displayNames: string[] = []; // List of all valid names for the UI

configuredKeys.forEach((key: string, index: number) => {
  const name = rawNames[index] || key.replace(/_redbull$/i, '');
  keyToNameMap[key] = name;
  displayNames.push(name);
});

const googleSheetsUrl = import.meta.env.VITE_GOOGLE_SHEETS_URL || '';

// Local storage still relies on the secure key so your local data isn't lost
const ratingsStorageKey = (participantKey: string) => `redbull-drinks-ratings-${participantKey}`;
const opinionsStorageKey = (participantKey: string) => `redbull-drinks-opinions-${participantKey}`;
const savedStateStorageKey = (participantKey: string) => `redbull-drinks-saved-state-${participantKey}`;

function Redbull() {
  const [drinks, setDrinks] = useState<RedbullDrink[]>([]);
  const [drinksLoading, setDrinksLoading] = useState(true);
  const [drinksError, setDrinksError] = useState<string | null>(null);

  // The user types a KEY to login
  const [participantKey, setParticipantKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [opinions, setOpinions] = useState<Record<string, string>>({});
  const [savedState, setSavedState] = useState<Record<string, SavedEntry>>({});
  const [existingResultsByDrink, setExistingResultsByDrink] = useState<ExistingResultsByDrink>({});

  const [savingState, setSavingState] = useState<'IDLE' | 'ALL' | string>('IDLE');

  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [hasAutoLoadedResults, setHasAutoLoadedResults] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Snapshot references to lock the sort order
  const initialRatedKeys = useRef<Set<string>>(new Set());
  const hasLockedLocalKeys = useRef(false);
  const prevAuthKey = useRef('');

  // Authorization checks the KEY
  const normalizedKey = participantKey.trim().toLowerCase();
  const isAuthorized = configuredKeys.includes(normalizedKey);
  const activeName = isAuthorized ? keyToNameMap[normalizedKey] : '';

  useEffect(() => {
    if (prevAuthKey.current !== normalizedKey) {
      initialRatedKeys.current.clear();
      hasLockedLocalKeys.current = false;
      prevAuthKey.current = normalizedKey;
    }
  }, [normalizedKey]);

  useEffect(() => {
    let active = true;

    const loadDrinks = async () => {
      try {
        const response = await fetch('/redbull_drinks.json');
        if (!response.ok) {
          throw new Error('Could not load redbull_drinks.json');
        }

        const data = await response.json();
        if (active) {
          setDrinks(Array.isArray(data) ? data : []);
          setDrinksError(null);
        }
      } catch {
        if (active) {
          setDrinks([]);
          setDrinksError('Failed to load JSON data.');
        }
      } finally {
        if (active) {
          setDrinksLoading(false);
        }
      }
    };

    loadDrinks();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isAuthorized || !activeName) {
      setRatings({});
      setOpinions({});
      setSavedState({});
      return;
    }

    // 1. Get whatever is already in Local Storage
    const storedRatings = localStorage.getItem(ratingsStorageKey(normalizedKey));
    const storedOpinions = localStorage.getItem(opinionsStorageKey(normalizedKey));
    const storedSavedState = localStorage.getItem(savedStateStorageKey(normalizedKey));

    let nextRatings: Record<string, number> = {};
    let nextOpinions: Record<string, string> = {};
    let nextSavedState: Record<string, SavedEntry> = {};

    try { if (storedRatings) nextRatings = JSON.parse(storedRatings); } catch {}
    try { if (storedOpinions) nextOpinions = JSON.parse(storedOpinions); } catch {}
    try { if (storedSavedState) nextSavedState = JSON.parse(storedSavedState); } catch {}

    // Migrate data saved before drinks had permanent numeric IDs.
    drinks.forEach((drink, index) => {
      const stableKey = getDrinkKey(drink);
      const legacyKey = `${drink.name}-${index}`;
      if (nextRatings[stableKey] === undefined && nextRatings[legacyKey] !== undefined) nextRatings[stableKey] = nextRatings[legacyKey];
      if (nextOpinions[stableKey] === undefined && nextOpinions[legacyKey] !== undefined) nextOpinions[stableKey] = nextOpinions[legacyKey];
      if (nextSavedState[stableKey] === undefined && nextSavedState[legacyKey] !== undefined) nextSavedState[stableKey] = nextSavedState[legacyKey];
    });

    // Google Sheets becomes the baseline after results are refreshed.
    Object.keys(existingResultsByDrink).forEach((drinkKey) => {
      const remoteData = existingResultsByDrink[drinkKey]?.[activeName];
      if (remoteData) {
        if (remoteData.rating !== '') nextRatings[drinkKey] = Number(remoteData.rating);
        else delete nextRatings[drinkKey];
        if (remoteData.opinion !== '') nextOpinions[drinkKey] = remoteData.opinion;
        else delete nextOpinions[drinkKey];
        nextSavedState[drinkKey] = remoteData;
      }
    });

    // Take snapshot of rated items ONLY on the initial load for this user.
    if (!hasLockedLocalKeys.current) {
      Object.keys(nextRatings).forEach(k => initialRatedKeys.current.add(k));
      Object.keys(nextSavedState).forEach(k => initialRatedKeys.current.add(k));
      hasLockedLocalKeys.current = true;
    }

    setRatings(nextRatings);
    setOpinions(nextOpinions);
    setSavedState(nextSavedState);

  }, [isAuthorized, normalizedKey, activeName, existingResultsByDrink, drinks]);

  const getDrinkKey = (drink: RedbullDrink) => String(drink.id);

  const updateRating = (drink: RedbullDrink, score: number) => {
    if (!isAuthorized) return;
    const normalizedScore = normalizeRating(score);
    if (normalizedScore === '') return;
    const key = getDrinkKey(drink);
    setRatings((current) => {
      const next = { ...current, [key]: normalizedScore };
      localStorage.setItem(ratingsStorageKey(normalizedKey), JSON.stringify(next));
      return next;
    });
  };

  const clearRating = (drink: RedbullDrink) => {
    if (!isAuthorized) return;
    const key = getDrinkKey(drink);
    setRatings((current) => {
      const next = { ...current };
      delete next[key];
      localStorage.setItem(ratingsStorageKey(normalizedKey), JSON.stringify(next));
      return next;
    });
  };

  const updateOpinion = (drink: RedbullDrink, opinion: string) => {
    if (!isAuthorized) return;
    const key = getDrinkKey(drink);
    setOpinions((current) => {
      const next = { ...current, [key]: opinion };
      localStorage.setItem(opinionsStorageKey(normalizedKey), JSON.stringify(next));
      return next;
    });
  };

  const saveResults = async (specificDrinkKey?: string) => {
    if (!isAuthorized) {
      setSaveMessage('Type a valid participant key before saving.');
      return;
    }

    if (!googleSheetsUrl) {
      setSaveMessage('VITE_GOOGLE_SHEETS_URL is missing in .env.');
      return;
    }

    const currentRows = drinks
      .map((drink) => {
        const drinkKey = getDrinkKey(drink);

        // If a specific key was passed, skip all other drinks
        if (specificDrinkKey && drinkKey !== specificDrinkKey) return null;

        const rating = ratings[drinkKey] || '';
        const opinion = (opinions[drinkKey] || '').trim();

        if (!rating && !opinion && !savedState[drinkKey]) {
          return null;
        }

        return {
          drinkKey,
          drinkId: drink.id,
          participant: activeName,
          flavour: drink.name,
          rating,
          opinion,
        };
      })
      .filter(Boolean) as Array<{ drinkKey: string; drinkId: number; participant: string; flavour: string; rating: number | ''; opinion: string }>;

    const payloads = currentRows.filter((row) => {
      const previous = savedState[row.drinkKey];
      if (!previous) {
        return true;
      }
      return previous.rating !== row.rating || previous.opinion !== row.opinion;
    });

    if (payloads.length === 0) {
      setSaveMessage(specificDrinkKey ? 'No changes to save on this drink.' : 'No new changes to save.');
      return;
    }

    if (payloads.some(({ rating }) => rating !== '' && normalizeRating(rating) === '')) {
      setSaveMessage(`Ratings must be whole numbers from ${MIN_RATING} to ${MAX_RATING}.`);
      return;
    }

    setSavingState(specificDrinkKey ? specificDrinkKey : 'ALL');
    setSaveMessage(specificDrinkKey ? 'Saving drink...' : 'Saving...');

    try {
      const responses = await Promise.all(payloads.map((payload) => fetch(googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          participant: payload.participant,
          flavour: payload.drinkId,
          rating: payload.rating,
          opinion: payload.opinion,
        }),
      })));

      await Promise.all(responses.map(async (response) => {
        if (!response.ok) throw new Error(`Save failed with HTTP ${response.status}`);
        const responseText = await response.text();
        if (!responseText.trim()) return;
        const result = JSON.parse(responseText);
        if (result?.error) throw new Error(String(result.error));
      }));

      setSavedState((current) => {
        const next = { ...current };
        payloads.forEach((payload) => {
          next[payload.drinkKey] = {
            rating: payload.rating,
            opinion: payload.opinion,
          };
        });
        localStorage.setItem(savedStateStorageKey(normalizedKey), JSON.stringify(next));
        return next;
      });

      setExistingResultsByDrink((current) => {
        const next = { ...current };
        payloads.forEach((payload) => {
          const drinkExisting = next[payload.drinkKey] || {};
          next[payload.drinkKey] = {
            ...drinkExisting,
            [activeName]: {
              rating: payload.rating,
              opinion: payload.opinion,
            },
          };
        });
        return next;
      });

      setSaveMessage(specificDrinkKey ? 'Drink saved!' : `Saved ${payloads.length} new/updated row${payloads.length === 1 ? '' : 's'} to Google Sheets.`);
    } catch {
      setSaveMessage('Failed to send data to Google Sheets. Check the URL and script deployment.');
    } finally {
      setSavingState('IDLE');
    }
  };

  const loadResults = async (showStatusMessage = true) => {
    if (showStatusMessage && hasUnsavedChanges && !window.confirm('Loading remote results will replace your unsaved local changes. Continue?')) {
      return;
    }

    if (!googleSheetsUrl) {
      if (showStatusMessage) {
        setSaveMessage('VITE_GOOGLE_SHEETS_URL is missing in .env.');
      }
      return;
    }

    if (displayNames.length === 0) {
      if (showStatusMessage) {
        setSaveMessage('No participant names mapped.');
      }
      return;
    }

    setIsLoadingResults(true);
    if (showStatusMessage) {
      setSaveMessage('Loading results...');
    }

    try {
      const fetches = displayNames.map(async (name: string) => {
        const url = `${googleSheetsUrl}?participant=${encodeURIComponent(name)}`;
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) {
          return { participantName: name, rows: [] as RemoteResultRow[], error: `HTTP ${response.status}` };
        }

        const responseText = await response.text();
        if (!responseText.trim().startsWith('{') && !responseText.trim().startsWith('[')) {
          if (responseText.includes('Função de script não encontrada: doGet') || responseText.includes('script function not found: doGet')) {
            return { participantName: name, rows: [] as RemoteResultRow[], error: 'Apps Script doGet is missing in this deployment' };
          }
          return { participantName: name, rows: [] as RemoteResultRow[], error: 'Non-JSON response from Apps Script' };
        }

        const data = JSON.parse(responseText);
        if (data?.error) {
          return { participantName: name, rows: [] as RemoteResultRow[], error: String(data.error) };
        }

        const rows: RemoteResultRow[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.rows)
            ? data.rows
            : [];

        return { participantName: name, rows };
      });

      const byParticipant: RemoteFetchResult[] = await Promise.all(fetches);
      const nextExistingResultsByDrink: ExistingResultsByDrink = {};
      let loadedRows = 0;
      const fetchErrors = byParticipant.filter((entry) => entry.error).map((entry) => `${entry.participantName}: ${entry.error}`);

      byParticipant.forEach(({ participantName: fetchParticipantName, rows }) => {
        rows.forEach((row: RemoteResultRow) => {
          const flavourValue = String(row.flavour ?? '').trim();
          const flavourId = Number(flavourValue);

          const drinkIndex =
            Number.isInteger(flavourId) && flavourId > 0
              ? drinks.findIndex((drink) => drink.id === flavourId)
              : drinks.findIndex((drink) => drink.name === flavourValue);
          if (drinkIndex === -1) return;

          const drink = drinks[drinkIndex];
          const drinkKey = getDrinkKey(drink);
          const normalizedRating = normalizeRating(row.rating);
          const normalizedOpinion = typeof row.opinion === 'string' ? row.opinion : '';

          const drinkExisting = nextExistingResultsByDrink[drinkKey] || {};
          nextExistingResultsByDrink[drinkKey] = {
            ...drinkExisting,
            [fetchParticipantName]: {
              rating: normalizedRating,
              opinion: normalizedOpinion,
            },
          };

          // Record that this drink had a rating on the fetch
          if (normalizedRating !== '') {
            initialRatedKeys.current.add(drinkKey);
          }

          loadedRows += 1;
        });
      });

      setExistingResultsByDrink(nextExistingResultsByDrink);

      if (fetchErrors.length > 0) {
        setSaveMessage(`Some participants failed to load: ${fetchErrors.join(' | ')}`);
      } else if (showStatusMessage) {
        setSaveMessage(loadedRows > 0 ? 'Loaded results for all participants.' : 'No remote results found yet.');
      }
    } catch {
      setSaveMessage('Failed to load remote results. Ensure your Apps Script has a doGet that returns JSON rows.');
    } finally {
      setIsLoadingResults(false);
    }
  };

  useEffect(() => {
    if (
      hasAutoLoadedResults ||
      drinksLoading ||
      drinksError ||
      drinks.length === 0 ||
      displayNames.length === 0 ||
      !googleSheetsUrl
    ) {
      return;
    }

    setHasAutoLoadedResults(true);
    void loadResults(false);
  }, [
    hasAutoLoadedResults,
    drinksLoading,
    drinksError,
    drinks.length,
  ]);

  const getProcessedDrinks = () => {
    let processed = drinks.map((drink, index) => {
      const key = getDrinkKey(drink);
      const drinkResults = Object.values(existingResultsByDrink[key] || {});
      const validRatings = drinkResults
        .map((result) => normalizeRating(result.rating))
        .filter((rating): rating is number => rating !== '');

      return {
        drink,
        originalIndex: index,
        key,
        averageRating: validRatings.length > 0
          ? validRatings.reduce((total, rating) => total + rating, 0) / validRatings.length
          : null,
      };
    });

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      processed = processed.filter(({ drink }) =>
        drink.name.toLowerCase().includes(lowerQuery) ||
        (drink.flavor && drink.flavor.toLowerCase().includes(lowerQuery))
      );
    }

    // Rated drinks come first, ordered by the average of all participant ratings.
    // Ties and unrated drinks retain their original catalogue order.
    processed.sort((a, b) => {
      if (a.averageRating === null && b.averageRating === null) return a.originalIndex - b.originalIndex;
      if (a.averageRating === null) return 1;
      if (b.averageRating === null) return -1;
      return b.averageRating - a.averageRating || a.originalIndex - b.originalIndex;
    });

    return processed;
  };

  const processedDrinks = getProcessedDrinks();
  const hasUnsavedChanges = drinks.some((drink) => {
    const key = getDrinkKey(drink);
    const rating = ratings[key] || '';
    const opinion = (opinions[key] || '').trim();
    const previous = savedState[key];
    return previous
      ? previous.rating !== rating || previous.opinion !== opinion
      : rating !== '' || opinion !== '';
  });

  useEffect(() => {
    const warnAboutUnsavedChanges = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnAboutUnsavedChanges);
    return () => window.removeEventListener('beforeunload', warnAboutUnsavedChanges);
  }, [hasUnsavedChanges]);

  return (
    <main className="redbull-page">
      <style>{`
        .redbull-page .unsaved-badge { display: inline-block; margin-bottom: .75rem; padding: .2rem .5rem; border-radius: 999px; background: #fff0b3; color: #6b4f00; font-size: .75rem; font-weight: 700; }
        .redbull-page .unsaved-status { color: #8a6300; font-weight: 700; }
        .redbull-page .clear-rating-button { border: 0; background: transparent; color: inherit; cursor: pointer; text-decoration: underline; }
        @media (max-width: 560px) { .redbull-page .rating-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .4rem; } .redbull-page .rating-button { width: 100%; min-width: 0; } .redbull-page .clear-rating-button { grid-column: 1 / -1; } }
      `}</style>
      <Link
        className="back-link"
        to="/"
        aria-label="Back to the home page"
        onClick={(event) => {
          if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Leave this page anyway?')) event.preventDefault();
        }}
      >
        <span aria-hidden="true">&larr;</span> mrbrodinha
      </Link>
      <header className="json-header">
        <div className="hero-copy">
          <p className="eyebrow">Taste test</p>
          <h1>Red Bull<br />Rater</h1>
          <p className="json-meta">{drinksLoading ? 'Loading catalog...' : drinksError || 'Rate every flavour, leave your verdict, and compare notes.'}</p>
        </div>
        <div className="control-panel">
          <form className="participant-panel" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="participant-key">Who is rating?</label>
            <input id="participant-key" type="password" value={participantKey} onChange={(event) => setParticipantKey(event.target.value)} placeholder="Type your secure key..." autoComplete="current-password" />
            <small className={isAuthorized ? 'login-status authorized' : 'login-status'}>{isAuthorized ? `Rating as ${activeName}` : 'Enter a valid key to unlock rating.'}</small>
          </form>
          <div className="search-panel">
            <label htmlFor="search-drinks">Find a drink</label>
            <input id="search-drinks" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name or flavour..." autoComplete="off" />
          </div>
          <div className="save-panel">
            <button className="save-button secondary" type="button" onClick={() => { void loadResults(); }} disabled={displayNames.length === 0 || isLoadingResults || savingState !== 'IDLE'}>{isLoadingResults ? 'Loading...' : 'Load results'}</button>
            <button className="save-button" type="button" onClick={() => saveResults()} disabled={!isAuthorized || savingState !== 'IDLE' || isLoadingResults}>{savingState === 'ALL' ? 'Saving all...' : 'Save all'}</button>
          </div>
          {saveMessage && <p className="save-status" role="status">{saveMessage}</p>}
          {hasUnsavedChanges && <p className="save-status unsaved-status">You have unsaved changes.</p>}
        </div>
      </header>

      {!drinksLoading && !drinksError && (
        <section className="catalog" aria-label="Red Bull drinks">
          <div className="drinks-grid">
          {processedDrinks.map(({ drink, originalIndex, key }) => {
            const currentRating = ratings[key] || 0;
            const currentOpinion = opinions[key] || '';

            // Check if this specific card has unsaved changes
            const prev = savedState[key];
            const hasChanges = prev
              ? (prev.rating !== (currentRating || '') || prev.opinion !== currentOpinion)
              : (currentRating !== 0 || currentOpinion !== '');

            const isSavingThis = savingState === key;

          return (
            <article className="drink-card" key={key}>
              <div className="drink-visual"><img className="drink-image" src={drink.image_url} alt={drink.name} loading="lazy" /></div>
              <div className="drink-content">
                <p className="drink-flavor">{drink.flavor || 'Unknown flavor'}</p>
                <h2>{drink.name}</h2>
                {hasChanges && <span className="unsaved-badge">Unsaved</span>}

                <ul className="existing-results-list" aria-label={`Existing results for ${drink.name}`}>
                  {displayNames.map((name: string) => {
                    const result = existingResultsByDrink[key]?.[name];
                    const ratingLabel = result?.rating ? String(result.rating) : '-';
                    const opinionLabel = result?.opinion ? result.opinion : '-';

                    return (
                      <li key={name}>
                        <strong>{name}</strong>
                        <span>Rating: {ratingLabel}</span>
                        <span>Opinion: {opinionLabel}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="rating-group"><p className="field-label">Your rating</p><div className="rating-row" aria-label={`Rating for ${drink.name}`}>
                  {Array.from({ length: MAX_RATING }, (_, index) => index + MIN_RATING).map((score) => (
                    <button
                      key={score}
                      type="button"
                      className={score <= currentRating ? 'rating-button active' : 'rating-button'}
                      onClick={() => updateRating(drink, score)}
                      aria-label={`Rate ${drink.name} ${score} out of ${MAX_RATING}`}
                      disabled={!isAuthorized}
                    >
                      {score}
                    </button>
                  ))}
                  {currentRating > 0 && (
                    <button type="button" className="clear-rating-button" onClick={() => clearRating(drink)} disabled={!isAuthorized}>
                      Clear
                    </button>
                  )}
                </div></div>
                <label className="field-label" htmlFor={`opinion-${originalIndex}`}>Your opinion</label>
                <textarea
                  id={`opinion-${originalIndex}`}
                  className="opinion-input"
                  value={currentOpinion}
                  onChange={(event) => updateOpinion(drink, event.target.value)}
                  rows={3}
                  placeholder="Write your opinion..."
                  disabled={!isAuthorized}
                />

                <div className="card-actions">
                  <a className="drink-link" href={drink.url} target="_blank" rel="noreferrer">Visit source</a>
                  <button
                    className="save-button card-save"
                    type="button"
                    onClick={() => saveResults(key)}
                    disabled={!isAuthorized || savingState !== 'IDLE' || !hasChanges}
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

export default Redbull;
