import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(source, imports = {}) {
  let js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  for (const [name, url] of Object.entries(imports)) js = js.replaceAll(`from "${name}"`, `from '${url}'`).replaceAll(`from '${name}'`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const source = path => readFile(new URL('../../src/components/brodle/' + path, import.meta.url), 'utf8');
const tutorialUrl = moduleUrl(await source('lib/tutorial.ts'));
const { tutorialSteps, placeTutorialCard } = await import(tutorialUrl);
const context = { exactOnly: false, maxHints: 3, finished: false, hasAttempts: false };

test('the tour covers visible game controls without offering unavailable hints or history', () => {
  const casual = tutorialSteps(context);
  assert.deepEqual(casual.map(step => step.id), ['song', 'difficulty', 'mode', 'staff', 'keyboard', 'settings', 'hints', 'submit']);
  assert.match(casual.find(step => step.id === 'hints').description, /up to 3 notes/);
  assert.match(casual.find(step => step.id === 'hints').description, /immediately locks/);
  const hard = tutorialSteps({ ...context, exactOnly: true, hasAttempts: true });
  assert.ok(!hard.some(step => step.id === 'hints'));
  assert.equal(hard.at(-1).id, 'attempts');
  assert.match(hard.find(step => step.id === 'mode').description, /exact pitch and octave/);
  assert.match(tutorialSteps({ ...context, maxHints: 0 }).find(step => step.id === 'hints').description, /no note reveals/);
});

test('completed rounds point to results and skip hidden draft, hint, and submit controls', () => {
  const steps = tutorialSteps({ ...context, finished: true, hasAttempts: true });
  assert.deepEqual(steps.map(step => step.id), ['song', 'difficulty', 'mode', 'keyboard', 'settings', 'attempts', 'result']);
  assert.match(steps.find(step => step.id === 'settings').description, /instrument/);
  assert.doesNotMatch(steps.find(step => step.id === 'settings').description, /Free play/);
});

test('help cards fit beside desktop targets and above or below phone targets', () => {
  const desktop = { width: 1024, height: 768 };
  const card = { width: 360, height: 260 };
  assert.deepEqual(placeTutorialCard({ left: 24, top: 100, width: 100, height: 40 }, card, desktop), { left: 140, top: 100 });
  assert.deepEqual(placeTutorialCard({ left: 850, top: 100, width: 100, height: 40 }, card, desktop), { left: 474, top: 100 });
  const phone = { width: 360, height: 640 };
  const phoneCard = { width: 328, height: 260 };
  const upper = placeTutorialCard({ left: 16, top: 30, width: 328, height: 160 }, phoneCard, phone);
  assert.deepEqual(upper, { left: 16, top: 206 });
  const lower = placeTutorialCard({ left: 16, top: 400, width: 328, height: 120 }, phoneCard, phone);
  assert.deepEqual(lower, { left: 16, top: 124 });
  for (const target of [null, { left: -20, top: -80, width: 500, height: 800 }]) {
    const placed = placeTutorialCard(target, phoneCard, phone);
    assert.ok(placed.left >= 16 && placed.left + phoneCard.width <= phone.width - 16);
    assert.ok(placed.top >= 16 && placed.top + phoneCard.height <= phone.height - 16);
  }
});

// Run the real component's navigation, focus, measurement, and cleanup without
// game mutations or a browser dependency. Native modal behavior remains browser QA.
const hostUrl = moduleUrl(`
  let slots = [], cursor = 0, effects = [];
  export let dirty = false;
  export function reset() { slots = []; }
  export function begin() { cursor = 0; effects = []; dirty = false; }
  export function flush() { effects.forEach(effect => effect()); }
  export function useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], next => {
      const value = typeof next === 'function' ? next(slots[index]) : next;
      if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; }
    }];
  }
  export function useRef(current) { const index = cursor++; return slots[index] ??= { current }; }
  export function useId() { return 'tour-' + cursor++; }
  export const useMemo = fn => fn();
  export function useEffect(effect, deps) {
    const index = cursor++, previous = slots[index];
    if (!previous || deps.some((value, position) => !Object.is(value, previous.deps[position]))) {
      effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
    }
  }
  export const useLayoutEffect = useEffect;
  export function Link() {}
  export default function Icon() {}
`);
const host = await import(hostUrl);
const { default: BrodleTutorial } = await import(moduleUrl(await source('components/BrodleTutorial.tsx'), {
  react: hostUrl, './BrodleIcon': hostUrl, '../lib/tutorial': tutorialUrl,
  'react-router-dom': hostUrl,
  'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
}));
const flatten = node => Array.isArray(node) ? node.flatMap(flatten)
  : node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [];

test('the guided tour highlights real targets, supports keyboard navigation, and restores focus and scrolling', t => {
  const scrolledTargets = [];
  const restoredScroll = [];
  const listeners = new Map();
  let stoppedAudio = 0;
  let triggerFocused = 0;
  let headingFocused = 0;
  let disconnected = 0;
  const root = { querySelector: selector => {
    scrolledTargets.push(['selected', selector]);
    return { getBoundingClientRect: () => ({ left: 24, top: 100, width: 100, height: 40, bottom: 140 }),
      scrollIntoView: () => scrolledTargets.push(['scrolled', selector]) };
  } };
  const trigger = { closest: () => root, focus: () => triggerFocused++ };
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const card = { getBoundingClientRect: () => ({ width: 360, height: 260 }) };
  const heading = { focus: () => headingFocused++ };
  const globals = {
    window: { innerHeight: 768, scrollX: 0, scrollY: 120,
      scrollTo: position => restoredScroll.push(position), scrollBy() {},
      addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    document: { documentElement: { clientWidth: 1024 } },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    ResizeObserver: class { observe() {} disconnect() { disconnected++; } },
  };
  const originals = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => { for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  host.reset();
  const render = () => {
    let elements;
    for (let count = 0; count < 5; count++) {
      host.begin();
      elements = flatten(BrodleTutorial({ maxHints: 3, onOpen: () => stoppedAudio++ }));
      for (const element of elements) {
        if (!element.ref) continue;
        element.ref.current = element.type === 'dialog' ? dialog : element.type === 'h2' ? heading
          : element.props.className === 'tutorial-card' ? card : trigger;
      }
      host.flush();
      if (!host.dirty) return elements;
    }
    assert.fail('tour renders settle');
  };
  let elements = render();
  elements.find(element => element.props.className?.includes('tutorial-trigger')).props.onClick();
  elements = render();
  assert.equal(dialog.open, true);
  assert.equal(stoppedAudio, 1);
  assert.ok(scrolledTargets.some(([action, selector]) => action === 'scrolled' && selector === '[data-tour="song"]'));
  assert.equal(elements.find(element => element.props.className === 'tutorial-target-outline').props.x, 17);
  assert.ok(headingFocused > 0);
  const key = key => ({ key, stopPropagation() {}, preventDefault() {} });
  elements.find(element => element.type === 'dialog').props.onKeyDown(key('ArrowRight'));
  elements = render();
  assert.ok(scrolledTargets.some(([action, selector]) => action === 'scrolled' && selector === '[data-tour="difficulty"]'));
  elements.find(element => element.props['aria-label'] === 'Step 7: Two separate ways to get help').props.onClick();
  elements = render();
  assert.ok(scrolledTargets.some(([action, selector]) => action === 'scrolled' && selector === '[data-tour="hints"]'));
  elements.find(element => element.props['aria-label'] === 'Close tutorial').props.onClick();
  render();
  assert.equal(dialog.open, false);
  assert.deepEqual(restoredScroll, [{ left: 0, top: 120, behavior: 'instant' }]);
  assert.equal(triggerFocused, 1);
  assert.equal(listeners.size, 0);
  assert.ok(disconnected >= 3);
  assert.equal(stoppedAudio, 1, 'navigation only tours the page; it never invokes the game controls');
});
