-- Extend authored notes and chords to G1–G7 (MIDI 31–103).
-- Existing rows, snapshots, function grants, and RLS policies are preserved.
begin;

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
    if duration not in (0.25,0.375,0.5,0.75,1,1.5,2,3,4,6) then return false; end if;
    if jsonb_typeof(step->'midi') <> 'null' then
      if jsonb_typeof(step->'midi') <> 'number' then return false; end if;
      pitch := (step->>'midi')::numeric;
      if pitch < 31 or pitch > 103 or trunc(pitch) <> pitch then return false; end if;
    end if;
  end loop;
  return true;
end $$;

create or replace function public.brodle_valid_victory_notes(notes jsonb) returns boolean
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
  return true;
end $$;
commit;
