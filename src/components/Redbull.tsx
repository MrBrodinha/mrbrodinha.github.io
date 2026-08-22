import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';

type RedbullDrink = {
  name: string;
  url: string;
  image_url: string;
  flavor: string;
};

type RemoteResultRow = {
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

  // If the user changes their login key, reset the sort locks
  if (prevAuthKey.current !== normalizedKey) {
    initialRatedKeys.current.clear();
    hasLockedLocalKeys.current = false;
    prevAuthKey.current = normalizedKey;
  }

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

    // 2. Hydrate from Google Sheets (existingResultsByDrink) if local storage is missing it
    Object.keys(existingResultsByDrink).forEach((drinkKey) => {
      const remoteData = existingResultsByDrink[drinkKey]?.[activeName];
      if (remoteData) {
        if (nextRatings[drinkKey] === undefined && remoteData.rating !== '') {
          nextRatings[drinkKey] = Number(remoteData.rating);
        }
        if (nextOpinions[drinkKey] === undefined && remoteData.opinion !== '') {
          nextOpinions[drinkKey] = remoteData.opinion;
        }
        if (nextSavedState[drinkKey] === undefined) {
          nextSavedState[drinkKey] = remoteData;
        }
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

  }, [isAuthorized, normalizedKey, activeName, existingResultsByDrink]);

  const getDrinkKey = (drink: RedbullDrink, index: number) => `${drink.name}-${index}`;

  const updateRating = (drink: RedbullDrink, index: number, score: number) => {
    if (!isAuthorized) return;
    const key = getDrinkKey(drink, index);
    setRatings((current) => {
      const next = { ...current, [key]: score };
      localStorage.setItem(ratingsStorageKey(normalizedKey), JSON.stringify(next));
      return next;
    });
  };

  const updateOpinion = (drink: RedbullDrink, index: number, opinion: string) => {
    if (!isAuthorized) return;
    const key = getDrinkKey(drink, index);
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
      .map((drink, index) => {
        const drinkKey = getDrinkKey(drink, index);

        // If a specific key was passed, skip all other drinks
        if (specificDrinkKey && drinkKey !== specificDrinkKey) return null;

        const rating = ratings[drinkKey] || '';
        const opinion = (opinions[drinkKey] || '').trim();

        if (!rating && !opinion) {
          return null;
        }

        return {
          drinkKey,
          participant: activeName,
          flavour: drink.name,
          rating,
          opinion,
        };
      })
      .filter(Boolean) as Array<{ drinkKey: string; participant: string; flavour: string; rating: number | ''; opinion: string }>;

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

    setSavingState(specificDrinkKey ? specificDrinkKey : 'ALL');
    setSaveMessage(specificDrinkKey ? 'Saving drink...' : 'Saving...');

    try {
      await Promise.all(payloads.map((payload) => fetch(googleSheetsUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          participant: payload.participant,
          flavour: payload.flavour,
          rating: payload.rating,
          opinion: payload.opinion,
        }),
      })));

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
          if (!row.flavour) return;

          const drinkIndex = drinks.findIndex((drink) => drink.name === row.flavour);
          if (drinkIndex === -1) return;

          const drink = drinks[drinkIndex];
          const drinkKey = getDrinkKey(drink, drinkIndex);
          const numericRating = Number(row.rating);
          const normalizedRating = !Number.isNaN(numericRating) && numericRating >= 1 && numericRating <= 5 ? numericRating : '';
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
    let processed = drinks.map((drink, index) => ({
      drink,
      originalIndex: index,
      key: getDrinkKey(drink, index)
    }));

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      processed = processed.filter(({ drink }) =>
        drink.name.toLowerCase().includes(lowerQuery) ||
        (drink.flavor && drink.flavor.toLowerCase().includes(lowerQuery))
      );
    }

    // Sort ONLY based on the `initialRatedKeys` reference.
    processed.sort((a, b) => {
      const aHasRating = initialRatedKeys.current.has(a.key);
      const bHasRating = initialRatedKeys.current.has(b.key);

      if (aHasRating && !bHasRating) return -1;
      if (!aHasRating && bHasRating) return 1;
      return 0;
    });

    return processed;
  };

  const processedDrinks = getProcessedDrinks();

  return (
    <main className="redbull-page">
      <Link className="back-link" to="/" aria-label="Back to the home page"><span aria-hidden="true">&larr;</span> mrbrodinha</Link>
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
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                    <button
                      key={score}
                      type="button"
                      className={score <= currentRating ? 'rating-button active' : 'rating-button'}
                      onClick={() => updateRating(drink, originalIndex, score)}
                      aria-label={`Rate ${drink.name} ${score} out of 5`}
                      disabled={!isAuthorized}
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
                  onChange={(event) => updateOpinion(drink, originalIndex, event.target.value)}
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
