import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import BrodleIcon from './BrodleIcon';
import { placeTutorialCard, tutorialSteps } from '../lib/tutorial';
import type { TourRect } from '../lib/tutorial';

export default function BrodleTutorial({ maxHints, onOpen, exactOnly = false, finished = false, hasAttempts = false }: {
  maxHints: number; onOpen: () => void; exactOnly?: boolean; finished?: boolean; hasAttempts?: boolean;
}) {
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
  const steps = useMemo(() => tutorialSteps({ maxHints, exactOnly, finished, hasAttempts }), [maxHints, exactOnly, finished, hasAttempts]);
  const current = Math.min(step, steps.length - 1);
  const active = steps[current];

  useEffect(() => {
    if (!open) return;
    const scroll = originalScroll.current;
    return () => {
      window.scrollTo({ ...scroll, behavior: 'instant' });
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const root = trigger.current?.closest('.brodle-page');
    const target = root?.querySelector<HTMLElement>(`[data-tour="${active.id}"]`);
    let frame = 0;
    const measure = () => {
      const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
      const panel = card.current?.getBoundingClientRect();
      if (!panel) return;
      const bounds = target?.getBoundingClientRect();
      const rect = bounds ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height } : null;
      setHighlight(rect);
      setPosition(placeTutorialCard(rect, panel, viewport));
    };
    target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    // Leave enough room for the card when a centered target fills most of a phone.
    const bounds = target?.getBoundingClientRect();
    const panel = card.current?.getBoundingClientRect();
    if (bounds && panel && bounds.height + panel.height + 48 <= window.innerHeight
      && bounds.top < panel.height + 32 && window.innerHeight - bounds.bottom < panel.height + 32) {
      window.scrollBy({ top: bounds.top - 16, behavior: 'instant' });
    }
    measure();
    heading.current?.focus({ preventScroll: true });
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    if (target) observer?.observe(target);
    if (card.current) observer?.observe(card.current);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
    };
  }, [open, active.id]);

  function openTutorial() {
    onOpen();
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
      aria-label="How to play: guided tour" title="Show me around Brodle" onClick={openTutorial}>
      <BrodleIcon name="help" />How to play
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
            <span>How to play · Guided tour</span>
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
              : <button type="button" className="brodle-button tutorial-next" onClick={closeTutorial}>Back to game</button>}
          </div>
          <Link to="/brodle/tutorial" className="tutorial-practice-link" onClick={closeTutorial}>Try a hands-on example<span aria-hidden="true">→</span></Link>
        </div>
      </>}
    </dialog>
  </>;
}
