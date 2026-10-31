import { useEffect, useRef } from 'react';
import abcjs from 'abcjs';
import { BPM, KEY, keyName } from './musicGame';
import type { Feedback, MusicalKey, NoteNaming } from './musicGame';

type SheetMusicProps = {
  abc: string;
  feedback?: readonly Feedback[];
  label?: string;
  musicalKey?: MusicalKey;
  naming?: NoteNaming;
  bpm?: number;
  wrap?: boolean;
};

function SheetMusic({ abc, feedback, label = 'Musical notation', musicalKey = KEY, naming = 'letters', bpm = BPM, wrap = false }: SheetMusicProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let renderedWidth = 0;
    const render = () => {
      const width = Math.round(element.getBoundingClientRect().width);
      if (!width || width === renderedWidth) return;
      renderedWidth = width;
      element.replaceChildren();
      abcjs.renderAbc(element, abc, {
        responsive: 'resize',
        add_classes: true,
        selectTypes: [],
        foregroundColor: '#e2e8f0',
        staffwidth: Math.max(220, width - 32),
        minPadding: 20,
        paddingleft: 16,
        paddingright: 16,
        paddingtop: 20,
        paddingbottom: 16,
        ...(wrap ? { wrap: { preferredMeasuresPerLine: 2, minSpacing: 1.8, maxSpacing: 2.7 } } : {}),
        format: { stretchlast: 1, annotationfont: 'Helvetica 11', tempofont: 'Helvetica 11' },
      });

      element.querySelectorAll<SVGElement>('.abcjs-note').forEach((note, index) => {
        const status = feedback?.[index];
        if (status) note.classList.add(`feedback-${status}`);
      });
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(element);
    return () => { observer.disconnect(); element.replaceChildren(); };
  }, [abc, feedback, wrap]);

  const keyLabel = keyName(musicalKey, naming);
  return (
    <div className="piano-sheet" role="img" aria-label={`${keyLabel}. ${bpm} beats per minute. ${label}`}>
      <span className="sheet-key" aria-hidden="true">Key: <strong>{keyLabel}</strong></span>
      <div ref={container} />
    </div>
  );
}

export default SheetMusic;
