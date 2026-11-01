import { useEffect, useRef } from 'react';
import abcjs from 'abcjs';
import { BPM, KEY, TIME_SIGNATURE, keyName } from '../lib/musicGame';
import type { Feedback, MusicalKey, NoteNaming, TimeSignature } from '../lib/musicGame';

type SheetMusicProps = {
  abc: string;
  feedback?: readonly Feedback[];
  feedbackIndices?: readonly number[];
  label?: string;
  musicalKey?: MusicalKey;
  naming?: NoteNaming;
  bpm?: number;
  wrap?: boolean;
  timeSignature?: TimeSignature;
  selection?: {
    stepIndices: readonly (readonly (number | null)[])[];
    labels: readonly (readonly string[])[];
    selected: { voice: number; index: number } | null;
    onSelect: (voice: number, index: number) => void;
    onDelete: (voice: number, index: number) => void;
  };
};

function SheetMusic({ abc, feedback, feedbackIndices, label = 'Musical notation', musicalKey = KEY, naming = 'letters', bpm = BPM, wrap = false,
  timeSignature = TIME_SIGNATURE, selection }: SheetMusicProps) {
  const container = useRef<HTMLDivElement>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const selectable = Boolean(selection);
  const stepIndices = selection?.stepIndices;
  function highlightSelection() {
    container.current?.querySelectorAll<SVGElement>('[data-score-index]').forEach((note) => {
      const selected = selectionRef.current?.selected;
      const active = selected?.voice === Number(note.dataset.scoreVoice) && selected?.index === Number(note.dataset.scoreIndex);
      note.classList.toggle('composer-selected-step', active);
      note.setAttribute('aria-pressed', String(active));
    });
  }

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
        const status = feedback?.[feedbackIndices?.[index] ?? index];
        if (status) note.classList.add(`feedback-${status}`);
      });
      // Selection only: no dragging, pitch-position guessing, or insertion on blank staff.
      const positions: number[] = [];
      element.querySelectorAll<SVGElement>('g.abcjs-note, g.abcjs-rest').forEach((note) => {
        const voice = Number(note.getAttribute('class')?.match(/\babcjs-v(\d+)\b/)?.[1] ?? 0);
        const fragment = positions[voice] ?? 0;
        positions[voice] = fragment + 1;
        const index = selectionRef.current?.stepIndices[voice]?.[fragment];
        if (index === undefined || index === null) return;
        note.dataset.scoreVoice = String(voice);
        note.dataset.scoreIndex = String(index);
        note.setAttribute('tabindex', '0');
        note.setAttribute('role', 'button');
        note.setAttribute('aria-label', selectionRef.current?.labels[voice]?.[index] ?? `Edit step ${index + 1}`);
        note.addEventListener('click', () => selectionRef.current?.onSelect(voice, index));
        note.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); selectionRef.current?.onSelect(voice, index);
          } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault(); selectionRef.current?.onDelete(voice, index);
          }
        });
      });
      highlightSelection();
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(element);
    return () => { observer.disconnect(); element.replaceChildren(); };
  }, [abc, feedback, feedbackIndices, wrap, selectable, stepIndices]);

  useEffect(highlightSelection, [selection?.selected?.voice, selection?.selected?.index]);

  const keyLabel = keyName(musicalKey, naming);
  return (
    <div className="piano-sheet" role={selection ? 'group' : 'img'} aria-label={`${keyLabel}. ${timeSignature} time. ${bpm} beats per minute. ${label}`}>
      <span className="sheet-key" aria-hidden="true">Key: <strong>{keyLabel}</strong></span>
      <div ref={container} />
    </div>
  );
}

export default SheetMusic;
