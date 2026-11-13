import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const alice='11111111-1111-4111-8111-111111111111';
const bob='22222222-2222-4222-8222-222222222222';
const target=[60,64];
const progress=(attempts=[],guess=[],attemptIds=attempts.map((_,index)=>`attempt-${index}`))=>({attempts,guess,attemptIds,selectedAttempt:Math.max(0,attempts.length-1),hintsUsed:0,attemptHints:attempts.map(()=>0)});

test('Brodle progress is private to its account, resumes after login, and merges stale saves without losing attempts', async()=>{
  const db=new PGlite();
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const role=async(id)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(id?{sub:id}:{})]);
    await db.exec('set role '+(id?'authenticated':'anon'));
  };
  const save=(id,value,day='day-a',notes=target)=>scalar('select public.save_brodle_progress($1,$2,$3,$4)',[id,day,notes,JSON.stringify(value)]);
  const load=(id,day='day-a',notes=target)=>scalar('select public.get_brodle_progress($1,$2,$3)',[id,day,notes]);
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      grant usage on schema public,auth to anon,authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      create table public.users(id uuid primary key);
      insert into public.users values('${alice}'),('${bob}');`);
    await db.exec(await readFile(new URL('../../database/migrations/202611010013_brodle_player_progress.sql',import.meta.url),'utf8'));
    const legacy = progress([[59,64]], [60], ['legacy']);
    delete legacy.hintsUsed;
    delete legacy.attemptHints;
    await role(alice);
    await save(alice, legacy, 'legacy');
    await db.exec('reset role');
    await db.exec(await readFile(new URL('../../database/migrations/202611020015_brodle_note_hints.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../../database/migrations/202611130017_brodle_hint_mode_lock.sql',import.meta.url),'utf8'));
    await role(alice);
    assert.deepEqual(await load(alice, 'legacy'), legacy, 'the upgrade preserves existing rounds');
    assert.deepEqual(await save(alice, legacy, 'legacy'), progress([[59,64]], [60], ['legacy']), 'old clients can still save');
    assert.equal(await load(alice),null);
    const first=progress([[59,64]],[60],['first']);
    assert.deepEqual(await save(alice,first),first);
    await role(null);
    await assert.rejects(load(alice),{code:'42501'});
    await assert.rejects(db.query('select * from public.brodle_player_progress'),{code:'42501'});
    await role(bob);
    assert.equal(await load(alice),null);
    assert.equal(await load(bob),null);
    assert.equal(await scalar('select count(*)::int from public.brodle_player_progress'),0);
    await assert.rejects(save(alice,progress()),{code:'42501'});
    await assert.rejects(db.query('insert into public.brodle_player_progress(user_id,challenge_id,target_notes,progress) values($1,$2,$3,$4)',[alice,'forged',target,JSON.stringify(first)]),{code:'42501'});
    assert.equal((await db.query("update public.brodle_player_progress set progress=$1 where user_id=$2 returning user_id",[JSON.stringify(progress()),alice])).rows.length,0);
    const bobs=progress([[58,64]],[],['bob-first']);
    assert.deepEqual(await save(bob,bobs),bobs);
    await role(alice);
    assert.deepEqual(await load(alice),first,'signing back in retains the round and unfinished guess');
    await assert.rejects(db.query('update public.brodle_player_progress set user_id=$1',[bob]),{code:'42501'});
    assert.equal(await load(alice,'day-b'),null);
    assert.equal(await load(alice,'day-a',[61,65]),null,'changed target pitches start a separate round');
    assert.deepEqual(await save(alice,progress([], [61]),'day-b'),progress([], [61]));
    const divergent=progress([[58,64]],[62],['other-device']);
    const merged=await save(alice,divergent);
    assert.deepEqual(merged.attemptIds,['first','other-device']);
    assert.deepEqual(merged.attempts,[[59,64],[58,64]]);
    assert.deepEqual(await save(alice,divergent),merged,'retrying a divergent save never duplicates its attempts');
    const won=await save(alice,progress([[59,64],target],[],['first','win']));
    assert.deepEqual(won.attemptIds,['first','other-device','win']);
    assert.deepEqual((await save(alice,first)).attempts,won.attempts,'stale tabs never erase a win');
    assert.deepEqual((await load(alice)).guess,[]);
    const casualSaved=await load(alice);
    assert.equal(await load(alice,'hard:day-a'),null,'a Casual win does not solve Hard');
    const hardFirst=progress([[61,63]],[62],['hard-first']);
    assert.deepEqual(await save(alice,hardFirst,'hard:day-a'),hardFirst);
    assert.deepEqual(await load(alice),casualSaved,'Hard attempts do not enter the Casual round');
    assert.deepEqual(await load(alice,'hard:day-a'),hardFirst,'Hard reloads its own attempts and partial draft');
    const hardHinted={...hardFirst,guess:[60],hintsUsed:1};
    assert.deepEqual(await save(alice,hardHinted,'hard:day-a'),hardHinted);
    assert.deepEqual(await load(alice),casualSaved,'Hard hints do not enter the Casual round');
    await role(bob);
    assert.deepEqual(await load(bob),bobs,'another user’s progress remains untouched');
    assert.equal(await load(bob,'hard:day-a'),null,'Hard progress stays private to its account');
    for (const invalid of [
      {...progress(),guess:[30]}, {...progress(),guess:[104]}, {...progress(),guess:[60,64,67]},
      {...progress(),guess:[60.5]}, {...progress(),selectedAttempt:1}, {...progress(),selectedAttempt:null},
      progress([[60]],[],['short']), progress([[60,64]],[],[]), progress([[59,64],[58,64]],[],['same','same']),
      {...progress(),attempts:null}, {...progress(),guess:null}, progress([[59,64]],[],['bad id']),
    ]) await assert.rejects(save(bob,invalid),{code:'23514'});
    for (const invalidTarget of [[],[30],[104],Array(257).fill(60)]) await assert.rejects(save(bob,progress(),'invalid',invalidTarget),{code:'23514'});
    const boundaries=progress([[31,103]],[],['limits']);
    assert.deepEqual(await save(bob,boundaries,'boundaries',[31,103]),boundaries);
    const tune=[60,64,67,65,62];
    const hinted={...progress([[60,63,66,64,61]],[60],['hinted-first']),hintsUsed:1,attemptHints:[1]};
    assert.deepEqual(await save(bob,hinted,'hints',tune),hinted);
    const moreHints={...progress(hinted.attempts,[60,64],hinted.attemptIds),hintsUsed:2,attemptHints:[1]};
    assert.deepEqual(await save(bob,moreHints,'hints',tune),moreHints);
    const staleHints=await save(bob,progress([], [59,63,66]),'hints',tune);
    assert.equal(staleHints.hintsUsed,2,'stale devices cannot refund hints');
    assert.deepEqual(staleHints.guess,[60,64,66],'stale drafts retain the correct revealed notes');
    assert.deepEqual(staleHints.attemptHints,[1],'each attempt keeps the hints used at submission');
    const cleared=await save(bob,{...moreHints,guess:[]},'hints',tune);
    assert.deepEqual(cleared.guess,[60,64],'Clear retains hints');
    const hintedWin=await save(bob,{...progress([...hinted.attempts,tune],[],['hinted-first','hinted-win']),hintsUsed:2,attemptHints:[1,2]},'hints',tune);
    assert.deepEqual(hintedWin.guess,[]);
    assert.equal(hintedWin.hintsUsed,2);
    assert.deepEqual(hintedWin.attemptHints,[1,2]);
    for (const invalid of [
      {...moreHints,hintsUsed:3}, {...moreHints,hintsUsed:-1}, {...moreHints,hintsUsed:1.5},
      {...moreHints,hintsUsed:null}, {...moreHints,hintsUsed:'2'},
      {...moreHints,attemptHints:null}, {...moreHints,attemptHints:[]}, {...moreHints,attemptHints:[3]},
      {...moreHints,attemptHints:[1.5]}, {...moreHints,attemptHints:[null]},
      {...moreHints,attempts:[[59,63,66,64,61]]}, {...moreHints,guess:[59,64]}, {...moreHints,guess:[60]},
    ]) await assert.rejects(save(bob,invalid,'invalid-hints',tune),{code:'23514'});
    await role(alice);
    assert.equal(await load(alice,'hints',tune),null,'revealed notes stay private to their account');
    const heard = { ...progress([], [59]), songHintUsed: true };
    assert.deepEqual(await save(alice, heard, 'song-hint'), heard, 'song use saves before any submission');
    assert.deepEqual(await load(alice, 'song-hint'), heard, 'a new device restores song use');
    const staleSong = await save(alice, progress(), 'song-hint');
    assert.equal(staleSong.songHintUsed, true, 'old clients cannot clear song usage');
    assert.equal((await save(alice, { ...progress(), songHintUsed: false }, 'song-hint')).songHintUsed, true, 'explicit false cannot refund song usage');
    for (const songHintUsed of [null, 0, 1, 'true', [], {}]) {
      await assert.rejects(save(alice, { ...progress(), songHintUsed }, 'invalid-song-hint'), { code: '23514' });
    }
    await role(bob);
    assert.equal(await load(bob, 'song-hint'), null, 'song usage belongs to its account');
  } finally { await db.close(); }
});
