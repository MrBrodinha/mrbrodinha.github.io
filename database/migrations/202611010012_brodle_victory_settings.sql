begin;

-- Null settings preserve the original shared tempo/key on existing melodies.
alter table public.brodle_melodies
  add column final_bpm integer check(final_bpm between 20 and 400),
  add column final_key_signature text check(final_key_signature in (
    'Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#',
    'Abm','Ebm','Bbm','Fm','Cm','Gm','Dm','Am','Em','Bm','F#m','C#m','G#m','D#m','A#m'));
grant insert(final_bpm,final_key_signature), update(final_bpm,final_key_signature)
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
    'finalBpm',coalesce(m.final_bpm,m.bpm),'finalKey',coalesce(m.final_key_signature,m.key_signature),
    'finalMelody',coalesce(nullif(m.final_notes,'[]'::jsonb),m.notes),'author',m.author_username,
    'finalBass',coalesce(m.final_bass_notes,'[]'::jsonb),'finalClef',m.final_clef,'finalBassClef',m.final_bass_clef)) returning id into result;
  if m.status <> 'approved' then update public.brodle_melodies set status = 'approved', reviewed_at = now() where id = m.id; end if;
  return result;
exception when unique_violation then raise exception 'brodle_date_taken';
end $$;

-- Published snapshots remain unchanged; clients inherit their original settings.
notify pgrst, 'reload schema';
commit;
