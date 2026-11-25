import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import BrodleIcon from './BrodleIcon';
import { placeTutorialCard } from '../lib/tutorial';
import type { TourRect, TutorialStep } from '../lib/tutorial';

type Props = {
  steps: readonly TutorialStep[];
  label: string;
  finishLabel: string;
  onOpen: () => void;
  scope?: string;
  autoOpen?: boolean;
  onAutoOpen?: () => void;
};

export default function GuidedTour({ steps, label, finishLabel, onOpen, scope = '.brodle-page', autoOpen = false, onAutoOpen }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const originalScroll = useRef({ left: 0, top: 0 });
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [highlight, setHighlight] = useState<TourRect | null>(null);
  const [position, setPosition] = useState({ left: 16, top: 16 });
  const maskId = useId();
  const headingId = useId();
  const descriptionId = useId();
  const disclosures = useRef(new Map<HTMLDetailsElement, boolean>());
  const scrollOffsets = useRef(new Map<HTMLElement, { left: number; top: number }>());
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!autoOpen) { autoOpened.current = false; return; }
    if (autoOpened.current) return;
    autoOpened.current = true;
    trigger.current?.click();
    onAutoOpen?.();
  }, [autoOpen, onAutoOpen]);
  const current = Math.min(step, steps.length - 1);
  const active = steps[current];

  useEffect(() => {
    if (!open) return;
    const scroll = originalScroll.current;
    const button = trigger.current, opened = disclosures.current, offsets = scrollOffsets.current;
    return () => {
      opened.forEach((wasOpen, node) => { if (node.isConnected) node.open = wasOpen; });
      offsets.forEach((offset, node) => { if (node.isConnected) { node.scrollLeft = offset.left; node.scrollTop = offset.top; } });
      opened.clear(); offsets.clear();
      window.scrollTo({ ...scroll, behavior: 'instant' });
      button?.focus({ preventScroll: true });
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const root = trigger.current?.closest(scope);
    const disclosure = active.reveal ? root?.querySelector<HTMLDetailsElement>(active.reveal) : null;
    if (disclosure) {
      if (!disclosures.current.has(disclosure)) disclosures.current.set(disclosure, disclosure.open);
      disclosure.open = true;
    }
    let frame = 0, scrolled: HTMLElement | null = null;
    const measure = () => {
      const target = root?.querySelector<HTMLElement>(active.selector ?? `[data-tour="${active.id}"]`) ?? null;
      const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
      const panel = card.current?.getBoundingClientRect();
      if (!panel) return;
      if (target && target !== scrolled) {
        for (let parent = target.parentElement; parent && parent !== root?.parentElement; parent = parent.parentElement) {
          if (!scrollOffsets.current.has(parent)) scrollOffsets.current.set(parent, { left: parent.scrollLeft, top: parent.scrollTop });
        }
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        scrolled = target;
        const bounds = target.getBoundingClientRect();
        if (bounds.height + panel.height + 48 <= window.innerHeight && bounds.top < panel.height + 32
          && window.innerHeight - bounds.bottom < panel.height + 32) {
          window.scrollBy({ top: bounds.top - 16, behavior: 'instant' });
          // Near the page bottom, scrolling down may be clamped. Make room above instead.
          const settled = target.getBoundingClientRect();
          if (settled.top < panel.height + 32 && window.innerHeight - settled.bottom < panel.height + 32)
            window.scrollBy({ top: settled.top - panel.height - 48, behavior: 'instant' });
        }
      }
      const bounds = target?.getBoundingClientRect();
      const rect = bounds ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height } : null;
      setHighlight(rect);
      setPosition(placeTutorialCard(rect, panel, viewport));
    };
    const scheduleMeasure = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    if (root) observer?.observe(root);
    if (card.current) observer?.observe(card.current);
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(scheduleMeasure);
    if (root) mutations?.observe(root, { childList: true, subtree: true });
    measure();
    heading.current?.focus({ preventScroll: true });
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect(); mutations?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
    };
  }, [open, active.id, active.selector, active.reveal, scope]);

  function openTutorial() {
    if (dialog.current?.open) return;
    onOpen();
    disclosures.current.clear(); scrollOffsets.current.clear();
    originalScroll.current = { left: window.scrollX, top: window.scrollY };
    setStep(0);
    dialog.current?.showModal();
    setOpen(true);
  }

  function closeTutorial() {
    dialog.current?.close();
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    event.stopPropagation();
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setStep(Math.max(0, Math.min(steps.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1))));
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return <>
    <button ref={trigger} type="button" className="brodle-button tutorial-trigger" aria-haspopup="dialog"
      aria-label={`${label}: guided tour`} title={label} onClick={openTutorial}>
      <BrodleIcon name="help" />{label}
    </button>
    <dialog ref={dialog} className="brodle-tutorial" aria-labelledby={headingId} aria-describedby={descriptionId}
      onKeyDown={handleKeyDown} onClose={() => setOpen(false)}>
      {open && <>
        <svg className="tutorial-spotlight" aria-hidden="true">
          <defs><mask id={maskId} maskUnits="userSpaceOnUse">
            <rect width="100%" height="100%" fill="white" />
            {highlight && <rect x={highlight.left - 7} y={highlight.top - 7} width={highlight.width + 14} height={highlight.height + 14} rx="12" fill="black" />}
          </mask></defs>
          <rect width="100%" height="100%" fill="#070a14" fillOpacity=".8" mask={`url(#${maskId})`} />
          {highlight && <rect className="tutorial-target-outline" x={highlight.left - 7} y={highlight.top - 7} width={highlight.width + 14} height={highlight.height + 14} rx="12" />}
        </svg>
        {highlight && <span className="tutorial-target-number" aria-hidden="true"
          style={{ left: Math.max(8, highlight.left - 12), top: Math.max(8, highlight.top - 12) }}>{current + 1}</span>}
        <div ref={card} className="tutorial-card" style={position}>
          <div className="tutorial-header">
            <span>{label} · Guided tour</span>
            <button type="button" className="brodle-button ghost-button" aria-label="Close tutorial" onClick={closeTutorial}>
              <BrodleIcon name="close" />
            </button>
          </div>
          <nav className="tutorial-progress" aria-label="Tour steps">
            {steps.map((item, index) => <button key={item.id} type="button" aria-label={`Step ${index + 1}: ${item.title}`}
              aria-current={index === current ? 'step' : undefined} onClick={() => setStep(index)}>{index + 1}</button>)}
          </nav>
          <section className="tutorial-step">
            <span className="tutorial-eyebrow">Step {current + 1} of {steps.length}</span>
            <h2 id={headingId} ref={heading} tabIndex={-1}>{active.title}</h2>
            <p id={descriptionId}>{active.description}</p>
          </section>
          <div className="tutorial-actions">
            <button type="button" className="brodle-button" disabled={current === 0} onClick={() => setStep(current - 1)}>Back</button>
            {current < steps.length - 1
              ? <button type="button" className="brodle-button tutorial-next" onClick={() => setStep(current + 1)}>Next<span aria-hidden="true">→</span></button>
              : <button type="button" className="brodle-button tutorial-next" onClick={closeTutorial}>{finishLabel}</button>}
          </div>
        </div>
      </>}
    </dialog>
  </>;
}
