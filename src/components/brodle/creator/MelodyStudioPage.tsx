import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MelodyStudio from '../../testing/sheet-editor/MelodyStudio';
import { COMPOSER_STORAGE_KEY, parseComposerDraft } from './melodyComposer';
import '../Brodle.css';
import './MelodyStudioPage.css';

export default function MelodyStudioPage() {
  const [params] = useSearchParams();
  const [hasPreviousDraft] = useState(() => {
    try {
      const draft = parseComposerDraft(localStorage.getItem(COMPOSER_STORAGE_KEY));
      return Boolean(draft.title || draft.source || draft.hint || draft.melody.length || draft.finalMelody?.length || draft.finalBass?.length);
    } catch { return false; }
  });
  return <div className="brodle-page official-melody-studio">
    <MelodyStudio previousDraft={hasPreviousDraft && !params.has('id') && !params.has('copy')} />
  </div>;
}
