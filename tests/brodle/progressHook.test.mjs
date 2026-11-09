import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText).toString('base64')}`;
async function sourceUrl(path, imports = {}) {
  let source = await readFile(new URL('../../src/components/brodle/' + path, import.meta.url), 'utf8');
  for (const [name, url] of Object.entries(imports)) source = source.replaceAll(`from '${name}'`, `from '${url}'`);
  return moduleUrl(source);
}
const musicUrl = await sourceUrl('lib/musicGame.ts');
const progressUrl = await sourceUrl('lib/gameProgress.ts', { './musicGame': musicUrl });
const syncUrl = await sourceUrl('lib/progressSync.ts', { './gameProgress': progressUrl });
const { emptyProgress, parseProgress, isFinished } = await import(progressUrl);
const hooksUrl = moduleUrl(`
  export const effects = [];
  export const states = [];
  export const useRef = current => ({ current });
  export const useCallback = callback => callback;
  export const useEffect = effect => { effects.push(effect); };
  export const useState = initial => {
    const state = { value: typeof initial === 'function' ? initial() : initial };
    states.push(state);
    return [state.value, next => { state.value = typeof next === 'function' ? next(state.value) : next; }];
  };
`);
const hooks = await import(hooksUrl);
const authUrl = moduleUrl(`export const useAuth = () => ({ user: { id: 'alice' } });`);
const transportUrl = moduleUrl(`
  export const transport = { load: undefined, save: async progress => progress };
  export function progressTransport(userId, challengeId, target, mode) {
    return { load: signal => transport.load(mode, signal), save: (progress, signal) => transport.save(progress, signal) };
  }
`);
const { transport } = await import(transportUrl);
const { useBrodleProgress } = await import(await sourceUrl('hooks/useBrodleProgress.ts', {
  react: hooksUrl, '../../../auth/authContext': authUrl, '../lib/gameProgress': progressUrl,
  '../lib/progressSync': syncUrl, '../services/progressService': transportUrl, '../lib/musicGame': musicUrl,
}));
const target = [60,64,67];

function mountProgress(t, mode, load) {
  const storage = new Map();
  const window = Object.assign(new EventTarget(), {
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setInterval, clearInterval,
  });
  const globals = { window, document: Object.assign(new EventTarget(), { hidden: false }) };
  const originals = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
  hooks.effects.length = 0;
  hooks.states.length = 0;
  transport.load = load;
  const restored = [];
  useBrodleProgress('day-a', target, mode, (nextMode) => restored.push(nextMode));
  const cleanups = hooks.effects.map((effect) => effect());
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    cleanups.splice(0).reverse().forEach((cleanup) => cleanup?.());
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
  t.after(unmount);
  return { state: hooks.states[0], restored, unmount };
}

test('account restore selects the already-started mode before exposing another mode', async (t) => {
  for (const mode of ['guided', 'classic']) {
    const other = mode === 'guided' ? 'classic' : 'guided';
    const started = parseProgress(JSON.stringify({ attempts: [[59,64,66]] }), target, other);
    const { state, restored, unmount } = mountProgress(t, mode, async (choice) => choice === other ? started : emptyProgress());
    assert.equal(state.value.loading, true);
    await setImmediate();
    assert.deepEqual(restored, [other]);
    assert.equal(state.value.loading, true, 'keep the empty round hidden while the selected mode changes');
    unmount();
  }
});

test('Hard account progress never restores an octave guess as a win', async (t) => {
  const hard = parseProgress(JSON.stringify({ attempts: [[72,76,79]] }), target, 'classic');
  const { state, restored } = mountProgress(t, 'classic', async (mode) => mode === 'classic' ? hard : emptyProgress());
  await setImmediate();
  assert.equal(state.value.loading, false);
  assert.equal(isFinished(state.value.progress, 'classic'), false);
  assert.deepEqual(state.value.progress.attempts[0].feedback, ['high','high','high']);
  assert.deepEqual(restored, []);
});

test('leaving a puzzle cancels mode discovery and ignores late account responses', async (t) => {
  let finish;
  let signal;
  const pending = new Promise((resolve) => { finish = resolve; });
  const { restored, unmount } = mountProgress(t, 'guided', async (mode, requestSignal) => {
    if (mode === 'guided') return emptyProgress();
    signal = requestSignal;
    return pending;
  });
  unmount();
  assert.equal(signal.aborted, true);
  finish(parseProgress(JSON.stringify({ attempts: [[59,64,66]] }), target, 'classic'));
  await setImmediate();
  assert.deepEqual(restored, []);
});
