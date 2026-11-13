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
const musicUrl = moduleUrl(await source('lib/musicGame.ts'));
const hooksUrl = moduleUrl(`
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
  export function useEffect(effect) { effects.push(effect); }
`);
const hooks = await import(hooksUrl);
const { default: PianoKeyboard } = await import(moduleUrl(await source('components/PianoKeyboard.tsx'), {
  react: hooksUrl, '../lib/musicGame': musicUrl, 'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
}));
const flatten = node => Array.isArray(node) ? node.flatMap(flatten)
  : node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [];

function mount(t, narrow = true) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    matchMedia: () => ({ matches: narrow, addEventListener() {}, removeEventListener() {} }),
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window; });
  hooks.reset();
  return props => {
    let tree;
    for (let count = 0; count < 5; count++) {
      hooks.begin();
      tree = PianoKeyboard({ naming: 'letters', octaveNavigation: true, fitToWidth: true,
        playing: null, pressedNotes: new Set(), onNote() {}, startNote() {}, releaseNote() {}, playNotes() {}, ...props });
      hooks.flush();
      if (!hooks.dirty) break;
      assert.ok(count < 4, 'keyboard settles after applying octave selection effects');
    }
    const elements = flatten(tree);
    return {
      keys: elements.filter(node => node.props['data-midi'] !== undefined).sort((a, b) => a.props['data-midi'] - b.props['data-midi']),
      previous: elements.find(node => node.props['aria-label']?.startsWith('Previous octave')),
      next: elements.find(node => node.props['aria-label']?.startsWith('Next octave')),
    };
  };
}

test('a phone octave includes both endpoint Cs without a spare closing-C page', t => {
  const render = mount(t);
  const view = render({ minMidi: 72, maxMidi: 84 });
  assert.deepEqual(view.keys.map(key => key.props['data-midi']), Array.from({ length: 13 }, (_, index) => 72 + index));
  assert.ok(view.keys.every(key => !key.props.disabled), 'both boundary Cs are playable');
  assert.equal(view.previous.props.disabled, true);
  assert.equal(view.next.props.disabled, true);
});

test('two phone octaves share the boundary C and keep it on the current page during playback', t => {
  const render = mount(t);
  const props = { minMidi: 72, maxMidi: 96 };
  let view = render(props);
  view.previous.props.onClick();
  view = render(props);
  assert.equal(view.keys[0].props['data-midi'], 72);
  assert.equal(view.keys.at(-1).props['data-midi'], 84);
  assert.equal(view.next.props['aria-label'], 'Next octave: C6 to C7');
  view = render({ ...props, playing: 'current', pressedNotes: new Set([84]) });
  assert.equal(view.keys[0].props['data-midi'], 72, 'playing the closing C does not jump to another page');
  view.next.props.onClick();
  view = render(props);
  assert.equal(view.keys[0].props['data-midi'], 84);
  assert.equal(view.keys.at(-1).props['data-midi'], 96);
  assert.equal(view.next.props.disabled, true);
  assert.equal(view.previous.props['aria-label'], 'Previous octave: C5 to C6');
});

test('wide keyboards show only the requested C-to-C range', t => {
  const render = mount(t, false);
  const view = render({ minMidi: 72, maxMidi: 96 });
  assert.equal(view.previous, undefined);
  assert.equal(view.next, undefined);
  assert.deepEqual(view.keys.map(key => key.props['data-midi']), Array.from({ length: 25 }, (_, index) => 72 + index));
});
