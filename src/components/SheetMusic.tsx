import { useEffect, useRef } from 'react';
import abcjs from 'abcjs';
import type { Feedback } from './musicGame';

type SheetMusicProps = {
  abc: string;
  feedback?: readonly Feedback[];
  label?: string;
};

function SheetMusic({ abc, feedback, label = 'Musical notation' }: SheetMusicProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    element.replaceChildren();
    abcjs.renderAbc(element, abc, {
      responsive: 'resize',
      add_classes: true,
      selectTypes: [],
      staffwidth: 600,
      paddingleft: 15,
      paddingright: 15,
      format: { stretchlast: 1 },
    });

    // The challenge has one rendered note per guessed pitch.
    element.querySelectorAll<SVGElement>('.abcjs-note').forEach((note, index) => {
      const status = feedback?.[index];
      if (status) note.classList.add(`feedback-${status}`);
    });
    return () => element.replaceChildren();
  }, [abc, feedback]);

  return <div className="piano-sheet" role="img" aria-label={label}><div ref={container} /></div>;
}

export default SheetMusic;
