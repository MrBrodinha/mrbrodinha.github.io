import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const alice='11111111-1111-4111-8111-111111111111';
const bob='22222222-2222-4222-8222-222222222222';
const target=[60,64];
const progress=(attempts=[],guess=[],attemptIds=attempts.map((_,index)=>`attempt-${index}`))=>({attempts,guess,attemptIds,selectedAttempt:Math.max(0,attempts.length-1)});

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
    await role(alice);
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
    await role(bob);
    assert.deepEqual(await load(bob),bobs,'another user’s progress remains untouched');
    for (const invalid of [
      {...progress(),guess:[30]}, {...progress(),guess:[104]}, {...progress(),guess:[60,64,67]},
      {...progress(),guess:[60.5]}, {...progress(),selectedAttempt:1}, {...progress(),selectedAttempt:null},
      progress([[60]],[],['short']), progress([[60,64]],[],[]), progress([[59,64],[58,64]],[],['same','same']),
      {...progress(),attempts:null}, {...progress(),guess:null}, progress([[59,64]],[],['bad id']),
    ]) await assert.rejects(save(bob,invalid),{code:'23514'});
    for (const invalidTarget of [[],[30],[104],Array(257).fill(60)]) await assert.rejects(save(bob,progress(),'invalid',invalidTarget),{code:'23514'});
    const boundaries=progress([[31,103]],[],['limits']);
    assert.deepEqual(await save(bob,boundaries,'boundaries',[31,103]),boundaries);
  } finally { await db.close(); }
});
