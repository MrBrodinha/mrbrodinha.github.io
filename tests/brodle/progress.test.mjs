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
const { emptyProgress, parseProgress, serializeProgress, mergeProgress, progressStorageKey, legacyHardStorageKey, hasProgress, winningAttempt, isFinished, hintLimit, editProgressGuess, revealNextHint, noteConstraints, replaceGuessNote, markSongHintUsed, canSubmitGuess, guessFeedback, copyLastAttempt, copyAttemptToDraft, guessRangeIssues } = await import(progressUrl);
const syncUrl = await moduleUrl('../../src/components/brodle/lib/progressSync.ts', { './gameProgress': progressUrl });
const { ProgressSync, readProgressCache, serializeProgressCache } = await import(syncUrl);
const target = [60,64];
const progress = (attempts = [], guess = [], attemptIds = attempts.map((_,index) => `attempt-${index}`)) => parseProgress(JSON.stringify({ attempts, guess, attemptIds, selectedAttempt: Math.max(0,attempts.length-1) }), target);
const initial = (value = emptyProgress(), pending = false) => ({ progress: value, pending });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('optional note and song hints work independently before a submission', () => {
  const tune = [60, 64, 67, 65];
  const draft = editProgressGuess(emptyProgress(), [59, 63], tune);
  assert.equal(hasProgress(draft), true);
  for (const assisted of [revealNextHint(draft, tune), markSongHintUsed(draft)]) {
    assert.equal(assisted.attempts.length, 0);
    assert.equal(hasProgress(assisted), true);
    assert.deepEqual(parseProgress(serializeProgress(assisted), tune), assisted);
  }
  const heard = markSongHintUsed(draft);
  assert.deepEqual(heard.guess, draft.guess);
  assert.equal(heard.hintsUsed, 0);
  assert.equal(markSongHintUsed(heard), heard);
  const solved = progress([target]);
  assert.equal(markSongHintUsed(solved), solved);
});

test('stale tabs and devices cannot erase song hint usage', async () => {
  const heard = markSongHintUsed(emptyProgress());
  const stale = emptyProgress();
  for (const merged of [mergeProgress(heard, stale, target), mergeProgress(stale, heard, target), mergeProgress(heard, stale, target, false)]) {
    assert.equal(merged.songHintUsed, true);
    assert.equal(hasProgress(merged), true);
  }
  let remote = emptyProgress();
  const transport = { load: async () => remote, save: async next => (remote = mergeProgress(remote, next, target)) };
  const first = new ProgressSync(target, initial(), transport, () => {});
  await first.sync();
  first.update(markSongHintUsed);
  assert.equal(hasProgress(first.state.progress), true, 'lock is immediate, before the save finishes');
  await setImmediate();
  first.dispose();
  const returning = new ProgressSync(target, initial(), transport, () => {});
  await returning.sync();
  assert.equal(returning.state.progress.songHintUsed, true);
  returning.dispose();
});

test('legacy progress remains compatible and only a boolean true restores song usage', () => {
  assert.equal(parseProgress(serializeProgress(emptyProgress()), target).songHintUsed, undefined);
  for (const songHintUsed of [false, null, 0, 1, 'true', [], {}]) {
    assert.equal(hasProgress(parseProgress(JSON.stringify({ attempts: [], guess: [], songHintUsed }), target)), false);
  }
  assert.equal(hasProgress(parseProgress(JSON.stringify({ attempts: [], guess: [], songHintUsed: true }), target)), true);
});

test('older attempts copy to the draft with current hints and confirmed notes, while exposing each blocked position', () => {
  const tune = [60, 64, 67, 65];
  const saved = parseProgress(JSON.stringify({ attempts: [[58, 62, 69, 64], [59, 64, 68, 66]], guess: [], hintsUsed: 1, selectedAttempt: 0 }), tune);
  const copied = copyAttemptToDraft(saved, 0, tune);
  assert.deepEqual(copied.guess, [60, 64, 69, 64], 'newer revealed and correct notes override the older attempt');
  assert.deepEqual(guessRangeIssues(copied, tune), [2, 3], 'all positions outside current bounds are identified in score order');
  assert.equal(canSubmitGuess(copied, tune), false);
  const partialFix = replaceGuessNote(copied, 2, 67, tune);
  assert.deepEqual(guessRangeIssues(partialFix, tune), [3]);
  const fixed = replaceGuessNote(partialFix, 3, 65, tune);
  assert.deepEqual(guessRangeIssues(fixed, tune), []);
  assert.equal(canSubmitGuess(fixed, tune), true);
  assert.deepEqual(saved.guess, [60], 'copying does not mutate the saved draft or its revealed note');
  assert.deepEqual(copied.attempts, saved.attempts, 'copying preserves history and hint snapshots');
  assert.equal(copied.hintsUsed, 1);
  assert.equal(copied.selectedAttempt, 0);
  for (const index of [-1, 2, 0.5]) assert.equal(copyAttemptToDraft(saved, index, tune), saved);
  const solved = parseProgress(JSON.stringify({ attempts: [tune] }), tune);
  assert.equal(copyAttemptToDraft(solved, 0, tune), solved, 'a finished round stays finished');
});

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
  assert.deepEqual(round.guess, [60], 'submission leaves a fresh draft with only revealed hints');
  round = revealNextHint(round, tune);
  assert.deepEqual(round.guess, [60, 64]);
  assert.equal(revealNextHint(round, tune), round, 'the budget cannot be exceeded');
  assert.deepEqual(editProgressGuess(round, [], tune).guess, [60, 64], 'Clear keeps revealed hints');
  assert.deepEqual(editProgressGuess(round, round.guess.slice(0, -1), tune).guess, [60, 64], 'Undo keeps revealed hints');
  round = copyLastAttempt(round, tune);
  assert.deepEqual(round.guess, [60, 64, 66, 64, 61], 'copying an old attempt preserves newer hints');
  assert.equal(round.attempts.length, 1, 'copying does not submit an attempt');
  assert.equal(round.hintsUsed, 2, 'copying does not use a hint');
  const restored = readProgressCache(serializeProgressCache(round, true), tune);
  assert.equal(restored.progress.hintsUsed, 2);
  assert.equal(restored.progress.attempts[0].hintsUsed, 1, 'later hints do not rewrite past attempts');
  assert.deepEqual(restored.progress.guess, [60, 64, 66, 64, 61]);
  const solved = parseProgress(JSON.stringify({ guess: [], hintsUsed: 2, attempts: [tune], attemptHints: [2] }), tune);
  assert.deepEqual(solved.guess, []);
  assert.equal(revealNextHint(solved, tune), solved);
  assert.equal(editProgressGuess(solved, [59], tune), solved);
});

test('each note accumulates independent pitch limits and locks correct pitches', () => {
  const tune = [64, 67, 60, 72];
  let round = parseProgress(JSON.stringify({ attempts: [[68, 62, 60, 71]], guess: [] }), tune);
  assert.deepEqual(round.guess, [], 'a submitted melody leaves a fresh draft');
  assert.equal(editProgressGuess(round, [68], tune), round, 'new input respects learned limits');
  round = copyLastAttempt(round, tune);
  assert.deepEqual(round.guess, [68, 62, 60, 71]);
  assert.deepEqual(noteConstraints(round, tune), [
    { minMidi: 31, maxMidi: 67, lockedMidi: null },
    { minMidi: 63, maxMidi: 103, lockedMidi: null },
    { minMidi: 60, maxMidi: 60, lockedMidi: 60 },
    { minMidi: 72, maxMidi: 103, lockedMidi: null },
  ]);
  assert.equal(canSubmitGuess(round, tune), false, 'an unchanged guess cannot consume another attempt');
  assert.equal(replaceGuessNote(round, 0, 68, tune), round, 'the too-high pitch itself is excluded');
  assert.equal(replaceGuessNote(round, 0, 69, tune), round);
  assert.equal(replaceGuessNote(round, 1, 62, tune), round, 'the too-low pitch itself is excluded');
  assert.equal(replaceGuessNote(round, 2, 59, tune), round, 'green notes cannot be changed');
  round = replaceGuessNote(round, 0, 60, tune);
  assert.deepEqual(round.guess, [60, 62, 60, 71], 'editing replaces only the selected note');
  assert.deepEqual(guessFeedback(round, tune), [undefined, undefined, 'correct', undefined], 'draft notes stay neutral except confirmed green notes');
  assert.equal(canSubmitGuess(round, tune), false, 'the other incorrect notes still need changes');
  round = replaceGuessNote(round, 1, 70, tune);
  round = replaceGuessNote(round, 3, 73, tune);
  assert.equal(canSubmitGuess(round, tune), true);
  const second = { id: 'second', notes: [...round.guess], feedback: scoreGuess(round.guess, tune) };
  round = parseProgress(serializeProgress({ ...round, attempts: [...round.attempts, second] }), tune);
  assert.deepEqual(noteConstraints(round, tune), [
    { minMidi: 61, maxMidi: 67, lockedMidi: null },
    { minMidi: 63, maxMidi: 69, lockedMidi: null },
    { minMidi: 60, maxMidi: 60, lockedMidi: 60 },
    { minMidi: 72, maxMidi: 72, lockedMidi: null },
  ], 'later low feedback retains the earlier upper bound, and vice versa');
  assert.equal(replaceGuessNote(round, 0, 60, tune), round);
  assert.equal(replaceGuessNote(round, 1, 70, tune), round);
  assert.deepEqual(editProgressGuess(round, [], tune).guess, []);
  assert.deepEqual(editProgressGuess(round, round.guess.slice(0, -1), tune).guess, [60, 70, 60]);
  const cleared = editProgressGuess(round, [], tune);
  assert.deepEqual(noteConstraints(cleared, tune), noteConstraints(round, tune), 'Clear retains learned limits');
  const restored = parseProgress(serializeProgress(round), tune);
  assert.deepEqual(noteConstraints(restored, tune), noteConstraints(round, tune));
  let solved = replaceGuessNote(restored, 0, 64, tune);
  solved = replaceGuessNote(solved, 1, 67, tune);
  solved = replaceGuessNote(solved, 3, 72, tune);
  assert.equal(canSubmitGuess(solved, tune), true);
  solved = parseProgress(serializeProgress({ ...solved, attempts: [...solved.attempts, { id: 'win', notes: solved.guess, feedback: scoreGuess(solved.guess, tune) }] }), tune);
  assert.equal(isFinished(solved), true);
  assert.deepEqual(guessFeedback(solved, tune), ['correct', 'correct', 'correct', 'correct']);
});

test('partial drafts stay partial and stale devices cannot replace confirmed pitches', () => {
  const tune = [64, 67, 60, 72];
  const saved = parseProgress(JSON.stringify({ attempts: [[68, 62, 60, 71]], guess: [66] }), tune);
  assert.deepEqual(saved.guess, [66], 'partial drafts are not filled from the last submission');
  const stale = parseProgress(JSON.stringify({ attempts: [], guess: [65, 64, 59, 70] }), tune);
  const merged = mergeProgress(saved, stale, tune);
  assert.deepEqual(merged.guess, [65, 64, 60, 70], 'a stale draft cannot replace a correct green note');
  assert.deepEqual(noteConstraints(merged, tune), noteConstraints(saved, tune));
  const completed = editProgressGuess(merged, [65, 64, 59, 72], tune);
  assert.deepEqual(completed.guess, [65, 64, 60, 72]);
});

test('legacy shifted completions reopen, keep their history and can be corrected to an exact win', () => {
  const tune = [60, 64, 67];
  for (const offset of [-24, -12, -2, 2, 12, 24]) {
    const notes = tune.map(midi => midi + offset);
    const round = parseProgress(JSON.stringify({ attempts: [notes], attemptIds: ['old-win'], guess: [], songHintUsed: true }), tune);
    assert.deepEqual(round.attempts[0].feedback, tune.map(() => offset < 0 ? 'low' : 'high'));
    assert.equal(isFinished(round), false);
    assert.equal(winningAttempt(round, tune), null);
    const copied = copyLastAttempt(round, tune);
    assert.deepEqual(copied.guess, notes);
    assert.deepEqual(guessRangeIssues(copied, tune), [0, 1, 2]);
    const repaired = editProgressGuess(copied, tune, tune);
    assert.equal(canSubmitGuess(repaired, tune), true);
    const solved = parseProgress(serializeProgress({ ...repaired, attempts: [...round.attempts, { id: 'exact', notes: tune, feedback: scoreGuess(tune, tune) }] }), tune);
    assert.equal(isFinished(solved), true);
    assert.equal(solved.attempts.length, 2);
    assert.equal(solved.attempts[0].id, 'old-win');
    assert.equal(solved.songHintUsed, true);
    assert.deepEqual(winningAttempt(solved, tune), { index: 1, kind: 'exact', offset: 0 });
    assert.deepEqual(parseProgress(serializeProgress(solved), tune), solved);
  }
});

test('restored shifted and octave guesses receive normal feedback and require an exact win', () => {
  const tune = [60, 64, 67];
  for (const offset of [-24, -12, -2, 2, 12, 24]) {
    const notes = tune.map((midi) => midi + offset);
    let round = parseProgress(JSON.stringify({ attempts: [notes], guess: tune }), tune);
    assert.deepEqual(round.attempts[0].feedback, tune.map(() => offset < 0 ? 'low' : 'high'));
    assert.equal(isFinished(round), false);
    assert.equal(winningAttempt(round, tune), null);
    assert.equal(canSubmitGuess(round, tune), true);
    round = parseProgress(serializeProgress({ ...round, attempts: [...round.attempts, { id: 'exact', notes: tune, feedback: scoreGuess(tune, tune) }] }), tune);
    assert.equal(isFinished(round), true);
    assert.deepEqual(winningAttempt(round, tune), { index: 1, kind: 'exact', offset: 0 });
    assert.equal(canSubmitGuess(round, tune), false);
    assert.deepEqual(parseProgress(serializeProgress(round), tune), round);
  }
});

test('partial drafts and revealed notes survive account sync and reloads', async () => {
  const tune = [60,64,67,65];
  let remote = parseProgress(JSON.stringify({attempts:[[60,63,69,64]],guess:[],hintsUsed:1}),tune);
  let cached = serializeProgressCache(remote,false);
  const transport = {
    load: async()=>parseProgress(serializeProgress(remote),tune),
    save: async next => (remote = mergeProgress(remote,next,tune,true)),
  };
  const session = new ProgressSync(tune,readProgressCache(cached,tune),transport,state=>{cached=serializeProgressCache(state.progress,state.pending);});
  await session.sync();
  assert.deepEqual(session.state.progress.guess,[60]);
  session.update(previous=>editProgressGuess(previous,[60,66],tune));
  await setImmediate();
  assert.deepEqual(remote.guess,[60,66], 'sync does not fill a partial draft from the previous attempt');
  session.dispose();
  const returning = new ProgressSync(tune,readProgressCache(cached,tune),transport,()=>{});
  await returning.sync();
  assert.deepEqual(returning.state.progress.guess,[60,66]);
  assert.equal(returning.state.progress.hintsUsed,1);
  returning.dispose();
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

test('canonical and legacy browser keys isolate users, guests, days and changed targets', () => {
  const keys = [progressStorageKey('day-a',target,'alice'),progressStorageKey('day-a',target,'bob'),progressStorageKey('day-a',target),progressStorageKey('day-b',target,'alice'),progressStorageKey('day-a',[61,65],'alice'),legacyHardStorageKey('day-a',target,'alice'),legacyHardStorageKey('day-a',target,null)];
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys[2], 'brodle:progress:v1:day-a:60-64');
  assert.equal(keys[5], 'brodle:progress:v2:user:alice:hard:day-a:60-64');
  const cache = new Map([[keys[0], serializeProgressCache(progress([[59,64]],[60]),true)]]);
  assert.deepEqual(readProgressCache(cache.get(keys[0]),target).progress.guess,[60]);
  for (const key of keys.slice(1)) assert.deepEqual(readProgressCache(cache.get(key) ?? null,target).progress,emptyProgress());
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
