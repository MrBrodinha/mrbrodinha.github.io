import { useId } from 'react';
import { CLEFS } from './sheetEditorModel';
import type { Clef } from './scoreModel';
import NotationPreview from './NotationPreview';

export default function ClefChoices({ value, onChange, 'aria-label': label }: {
  value: Clef;
  onChange: (value: Clef) => void;
  'aria-label': string;
}) {
  const name = useId();
  return <fieldset className="studio-clef-choices" aria-label={label}>
    <legend>{label}</legend>
    {(Object.keys(CLEFS) as Clef[]).map(clef => <label key={clef} className="studio-clef-choice" data-selected={value === clef}>
      <input type="radio" name={name} value={clef} checked={value === clef} onChange={() => onChange(clef)} />
      <NotationPreview clef={clef} />
      <span>{CLEFS[clef].label}</span>
    </label>)}
  </fieldset>;
}
