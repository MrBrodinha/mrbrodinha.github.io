import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Match the existing schema supplied by the site owner. Auth is a local fixture;
// the migration and RLS smoke script themselves run in real embedded PostgreSQL.
test('existing schema, signup trigger contract and rating ownership policies', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      grant usage on schema public, auth to anon, authenticated;
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
      $$;
      create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null, email_confirmed_at timestamptz);
      create table public.users (
        id uuid primary key references auth.users(id) on delete cascade,
        username text not null check (username ~ '^[A-Za-z0-9_]{3,30}$')
      );
      alter table public.users add column private_note text;
      grant select(private_note) on public.users to public, anon, authenticated;
      create unique index users_username_unique on public.users (lower(username));
      create function public.fixture_signup_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
        begin insert into public.users(id, username) values(new.id, new.raw_user_meta_data ->> 'username'); return new; end;
      $$;
      create trigger fixture_signup after insert on auth.users for each row execute function public.fixture_signup_trigger();
      create table public.redbull (
        id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) > 0),
        flavour text, description text, image_url text, source_url text unique
      );
      create table public.redbull_rating (
        id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
        redbull_id uuid not null references public.redbull(id) on delete restrict,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        rating smallint not null check(rating >= 1 and rating <= 5), opinion text not null default '',
        constraint redbull_rating_user_drink_unique unique(user_id, redbull_id)
      );
      create function public.touch_redbull_rating() returns trigger language plpgsql as $$
        begin new.updated_at = now(); return new; end;
      $$;
      create trigger redbull_rating_updated before update on public.redbull_rating for each row execute function public.touch_redbull_rating();
      -- Simulate legacy broad grants/policies; the new guards must still protect writes.
      alter table public.redbull_rating enable row level security;
      grant all on public.redbull_rating to anon, authenticated;
      create policy legacy_permissive on public.redbull_rating for all using(true) with check(true);
    `);
    const migration = await readFile(new URL('../../database/migrations/202610310001_shared_auth_ratings.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    assert.equal((await db.query("select has_column_privilege('anon', 'public.users', 'private_note', 'SELECT') as allowed")).rows[0].allowed, false, 'legacy column grants must not expose private profile fields');
    await db.exec(`
      insert into auth.users values
      ('11111111-1111-4111-8111-111111111111', '{"username":"Alice"}', now()),
      ('22222222-2222-4222-8222-222222222222', '{"username":"Bob"}', now());
      insert into public.redbull(name, source_url) values('Red Bull', 'https://example.test/drink');
    `);
    assert.equal((await db.query('select count(*)::int as count from public.users')).rows[0].count, 2);
    await assert.rejects(db.exec(`insert into auth.users values ('33333333-3333-4333-8333-333333333333', '{"username":"ALICE"}', now())`), { code: '23505' });
    assert.equal((await db.query('select count(*)::int as count from auth.users')).rows[0].count, 2, 'a conflicting trigger insert must roll back its Auth user');
    await assert.rejects(db.exec(`insert into auth.users values ('33333333-3333-4333-8333-333333333333', '{"username":"bad-name"}', now())`), { code: '23514' });
    const smoke = await readFile(new URL('./fixtures/rating-ownership.sql', import.meta.url), 'utf8');
    await db.exec(smoke);
    assert.equal((await db.query('select count(*)::int as count from public.redbull_rating')).rows[0].count, 0, 'smoke test fixtures must roll back');
    // Exercise the same upsert shape PostgREST uses, under the authenticated role.
    await db.exec(`begin;
      select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
      set local role authenticated;
      insert into public.redbull_rating(user_id, redbull_id, rating, opinion)
        select auth.uid(), id, 4, 'first' from public.redbull limit 1;
      insert into public.redbull_rating(user_id, redbull_id, rating, opinion)
        select auth.uid(), id, 5, 'updated' from public.redbull limit 1
        on conflict(user_id, redbull_id) do update set user_id=excluded.user_id,
          redbull_id=excluded.redbull_id, rating=excluded.rating, opinion=excluded.opinion;
      reset role;
      commit;`);
    assert.deepEqual((await db.query('select rating, opinion from public.redbull_rating')).rows, [{rating:5, opinion:'updated'}]);
  } finally { await db.close(); }
});
