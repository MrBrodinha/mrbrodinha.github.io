import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(source, imports = {}) {
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  for (const [name, url] of Object.entries(imports)) js = js.replaceAll(`from "${name}"`, `from '${url}'`).replaceAll(`from '${name}'`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const hostUrl = moduleUrl(`
  let slots = [], cursor = 0, effects = [];
  export let dirty = false, writes = 0, supabase = null;
  export const context = { user: null, loading: false };
  export const useAuth = () => context;
  export function configureClient(client) { supabase = client; }
  export function begin() { cursor = 0; effects = []; dirty = false; }
  export function flush() { effects.splice(0).forEach(effect => effect()); }
  export function reset() { slots.forEach(slot => slot?.cleanup?.()); slots = []; begin(); }
  export function useState(initial) {
    const index = cursor++;
    const cell = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [cell.value, value => { cell.value = value; dirty = true; writes++; }];
  }
  export function useEffect(effect, deps) {
    const index = cursor++, previous = slots[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
    }
  }
`);
const host = await import(hostUrl);
const libraryUrl = moduleUrl('export const MELODY_COLUMNS = ""; export function melodyPayload() {}');
const serviceUrl = moduleUrl(await readFile(new URL('../../src/components/brodle/services/melodyService.ts', import.meta.url), 'utf8'), {
  '../../../lib/supabase': hostUrl, '../lib/melodyLibrary': libraryUrl,
});
const { useBrodleAdmin } = await import(moduleUrl(await readFile(new URL('../../src/components/brodle/hooks/useBrodleAdmin.ts', import.meta.url), 'utf8'), {
  react: hostUrl, '../../../auth/authContext': hostUrl,
  '../../../lib/supabase': hostUrl, '../services/melodyService': serviceUrl,
}));
function render() {
  for (let attempt = 0; attempt < 5; attempt++) {
    host.begin();
    const value = useBrodleAdmin();
    host.flush();
    if (!host.dirty) return value;
  }
  assert.fail('Admin hook did not settle');
}
function mount(t, rpc, user = { id: 'admin' }) {
  host.reset();
  host.context.user = user;
  host.context.loading = false;
  host.configureClient(rpc ? { rpc } : null);
  t.after(() => host.reset());
  return render();
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('only an exact positive RPC result without an error grants administrator access', async t => {
  for (const [data, error, expected] of [
    [true, null, true], [false, null, false], [null, null, false],
    ['true', null, false], [1, null, false], [true, { code: '42501' }, false],
  ]) {
    assert.equal(mount(t, name => {
      assert.equal(name, 'is_brodle_admin');
      return Promise.resolve({ data, error });
    }).loading, true);
    await setImmediate();
    const state = render();
    assert.equal(state.admin, expected);
    assert.equal(state.loading, false);
    assert.equal(Boolean(state.error), Boolean(error));
  }
});

test('missing configuration and guest sessions settle without an access request', t => {
  const state = mount(t, null);
  assert.equal(state.admin, false);
  assert.equal(state.loading, false);
  assert.equal(typeof state.error, 'string');
  const guest = mount(t, () => { assert.fail('Guests must not query admin membership'); }, null);
  assert.deepEqual(guest, { admin: false, loading: false, error: null });
  host.context.loading = true;
  assert.equal(render().loading, true);
});

test('synchronous and rejected access requests become denied states without exposing errors', async t => {
  for (const rpc of [
    () => { throw new Error('private@example.test secret'); },
    () => Promise.reject(new Error('private@example.test secret')),
  ]) {
    mount(t, rpc);
    await setImmediate();
    const state = render();
    assert.equal(state.admin, false);
    assert.equal(state.loading, false);
    assert.equal(typeof state.error, 'string');
    assert.doesNotMatch(state.error, /private@example|secret/);
  }
});

test('a new account never inherits an admin result, even before its effect runs', async t => {
  const next = deferred();
  let calls = 0;
  mount(t, () => ++calls === 1 ? Promise.resolve({ data: true, error: null }) : next.promise);
  await setImmediate();
  assert.equal(render().admin, true);
  host.context.user = { id: 'ordinary' };
  host.begin();
  const immediate = useBrodleAdmin();
  assert.equal(immediate.admin, false);
  assert.equal(immediate.loading, true);
  host.flush();
  next.resolve({ data: false, error: null });
  await setImmediate();
  assert.deepEqual(render(), { admin: false, loading: false, error: null });
});

test('late admin responses cannot grant access after an account switch or sign-out', async t => {
  for (const nextUser of [{ id: 'ordinary' }, null]) {
    const old = deferred();
    let calls = 0;
    mount(t, () => ++calls === 1 ? old.promise : Promise.resolve({ data: false, error: null }));
    host.context.user = nextUser;
    assert.equal(render().admin, false);
    await setImmediate();
    old.resolve({ data: true, error: null });
    await setImmediate();
    assert.deepEqual(render(), { admin: false, loading: false, error: null });
  }
});

test('unmounted access checks ignore late completion', async t => {
  const pending = deferred();
  mount(t, () => pending.promise);
  host.reset();
  const writes = host.writes;
  pending.resolve({ data: true, error: null });
  await setImmediate();
  assert.equal(host.writes, writes);
});
