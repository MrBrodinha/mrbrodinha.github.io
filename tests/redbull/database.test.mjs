import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const alice='11111111-1111-4111-8111-111111111111', bob='22222222-2222-4222-8222-222222222222', mallory='33333333-3333-4333-8333-333333333333';
const drinkId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', uploadId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const uploadPath=alice+'/'+uploadId+'/'+'a'.repeat(64)+'.png';

test('private two-account access, atomic entries, ownership, uploads and revocation', async () => {
  const db=new PGlite();
  const role=async(id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(id?{sub:id,role:'authenticated'}:{role:'anon'})]);await db.exec('set role '+(id?'authenticated':'anon'));};
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const values=(overrides={})=>({p_id:drinkId,p_name:'  New Summer Edition  ',p_flavour:'  Citrus ',p_source_url:'https://example.test/new',p_image_url:'https://example.test/image.png',p_image_path:null,p_rating:4,p_opinion:'  Delicious!  ',...overrides});
  let legacyEntryRpc=true;
  const create=async(input=values())=>{
    const params=Object.values(input);
    if(legacyEntryRpc)params.splice(3,0,'A regional edition');
    return scalar('select public.create_redbull_entry('+params.map((_,index)=>'$'+(index+1)).join(',')+')',params);
  };
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
      grant usage on schema public,auth,storage to anon,authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null);
      create table public.users(id uuid primary key references auth.users(id) on delete cascade,username text not null check(username~'^[A-Za-z0-9_]{3,30}$'));
      create function public.signup_fixture() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.users(id,username)values(new.id,new.raw_user_meta_data->>'username');return new;end $$;
      create trigger signup_fixture after insert on auth.users for each row execute function public.signup_fixture();
      create table public.redbull(id uuid primary key default gen_random_uuid(),name text not null check(length(btrim(name))>0),flavour text,description text,image_url text,source_url text unique);
      create table public.redbull_rating(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.users(id)on delete cascade,redbull_id uuid not null references public.redbull(id)on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),rating smallint not null check(rating between 1 and 5),opinion text not null default '',unique(user_id,redbull_id));
      create function public.rating_fixture()returns trigger language plpgsql as $$begin new.updated_at=now();if new.opinion='FORCE_FAILURE' then raise exception 'forced_rating_failure';end if;return new;end$$;
      create trigger rating_fixture before insert or update on public.redbull_rating for each row execute function public.rating_fixture();
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
      create function storage.foldername(name text)returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to anon,authenticated;
      create policy old_storage_access on storage.objects for all using(true) with check(true);
    `);
    await db.exec(await readFile(new URL('../../database/migrations/202610310001_shared_auth_ratings.sql',import.meta.url),'utf8'));
    await db.exec(`create policy old_drink_access on public.redbull for all using(true)with check(true);create policy old_rating_access on public.redbull_rating for all using(true)with check(true);grant insert(name),update(name)on public.redbull to authenticated;`);
    await db.exec(await readFile(new URL('../../database/migrations/202610310006_redbull_private_entries.sql',import.meta.url),'utf8'));
    await db.query('insert into auth.users values($1,$2),($3,$4),($5,$6)',[alice,{username:'Alice'},bob,{username:'Bob'},mallory,{username:'Mallory',redbull_enabled:true,redbull_access_slot:1}]);
    assert.equal(await scalar('select count(*)::int from public.users where redbull_enabled'),0,'signup never enables Red Bull automatically');
    await db.exec(`update public.users set redbull_enabled=true where id in('${alice}','${bob}')`);
    assert.equal(await scalar('select count(distinct redbull_access_slot)::int from public.users'),2);
    await assert.rejects(db.query('update public.users set redbull_enabled=true where id=$1',[mallory]),/redbull_two_user_limit/);
    await db.query('update public.users set redbull_enabled=false where id=$1',[alice]);
    await db.query('update public.users set redbull_enabled=true where id=$1',[mallory]);
    await db.query('update public.users set redbull_enabled=false where id=$1',[mallory]);
    await db.query('update public.users set redbull_enabled=true where id=$1',[alice]);
    const bucket=(await db.query('select * from storage.buckets')).rows[0];
    assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,5242880);assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp','image/gif']);
    await role(null);assert.equal(await scalar('select public.can_use_redbull()'),false);
    assert.deepEqual((await db.query('select id,username from public.users')).rows.map(row=>row.username).sort(),['Alice','Bob','Mallory']);
    await assert.rejects(db.query('select redbull_enabled from public.users'),{code:'42501'});
    await role(mallory);assert.equal(await scalar('select public.can_use_redbull()'),false);
    await assert.rejects(db.query('update public.users set redbull_enabled=true where id=$1',[mallory]),{code:'42501'});
    await assert.rejects(db.query('update public.users set redbull_access_slot=1 where id=$1',[mallory]),{code:'42501'});
    await assert.rejects(create(),{code:'42501'});
    await role(alice);assert.equal(await scalar('select public.can_use_redbull()'),true);
    await assert.rejects(db.query("insert into public.redbull(name)values('Direct API write')"),{code:'42501'});
    const first=await create();assert.equal(first.drink.name,'New Summer Edition');assert.equal(first.drink.created_by,alice);assert.deepEqual(first.rating,{rating:4,opinion:'Delicious!'});
    assert.deepEqual(await create(),first,'the same request can be retried without a duplicate');
    assert.equal(await scalar('select count(*)::int from public.redbull'),1);assert.equal(await scalar('select count(*)::int from public.redbull_rating'),1);
    // Upgrade an existing installation without changing its saved scores/access.
    await db.exec('reset role');
    await db.exec(await readFile(new URL('../../database/migrations/202611010007_redbull_rating_scale.sql',import.meta.url),'utf8'));
    const legacyMissing=crypto.randomUUID(),legacyBlank=crypto.randomUUID();
    await db.query("insert into public.redbull(id,name,flavour,description)values($1,'Legacy missing flavour',null,'Removed description'),($2,'Legacy blank flavour',$3,'Removed description')",[legacyMissing,legacyBlank,'\t \n']);
    await db.exec(await readFile(new URL('../../database/migrations/202611010009_redbull_required_flavour.sql',import.meta.url),'utf8'));
    legacyEntryRpc=false;
    assert.equal(await scalar("select count(*)::int from information_schema.columns where table_schema='public' and table_name='redbull' and column_name='description'"),0,'description column is removed');
    assert.equal(await scalar("select is_nullable from information_schema.columns where table_schema='public' and table_name='redbull' and column_name='flavour'"),'NO');
    assert.deepEqual((await db.query('select flavour from public.redbull where id in($1,$2)',[legacyMissing,legacyBlank])).rows,[{flavour:'Unknown flavour'},{flavour:'Unknown flavour'}]);
    await db.query('delete from public.redbull where id in($1,$2)',[legacyMissing,legacyBlank]);
    assert.equal(await scalar("select to_regprocedure('public.create_redbull_entry(uuid,text,text,text,text,text,text,smallint,text)')"),null,'obsolete description RPC signature is removed');
    assert.equal(await scalar("select has_function_privilege('anon','public.create_redbull_entry(uuid,text,text,text,text,text,smallint,text)','execute')"),false);
    await assert.rejects(db.query('update public.redbull set flavour=null where id=$1',[drinkId]),{code:'23502'});
    for(const blank of ['', '   ', '\t \n'])await assert.rejects(db.query('update public.redbull set flavour=$1 where id=$2',[blank,drinkId]),{code:'23514'});
    await role(alice);
    const {description,...preservedDrink}=first.drink;
    assert.equal(description,'A regional edition');
    assert.deepEqual(await create(),{...first,drink:preservedDrink},'upgrade preserves existing drink metadata, reviews and idempotent retries');
    assert.equal(await scalar('select rating from public.redbull_rating where redbull_id=$1',[drinkId]),4);
    assert.equal(await scalar('select public.can_use_redbull()'),true);
    // Reproduce a partially upgraded live database: new entry RPC, old scale.
    await db.exec('reset role');
    await db.exec('alter table public.redbull_rating drop constraint redbull_rating_rating_check, add constraint redbull_rating_rating_check check(rating between 1 and 5)');
    await role(alice);
    const retryId=crypto.randomUUID();
    await assert.rejects(create(values({p_id:retryId,p_rating:9,p_source_url:null})),{code:'23514'});
    assert.equal(await scalar('select count(*)::int from public.redbull where id=$1',[retryId]),0,'rejected first review leaves no partial drink');
    await db.exec('reset role');
    await db.exec(await readFile(new URL('../../database/migrations/202611010010_redbull_rating_constraint.sql',import.meta.url),'utf8'));
    assert.equal(await scalar("select count(*)::int from information_schema.columns where table_schema='public' and table_name='redbull' and column_name='description'"),0,'rating repair keeps the current description-free schema');
    await role(alice);
    await db.exec('begin');
    const repaired=await create(values({p_id:retryId,p_rating:9,p_source_url:null}));
    assert.equal(repaired.rating.rating,9,'retrying the same drink succeeds after repairing the scale');
    assert.deepEqual(await create(values({p_id:retryId,p_rating:9,p_source_url:null})),repaired,'repaired retries remain idempotent');
    assert.equal(await scalar('select rating from public.redbull_rating where redbull_id=$1',[drinkId]),4,'existing ratings survive the repair');
    await db.exec('rollback');
    await db.exec('begin');
    for(const score of [0,10]) {
      const boundary=await create(values({p_id:crypto.randomUUID(),p_name:'Boundary '+score,p_rating:score,p_source_url:'  '}));
      assert.equal(boundary.rating.rating,score);assert.equal(boundary.drink.source_url,null,'source link stays optional');
      await db.query('update public.redbull_rating set rating=$1 where redbull_id=$2',[score,drinkId]);
      assert.equal(await scalar('select rating from public.redbull_rating where redbull_id=$1',[drinkId]),score);
    }
    await db.exec('rollback');
    for(const score of [-1,11])await assert.rejects(db.query('update public.redbull_rating set rating=$1 where redbull_id=$2',[score,drinkId]),{code:'23514'});

    await assert.rejects(create(values({p_name:'Changed'})),/redbull_entry_already_created/);
    for(const invalid of [{p_rating:-1},{p_rating:11},{p_name:' '},{p_flavour:null},{p_flavour:''},{p_flavour:'  '},{p_flavour:'\t \n'},{p_flavour:'x'.repeat(201)},{p_image_url:'javascript:alert(1)'},{p_source_url:'https://user:password@example.test/'},{p_name:'x'.repeat(161)}])await assert.rejects(create(values({p_id:crypto.randomUUID(),p_source_url:null,...invalid})),{code:'22023'});
    await assert.rejects(create(values({p_id:crypto.randomUUID(),p_opinion:'FORCE_FAILURE',p_source_url:null})),/forced_rating_failure/);
    assert.equal(await scalar('select count(*)::int from public.redbull'),1,'a failed first rating rolls back the new drink');
    await assert.rejects(create(values({p_id:crypto.randomUUID()})),/redbull_duplicate_source/);
    await role(bob);
    assert.equal(await scalar('select count(*)::int from public.redbull'),1);
    assert.equal((await db.query('update public.redbull_rating set rating=1 where user_id=$1 returning id',[alice])).rows.length,0);
    assert.equal((await db.query('delete from public.redbull_rating where user_id=$1 returning id',[alice])).rows.length,0);
    await assert.rejects(db.query('insert into public.redbull_rating(user_id,redbull_id,rating)values($1,$2,1)',[alice,drinkId]),{code:'42501'});
    await db.query('insert into public.redbull_rating(redbull_id,rating,opinion)values($1,5,$2)',[drinkId,'My own review']);
    assert.equal((await db.query('delete from public.redbull_rating where user_id=$1 returning id',[bob])).rows.length,1);
    await assert.rejects(db.query('update public.redbull set name=$1 where id=$2',['Changed catalog',drinkId]),{code:'42501'});
    await role(alice);
    await db.query('update public.redbull_rating set rating=5 where redbull_id=$1',[drinkId]);
    await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['redbull-images',uploadPath]);
    assert.equal((await db.query('update storage.objects set name=$1 where name=$2 returning id',[uploadPath+'overwrite',uploadPath])).rows.length,0,'stored images cannot be overwritten');
    await role(bob);
    assert.equal(await scalar('select count(*)::int from storage.objects'),1,'both enabled accounts can read uploaded images');
    await assert.rejects(db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['redbull-images',alice+'/forged.png']),{code:'42501'});
    assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[uploadPath])).rows.length,0);
    await assert.rejects(create(values({p_id:uploadId,p_source_url:null,p_image_url:null,p_image_path:uploadPath})),/redbull_invalid_upload/);
    await role(alice);
    const uploaded=await create(values({p_id:uploadId,p_source_url:null,p_image_url:null,p_image_path:uploadPath}));assert.equal(uploaded.drink.image_path,uploadPath);
    assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[uploadPath])).rows.length,0,'cleanup cannot remove a committed image');
    const orphan=alice+'/orphan.png';await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['redbull-images',orphan]);assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[orphan])).rows.length,1);
    await db.exec('reset role');await db.query('update public.users set redbull_enabled=false where id=$1',[alice]);
    for(const actor of [null,alice,mallory]){
      await role(actor);assert.equal(await scalar('select public.can_use_redbull()'),false);
      assert.equal(await scalar('select count(*)::int from public.redbull'),0);assert.equal(await scalar('select count(*)::int from public.redbull_rating'),0);assert.equal(await scalar('select count(*)::int from storage.objects'),0);
      if(actor){await assert.rejects(create(),{code:'42501'});await assert.rejects(db.query('insert into public.redbull_rating(redbull_id,rating)values($1,3)',[drinkId]),{code:'42501'});await assert.rejects(db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['redbull-images',actor+'/blocked.png']),{code:'42501'});}
    }
    await role(bob);assert.equal(await scalar('select count(*)::int from public.redbull'),2,'revocation preserves the catalog and existing reviews');
  }finally{await db.close();}
});
