import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRedbullEntry } from './redbullService';
import { MAX_RATING, RATING_VALUES, normalizedUrl, redbullError, validateImage, validateNewDrink } from './redbullData';
import type { CreatedDrink, NewDrink } from './redbullData';

const empty: NewDrink = { name: '', flavour: '', sourceUrl: '', imageUrl: '', rating: '', opinion: '' };
export default function AddDrinkForm({ userId, onCreated, onClose, onDirty }: {
  userId: string; onCreated: (result: CreatedDrink) => void; onClose: () => void; onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(empty);
  const [id] = useState(() => crypto.randomUUID());
  const [imageMode, setImageMode] = useState<'url' | 'upload'>('url');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onDirty(false); }; }, [onDirty]);
  useEffect(() => { onDirty(Boolean(file || Object.entries(draft).some(([key,value]) => value !== empty[key as keyof NewDrink]))); }, [draft, file, onDirty]);
  useEffect(() => {
    if (imageMode === 'upload') { if (file) { const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); } setPreview(''); return; }
    try { setPreview(normalizedUrl(draft.imageUrl, true) ?? ''); } catch { setPreview(''); }
  }, [imageMode, file, draft.imageUrl]);
  function change(field: keyof NewDrink, value: string | number) { setDraft((previous) => ({ ...previous, [field]: value })); setError(''); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const content = { ...draft, imageUrl: imageMode === 'url' ? draft.imageUrl : '' };
    try {
      validateNewDrink(content);
      if (imageMode === 'upload') { if (!file) throw new Error('Choose an image file, or switch to Image URL.'); validateImage(file); }
    } catch (problem) { setError((problem as Error).message); return; }
    setBusy(true); setError(''); setStatus('Saving…');
    try {
      const result = await createRedbullEntry(id, userId, content, imageMode === 'upload' ? file : null,
        (message) => { if (alive.current) setStatus(message); });
      if (alive.current) { onDirty(false); onCreated(result); }
    } catch (problem) { if (alive.current) { setError(redbullError(problem)); setStatus(''); } }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="redbull-add-panel" aria-labelledby="add-drink-title">
    <div className="redbull-add-heading"><div><p className="redbull-add-eyebrow">New discovery</p><h2 id="add-drink-title">Add a Red Bull</h2><p>Add it to the catalog and save your first rating.</p></div><button className="redbull-form-cancel" type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
    <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
      <fieldset disabled={busy} className="redbull-entry-fields"><legend className="redbull-form-legend">Drink details</legend>
        <div className="redbull-entry-grid">
          <label htmlFor="new-drink-name">Name <span>Required</span><input id="new-drink-name" maxLength={160} required value={draft.name} onChange={(event) => change('name', event.target.value)} placeholder="Red Bull Summer Edition" /></label>
          <label htmlFor="new-drink-flavour">Flavour <span>Required</span><input id="new-drink-flavour" maxLength={200} required value={draft.flavour} onChange={(event) => change('flavour', event.target.value)} placeholder="The flavour on the can" /></label>
          <label className="redbull-entry-wide" htmlFor="new-drink-source">Source link <span>Optional</span><input id="new-drink-source" type="url" maxLength={2048} value={draft.sourceUrl} onChange={(event) => change('sourceUrl', event.target.value)} placeholder="https://…" /></label>
        </div>
      </fieldset>
      <fieldset disabled={busy} className="redbull-entry-fields"><legend className="redbull-form-legend">Image <span>Optional</span></legend>
        <div className="redbull-image-modes" role="group" aria-label="Image source"><button type="button" aria-pressed={imageMode === 'url'} onClick={() => { setImageMode('url'); setError(''); }}>Image URL</button><button type="button" aria-pressed={imageMode === 'upload'} onClick={() => { setImageMode('upload'); setError(''); }}>Upload image</button></div>
        {imageMode === 'url' ? <label key="image-url" htmlFor="new-drink-image-url">Image URL<input id="new-drink-image-url" type="url" maxLength={2048} value={draft.imageUrl} onChange={(event) => change('imageUrl', event.target.value)} placeholder="https://example.com/redbull.jpg" /></label>
          : <label key="image-file" htmlFor="new-drink-image-file">Choose an image<input id="new-drink-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { const next = event.target.files?.[0] ?? null; try { if (next) validateImage(next); setFile(next); setError(''); } catch (problem) { setFile(null); event.target.value = ''; setError((problem as Error).message); } }} /><small>JPG, PNG, WebP, or GIF · up to 5 MB. Visible only to the two enabled accounts.</small></label>}
        {preview && <img className="redbull-new-image-preview" src={preview} alt="New drink preview" />}
      </fieldset>
      <fieldset disabled={busy} className="redbull-entry-fields"><legend className="redbull-form-legend">Your first rating <span>Required</span></legend>
        <div className="redbull-new-rating" role="group" aria-label="New drink rating">{RATING_VALUES.map((rating) => <button type="button" key={rating} aria-label={`Rate new drink ${rating} out of ${MAX_RATING}`} aria-pressed={draft.rating === rating} onClick={() => change('rating', rating)}>{rating}</button>)}</div>
        <label htmlFor="new-drink-opinion">Your opinion<textarea id="new-drink-opinion" rows={3} maxLength={2000} value={draft.opinion} onChange={(event) => change('opinion', event.target.value)} placeholder="What did you think?" /></label>
      </fieldset>
      {error && <p className="redbull-form-error" role="alert">{error}</p>}
      <div className="redbull-form-actions"><button className="save-button redbull-create-submit" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add drink and save rating'}</button><span role="status">{status}</span></div>
    </form>
  </section>;
}
