-- Review/run in Supabase SQL Editor before enabling the new frontend.
-- Uses the EXISTING public.users, public.redbull and public.redbull_rating.
-- Preserves the signup trigger, rating range 1–5, UUID keys and updated_at trigger.
-- No profile insertion, copied Auth fields, or new parallel rating table.
begin;

alter table public.users enable row level security;
-- The existing users_username_check validates 3–30 ASCII letters/digits/_ .
create unique index if not exists users_username_unique on public.users (lower(username));

-- Publish only usernames/IDs. Remove legacy table AND column-level privileges.
revoke all on table public.users from public, anon, authenticated;
do $$ declare col record; begin
  for col in select column_name from information_schema.columns where table_schema = 'public' and table_name = 'users' loop
    execute format('revoke all (%I) on table public.users from public, anon, authenticated', col.column_name);
  end loop;
end $$;
grant select (id, username) on table public.users to anon, authenticated;
create policy shared_accounts_read_usernames on public.users
  for select to anon, authenticated using (true);

alter table public.redbull enable row level security;
grant select (id, name, flavour, image_url, source_url) on public.redbull to anon, authenticated;
create policy shared_accounts_read_drinks on public.redbull
  for select to anon, authenticated using (true);

alter table public.redbull_rating enable row level security;
revoke all on table public.redbull_rating from public, anon, authenticated;
do $$ declare col record; begin
  for col in select column_name from information_schema.columns where table_schema = 'public' and table_name = 'redbull_rating' loop
    execute format('revoke all (%I) on table public.redbull_rating from public, anon, authenticated', col.column_name);
  end loop;
end $$;
grant select (id, user_id, redbull_id, rating, opinion, created_at, updated_at)
  on public.redbull_rating to anon, authenticated;
grant insert (user_id, redbull_id, rating, opinion), update (user_id, redbull_id, rating, opinion), delete
  on public.redbull_rating to authenticated;

create policy shared_accounts_read_ratings on public.redbull_rating
  for select to anon, authenticated using (true);
create policy shared_accounts_insert_own_rating on public.redbull_rating
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy shared_accounts_update_own_rating on public.redbull_rating
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy shared_accounts_delete_own_rating on public.redbull_rating
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Restrictive guards preserve ownership even if old permissive policies exist.
create policy shared_accounts_insert_owner_guard on public.redbull_rating as restrictive
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy shared_accounts_update_owner_guard on public.redbull_rating as restrictive
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy shared_accounts_delete_owner_guard on public.redbull_rating as restrictive
  for delete to authenticated using ((select auth.uid()) = user_id);
commit;
