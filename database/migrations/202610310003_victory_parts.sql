begin;

create function public.brodle_valid_victory_notes(notes jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare step jsonb; pitch numeric; previous_pitch numeric; item jsonb;
begin
  if notes is null or jsonb_typeof(notes) <> 'array' then return false; end if;
  if jsonb_array_length(notes) > 512 then return false; end if;
  for step in select value from jsonb_array_elements(notes) loop
    if jsonb_typeof(step) <> 'object' or not(step ? 'midi') or not(step ? 'beats') or jsonb_typeof(step->'beats') <> 'number' then return false; end if;
    if (step->>'beats')::numeric not in (0.25,0.375,0.5,0.75,1,1.5,2,3,4,6) then return false; end if;
    if jsonb_typeof(step->'midi') <> 'null' then
      if jsonb_typeof(step->'midi') <> 'number' then return false; end if;
      pitch := (step->>'midi')::numeric;
      if pitch < 36 or pitch > 84 or trunc(pitch) <> pitch then return false; end if;
    end if;
    if step ? 'pitches' then
      if jsonb_typeof(step->'pitches') <> 'array' then return false; end if;
      if jsonb_array_length(step->'pitches') not between 2 and 8 then return false; end if;
      if step->'midi' is distinct from step->'pitches'->0 then return false; end if;
      previous_pitch := null;
      for item in select value from jsonb_array_elements(step->'pitches') loop
        if jsonb_typeof(item) <> 'number' then return false; end if;
        pitch := item::text::numeric;
        if pitch < 36 or pitch > 84 or trunc(pitch) <> pitch or (previous_pitch is not null and pitch <= previous_pitch) then return false; end if;
        previous_pitch := pitch;
      end loop;
    end if;
  end loop;
  return true;
end $$;
revoke all on function public.brodle_valid_victory_notes(jsonb) from public;
grant execute on function public.brodle_valid_victory_notes(jsonb) to authenticated;

alter table public.brodle_melodies
  drop constraint brodle_melodies_final_notes_check,
  add constraint brodle_melodies_final_notes_check check(final_notes is null or public.brodle_valid_victory_notes(final_notes)),
  add constraint brodle_challenge_single_notes check(not jsonb_path_exists(notes, '$[*].pitches')),
  add column final_bass_notes jsonb check(final_bass_notes is null or public.brodle_valid_victory_notes(final_bass_notes)),
  add column final_clef text not null default 'treble' check(final_clef in ('treble','bass')),
  add column final_bass_clef text not null default 'bass' check(final_bass_clef in ('treble','bass'));
grant insert(final_bass_notes,final_clef,final_bass_clef), update(final_bass_notes,final_clef,final_bass_clef)
  on public.brodle_melodies to authenticated;

create or replace function public.schedule_brodle_melody(melody_id uuid, play_date date) returns uuid
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
    'finalMelody',coalesce(nullif(m.final_notes,'[]'::jsonb),m.notes),'author',m.author_username, 'finalBass',coalesce(m.final_bass_notes,'[]'::jsonb),
    'finalClef',m.final_clef,'finalBassClef',m.final_bass_clef)) returning id into result;
  if m.status <> 'approved' then update public.brodle_melodies set status = 'approved', reviewed_at = now() where id = m.id; end if;
  return result;
exception when unique_violation then raise exception 'brodle_date_taken';
end $$;

-- Existing scheduled snapshots and ownership/review policies are preserved.
commit;
