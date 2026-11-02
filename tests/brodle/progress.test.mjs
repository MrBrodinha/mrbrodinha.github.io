import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import ts from 'typescript';

async function moduleUrl(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  for (const [name, url] of Object.entries(imports)) js = js.replaceAll(`from '${name}'`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const musicUrl = await moduleUrl('../../src/components/brodle/lib/musicGame.ts');
const { scoreGuess } = await import(musicUrl);
const progressUrl = await moduleUrl('../../src/components/brodle/lib/gameProgress.ts', { './musicGame': musicUrl });
const { emptyProgress, parseProgress, serializeProgress, mergeProgress, progressStorageKey, isFinished, hintLimit, editProgressGuess, revealNextHint } = await import(progressUrl);
const syncUrl = await moduleUrl('../../src/components/brodle/lib/progressSync.ts', { './gameProgress': progressUrl });
const { ProgressSync, readProgressCache, serializeProgressCache } = await import(syncUrl);
const target = [60,64];
const progress = (attempts = [], guess = [], attemptIds = attempts.map((_,index) => `attempt-${index}`)) => parseProgress(JSON.stringify({ attempts, guess, attemptIds, selectedAttempt: Math.max(0,attempts.length-1) }), target);
const initial = (value = emptyProgress(), pending = false) => ({ progress: value, pending });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('note hints keep half the melody at most, survive editing and retain a snapshot for each attempt', () => {
  const tune = [60, 64, 67, 65, 62];
  assert.equal(hintLimit(Array(10).fill(60)), 5);
  assert.equal(hintLimit(tune), 2);
  assert.equal(hintLimit([60]), 0);
  let round = revealNextHint(emptyProgress(), tune);
  assert.deepEqual(round.guess, [60]);
  round = editProgressGuess(round, [59, 63, 66, 64, 61], tune);
  assert.deepEqual(round.guess, [60, 63, 66, 64, 61]);
  const first = { id: 'first', notes: round.guess, feedback: scoreGuess(round.guess, tune), hintsUsed: round.hintsUsed };
  round = parseProgress(serializeProgress({ ...round, guess: [], attempts: [first] }), tune);
  assert.deepEqual(round.guess, [60], 'the next attempt starts with the revealed notes');
  round = revealNextHint(round, tune);
  assert.deepEqual(round.guess, [60, 64]);
  assert.equal(revealNextHint(round, tune), round, 'the budget cannot be exceeded');
  assert.deepEqual(editProgressGuess(round, [], tune).guess, [60, 64], 'Clear preserves hints');
  assert.deepEqual(editProgressGuess(round, round.guess.slice(0, -1), tune).guess, [60, 64], 'Undo preserves hints');
  assert.deepEqual(editProgressGuess(round, first.notes, tune).guess, [60, 64, 66, 64, 61], 'copying an old attempt preserves newer hints');
  const restored = readProgressCache(serializeProgressCache(round, true), tune);
  assert.equal(restored.progress.hintsUsed, 2);
  assert.equal(restored.progress.attempts[0].hintsUsed, 1, 'later hints do not rewrite past attempts');
  assert.deepEqual(restored.progress.guess, [60, 64]);
  const solved = parseProgress(JSON.stringify({ guess: [], hintsUsed: 2, attempts: [tune], attemptHints: [2] }), tune);
  assert.deepEqual(solved.guess, []);
  assert.equal(revealNextHint(solved, tune), solved);
  assert.equal(editProgressGuess(solved, [59], tune), solved);
});

test('stale tabs and devices cannot erase revealed notes or refund hints', async () => {
  const tune = [60, 64, 67, 65];
  const hinted = revealNextHint(revealNextHint(emptyProgress(), tune), tune);
  const stale = editProgressGuess(emptyProgress(), [59, 63, 66], tune);
  for (const merged of [mergeProgress(hinted, stale, tune), mergeProgress(stale, hinted, tune), mergeProgress(hinted, stale, tune, false)]) {
    assert.equal(merged.hintsUsed, 2);
    assert.deepEqual(merged.guess.slice(0, 2), [60, 64]);
  }
  let remote = hinted;
  const transport = { load: async () => remote, save: async next => (remote = mergeProgress(remote, next, tune)) };
  const session = new ProgressSync(tune, initial(), transport, () => {});
  await session.sync();
  assert.equal(session.state.progress.hintsUsed, 2, 'another device restores hints from the account');
  session.receive(stale, true);
  await session.sync();
  assert.equal(remote.hintsUsed, 2);
  assert.deepEqual(remote.guess.slice(0, 2), [60, 64]);
  session.dispose();
});

test('old progress has no hints and malformed hint metadata cannot spend extra hints', () => {
  assert.equal(progress([[59,64]]).hintsUsed, 0);
  for (const hintsUsed of [-1, 1.5, 2, null, '1']) {
    assert.equal(parseProgress(JSON.stringify({ attempts: [], guess: [], hintsUsed }), target).hintsUsed, 0);
  }
  const damaged = parseProgress(JSON.stringify({ attempts: [[59,64]], guess: [], attemptHints: [1] }), target);
  assert.equal(damaged.hintsUsed, 0, 'an incorrect note cannot be restored as a revealed correct note');
});

test('account and challenge storage keys isolate users, guests, archive days and changed targets', () => {
  const keys = [progressStorageKey('day-a',target,'alice'),progressStorageKey('day-a',target,'bob'),progressStorageKey('day-a',target),progressStorageKey('day-b',target,'alice'),progressStorageKey('day-a',[61,65],'alice')];
  assert.equal(new Set(keys).size,keys.length);
  assert.equal(progressStorageKey('day-a',target), 'brodle:progress:v1:day-a:60-64', 'old unowned rounds remain guest rounds');
  const cache = new Map([[keys[0], serializeProgressCache(progress([[59,64]],[60]),true)]]);
  assert.deepEqual(readProgressCache(cache.get(keys[0]),target).progress.guess,[60]);
  assert.deepEqual(readProgressCache(cache.get(keys[1]) ?? null,target).progress,emptyProgress());
  assert.deepEqual(readProgressCache(cache.get(keys[2]) ?? null,target).progress,emptyProgress());
});

test('attempt identities preserve repeated guesses and make stale retries idempotent', () => {
  const first = progress([[59,64]],[],['a']);
  const other = progress([[59,64],[59,64]],[],['a','b']);
  const merged = mergeProgress(first,other,target);
  assert.equal(merged.attempts.length,2,'two submissions of the same notes remain two attempts');
  assert.deepEqual(mergeProgress(merged,first,target).attempts,merged.attempts);
  const concurrent = progress([[58,64]],[],['c']);
  const both = mergeProgress(merged,concurrent,target);
  assert.deepEqual(both.attempts.map(a=>a.id),['a','b','c']);
  assert.deepEqual(mergeProgress(both,concurrent,target).attempts,both.attempts);
  const legacy = parseProgress(JSON.stringify({ attempts:[[59,64]], guess:[] }),target);
  assert.deepEqual(parseProgress(serializeProgress(legacy),target),legacy);
});

test('signing out and back in restores attempts, unfinished guesses and solved games', async () => {
  let remote = emptyProgress();
  let cached;
  const transport = { load: async()=>remote, save: async(next)=>{ remote=mergeProgress(remote,next,target); return remote; } };
  const first = new ProgressSync(target,initial(),transport,state=>{ cached=serializeProgressCache(state.progress,state.pending); });
  await first.sync();
  first.update(()=>progress([[59,64]],[60]));
  await setImmediate();
  assert.equal(first.state.status,'saved');
  first.dispose();
  const returning = new ProgressSync(target,readProgressCache(cached,target),transport,()=>{});
  await returning.sync();
  assert.equal(returning.state.progress.attempts.length,1);
  assert.deepEqual(returning.state.progress.guess,[60]);
  returning.update(()=>progress([[59,64],target],[],['attempt-0','win']));
  await setImmediate();
  returning.dispose();
  const anotherDevice = new ProgressSync(target,initial(),transport,()=>{});
  await anotherDevice.sync();
  assert.equal(isFinished(anotherDevice.state.progress),true);
  assert.equal(anotherDevice.state.progress.attempts.length,2);
  assert.deepEqual(anotherDevice.state.progress.guess,[]);
  anotherDevice.dispose();
});

test('offline edits remain in the account cache and upload after a failed restore recovers', async () => {
  let online = false;
  let remote = progress([[59,64]],[],['remote']);
  let cached;
  let saves = 0;
  const transport = {
    load: async()=>{ if (!online) throw new Error('Offline'); return remote; },
    save: async(next)=>{ saves++; remote=mergeProgress(remote,next,target); return remote; },
  };
  const session = new ProgressSync(target,initial(),transport,state=>{ cached=serializeProgressCache(state.progress,state.pending); });
  await session.sync();
  assert.equal(session.state.loading,false);
  assert.equal(session.state.status,'error');
  session.update(()=>progress([[58,64]],[62],['local']));
  await setImmediate();
  assert.equal(saves,0,'a failed restore must never blindly overwrite the account');
  assert.equal(readProgressCache(cached,target).pending,true);
  session.dispose();
  online = true;
  const returning = new ProgressSync(target,readProgressCache(cached,target),transport,()=>{});
  await returning.sync();
  assert.deepEqual(returning.state.progress.attempts.map(a=>a.id),['remote','local']);
  assert.deepEqual(returning.state.progress.guess,[62]);
  assert.equal(returning.state.pending,false);
  returning.dispose();
});

test('edits made during a slow save are queued and a stale tab cannot erase a solved round', async () => {
  let remote = emptyProgress();
  const hold = deferred();
  let saves = 0;
  const transport = {
    load: async()=>remote,
    save: async(next)=>{ if (++saves===1) await hold.promise; remote=mergeProgress(remote,next,target); return remote; },
  };
  const session = new ProgressSync(target,initial(),transport,()=>{});
  await session.sync();
  session.update(()=>progress([[59,64]],[60],['one']));
  await setImmediate();
  session.update(()=>progress([[59,64],target],[],['one','two']));
  hold.resolve();
  await setImmediate();
  assert.equal(saves,2);
  assert.equal(isFinished(remote),true);
  assert.equal(session.state.status,'saved');
  session.receive(progress([[59,64]],[58],['one']),true);
  await session.sync();
  assert.equal(isFinished(session.state.progress),true);
  assert.deepEqual(session.state.progress.guess,[]);
  session.dispose();
});

test('logging out or changing puzzles ignores late responses and aborts the old request', async () => {
  const request = deferred();
  let signal;
  let changes = 0;
  const old = new ProgressSync(target,initial(),{ load: async(nextSignal)=>{ signal=nextSignal; return request.promise; },save: async(next)=>next },()=>{ changes++; });
  const loading = old.sync();
  old.dispose();
  assert.equal(signal.aborted,true);
  request.resolve(progress([target],[],['old-user-win']));
  await loading;
  assert.equal(changes,0);
  const guest = new ProgressSync(target,initial(),undefined,()=>{});
  guest.update(()=>progress([], [60]));
  assert.equal(guest.state.status,'local');
  assert.equal(guest.state.pending,false);
  guest.dispose();
});
