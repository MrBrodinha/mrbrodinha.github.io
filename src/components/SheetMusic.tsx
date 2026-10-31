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
        format: { stretchlast: 1, annotationfont: 'Helvetica 11' },
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
  }, [abc, feedback]);

  return <div className="piano-sheet" role="img" aria-label={label}><div ref={container} /></div>;
}

export default SheetMusic;
