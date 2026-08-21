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
  key: string;
  participantName: string;
  rows: RemoteResultRow[];
  error?: string;
};

const configuredKeys = (import.meta.env.VITE_REDBULL_KEYS || '')
  .split(',')
  .map((key: string) => key.trim().toLowerCase())
  .filter(Boolean);
const googleSheetsUrl = import.meta.env.VITE_GOOGLE_SHEETS_URL || '';

const ratingsStorageKey = (participantKey: string) => `redbull-drinks-ratings-${participantKey}`;
const opinionsStorageKey = (participantKey: string) => `redbull-drinks-opinions-${participantKey}`;
const savedStateStorageKey = (participantKey: string) => `redbull-drinks-saved-state-${participantKey}`;

function Redbull() {
  const [drinks, setDrinks] = useState<RedbullDrink[]>([]);
  const [drinksLoading, setDrinksLoading] = useState(true);
  const [drinksError, setDrinksError] = useState<string | null>(null);
  const [participantKey, setParticipantKey] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [opinions, setOpinions] = useState<Record<string, string>>({});
  const [savedState, setSavedState] = useState<Record<string, SavedEntry>>({});
  const [existingResultsByDrink, setExistingResultsByDrink] = useState<ExistingResultsByDrink>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [hasAutoLoadedResults, setHasAutoLoadedResults] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const isAuthorized = configuredKeys.includes(participantKey);

  useEffect(() => {
    if (!participantKey && configuredKeys.length > 0) {
      setParticipantKey(configuredKeys[0]);
    }
  }, [participantKey]);

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

    const stored = localStorage.getItem(ratingsStorageKey(participantKey));
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
  }, [isAuthorized, participantKey]);

  useEffect(() => {
    if (!isAuthorized) {
      setOpinions({});
      return;
    }

    const stored = localStorage.getItem(opinionsStorageKey(participantKey));
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
  }, [isAuthorized, participantKey]);

  useEffect(() => {
    if (!isAuthorized) {
      setSavedState({});
      return;
    }

    const stored = localStorage.getItem(savedStateStorageKey(participantKey));
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
  }, [isAuthorized, participantKey]);

  const getDrinkKey = (drink: RedbullDrink, index: number) => `${drink.name}-${index}`;

  const participantNameFromKey = (key: string) => {
    const cleaned = key.replace(/_redbull$/i, '');
    if (cleaned === 'martinho') {
      return 'marte';
    }
    return cleaned;
  };

  const formatParticipantName = (key: string) => participantNameFromKey(key);

  const updateRating = (drink: RedbullDrink, index: number, score: number) => {
    if (!isAuthorized) return;
    const key = getDrinkKey(drink, index);
    setRatings((current) => {
      const next = { ...current, [key]: score };
      localStorage.setItem(ratingsStorageKey(participantKey), JSON.stringify(next));
      return next;
    });
  };

  const updateOpinion = (drink: RedbullDrink, index: number, opinion: string) => {
    if (!isAuthorized) return;
    const key = getDrinkKey(drink, index);
    setOpinions((current) => {
      const next = { ...current, [key]: opinion };
      localStorage.setItem(opinionsStorageKey(participantKey), JSON.stringify(next));
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
          participant: participantNameFromKey(participantKey),
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
        localStorage.setItem(savedStateStorageKey(participantKey), JSON.stringify(next));
        return next;
      });

      setExistingResultsByDrink((current) => {
        const next = { ...current };
        payloads.forEach((payload) => {
          const drinkExisting = next[payload.drinkKey] || {};
          next[payload.drinkKey] = {
            ...drinkExisting,
            [participantKey]: {
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

    if (configuredKeys.length === 0) {
      if (showStatusMessage) {
        setSaveMessage('No participant keys found in VITE_REDBULL_KEYS.');
      }
      return;
    }

    setIsLoadingResults(true);
    if (showStatusMessage) {
      setSaveMessage('Loading results...');
    }

    try {
      const fetches = configuredKeys.map(async (key: string) => {
        const participantName = participantNameFromKey(key);
        const url = `${googleSheetsUrl}?participant=${encodeURIComponent(participantName)}`;
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) {
          return { key, participantName, rows: [] as RemoteResultRow[], error: `HTTP ${response.status}` };
        }

        const responseText = await response.text();
        if (!responseText.trim().startsWith('{') && !responseText.trim().startsWith('[')) {
          if (responseText.includes('Função de script não encontrada: doGet') || responseText.includes('script function not found: doGet')) {
            return { key, participantName, rows: [] as RemoteResultRow[], error: 'Apps Script doGet is missing in this deployment' };
          }

          return { key, participantName, rows: [] as RemoteResultRow[], error: 'Non-JSON response from Apps Script' };
        }

        const data = JSON.parse(responseText);
        if (data?.error) {
          return { key, participantName, rows: [] as RemoteResultRow[], error: String(data.error) };
        }

        const rows: RemoteResultRow[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.rows)
            ? data.rows
            : [];

        return { key, participantName, rows };
      });

      const byParticipant: RemoteFetchResult[] = await Promise.all(fetches);
      const nextExistingResultsByDrink: ExistingResultsByDrink = {};
      const nextRatings: Record<string, number> = {};
      const nextOpinions: Record<string, string> = {};
      const nextSavedState: Record<string, SavedEntry> = {};
      let loadedRows = 0;
      const fetchErrors = byParticipant.filter((entry) => entry.error).map((entry) => `${entry.participantName}: ${entry.error}`);

      byParticipant.forEach(({ key: participant, rows }) => {
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
            [participant]: {
              rating: normalizedRating,
              opinion: normalizedOpinion,
            },
          };

          if (participant === participantKey) {
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
        localStorage.setItem(ratingsStorageKey(participantKey), JSON.stringify(nextRatings));
        localStorage.setItem(opinionsStorageKey(participantKey), JSON.stringify(nextOpinions));
        localStorage.setItem(savedStateStorageKey(participantKey), JSON.stringify(nextSavedState));
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
    if (hasAutoLoadedResults) {
      return;
    }

    if (drinksLoading || drinksError || drinks.length === 0) {
      return;
    }

    if (!participantKey || configuredKeys.length === 0 || !googleSheetsUrl) {
      return;
    }

    setHasAutoLoadedResults(true);
    void loadResults(false);
  }, [hasAutoLoadedResults, drinksLoading, drinksError, drinks.length, participantKey]);

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
            onChange={(event) => setParticipantKey(event.target.value.trim().toLowerCase())}
            placeholder="Type your participant key"
            autoComplete="off"
          />
          <small>{isAuthorized ? `Rating as ${participantKey}` : 'Choose one key from VITE_REDBULL_KEYS.'}</small>
        </div>
        <div className="save-panel">
          <button className="save-button secondary" type="button" onClick={() => { void loadResults(); }} disabled={configuredKeys.length === 0 || isLoadingResults || isSaving}>
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
          {drinks.map((drink, index) => {
            const key = getDrinkKey(drink, index);
            const currentRating = ratings[key] || 0;
            const currentOpinion = opinions[key] || '';

          return (
            <article className="drink-card" key={`${drink.name}-${index}`}>
              <img className="drink-image" src={drink.image_url} alt={drink.name} loading="lazy" />
              <div className="drink-content">
                <h2>{drink.name}</h2>
                <p className="drink-flavor">{drink.flavor || 'Unknown flavor'}</p>
                <ul className="existing-results-list" aria-label={`Existing results for ${drink.name}`}>
                  {configuredKeys.map((participant: string) => {
                    const result = existingResultsByDrink[key]?.[participant];
                    const ratingLabel = result?.rating ? String(result.rating) : '-';
                    const opinionLabel = result?.opinion ? result.opinion : '-';

                    return (
                      <li key={participant}>
                        <strong>{formatParticipantName(participant)}</strong>
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
                      onClick={() => updateRating(drink, index, score)}
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
                  onChange={(event) => updateOpinion(drink, index, event.target.value)}
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