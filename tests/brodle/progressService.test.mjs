import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function moduleUrl(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  for (const [name, url] of Object.entries(imports)) js = js.replaceAll(`from '${name}'`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const musicUrl = await moduleUrl('../../src/components/brodle/lib/musicGame.ts');
const progressUrl = await moduleUrl('../../src/components/brodle/lib/gameProgress.ts', { './musicGame': musicUrl });
const { emptyProgress, parseProgress, serializeProgress } = await import(progressUrl);
const clientUrl = `data:text/javascript;base64,${Buffer.from('export const supabase = { rpc() { throw new Error("Unexpected RPC"); } };').toString('base64')}`;
const { supabase } = await import(clientUrl);
const serviceUrl = await moduleUrl('../../src/components/brodle/services/progressService.ts', {
  '../../../lib/supabase': clientUrl, '../lib/gameProgress': progressUrl,
});
const { progressTransport, loadLegacyHardProgress } = await import(serviceUrl);

test('canonical load/save uses one record; legacy Hard is available only as an explicit compatibility read', async t => {
  const records = new Map();
  const requests = [];
  t.mock.method(supabase, 'rpc', (name, scope) => ({
    async abortSignal(signal) {
      signal.throwIfAborted();
      requests.push({ name, scope });
      const key = JSON.stringify([scope.p_user_id, scope.p_challenge_id, scope.p_target_notes]);
      if (name === 'save_brodle_progress') records.set(key, structuredClone(scope.p_progress));
      else assert.equal(name, 'get_brodle_progress');
      return { data: records.get(key) ?? null, error: null };
    },
  }));
  const target = [60,64,67,65];
  const legacy = parseProgress(JSON.stringify({ attempts: [[61,65,68,66]], guess: [60,64], hintsUsed: 1, songHintUsed: true }),target);
  records.set(JSON.stringify(['alice','hard:day-a',target]), JSON.parse(serializeProgress(legacy)));
  const signal = new AbortController().signal;
  const canonical = progressTransport('alice','day-a',target);
  assert.deepEqual(await canonical.load(signal),emptyProgress());
  assert.equal(canonical.hasRemoteRecord, false);
  assert.deepEqual(await loadLegacyHardProgress('alice','day-a',target,signal),legacy);
  await canonical.save(legacy,signal);
  assert.deepEqual(await canonical.load(signal),legacy);
  assert.equal(canonical.hasRemoteRecord, true);
  assert.deepEqual(await progressTransport('bob','day-a',target).load(signal),emptyProgress());
  assert.deepEqual(await progressTransport('alice','day-b',target).load(signal),emptyProgress());
  assert.deepEqual(await progressTransport('alice','day-a',[60,64]).load(signal),emptyProgress());
  assert.deepEqual(requests.filter(request => request.name === 'save_brodle_progress').map(request => request.scope.p_challenge_id), ['day-a']);
  assert.deepEqual(records.get(JSON.stringify(['alice','hard:day-a',target])),JSON.parse(serializeProgress(legacy)));
  await canonical.save(emptyProgress(), signal);
  assert.deepEqual(await canonical.load(signal), emptyProgress());
  assert.equal(canonical.hasRemoteRecord, true, 'an existing empty row stays authoritative');
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(canonical.load(cancelled.signal), { name: 'AbortError' });
});
