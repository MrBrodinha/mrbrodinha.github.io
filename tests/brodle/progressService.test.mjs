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
const { progressTransport } = await import(serviceUrl);

test('account load/save requests keep Casual and Hard progress in separate records', async (t) => {
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
  const casual = progressTransport('alice','day-a',target,'guided');
  const hard = progressTransport('alice','day-a',target,'classic');
  const signal = new AbortController().signal;
  const casualRound = parseProgress(JSON.stringify({attempts:[[60,63,69,64]],guess:[60,64],hintsUsed:1}),target,'guided');
  const hardRound = parseProgress(JSON.stringify({attempts:[[59,63,66,66]],guess:[62,66]}),target,'classic');
  await casual.save(casualRound,signal);
  assert.deepEqual(await hard.load(signal),emptyProgress(),'Hard does not load the old shared history');
  await hard.save(hardRound,signal);
  assert.deepEqual(await casual.load(signal),casualRound);
  assert.deepEqual(await hard.load(signal),hardRound);
  const solved = parseProgress(JSON.stringify({attempts:[target],guess:[]}),target,'guided');
  await casual.save(solved,signal);
  const returningHard = progressTransport('alice','day-a',target,'classic');
  const returningCasual = progressTransport('alice','day-a',target,'guided');
  assert.deepEqual(await returningCasual.load(signal),solved);
  assert.deepEqual(await returningHard.load(signal),hardRound,'a Casual win does not overwrite Hard on another device');
  assert.deepEqual(await progressTransport('bob','day-a',target,'classic').load(signal),emptyProgress());
  assert.deepEqual([...new Set(requests.filter(({scope})=>scope.p_user_id==='alice').map(({scope})=>scope.p_challenge_id))].sort(),['day-a','hard:day-a']);
  assert.equal(records.size,2);
  assert.equal(serializeProgress(await hard.load(signal)),serializeProgress(hardRound));
});
