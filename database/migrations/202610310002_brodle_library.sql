begin;

create table public.brodle_admins (
  user_id uuid primary key references public.users(id) on delete cascade
);
alter table public.brodle_admins enable row level security;
revoke all on public.brodle_admins from public, anon, authenticated;

create function public.is_brodle_admin() returns boolean language sql stable
security definer set search_path = '' as $$
  select exists(select 1 from public.brodle_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_brodle_admin() from public;
grant execute on function public.is_brodle_admin() to authenticated;

create function public.brodle_valid_notes(notes jsonb, max_steps integer) returns boolean
language plpgsql immutable set search_path = '' as $$
declare step jsonb; pitch numeric; duration numeric;
begin
  if max_steps is null or max_steps < 1 or max_steps > 512 then return false; end if;
  if notes is null or jsonb_typeof(notes) <> 'array' then return false; end if;
  if jsonb_array_length(notes) > max_steps then return false; end if;
  for step in select value from jsonb_array_elements(notes) loop
    if jsonb_typeof(step) <> 'object' or not (step ? 'midi') or not (step ? 'beats') or jsonb_typeof(step->'beats') <> 'number' then return false; end if;
    duration := (step->>'beats')::numeric;
    if duration not in (0.25,0.375,0.5,0.75,1,1.5,2,3,4,6) then return false; end if;
    if jsonb_typeof(step->'midi') <> 'null' then
      if jsonb_typeof(step->'midi') <> 'number' then return false; end if;
      pitch := (step->>'midi')::numeric;
      if pitch < 48 or pitch > 84 or trunc(pitch) <> pitch then return false; end if;
    end if;
  end loop;
  return true;
end $$;

create table public.brodle_melodies (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.users(id) on delete cascade,
  author_username text not null default '',
  title text not null default '' check(char_length(title) <= 160),
  source text not null default '' check(char_length(source) <= 200),
  hint text not null default '' check(char_length(hint) <= 300),
  bpm integer not null check(bpm between 20 and 400),
  key_signature text not null check(key_signature in ('Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#','Abm','Ebm','Bbm','Fm','Cm','Gm','Dm','Am','Em','Bm','F#m','C#m','G#m','D#m','A#m')),
  time_signature text not null check(time_signature in ('2/4','3/4','4/4','5/4','6/4','7/4','3/8','5/8','6/8','7/8','9/8','12/8','2/2','3/2','4/2','5/16','7/16')),
  notes jsonb not null default '[]' check(public.brodle_valid_notes(notes,256)),
  final_notes jsonb check(final_notes is null or public.brodle_valid_notes(final_notes,512)),
  status text not null default 'draft' check(status in ('draft','submitted','approved','rejected')),
  review_note text not null default '' check(char_length(review_note) <= 1000),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index brodle_melodies_owner_idx on public.brodle_melodies(created_by, updated_at desc);
create index brodle_melodies_status_idx on public.brodle_melodies(status, updated_at desc);

create function public.brodle_melody_stamp() returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select username into new.author_username from public.users where id = new.created_by;
    if new.author_username is null then raise exception 'brodle_profile_missing'; end if;
  else
    if new.id <> old.id or new.created_by <> old.created_by then raise exception 'brodle_not_editable'; end if;
    new.author_username := old.author_username;
    new.created_at := old.created_at;
    if old.status = 'rejected' and new.status = 'rejected' then
      new.status := 'draft'; new.review_note := ''; new.reviewed_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger brodle_melody_stamp before insert or update on public.brodle_melodies
for each row execute function public.brodle_melody_stamp();

alter table public.brodle_melodies enable row level security;
revoke all on public.brodle_melodies from public, anon, authenticated;
grant select on public.brodle_melodies to authenticated;
grant insert(id,created_by,title,source,hint,bpm,key_signature,time_signature,notes,final_notes),
  update(id,created_by,title,source,hint,bpm,key_signature,time_signature,notes,final_notes), delete
  on public.brodle_melodies to authenticated;
create policy brodle_melody_read on public.brodle_melodies for select to authenticated
using(created_by = (select auth.uid()) or (status <> 'draft' and (select public.is_brodle_admin())));
create policy brodle_melody_insert on public.brodle_melodies for insert to authenticated
with check(created_by = (select auth.uid()) and status = 'draft');
create policy brodle_melody_update on public.brodle_melodies for update to authenticated
using(created_by = (select auth.uid()) and status in ('draft','rejected'))
with check(created_by = (select auth.uid()) and status = 'draft');
create policy brodle_melody_delete on public.brodle_melodies for delete to authenticated
using(created_by = (select auth.uid()) and status in ('draft','rejected'));

create function public.submit_brodle_melody(melody_id uuid) returns uuid language plpgsql
security definer set search_path = '' as $$
declare m public.brodle_melodies;
begin
  select * into m from public.brodle_melodies where id = melody_id and created_by = (select auth.uid()) for update;
  if not found or m.status not in ('draft','rejected') then raise exception 'brodle_not_editable'; end if;
  if length(btrim(m.title)) = 0 then raise exception 'brodle_title_required'; end if;
  if not exists(select 1 from jsonb_array_elements(m.notes) n where n->'midi' <> 'null'::jsonb) then raise exception 'brodle_notes_required'; end if;
  update public.brodle_melodies set status = 'submitted', submitted_at = now(), reviewed_at = null, review_note = '' where id = melody_id;
  return melody_id;
end $$;

create function public.review_brodle_melody(melody_id uuid, decision text, note text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_brodle_admin() then raise exception 'brodle_admin_required'; end if;
  if decision not in ('approved','rejected') or char_length(note) > 1000 then raise exception 'brodle_invalid_review'; end if;
  update public.brodle_melodies set status = decision, review_note = note, reviewed_at = now()
    where id = melody_id and status = 'submitted';
  if not found then raise exception 'brodle_not_editable'; end if;
  return melody_id;
end $$;

create table public.brodle_daily_challenges (
  id uuid primary key default gen_random_uuid(),
  play_date date not null unique,
  melody_id uuid not null references public.brodle_melodies(id) on delete restrict,
  snapshot jsonb not null,
  scheduled_by uuid not null references public.users(id) on delete restrict,
  scheduled_at timestamptz not null default now()
);
alter table public.brodle_daily_challenges enable row level security;
revoke all on public.brodle_daily_challenges from public, anon, authenticated;
grant select on public.brodle_daily_challenges to authenticated;
create policy brodle_schedule_admin_read on public.brodle_daily_challenges for select to authenticated
using((select public.is_brodle_admin()));

create function public.schedule_brodle_melody(melody_id uuid, play_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare m public.brodle_melodies; result uuid; today date := (now() at time zone 'Europe/Lisbon')::date;
begin
  if not public.is_brodle_admin() then raise exception 'brodle_admin_required'; end if;
  if play_date is null or play_date < today then raise exception 'brodle_date_past'; end if;
  select * into m from public.brodle_melodies where id = melody_id for update;
  if not found then raise exception 'brodle_not_found'; end if;
  if not (m.status = 'approved' or (m.created_by = auth.uid() and m.status in ('draft','rejected'))) then raise exception 'brodle_not_approved'; end if;
  if length(btrim(m.title)) = 0 then raise exception 'brodle_title_required'; end if;
  if not exists(select 1 from jsonb_array_elements(m.notes) n where n->'midi' <> 'null'::jsonb) then raise exception 'brodle_notes_required'; end if;
  insert into public.brodle_daily_challenges(play_date, melody_id, scheduled_by, snapshot)
  values(play_date, m.id, auth.uid(), jsonb_build_object('title',m.title,'source',m.source,'hint',m.hint,
    'bpm',m.bpm,'key',m.key_signature,'timeSignature',m.time_signature,'melody',m.notes,
    'finalMelody',coalesce(nullif(m.final_notes,'[]'::jsonb),m.notes),'author',m.author_username)) returning id into result;
  if m.status <> 'approved' then update public.brodle_melodies set status = 'approved', reviewed_at = now() where id = m.id; end if;
  return result;
exception when unique_violation then raise exception 'brodle_date_taken';
end $$;

create function public.reschedule_brodle_challenge(challenge_id uuid, new_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare old_date date; today date := (now() at time zone 'Europe/Lisbon')::date;
begin
  if not public.is_brodle_admin() then raise exception 'brodle_admin_required'; end if;
  if new_date is null or new_date < today then raise exception 'brodle_date_past'; end if;
  select play_date into old_date from public.brodle_daily_challenges where id = challenge_id for update;
  if not found then raise exception 'brodle_not_found'; end if;
  if old_date <= today then raise exception 'brodle_published_locked'; end if;
  update public.brodle_daily_challenges set play_date = new_date where id = challenge_id;
exception when unique_violation then raise exception 'brodle_date_taken';
end $$;

create function public.cancel_brodle_challenge(challenge_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_brodle_admin() then raise exception 'brodle_admin_required'; end if;
  delete from public.brodle_daily_challenges where id = challenge_id and play_date > (now() at time zone 'Europe/Lisbon')::date;
  if not found then raise exception 'brodle_published_locked'; end if;
end $$;

-- The public API resolves time on the server and never returns future schedules.
-- A gap keeps the last published challenge and its original date/identity.
create function public.get_daily_brodle() returns jsonb language sql stable
security definer set search_path = '' as $$
  select jsonb_build_object('today',(now() at time zone 'Europe/Lisbon')::date,
    'serverNow',now(), 'nextChangeAt', (((now() at time zone 'Europe/Lisbon')::date + 1)::timestamp at time zone 'Europe/Lisbon'),
    'challenge',(select jsonb_build_object('id',id,'playDate',play_date,'snapshot',snapshot)
      from public.brodle_daily_challenges where play_date <= (now() at time zone 'Europe/Lisbon')::date order by play_date desc limit 1));
$$;

revoke all on function public.brodle_valid_notes(jsonb,integer), public.brodle_melody_stamp(), public.submit_brodle_melody(uuid),
  public.review_brodle_melody(uuid,text,text), public.schedule_brodle_melody(uuid,date),
  public.reschedule_brodle_challenge(uuid,date), public.cancel_brodle_challenge(uuid), public.get_daily_brodle() from public;
grant execute on function public.brodle_valid_notes(jsonb,integer), public.submit_brodle_melody(uuid), public.review_brodle_melody(uuid,text,text),
  public.schedule_brodle_melody(uuid,date), public.reschedule_brodle_challenge(uuid,date), public.cancel_brodle_challenge(uuid) to authenticated;
grant execute on function public.get_daily_brodle() to anon, authenticated;
commit;
