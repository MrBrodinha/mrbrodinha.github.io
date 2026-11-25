-- Optional expressive note metadata; existing rows/snapshots remain unchanged.
begin;
create function public.brodle_valid_expressions(notes jsonb, chords boolean) returns boolean
language plpgsql immutable set search_path = '' as $$
declare step jsonb; following jsonb; pitch jsonb; previous numeric; current_pitches jsonb; next_pitches jsonb; i integer;
begin
  if jsonb_typeof(notes) is distinct from 'array' then return false; end if;
  for i in 0..jsonb_array_length(notes)-1 loop
    step := notes->i; following := notes->(i+1);
    if not chords and step ? 'pitches' then return false; end if;
    current_pitches := case when step ? 'pitches' then step->'pitches' when step->'midi' <> 'null'::jsonb then jsonb_build_array(step->'midi') else '[]'::jsonb end;
    next_pitches := case when following ? 'pitches' then following->'pitches' when following->'midi' <> 'null'::jsonb then jsonb_build_array(following->'midi') else '[]'::jsonb end;
    if step ? 'staccato' and (jsonb_typeof(step->'staccato') is distinct from 'boolean' or jsonb_array_length(current_pitches)=0) then return false; end if;
    if step ? 'arpeggio' and (jsonb_typeof(step->'arpeggio') is distinct from 'string' or step->>'arpeggio' not in ('up','down') or jsonb_array_length(current_pitches)<2) then return false; end if;
    if step ? 'tieToNext' then
      if jsonb_typeof(step->'tieToNext') is distinct from 'array' then return false; end if;
      if jsonb_array_length(step->'tieToNext') not between 1 and 8 then return false; end if;
      previous := null;
      for pitch in select value from jsonb_array_elements(step->'tieToNext') loop
        if jsonb_typeof(pitch) is distinct from 'number' then return false; end if;
        if trunc(pitch::text::numeric) <> pitch::text::numeric or (previous is not null and pitch::text::numeric<=previous) then return false; end if;
        if not(current_pitches @> jsonb_build_array(pitch)) or not(next_pitches @> jsonb_build_array(pitch)) then return false; end if;
        previous := pitch::text::numeric;
      end loop;
    end if;
  end loop;
  return true;
end $$;
revoke all on function public.brodle_valid_expressions(jsonb,boolean) from public;
grant execute on function public.brodle_valid_expressions(jsonb,boolean) to authenticated;
create or replace function public.brodle_valid_notes(notes jsonb, max_steps integer) returns boolean
language plpgsql immutable set search_path = '' as $$
declare step jsonb; pitch numeric; duration numeric;
begin
  if max_steps is null or max_steps < 1 or max_steps > 512 then return false; end if;
  if notes is null or jsonb_typeof(notes) <> 'array' then return false; end if;
  if jsonb_array_length(notes) > max_steps then return false; end if;
  for step in select value from jsonb_array_elements(notes) loop
    if jsonb_typeof(step) <> 'object' or not (step ? 'midi') or not (step ? 'beats') or jsonb_typeof(step->'beats') <> 'number' then return false; end if;
    duration := (step->>'beats')::numeric;
    if duration not in (0.125,0.1875,0.25,0.375,0.5,0.75,1,1.5,2,3,4,6) then return false; end if;
    if jsonb_typeof(step->'midi') <> 'null' then
      if jsonb_typeof(step->'midi') <> 'number' then return false; end if;
      pitch := (step->>'midi')::numeric;
      if pitch < 31 or pitch > 103 or trunc(pitch) <> pitch then return false; end if;
    end if;
  end loop;
  return public.brodle_valid_triplets(notes) and public.brodle_valid_expressions(notes,false);
end $$;

create or replace function public.brodle_valid_victory_notes(notes jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare step jsonb; pitch numeric; previous_pitch numeric; item jsonb;
begin
  if notes is null or jsonb_typeof(notes) <> 'array' then return false; end if;
  if jsonb_array_length(notes) > 512 then return false; end if;
  for step in select value from jsonb_array_elements(notes) loop
    if jsonb_typeof(step) <> 'object' or not(step ? 'midi') or not(step ? 'beats') or jsonb_typeof(step->'beats') <> 'number' then return false; end if;
    if (step->>'beats')::numeric not in (0.125,0.1875,0.25,0.375,0.5,0.75,1,1.5,2,3,4,6) then return false; end if;
    if jsonb_typeof(step->'midi') <> 'null' then
      if jsonb_typeof(step->'midi') <> 'number' then return false; end if;
      pitch := (step->>'midi')::numeric;
      if pitch < 31 or pitch > 103 or trunc(pitch) <> pitch then return false; end if;
    end if;
    if step ? 'pitches' then
      if jsonb_typeof(step->'pitches') <> 'array' then return false; end if;
      if jsonb_array_length(step->'pitches') not between 2 and 8 then return false; end if;
      if step->'midi' is distinct from step->'pitches'->0 then return false; end if;
      previous_pitch := null;
      for item in select value from jsonb_array_elements(step->'pitches') loop
        if jsonb_typeof(item) <> 'number' then return false; end if;
        pitch := item::text::numeric;
        if pitch < 31 or pitch > 103 or trunc(pitch) <> pitch or (previous_pitch is not null and pitch <= previous_pitch) then return false; end if;
        previous_pitch := pitch;
      end loop;
    end if;
  end loop;
  return public.brodle_valid_triplets(notes) and public.brodle_valid_expressions(notes,true);
end $$;
notify pgrst, 'reload schema';
commit;
