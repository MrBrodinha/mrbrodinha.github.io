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
const { emptyProgress, parseProgress, serializeProgress, mergeProgress, progressStorageKey, progressRoundId, gameModeStorageKey, modeIsLocked, modeWithProgress, winningAttempt, isFinished, hintLimit, editProgressGuess, revealNextHint, noteConstraints, replaceGuessNote, markSongHintUsed, canSubmitGuess, guessFeedback, copyLastAttempt, copyAttemptToDraft, guessRangeIssues } = await import(progressUrl);
const syncUrl = await moduleUrl('../../src/components/brodle/lib/progressSync.ts', { './gameProgress': progressUrl });
const { ProgressSync, readProgressCache, serializeProgressCache } = await import(syncUrl);
const target = [60,64];
const progress = (attempts = [], guess = [], attemptIds = attempts.map((_,index) => `attempt-${index}`)) => parseProgress(JSON.stringify({ attempts, guess, attemptIds, selectedAttempt: Math.max(0,attempts.length-1) }), target);
const initial = (value = emptyProgress(), pending = false) => ({ progress: value, pending });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('either Casual hint locks the mode before any submission, while an unsubmitted draft stays switchable', () => {
  const tune = [60, 64, 67, 65];
  const empty = emptyProgress();
  const draft = editProgressGuess(empty, [59, 63], tune);
  assert.equal(modeIsLocked(draft), false);
  assert.equal(modeWithProgress('classic', { guided: draft, classic: empty }), 'classic');
  for (const assisted of [revealNextHint(draft, tune), markSongHintUsed(draft)]) {
    assert.equal(assisted.attempts.length, 0);
    assert.equal(modeIsLocked(assisted), true);
    const restored = parseProgress(serializeProgress(assisted), tune);
    assert.equal(modeIsLocked(restored), true, 'reload preserves the lock');
    assert.equal(modeWithProgress('classic', { guided: restored, classic: empty }), 'guided', 'a Hard preference cannot bypass the Casual hint lock');
  }
  const heard = markSongHintUsed(draft);
  assert.deepEqual(heard.guess, draft.guess, 'hearing the song never edits the draft');
  assert.equal(heard.hintsUsed, 0, 'hearing the song uses no note hints');
  assert.equal(markSongHintUsed(heard), heard, 'replays keep the same lock');
  assert.equal(markSongHintUsed(empty, 'classic'), empty, 'Hard cannot use song hints');
  const solved = progress([target]);
  assert.equal(markSongHintUsed(solved), solved, 'completed rounds cannot use song hints');
});

test('stale tabs and devices cannot erase song hint usage or unlock Hard', async () => {
  const heard = markSongHintUsed(emptyProgress());
  const stale = emptyProgress();
  for (const merged of [mergeProgress(heard, stale, target), mergeProgress(stale, heard, target), mergeProgress(heard, stale, target, false)]) {
    assert.equal(merged.songHintUsed, true);
    assert.equal(modeIsLocked(merged), true);
  }
  let remote = emptyProgress();
  const transport = { load: async () => remote, save: async next => (remote = mergeProgress(remote, next, target)) };
  const first = new ProgressSync(target, initial(), transport, () => {});
  await first.sync();
  first.update(markSongHintUsed);
  assert.equal(modeIsLocked(first.state.progress), true, 'lock is immediate, before the save finishes');
  await setImmediate();
  first.dispose();
  const returning = new ProgressSync(target, initial(), transport, () => {});
  await returning.sync();
  assert.equal(returning.state.progress.songHintUsed, true);
  assert.equal(modeWithProgress('classic', { guided: returning.state.progress, classic: stale }), 'guided');
  returning.dispose();
});

test('legacy progress remains compatible and only a boolean true restores song usage', () => {
  assert.equal(parseProgress(serializeProgress(emptyProgress()), target).songHintUsed, undefined);
  for (const songHintUsed of [false, null, 0, 1, 'true', [], {}]) {
    assert.equal(modeIsLocked(parseProgress(JSON.stringify({ attempts: [], guess: [], songHintUsed }), target)), false);
  }
  assert.equal(modeIsLocked(parseProgress(JSON.stringify({ attempts: [], guess: [], songHintUsed: true }), target)), true);
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
  const classic = copyAttemptToDraft(saved, 0, tune, 'classic');
  assert.deepEqual(classic.guess, [60, 62, 69, 64]);
  assert.deepEqual(guessRangeIssues(classic, tune, 'classic'), []);
  assert.equal(canSubmitGuess(classic, tune, 'classic'), true);
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
  assert.deepEqual(round.guess, [], 'a submitted guided melody leaves a fresh draft');
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

test('Casual shifted and octave guesses finish the round and survive reloads and stale saves', () => {
  const tune = [60, 64, 67];
  for (const offset of [-24, -12, -2, 2, 12, 24]) {
    const round = parseProgress(JSON.stringify({ attempts: [tune.map(midi => midi + offset)], guess: tune }), tune);
    assert.ok(round.attempts[0].feedback.every(value => value === (offset % 12 === 0 ? 'octave' : 'shifted')));
    assert.equal(isFinished(round), true);
    assert.deepEqual(winningAttempt(round, tune), { index: 0, kind: offset % 12 === 0 ? 'octave' : 'shifted', offset });
    assert.deepEqual(round.guess, [], 'a winning melody has no editable draft');
    assert.equal(copyLastAttempt(round, tune), round);
    assert.equal(editProgressGuess(round, tune, tune), round);
    assert.equal(replaceGuessNote(round, 0, tune[0], tune), round);
    assert.equal(revealNextHint(round, tune), round);
    assert.equal(canSubmitGuess(round, tune), false);
    assert.deepEqual(guessFeedback(round, tune), round.attempts[0].feedback);
    assert.deepEqual(parseProgress(serializeProgress(round), tune), round);
    const stale = parseProgress(JSON.stringify({ attempts: [[59, 62, 66]], guess: [60] }), tune);
    assert.deepEqual(mergeProgress(round, stale, tune), round, 'a stale tab cannot reopen a Casual win');
  }
});

test('Hard restores shifted and octave guesses as normal feedback and requires an exact win', () => {
  const tune = [60, 64, 67];
  for (const offset of [-24, -12, -2, 2, 12, 24]) {
    const notes = tune.map((midi) => midi + offset);
    let round = parseProgress(JSON.stringify({ attempts: [notes], guess: tune }), tune, 'classic');
    assert.deepEqual(round.attempts[0].feedback, tune.map(() => offset < 0 ? 'low' : 'high'));
    assert.equal(isFinished(round, 'classic'), false);
    assert.equal(winningAttempt(round, tune, 'classic'), null);
    assert.equal(canSubmitGuess(round, tune, 'classic'), true);
    round = parseProgress(serializeProgress({ ...round, attempts: [...round.attempts, { id: 'exact', notes: tune, feedback: scoreGuess(tune, tune) }] }), tune, 'classic');
    assert.equal(isFinished(round, 'classic'), true);
    assert.deepEqual(winningAttempt(round, tune, 'classic'), { index: 1, kind: 'exact', offset: 0 });
    assert.equal(canSubmitGuess(round, tune, 'classic'), false);
    assert.deepEqual(parseProgress(serializeProgress(round), tune, 'classic'), round);
  }
});

test('mode selection restores an already-started puzzle and keeps accounts, days and targets separate', () => {
  const empty = emptyProgress();
  const started = progress([[59,64]]);
  assert.equal(modeWithProgress('guided', { guided: empty, classic: empty }), 'guided');
  assert.equal(modeWithProgress('classic', { guided: empty, classic: empty }), 'classic');
  assert.equal(modeWithProgress('guided', { guided: empty, classic: started }), 'classic');
  assert.equal(modeWithProgress('classic', { guided: started, classic: empty }), 'guided');
  // Existing users with two historical rounds keep the round they selected.
  for (const mode of ['guided', 'classic']) assert.equal(modeWithProgress(mode, { guided: started, classic: started }), mode);
  const keys = [
    gameModeStorageKey('day-a', target, null), gameModeStorageKey('day-a', target, 'alice'),
    gameModeStorageKey('day-a', target, 'bob'), gameModeStorageKey('day-b', target, 'alice'),
    gameModeStorageKey('day-a', [61,65], 'alice'),
  ];
  assert.equal(new Set(keys).size, keys.length);
});

test('classic mode accepts complete new melodies without guided locks or pitch elimination', () => {
  const tune = [60,64,67,65];
  const previous = [60,63,69,64];
  let round = parseProgress(JSON.stringify({ attempts: [previous], guess: [] }), tune, 'classic');
  assert.deepEqual(round.guess, [], 'a submitted classic melody leaves a fresh draft');
  assert.ok(noteConstraints(round,tune,'classic').every(({minMidi,maxMidi,lockedMidi}) => minMidi===31 && maxMidi===103 && lockedMidi===null));
  round = editProgressGuess(round,[59,65,70,63],tune,'classic');
  assert.deepEqual(round.guess,[59,65,70,63], 'classic permits pitches ruled out by guided feedback and replacing previously correct notes');
  assert.equal(canSubmitGuess(round,tune,'classic'),true);
  assert.deepEqual(guessFeedback(round,tune,'classic'),[undefined,undefined,undefined,undefined]);
  assert.deepEqual(editProgressGuess(round,[],tune,'classic').guess,[]);
  assert.deepEqual(editProgressGuess(round,round.guess.slice(0,-1),tune,'classic').guess,[59,65,70]);
  round = replaceGuessNote(round,1,66,tune,'classic');
  assert.deepEqual(round.guess,[59,66,70,63]);
  const repeated = editProgressGuess(round,previous,tune,'classic');
  assert.equal(canSubmitGuess(repeated,tune,'classic'),true,'classic still counts repeated complete submissions');
  assert.equal(revealNextHint(round,tune,'classic'),round,'Hard cannot reveal note hints');
  assert.deepEqual(round.guess,[59,66,70,63]);
  assert.deepEqual(editProgressGuess(round,[],tune,'classic').guess,[]);
  assert.deepEqual(replaceGuessNote(round,0,60,tune,'classic').guess,[60,66,70,63]);
  assert.deepEqual(guessFeedback(round,tune,'classic'),[undefined,undefined,undefined,undefined]);
  assert.deepEqual(parseProgress(serializeProgress(round),tune,'classic'),round);
  const winning = {id:'classic-win',notes:tune,feedback:scoreGuess(tune,tune),hintsUsed:round.hintsUsed};
  const solved = parseProgress(serializeProgress({...round,attempts:[...round.attempts,winning]}),tune,'classic');
  assert.equal(isFinished(solved),true);
  assert.deepEqual(guessFeedback(solved,tune,'classic'),['correct','correct','correct','correct']);
});

test('legacy Hard partial drafts and revealed notes survive account sync and reloads', async () => {
  const tune = [60,64,67,65];
  let remote = parseProgress(JSON.stringify({attempts:[[60,63,69,64]],guess:[],hintsUsed:1}),tune,'classic');
  let cached = serializeProgressCache(remote,false);
  const transport = {
    load: async()=>parseProgress(serializeProgress(remote),tune,'classic'),
    save: async next => (remote = mergeProgress(remote,next,tune,true,'classic')),
  };
  const session = new ProgressSync(tune,readProgressCache(cached,tune,'classic'),transport,state=>{cached=serializeProgressCache(state.progress,state.pending);},'classic');
  await session.sync();
  assert.deepEqual(session.state.progress.guess,[60]);
  session.update(previous=>editProgressGuess(previous,[60,66],tune,'classic'));
  await setImmediate();
  assert.deepEqual(remote.guess,[60,66], 'sync does not fill a classic draft from the previous attempt');
  session.dispose();
  const returning = new ProgressSync(tune,readProgressCache(cached,tune,'classic'),transport,()=>{},'classic');
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

test('account and challenge storage keys isolate users, guests, modes, archive days and changed targets', () => {
  const keys = [progressStorageKey('day-a',target,'alice'),progressStorageKey('day-a',target,'bob'),progressStorageKey('day-a',target),progressStorageKey('day-b',target,'alice'),progressStorageKey('day-a',[61,65],'alice'),progressStorageKey('day-a',target,'alice','classic'),progressStorageKey('day-a',target,null,'classic')];
  assert.equal(new Set(keys).size,keys.length);
  assert.equal(progressStorageKey('day-a',target), 'brodle:progress:v1:day-a:60-64', 'old unowned rounds remain guest rounds');
  const cache = new Map([[keys[0], serializeProgressCache(progress([[59,64]],[60]),true)]]);
  assert.deepEqual(readProgressCache(cache.get(keys[0]),target).progress.guess,[60]);
  assert.deepEqual(readProgressCache(cache.get(keys[1]) ?? null,target).progress,emptyProgress());
  assert.deepEqual(readProgressCache(cache.get(keys[2]) ?? null,target).progress,emptyProgress());
  assert.deepEqual(readProgressCache(cache.get(keys[5]) ?? null,target,'classic').progress,emptyProgress(), 'old shared progress is not copied into Hard');
  assert.equal(progressRoundId('day-a','guided'),'day-a', 'existing account history stays in Casual');
  assert.equal(progressRoundId('day-a','classic'),'hard:day-a');
});

test('Casual and Hard browser rounds retain separate attempts, drafts, hints and wins', () => {
  const tune = [60,64,67,65];
  for (const userId of [null, 'alice']) {
    const casualKey = progressStorageKey('mode-round',tune,userId,'guided');
    const hardKey = progressStorageKey('mode-round',tune,userId,'classic');
    const casual = parseProgress(JSON.stringify({attempts:[[60,63,69,64]],guess:[60,64],hintsUsed:1}),tune,'guided');
    const hard = parseProgress(JSON.stringify({attempts:[[59,63,66,66]],guess:[62,66]}),tune,'classic');
    const cache = new Map([[casualKey,serializeProgressCache(casual,false)], [hardKey,serializeProgressCache(hard,false)]]);
    const restore = mode => readProgressCache(cache.get(progressStorageKey('mode-round',tune,userId,mode)),tune,mode).progress;
    assert.deepEqual(restore('guided'),casual);
    assert.deepEqual(restore('classic'),hard);
    const solved = parseProgress(serializeProgress({...casual,attempts:[...casual.attempts,{id:'casual-win',notes:tune,feedback:scoreGuess(tune,tune)}]}),tune,'guided');
    cache.set(casualKey,serializeProgressCache(solved,false));
    assert.equal(isFinished(restore('guided')),true);
    assert.equal(isFinished(restore('classic')),false);
    assert.equal(restore('classic').hintsUsed,0);
    assert.deepEqual(restore('classic'),hard,'solving Casual leaves the Hard round unchanged');
  }
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
