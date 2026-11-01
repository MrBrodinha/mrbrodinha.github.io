-- Local historical ownership fixture, loaded by tests/auth/database.test.mjs.
-- Run through npm test; never run fixture writes against the live database.
-- All fixture writes, including constraint probes, are rolled back.
begin;
do $$ begin
  if (select count(*) from public.users u join auth.users a using (id) where a.email_confirmed_at is not null) < 2 then
    raise exception 'Create and confirm two test accounts before running this script';
  end if;
  if not exists (select 1 from public.redbull) then raise exception 'Add at least one catalog drink first'; end if;
end $$;
select set_config('test.drink', (select id::text from public.redbull order by id limit 1), true);
select set_config('test.actor_a', (select u.id::text from public.users u join auth.users a using(id) where a.email_confirmed_at is not null order by u.id limit 1), true);
select set_config('test.actor_b', (select u.id::text from public.users u join auth.users a using(id) where a.email_confirmed_at is not null order by u.id offset 1 limit 1), true);

do $$ begin
  begin
    update public.users set username = upper((select username from public.users where id = current_setting('test.actor_a')::uuid)) where id = current_setting('test.actor_b')::uuid;
    raise exception 'FAIL: usernames are not case-insensitively unique';
  exception when unique_violation then null; end;
  begin
    update public.users set username = 'bad-name' where id = current_setting('test.actor_b')::uuid;
    raise exception 'FAIL: invalid username was accepted';
  exception when check_violation then null; end;
end $$;

-- Fixtures use an existing catalog UUID; rollback restores any previous rows.
delete from public.redbull_rating where redbull_id = current_setting('test.drink')::uuid;
insert into public.redbull_rating(user_id, redbull_id, rating, opinion)
values (current_setting('test.actor_b')::uuid, current_setting('test.drink')::uuid, 3, 'B fixture');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.actor_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.redbull_rating(user_id, redbull_id, rating, opinion)
values (current_setting('test.actor_a')::uuid, current_setting('test.drink')::uuid, 4, 'A fixture');

do $$ declare affected integer; begin
  if (select count(*) from public.redbull_rating where redbull_id = current_setting('test.drink')::uuid) <> 2 then raise exception 'FAIL: comparison results not readable'; end if;
  begin
    insert into public.redbull_rating(user_id, redbull_id, rating, opinion) values (current_setting('test.actor_b')::uuid, current_setting('test.drink')::uuid, 4, 'forged');
    raise exception 'FAIL: insert for another user succeeded';
  exception when insufficient_privilege then null; end;
  update public.redbull_rating set rating = 1 where user_id = current_setting('test.actor_b')::uuid and redbull_id = current_setting('test.drink')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: update of another user succeeded'; end if;
  delete from public.redbull_rating where user_id = current_setting('test.actor_b')::uuid and redbull_id = current_setting('test.drink')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: delete of another user succeeded'; end if;
  begin
    update public.redbull_rating set user_id = current_setting('test.actor_b')::uuid, redbull_id = current_setting('test.drink')::uuid where user_id = current_setting('test.actor_a')::uuid and redbull_id = current_setting('test.drink')::uuid;
    raise exception 'FAIL: ownership transfer succeeded';
  exception when insufficient_privilege then null; end;
  update public.redbull_rating set rating = 5 where user_id = current_setting('test.actor_a')::uuid and redbull_id = current_setting('test.drink')::uuid;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: own update denied'; end if;
  delete from public.redbull_rating where user_id = current_setting('test.actor_a')::uuid and redbull_id = current_setting('test.drink')::uuid;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: own delete denied'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  perform id, username from public.users limit 1;
  perform user_id, redbull_id, rating, opinion from public.redbull_rating limit 1;
  begin
    insert into public.redbull_rating(user_id, redbull_id, rating, opinion) values (current_setting('test.actor_a')::uuid, current_setting('test.drink')::uuid, 5, 'guest');
    raise exception 'FAIL: guest write succeeded';
  exception when insufficient_privilege then null; end;
  begin
    execute 'select email from public.users limit 1';
    raise exception 'FAIL: profile email is exposed';
  exception when insufficient_privilege or undefined_column then null; end;
end $$;
reset role;
rollback;
