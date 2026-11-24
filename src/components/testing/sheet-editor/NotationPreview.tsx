import { useEffect, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { CLEFS } from './sheetEditorModel';
import type { Clef } from './scoreModel';
import type { MusicalKey } from '../../brodle/lib/musicGame';
import { propertyPreviewAbc } from './sheetEditorPreview';

export default function NotationPreview({ clef, musicalKey = 'C' }: { clef: Clef; musicalKey?: MusicalKey }) {
  const target = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    try {
      abcjs.renderAbc(element, propertyPreviewAbc(clef, musicalKey), {
        responsive: 'resize', staffwidth: 150, paddingleft: 8, paddingright: 8,
        paddingtop: 10, paddingbottom: 10, foregroundColor: 'currentColor',
      });
      const svg = element.querySelector('svg');
      if (!svg) throw new Error('Missing preview');
      svg.setAttribute('aria-hidden', 'true');
      setFailed(false);
    } catch {
      element.replaceChildren();
      setFailed(true);
    }
    return () => element.replaceChildren();
  }, [clef, musicalKey]);
  return <div className="studio-notation-preview">
    <div ref={target} aria-hidden="true" />
    {failed && <span className="studio-preview-fallback">{CLEFS[clef].label} · {musicalKey} · Preview unavailable</span>}
  </div>;
}
