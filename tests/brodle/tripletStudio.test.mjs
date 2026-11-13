import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = path => readFile(new URL('../../src/components/brodle/' + path, import.meta.url), 'utf8');
function moduleUrl(source, imports = {}) {
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const [name, url] of Object.entries(imports)) js = js.replaceAll(`from '${name}'`, `from '${url}'`).replaceAll(`from "${name}"`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const musicUrl = moduleUrl(await source('lib/musicGame.ts'));
const victoryUrl = moduleUrl(await source('lib/victoryMusic.ts'), { './musicGame': musicUrl });
const composerUrl = moduleUrl(await source('creator/melodyComposer.ts'), { '../lib/musicGame': musicUrl, '../lib/victoryMusic': victoryUrl });
const codeUrl = moduleUrl(await source('creator/melodyCode.ts'), { '../lib/musicGame': musicUrl, '../lib/victoryMusic': victoryUrl });
const { makeStep, emptyComposerDraft, COMPOSER_STORAGE_KEY } = await import(composerUrl);
// Run the studio's real handlers across renders; child notation/audio have their
// own integration checks. This keeps entry, selection and autosave tests DOM-free.
const hostUrl = moduleUrl(`
  let slots = [], cursor = 0, effects = [];
  export let dirty = false;
  export let draft;
  export const audio = { playing: null, stopAudio() { this.playing = null; }, playMelody(notes, id) { this.playing = id; this.notes = notes; }, setAudioError() {} };
  const cloud = { locked: false, loading: false, busy: false, draftVersion: 0 };
  export function reset() { slots = []; effects = []; dirty = false; audio.playing = null; }
  export function begin() { cursor = 0; dirty = false; effects = []; }
  export function flush() { effects.forEach(effect => effect()); }
  export function useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], next => {
      const value = typeof next === 'function' ? next(slots[index]) : next;
      if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; }
    }];
  }
  export function useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; }
  export const useMemo = fn => fn();
  export function useEffect(effect, deps) {
    const index = cursor++, previous = slots[index];
    if (!previous || !deps || deps.some((value, position) => !Object.is(value, previous[position]))) effects.push(effect);
    slots[index] = deps;
  }
  export const useAuth = () => ({});
  export const useSearchParams = () => [new URLSearchParams()];
  export const usePianoAudio = () => audio;
  export const useStudioCloud = value => { draft = value; return cloud; };
  export const MAX_MELODY_STEPS = 256;
  export const MAX_FINAL_STEPS = 512;
  export default function Child() {}
`);
const host = await import(hostUrl);
const imports = Object.fromEntries([
  'react', '../../../auth/authContext', 'react-router-dom', '../components/BrodleIcon', '../components/MelodyDifficulty', '../components/PianoKeyboard',
  '../components/PianoControls', '../components/SheetMusic', '../components/RhythmSymbol', '../hooks/usePianoAudio',
  './StudioCloudPanel', './useStudioCloud', '../lib/melodyLibrary',
].map(name => [name, hostUrl]));
Object.assign(imports, { 'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'), '../lib/musicGame': musicUrl, '../lib/victoryMusic': victoryUrl, './melodyComposer': composerUrl, './melodyCode': codeUrl });
const studioSource = (await source('creator/MelodyCreator.tsx')).replace(/^import ['"].*\.css['"];$/gm, '') + '\nexport { MelodyCreator };';
const { MelodyCreator } = await import(moduleUrl(studioSource, imports));
const flatten = node => Array.isArray(node) ? node.flatMap(flatten) : node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [];
const label = node => Array.isArray(node) ? node.map(label).join('') : node && typeof node === 'object' ? label(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
function mount(t, initial = emptyComposerDraft()) {
  host.reset();
  const values = new Map([[COMPOSER_STORAGE_KEY, JSON.stringify(initial)]]);
  const globals = { document: { title: 'Studio' }, localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  const originals = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => { for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  let tree;
  function render() {
    for (let attempt = 0; attempt < 15; attempt++) {
      host.begin(); tree = MelodyCreator({ fresh: false }); host.flush();
      if (!host.dirty) return;
    }
    throw new Error('Studio did not settle');
  }
  const all = () => flatten(tree);
  function click(text) {
    const button = all().find(node => node.type === 'button' && (node.props['aria-label'] ?? label(node)) === text);
    assert.ok(button, 'Missing button: ' + text);
    assert.ok(!button.props.disabled, 'Disabled button: ' + text);
    button.props.onClick(); render();
  }
  const piano = () => all().find(node => typeof node.props?.onNote === 'function');
  const score = () => all().find(node => node.props?.selection && node.props?.abc);
  render();
  return { click, all, render, values, text: () => label(tree),
    note(midi) { piano().props.onNote(midi); render(); },
    select(voice, index) { score().props.selection.onSelect(voice, index); render(); },
    rest() { all().find(node => node.props?.id === 'composer-rest-mode').props.onChange({ target: { checked: true } }); render(); },
    duration(id) { const button = all().find(node => node.props?.['data-duration'] === id); assert.ok(!button.props.disabled); button.props.onClick(); render(); },
  };
}

test('studio enters three triplet notes/rests, reports progress and returns to normal entry', t => {
  const ui = mount(t);
  ui.click('③Triplet'); ui.duration('eighth');
  assert.match(ui.text(), /Triplet: 0\/3/);
  ui.note(60);
  assert.match(ui.text(), /Triplet: 1\/3/);
  assert.equal(ui.all().find(node => node.props?.cloud)?.props.valid, false);
  ui.rest(); ui.duration('eighth');
  assert.match(ui.text(), /Triplet: 2\/3/);
  ui.note(67); ui.note(69);
  assert.deepEqual(host.draft.melody.map(({ midi, beats, triplet }) => [midi, beats, triplet]), [[60,.5,1],[null,.5,2],[67,.5,3],[69,.5,undefined]]);
  assert.equal(ui.all().find(node => node.props?.cloud)?.props.valid, true);
  assert.deepEqual(JSON.parse(ui.values.get(COMPOSER_STORAGE_KEY)).melody, host.draft.melody);
  ui.select(0, 1); ui.duration('quarter');
  assert.deepEqual(host.draft.melody.slice(0,3).map(step => step.beats), [1,1,1]);
  ui.click('Delete → rest');
  assert.equal(host.draft.melody[1].triplet, 2);
});

test('triplet chord pitches share one entry and confirmation advances the group', t => {
  const ui = mount(t);
  ui.click('Victory melody · optional'); ui.click('③Triplet');
  ui.duration('eighth');
  for (let position = 1; position <= 3; position++) {
    ui.click('Chords'); ui.note(60); ui.note(64); ui.note(67);
    assert.equal(host.draft.finalMelody.length, position);
    assert.deepEqual(host.draft.finalMelody[position - 1].pitches, [60,64,67]);
    assert.equal(host.draft.finalMelody[position - 1].triplet, position);
    ui.click('Hear chord');
    assert.equal(host.audio.notes[0].beats, 1);
    assert.equal(host.audio.notes[0].triplet, undefined);
    assert.deepEqual(host.audio.notes[0].pitches, [60,64,67]);
    assert.equal(host.draft.finalMelody[position - 1].beats, .5);
    assert.equal(host.draft.finalMelody[position - 1].triplet, position);
    ui.click('Done with chord');
  }
  ui.note(72);
  assert.equal(host.draft.finalMelody[3].triplet, undefined);
  ui.select(0, 1); ui.duration('eighth');
  assert.deepEqual(host.draft.finalMelody.slice(0,3).map(step => step.beats), [.5,.5,.5]);
  ui.note(65);
  assert.equal(host.draft.finalMelody[1].triplet, 2);
  assert.deepEqual(host.draft.finalMelody[1].pitches, [60,64,65,67]);
});

test('unfinished triplets resume after reload and can be completed with rests or undo', t => {
  const ui = mount(t, { ...emptyComposerDraft(), melody: [makeStep(60, 'eighth', false, 1)] });
  assert.match(ui.text(), /Triplet: 1\/3/);
  ui.note(64);
  assert.equal(host.draft.melody[1].triplet, 2);
  ui.click('Undo last note');
  assert.match(ui.text(), /Triplet: 1\/3/);
  ui.click('Finish with rests');
  assert.deepEqual(host.draft.melody.map(step => [step.midi,step.triplet]), [[60,1],[null,2],[null,3]]);
  ui.note(67);
  assert.equal(host.draft.melody[3].triplet, undefined);
});

test('triplet mode clears dotted duration, limits the picker and safely finishes a group when toggled off', t => {
  const ui = mount(t);
  ui.click('•Dotted'); ui.click('③Triplet');
  const dotted = ui.all().find(node => node.type === 'button' && label(node) === '•Dotted');
  assert.equal(dotted.props['aria-pressed'], false);
  assert.equal(dotted.props.disabled, true);
  assert.equal(ui.all().find(node => node.props?.['data-duration'] === 'half').props.disabled, true);
  ui.note(60); ui.click('③Triplet');
  assert.deepEqual(host.draft.melody.map(step => [step.beats,step.triplet,step.midi]), [[1,1,60],[1,2,null],[1,3,null]]);
  assert.equal(ui.all().find(node => node.props?.cloud)?.props.valid, true);
});

test('editing an earlier note cannot shift an existing triplet onto unsupported notation', t => {
  const ui = mount(t, { ...emptyComposerDraft(), melody: [makeStep(null, 'quarter', false), ...[60,64,67].map((midi, index) => makeStep(midi, 'eighth', false, index + 1))] });
  ui.select(0,0); ui.duration('thirty-second'); ui.click('•Dotted');
  assert.equal(host.draft.melody[0].beats, .125);
  assert.equal(ui.all().find(node => node.type === 'button' && label(node) === '•Dotted').props['aria-pressed'], false);
  assert.match(ui.text(), /Complete the dotted 32nd subdivision.*Your score has not changed/);
  assert.equal(ui.all().find(node => node.props?.cloud)?.props.valid, true);
});
