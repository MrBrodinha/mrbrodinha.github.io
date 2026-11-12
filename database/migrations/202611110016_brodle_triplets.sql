-- Store written beats plus positions 1, 2, 3 for complete 3:2 triplets.
-- No existing records or published snapshots are rewritten.
begin;

create or replace function public.brodle_valid_triplets(notes jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare step jsonb; expected integer := 1; position numeric; duration numeric; elapsed numeric := 0;
begin
  if notes is null or jsonb_typeof(notes) <> 'array' then return false; end if;
  for step in select value from jsonb_array_elements(notes) loop
    if jsonb_typeof(step) <> 'object' then return false; end if;
    if step ? 'triplet' then
      if jsonb_typeof(step->'triplet') is distinct from 'number' or jsonb_typeof(step->'beats') is distinct from 'number' then return false; end if;
      if expected = 1 and mod(elapsed,4) <> 0 then return false; end if;
      position := (step->>'triplet')::numeric;
      if position <> expected or position not in (1,2,3) or (step->>'beats')::numeric not in (0.5,1) then return false; end if;
      if expected > 1 and (step->>'beats')::numeric <> duration then return false; end if;
      duration := (step->>'beats')::numeric;
      expected := case when position = 3 then 1 else position::integer + 1 end;
      elapsed := elapsed + (step->>'beats')::numeric * 64;
    elsif expected <> 1 then return false;
    else elapsed := elapsed + (step->>'beats')::numeric * 96;
    end if;
  end loop;
  return expected = 1;
end $$;

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
  return public.brodle_valid_triplets(notes);
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
  return public.brodle_valid_triplets(notes);
end $$;
notify pgrst, 'reload schema';
commit;
