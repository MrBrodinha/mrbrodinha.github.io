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
const studioUrl = moduleUrl(await source('lib/studioTutorial.ts'));
const {studioTutorialSteps} = await import(studioUrl);
const context = { maxHints: 3, finished: false, hasAttempts: false };

test('difficulty tour preserves all five pitch estimates independently of the rules', () => {
  const description = tutorialSteps(context).find(step => step.id === 'difficulty').description;
  assert.match(description, /Very Easy, Easy, Medium, Hard, and Very Hard/);
  assert.match(description, /Note count and pitch variety matter most/);
  assert.match(description, /Rhythm and rests are already filled in/);
  assert.match(description, /Difficulty does not change the rules or available hints/);
});

test('the tour explains exact wins and optional assistance without mode controls', () => {
  const steps = tutorialSteps(context);
  assert.deepEqual(steps.map(step => step.id), ['song', 'difficulty', 'staff', 'keyboard', 'settings', 'hints', 'submit']);
  assert.match(steps.find(step => step.id === 'staff').description, /original pitch and octave to win/);
  assert.match(steps.find(step => step.id === 'hints').description, /up to 3 notes/);
  assert.match(steps.find(step => step.id === 'hints').description, /recorded in your shared result/);
  assert.doesNotMatch(JSON.stringify(steps), /Casual|Hard:|Mode locked|game mode/);
  assert.equal(tutorialSteps({ ...context, hasAttempts: true }).at(-1).id, 'attempts');
  assert.match(tutorialSteps({ ...context, maxHints: 0 }).find(step => step.id === 'hints').description, /no note reveals/);
});

test('completed rounds point to results and skip hidden draft, hint, and submit controls', () => {
  const steps = tutorialSteps({ ...context, finished: true, hasAttempts: true });
  assert.deepEqual(steps.map(step => step.id), ['song', 'difficulty', 'keyboard', 'settings', 'attempts', 'result']);
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
  export function reset() { slots.forEach(slot=>slot?.cleanup?.()); slots = []; effects = []; }
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
const { default: GuidedTour } = await import(moduleUrl(await source('components/GuidedTour.tsx'), {
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
  const disclosure={open:false,isConnected:true};
  const localScroll={scrollLeft:17,scrollTop:9,isConnected:true,parentElement:null};
  const root = { querySelector: selector => {
    if(selector==='.panel')return disclosure;
    scrolledTargets.push(['selected', selector]);
    return { parentElement:localScroll, getBoundingClientRect: () => ({ left: 24, top: 100, width: 100, height: 40, bottom: 140 }),
      scrollIntoView: () => {localScroll.scrollLeft=100;scrolledTargets.push(['scrolled', selector]);} };
  } };
  const trigger = { closest: () => root, focus: () => triggerFocused++, click:()=>elements.find(element=>element.props.className?.includes('tutorial-trigger')).props.onClick() };
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
  let tourSteps=tutorialSteps(context),autoOpen=false,consumed=0;
  const render = () => {
    let elements;
    for (let count = 0; count < 5; count++) {
      host.begin();
      elements = flatten(GuidedTour({ steps: tourSteps, label: 'How to play', finishLabel: 'Back to game', onOpen: () => stoppedAudio++, autoOpen,onAutoOpen:()=>consumed++ }));
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
  const first={focus(){document.activeElement=first;}},last={focus(){document.activeElement=last;}};
  document.activeElement=first;
  elements.find(element=>element.type==='dialog').props.onKeyDown({...key('Tab'),shiftKey:true,currentTarget:{querySelectorAll:()=>[first,last]}});
  assert.equal(document.activeElement,last);
  elements.find(element=>element.type==='dialog').props.onKeyDown({...key('Tab'),shiftKey:false,currentTarget:{querySelectorAll:()=>[first,last]}});
  assert.equal(document.activeElement,first);
  elements.find(element => element.type === 'dialog').props.onKeyDown(key('ArrowRight'));
  elements = render();
  assert.ok(scrolledTargets.some(([action, selector]) => action === 'scrolled' && selector === '[data-tour="difficulty"]'));
  elements.find(element => element.props['aria-label'] === 'Step 6: Two separate ways to get help').props.onClick();
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
  assert.equal(localScroll.scrollLeft,17);
  tourSteps=[{id:'panel',title:'Optional panel',description:'A panel',selector:'.keys',reveal:'.panel'}];
  elements=render();elements.find(element=>element.props.className?.includes('tutorial-trigger')).props.onClick();elements=render();
  assert.equal(disclosure.open,true);assert.equal(localScroll.scrollLeft,100);
  assert.ok(!elements.some(element=>element.props.className==='tutorial-practice-link'));
  elements.find(element=>element.props['aria-label']==='Close tutorial').props.onClick();render();
  assert.equal(disclosure.open,false);assert.equal(localScroll.scrollLeft,17);
  assert.equal(stoppedAudio,2);
  autoOpen=true;elements=render();assert.equal(dialog.open,true);assert.equal(consumed,1);
  elements.find(element=>element.props['aria-label']==='Close tutorial').props.onClick();render();
  autoOpen=false;render();autoOpen=true;elements=render();assert.equal(dialog.open,true);assert.equal(consumed,2,'a later menu request must reopen the same mounted guide');
  elements.find(element=>element.props['aria-label']==='Close tutorial').props.onClick();render();
  elements=render();elements.find(element=>element.props.className?.includes('tutorial-trigger')).props.onClick();render();
  assert.equal(disclosure.open,true);host.reset();assert.equal(disclosure.open,false);assert.equal(localScroll.scrollLeft,17);assert.equal(listeners.size,0);


});


test('composer tour covers real controls and guest, account, Victory and locked contexts',()=>{
 const guest=studioTutorialSteps({signedIn:false,gameMelody:true,readOnly:false});
 assert.deepEqual(guest.map(step=>step.id),['details','tracks','mode','rhythm','accidentals','score','expression','playback','view','piano','code','save']);
 assert.ok(guest.every(step=>step.selector&&step.description));
 assert.equal(guest.find(step=>step.id==='piano').reveal,'.studio-piano');
 assert.equal(guest.find(step=>step.id==='code').reveal,'#melody-code-panel');
 assert.match(guest.at(-1).description,/Guest and account drafts are separate/);
 assert.match(guest.find(step=>step.id==='expression').description,/select a rest/);
 const account=studioTutorialSteps({signedIn:true,gameMelody:false,readOnly:false});
 assert.match(account.at(-1).description,/every five seconds/);
 assert.match(account.find(step=>step.id==='score').description,/Click a clef/);
 const locked=studioTutorialSteps({signedIn:true,gameMelody:true,readOnly:true});
 assert.match(locked.find(step=>step.id==='mode').description,/read only/);
 assert.match(locked.find(step=>step.id==='playback').description,/unavailable on this locked version/);
 assert.match(locked.find(step=>step.id==='piano').description,/never edit the score/);
 assert.equal(locked.at(-1).title,'Review status');
 assert.doesNotMatch(locked.at(-1).description,/Save now|copy|automatically/);
});

const routeHostUrl=moduleUrl(`export let params=new URLSearchParams('date=2026-11-25&tour=1');export const useMemo=fn=>fn();export const useSearchParams=()=>[params,next=>{params=next;}];export default function Child(){}`);
const routeHost=await import(routeHostUrl);
const {default:BrodleTutorial}=await import(moduleUrl(await source('components/BrodleTutorial.tsx'),{react:routeHostUrl,'react-router-dom':routeHostUrl,'./GuidedTour':routeHostUrl,'../lib/tutorial':tutorialUrl,'react/jsx-runtime':import.meta.resolve('react/jsx-runtime')}));
test('game tour consumes auto-open links without losing the selected puzzle date',()=>{
 const props={maxHints:3,onOpen(){},finished:false,hasAttempts:false};
 const tour=BrodleTutorial(props);assert.equal(tour.props.autoOpen,true);tour.props.onAutoOpen();
 assert.equal(routeHost.params.get('date'),'2026-11-25');assert.equal(routeHost.params.has('tour'),false);
 assert.equal(BrodleTutorial(props).props.autoOpen,false);
});
