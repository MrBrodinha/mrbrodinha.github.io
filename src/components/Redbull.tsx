import { useEffect, useState } from 'react';

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
  // Use the mapped name if available, otherwise strip '_redbull' as a fallback
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
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [hasAutoLoadedResults, setHasAutoLoadedResults] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Authorization checks the KEY
  const normalizedKey = participantKey.trim().toLowerCase();
  const isAuthorized = configuredKeys.includes(normalizedKey);
  
  // The active name is determined by mapping the authorized key
  const activeName = isAuthorized ? keyToNameMap[normalizedKey] : '';

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
    if (!isAuthorized) {
      setRatings({});
      return;
    }

    const stored = localStorage.getItem(ratingsStorageKey(normalizedKey));
    if (!stored) {
      setRatings({});
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        setRatings(parsed as Record<string, number>);
      }
    } catch {
      setRatings({});
    }
  }, [isAuthorized, normalizedKey]);

  useEffect(() => {
    if (!isAuthorized) {
      setOpinions({});
      return;
    }

    const stored = localStorage.getItem(opinionsStorageKey(normalizedKey));
    if (!stored) {
      setOpinions({});
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        setOpinions(parsed as Record<string, string>);
      }
    } catch {
      setOpinions({});
    }
  }, [isAuthorized, normalizedKey]);

  useEffect(() => {
    if (!isAuthorized) {
      setSavedState({});
      return;
    }

    const stored = localStorage.getItem(savedStateStorageKey(normalizedKey));
    if (!stored) {
      setSavedState({});
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        setSavedState(parsed as Record<string, SavedEntry>);
      }
    } catch {
      setSavedState({});
    }
  }, [isAuthorized, normalizedKey]);

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

  const saveResults = async () => {
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
        const rating = ratings[drinkKey] || '';
        const opinion = (opinions[drinkKey] || '').trim();

        if (!rating && !opinion) {
          return null;
        }

        return {
          drinkKey,
          participant: activeName, // Send the NAME to Google Sheets, not the key
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
      setSaveMessage('No new changes to save.');
      return;
    }

    setIsSaving(true);
    setSaveMessage('Saving...');

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

      setSaveMessage(`Saved ${payloads.length} new/updated row${payloads.length === 1 ? '' : 's'} to Google Sheets.`);
    } catch {
      setSaveMessage('Failed to send data to Google Sheets. Check the URL and script deployment.');
    } finally {
      setIsSaving(false);
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
      // Fetch by NAME
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
      const nextRatings: Record<string, number> = {};
      const nextOpinions: Record<string, string> = {};
      const nextSavedState: Record<string, SavedEntry> = {};
      let loadedRows = 0;
      const fetchErrors = byParticipant.filter((entry) => entry.error).map((entry) => `${entry.participantName}: ${entry.error}`);

      byParticipant.forEach(({ participantName: fetchParticipantName, rows }) => {
        rows.forEach((row: RemoteResultRow) => {
          if (!row.flavour) {
            return;
          }

          const drinkIndex = drinks.findIndex((drink) => drink.name === row.flavour);
          if (drinkIndex === -1) {
            return;
          }

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

          // Compare the fetched name to the active logged-in user's name
          if (isAuthorized && fetchParticipantName === activeName) {
            if (normalizedRating !== '') {
              nextRatings[drinkKey] = normalizedRating;
            }

            if (normalizedOpinion) {
              nextOpinions[drinkKey] = normalizedOpinion;
            }

            nextSavedState[drinkKey] = {
              rating: normalizedRating,
              opinion: normalizedOpinion,
            };
          }

          loadedRows += 1;
        });
      });

      setExistingResultsByDrink(nextExistingResultsByDrink);

      if (isAuthorized) {
        setRatings(nextRatings);
        setOpinions(nextOpinions);
        setSavedState(nextSavedState);
        localStorage.setItem(ratingsStorageKey(normalizedKey), JSON.stringify(nextRatings));
        localStorage.setItem(opinionsStorageKey(normalizedKey), JSON.stringify(nextOpinions));
        localStorage.setItem(savedStateStorageKey(normalizedKey), JSON.stringify(nextSavedState));
      }

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

    processed.sort((a, b) => {
      const aHasRemoteRating = Object.values(existingResultsByDrink[a.key] || {}).some(res => Boolean(res.rating));
      const aHasRating = !!ratings[a.key] || aHasRemoteRating;

      const bHasRemoteRating = Object.values(existingResultsByDrink[b.key] || {}).some(res => Boolean(res.rating));
      const bHasRating = !!ratings[b.key] || bHasRemoteRating;

      if (aHasRating && !bHasRating) return -1;
      if (!aHasRating && bHasRating) return 1;
      return 0; 
    });

    return processed;
  };

  const processedDrinks = getProcessedDrinks();

  return (
    <main className="redbull-page">
      <header className="json-header">
        <p className="eyebrow">Red Bull Data</p>
        <h1>Drinks JSON Viewer</h1>
        <p className="json-meta">
          {drinksLoading ? 'Loading...' : drinksError ? drinksError : `${drinks.length} records loaded from /redbull_drinks.json`}
        </p>
        <div className="participant-panel">
          <label htmlFor="participant-key">Who is rating?</label>
          <input
            id="participant-key"
            type="text"
            value={participantKey}
            onChange={(event) => setParticipantKey(event.target.value)}
            placeholder="Type your secure key..."
            autoComplete="off"
          />
          <small>
            {isAuthorized
              ? `Logged in. Rating as ${activeName}`
              : 'Enter a valid participant key to unlock.'}
          </small>
        </div>

        <div className="search-panel" style={{ marginTop: '1rem' }}>
          <label htmlFor="search-drinks">Search Drinks</label>
          <input
            id="search-drinks"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or flavor..."
            autoComplete="off"
          />
        </div>

        <div className="save-panel">
          <button className="save-button secondary" type="button" onClick={() => { void loadResults(); }} disabled={displayNames.length === 0 || isLoadingResults || isSaving}>
            {isLoadingResults ? 'Loading...' : 'Load Results'}
          </button>
          <button className="save-button" type="button" onClick={saveResults} disabled={!isAuthorized || isSaving || isLoadingResults}>
            {isSaving ? 'Saving...' : 'Save Results'}
          </button>
          {saveMessage && <p className="save-status">{saveMessage}</p>}
        </div>
      </header>

      {!drinksLoading && !drinksError && (
        <section className="drinks-grid" aria-label="Red Bull JSON cards">
          {processedDrinks.map(({ drink, originalIndex, key }) => {
            const currentRating = ratings[key] || 0;
            const currentOpinion = opinions[key] || '';

          return (
            <article className="drink-card" key={key}>
              <img className="drink-image" src={drink.image_url} alt={drink.name} loading="lazy" />
              <div className="drink-content">
                <h2>{drink.name}</h2>
                <p className="drink-flavor">{drink.flavor || 'Unknown flavor'}</p>
                
                {/* Iterate over the clean displayNames */}
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
                <div className="rating-row" aria-label={`Rating for ${drink.name}`}>
                  {[1, 2, 3, 4, 5].map((score) => (
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
                </div>
                <textarea
                  className="opinion-input"
                  value={currentOpinion}
                  onChange={(event) => updateOpinion(drink, originalIndex, event.target.value)}
                  rows={3}
                  placeholder="Write your opinion..."
                  disabled={!isAuthorized}
                />
                <a className="drink-link" href={drink.url} target="_blank" rel="noreferrer">Visit source</a>
              </div>
            </article>
          );
          })}
        </section>
      )}
    </main>
  );
}

export default Redbull;