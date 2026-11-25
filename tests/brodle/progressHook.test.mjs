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
const { emptyProgress, parseProgress, serializeProgress, progressStorageKey, legacyHardStorageKey, isFinished } = await import(progressUrl);
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
const authUrl = moduleUrl(`export const auth = { user: { id: 'alice' } }; export const useAuth = () => auth;`);
const { auth } = await import(authUrl);
const transportUrl = moduleUrl(`
  export const transport = { load: undefined, save: undefined, hasRemoteRecord: undefined };
  export function progressTransport(userId, challengeId) {
    return { load: signal => transport.load(challengeId, signal), save: (progress, signal) => transport.save(challengeId, progress, signal), get hasRemoteRecord() { return transport.hasRemoteRecord; } };
  }
  export function loadLegacyHardProgress(userId, challengeId, target, signal) { return transport.load('hard:' + challengeId, signal); }
`);
const { transport } = await import(transportUrl);
const { useBrodleProgress } = await import(await sourceUrl('hooks/useBrodleProgress.ts', {
  react: hooksUrl, '../../../auth/authContext': authUrl, '../lib/gameProgress': progressUrl,
  '../lib/progressSync': syncUrl, '../services/progressService': transportUrl, '../lib/musicGame': musicUrl,
}));
const target = [60,64,67];
const round = value => parseProgress(JSON.stringify({ attempts: [], guess: [], ...value }), target);

function mountProgress(t, load, { userId = 'alice', seed = new Map(), save, hasRemoteRecord } = {}) {
  const storage = new Map(seed);
  const window = Object.assign(new EventTarget(), {
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setInterval, clearInterval,
  });
  const globals = { window, document: Object.assign(new EventTarget(), { hidden: false }) };
  const originals = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
  hooks.effects.length = 0;
  hooks.states.length = 0;
  auth.user = userId ? { id: userId } : null;
  const requests = [];
  transport.hasRemoteRecord = hasRemoteRecord;
  transport.load = (id, signal) => { requests.push(['load', id]); return load(id, signal); };
  transport.save = async (id, progress, signal) => { requests.push(['save', id]); return save ? save(id, progress, signal) : progress; };
  const result = useBrodleProgress('day-a', target);
  const cleanups = hooks.effects.map(effect => effect());
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    cleanups.splice(0).reverse().forEach(cleanup => cleanup?.());
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
  t.after(unmount);
  return { state: hooks.states[0], result, storage, window, requests, unmount };
}

test('canonical account history, drafts and hint-only progress take precedence over legacy Hard', async t => {
  for (const canonical of [round({ attempts: [[62,66,69]] }), round({ guess: [60] }), round({ hintsUsed: 1 }), round({ songHintUsed: true })]) {
    const { state, requests, unmount } = mountProgress(t, async id => {
      assert.equal(id, 'day-a', 'legacy progress is not requested when canonical state exists');
      return canonical;
    });
    assert.equal(state.value.loading, true);
    await setImmediate();
    assert.equal(state.value.loading, false);
    assert.equal(isFinished(state.value.progress), false);
    assert.deepEqual(state.value.progress, canonical);
    assert.deepEqual(requests, [['load', 'day-a']]);
    unmount();
  }
});

test('Hard-only account history imports once through canonical saves and preserves its source cache', async t => {
  const legacy = round({ attempts: [[72,76,79]], attemptIds: ['old-hard'], guess: [70], songHintUsed: true });
  const legacyKey = legacyHardStorageKey('day-a', target, 'alice');
  const seed = new Map([[legacyKey, serializeProgress(legacy)]]);
  let remote = emptyProgress();
  const load = async id => id === 'day-a' ? remote : legacy;
  const { state, requests, storage, unmount } = mountProgress(t, load, { seed, save: async (id, value) => { remote = value; return value; } });
  await setImmediate();
  assert.equal(state.value.loading, false);
  assert.equal(state.value.status, 'saved');
  assert.equal(isFinished(state.value.progress), false);
  assert.deepEqual(state.value.progress.attempts[0].feedback, ['high','high','high']);
  assert.equal(state.value.progress.attempts[0].id, 'old-hard');
  assert.deepEqual(state.value.progress.guess, [70]);
  assert.equal(state.value.progress.songHintUsed, true);
  assert.deepEqual(requests, [['load', 'day-a'], ['load', 'hard:day-a'], ['save', 'day-a']]);
  assert.equal(storage.get(legacyKey), seed.get(legacyKey));
  unmount();
  const returning = mountProgress(t, load, { seed: storage });
  await setImmediate();
  assert.deepEqual(returning.requests, [['load', 'day-a']]);
  assert.deepEqual(returning.state.value.progress, remote);
});

test('guest Hard-only progress imports locally while guest/account caches remain separate', async t => {
  const legacy = round({ attempts: [[62,66,69]], guess: [61,65], hintsUsed: 0 });
  const guestKey = legacyHardStorageKey('day-a', target, null);
  const seed = new Map([[guestKey, serializeProgress(legacy)], [legacyHardStorageKey('day-a', target, 'alice'), serializeProgress(round({ guess: [60] }))]]);
  const { state, storage, requests, unmount } = mountProgress(t, () => assert.fail('guest must not use account RPCs'), { userId: null, seed });
  assert.deepEqual(state.value.progress, legacy);
  assert.deepEqual(parseProgress(storage.get(progressStorageKey('day-a', target)), target), legacy);
  assert.equal(storage.get(guestKey), seed.get(guestKey));
  assert.deepEqual(requests, []);
  unmount();
  const canonical = round({ songHintUsed: true });
  seed.set(progressStorageKey('day-a', target), serializeProgress(canonical));
  const second = mountProgress(t, () => assert.fail('guest RPC'), { userId: null, seed });
  assert.deepEqual(second.state.value.progress, canonical, 'hint-only canonical progress prevents fallback');
});

test('pending canonical account drafts prevent fallback even when remote canonical is empty', async t => {
  const canonical = round({ guess: [60,65], songHintUsed: true });
  const seed = new Map([[progressStorageKey('day-a', target, 'alice'), JSON.stringify({ ...JSON.parse(serializeProgress(canonical)), pending: true })]]);
  const { state, requests } = mountProgress(t, async id => { assert.equal(id, 'day-a'); return emptyProgress(); }, { seed });
  await setImmediate();
  assert.deepEqual(state.value.progress, canonical);
  assert.equal(state.value.status, 'saved');
  assert.deepEqual(requests, [['load', 'day-a'], ['save', 'day-a']]);
});

test('a failed canonical load never imports legacy data; recovery retries the complete restore', async t => {
  let fail = true;
  const legacy = round({ hintsUsed: 1, songHintUsed: true });
  const { state, result, requests } = mountProgress(t, async id => {
    if (id === 'day-a') { if (fail) throw Error('offline'); return emptyProgress(); }
    return legacy;
  });
  await setImmediate();
  assert.equal(state.value.status, 'error');
  assert.deepEqual(requests, [['load', 'day-a']]);
  fail = false;
  result.retrySync();
  await setImmediate();
  assert.equal(state.value.status, 'saved');
  assert.equal(state.value.progress.hintsUsed, 1);
  assert.equal(state.value.progress.songHintUsed, true);
});

test('pending legacy account edits merge with legacy remote before canonical import', async t => {
  const legacyKey = legacyHardStorageKey('day-a', target, 'alice');
  const cached = round({ guess: [60,65], hintsUsed: 1, songHintUsed: true });
  const seed = new Map([[legacyKey, JSON.stringify({ ...JSON.parse(serializeProgress(cached)), pending: true })]]);
  const { state } = mountProgress(t, async id => id === 'day-a' ? emptyProgress() : round({ attempts: [[62,66,69]], attemptIds: ['remote-hard'] }), { seed });
  await setImmediate();
  assert.equal(state.value.status, 'saved');
  assert.equal(state.value.progress.attempts[0].id, 'remote-hard');
  assert.deepEqual(state.value.progress.guess, [60,65]);
  assert.equal(state.value.progress.songHintUsed, true);
});

test('leaving an account or puzzle cancels fallback and ignores late responses', async t => {
  let finish;
  let signal;
  const pending = new Promise(resolve => { finish = resolve; });
  const { state, requests, unmount } = mountProgress(t, async (id, requestSignal) => {
    if (id === 'day-a') return emptyProgress();
    signal = requestSignal;
    return pending;
  });
  await setImmediate();
  assert.equal(state.value.loading, true);
  unmount();
  assert.equal(signal.aborted, true);
  finish(round({ attempts: [[62,66,69]] }));
  await setImmediate();
  assert.deepEqual(requests, [['load', 'day-a'], ['load', 'hard:day-a']]);
  assert.equal(state.value.progress.attempts.length, 0);
});


test('cleared imported drafts stay cleared on guest reload and account restore', async t => {
  const retired = round({ guess: [61,65] });
  const canonicalKey = progressStorageKey('day-a', target);
  const seed = new Map([[legacyHardStorageKey('day-a', target, null), serializeProgress(retired)], [canonicalKey, serializeProgress(emptyProgress())]]);
  const guest = mountProgress(t, () => assert.fail('guest RPC'), { userId: null, seed });
  assert.deepEqual(guest.state.value.progress, emptyProgress());
  guest.unmount();
  const account = mountProgress(t, async id => {
    assert.equal(id, 'day-a', 'an existing canonical row prevents resurrecting a retired draft');
    return emptyProgress();
  }, { hasRemoteRecord: true, seed: new Map([[progressStorageKey('day-a', target, 'alice'), serializeProgress(retired)]]) });
  await setImmediate();
  assert.deepEqual(account.state.value.progress, emptyProgress(), 'the remote Clear also replaces a stale, already-synced canonical draft');
  assert.deepEqual(account.requests, [['load', 'day-a']]);
  account.unmount();
  const pendingSeed = new Map([[progressStorageKey('day-a', target, 'alice'), JSON.stringify({ ...JSON.parse(serializeProgress(emptyProgress())), pending: true })]]);
  const pending = mountProgress(t, async id => { assert.equal(id, 'day-a'); return emptyProgress(); }, { seed: pendingSeed });
  await setImmediate();
  assert.deepEqual(pending.state.value.progress, emptyProgress());
  assert.deepEqual(pending.requests, [['load', 'day-a'], ['save', 'day-a']], 'a pending Clear establishes an authoritative empty account row');
});
