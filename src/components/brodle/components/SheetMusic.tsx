import { useEffect, useRef } from 'react';
import abcjs from 'abcjs';
import { BPM, KEY, TIME_SIGNATURE, keyName } from '../lib/musicGame';
import type { Feedback, MusicalKey, NoteNaming, TimeSignature } from '../lib/musicGame';
import { feedbackMarkers } from '../lib/feedback';

type SheetMusicProps = {
  abc: string;
  feedback?: readonly (Feedback | undefined)[];
  feedbackIndices?: readonly number[];
  invalidNotes?: readonly number[];
  minWidth?: number;
  compact?: boolean;
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
    onDelete?: (voice: number, index: number) => void;
  };
};

function SheetMusic({ abc, feedback, feedbackIndices, invalidNotes, minWidth, compact = false, label = 'Musical notation', musicalKey = KEY, naming = 'letters', bpm = BPM, wrap = false,
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
      element.style.height = '';
      abcjs.renderAbc(element, compact ? abc.replace(/^Q:/m, '%%printtempo 0\nQ:') : abc, {
        responsive: 'resize',
        add_classes: true,
        selectTypes: [],
        foregroundColor: '#e2e8f0',
        staffwidth: Math.max(220, width - 32),
        minPadding: 20,
        paddingleft: 16,
        paddingright: 16,
        paddingtop: compact ? 10 : 20,
        paddingbottom: compact ? 10 : 16,
        ...(wrap ? { wrap: { preferredMeasuresPerLine: 2, minSpacing: 1.8, maxSpacing: 2.7 } } : {}),
        format: { stretchlast: 1, annotationfont: 'Helvetica 11', tempofont: 'Helvetica 11' },
      });
      // ABC's percentage padding uses the outer width, which clips a wider,
      // horizontally scrollable score. Size that wrapper from its own viewBox.
      const svg = element.querySelector('svg');
      if (minWidth && svg?.viewBox.baseVal.width) {
        element.style.paddingBottom = '0';
        element.style.height = `${svg.viewBox.baseVal.height * width / svg.viewBox.baseVal.width}px`;
      }
      const marked = new Set<number>();
      element.querySelectorAll<SVGGraphicsElement>('g.abcjs-note').forEach((note, index) => {
        const position = feedbackIndices?.[index] ?? index;
        const status = feedback?.[position];
        if (status) note.classList.add(`feedback-${status}`);
        const invalid = invalidNotes?.includes(position);
        if (invalid) {
          note.classList.add('guess-outside-range');
          note.dataset.invalid = 'true';
        }
        if ((!status && !invalid) || marked.has(position)) return;
        marked.add(position);
        const bounds = note.getBBox();
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        marker.setAttribute('x', String(bounds.x + bounds.width / 2));
        marker.setAttribute('y', String(Math.max(12, bounds.y - 7)));
        marker.setAttribute('text-anchor', 'middle');
        marker.setAttribute('class', `sheet-feedback-marker${invalid ? ' is-invalid' : ''}`);
        marker.setAttribute('aria-hidden', 'true');
        marker.textContent = invalid ? '!' : feedbackMarkers[status!];
        note.append(marker);
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
            event.preventDefault(); event.stopPropagation(); selectionRef.current?.onSelect(voice, index);
          } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectionRef.current?.onDelete) {
            event.preventDefault(); event.stopPropagation(); selectionRef.current.onDelete(voice, index);
          }
        });
      });
      highlightSelection();
    };
    render();
    // Let the existing SVG scale during layout transitions, then reflow the
    // notation once resizing settles instead of rebuilding it every frame.
    let resizeTimer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 80);
    });
    observer.observe(element);
    return () => { observer.disconnect(); clearTimeout(resizeTimer); element.replaceChildren(); };
  }, [abc, feedback, feedbackIndices, invalidNotes, minWidth, compact, wrap, selectable, stepIndices]);

  useEffect(highlightSelection, [selection?.selected?.voice, selection?.selected?.index]);

  const keyLabel = keyName(musicalKey, naming);
  return (
    <div className={'piano-sheet' + (minWidth ? ' scrollable-sheet' : '') + (compact ? ' compact-sheet' : '')} role={selection ? 'group' : 'img'} aria-label={`${keyLabel}. ${timeSignature} time. ${bpm} beats per minute. ${label}`}>
      <span className="sheet-key" aria-hidden="true">Key: <strong>{keyLabel}</strong>{compact && ` · ${bpm} BPM`}</span>
      <div ref={container} style={minWidth ? { minWidth } : undefined} />
    </div>
  );
}

export default SheetMusic;
