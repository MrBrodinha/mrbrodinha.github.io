begin;

create or replace function public.brodle_valid_progress(target_notes integer[], progress jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare part jsonb; note jsonb; item jsonb; position bigint; attempt_count integer;
  selected numeric; pitch numeric; ids jsonb := '{}'::jsonb; attempt_id text;
  hints numeric; used numeric; hint_index integer;
begin
  if target_notes is null or coalesce(array_ndims(target_notes),0) <> 1
    or array_lower(target_notes,1) <> 1 or cardinality(target_notes) not between 1 and 256
    or exists(select 1 from unnest(target_notes) n where n is null or n not between 31 and 103) then return false; end if;
  if jsonb_typeof(progress) is distinct from 'object' or pg_column_size(progress) > 1048576
    or jsonb_typeof(progress->'attempts') is distinct from 'array'
    or jsonb_typeof(progress->'attemptIds') is distinct from 'array'
    or jsonb_typeof(progress->'guess') is distinct from 'array'
    or jsonb_typeof(progress->'selectedAttempt') is distinct from 'number' then return false; end if;
  attempt_count := jsonb_array_length(progress->'attempts');
  if jsonb_array_length(progress->'attemptIds') <> attempt_count then return false; end if;
  selected := (progress->>'selectedAttempt')::numeric;
  if selected <> trunc(selected) or selected < 0 or selected >= greatest(1,attempt_count) then return false; end if;
  if jsonb_typeof(coalesce(progress->'hintsUsed','0'::jsonb)) <> 'number' then return false; end if;
  hints := coalesce((progress->>'hintsUsed')::numeric,0);
  if hints <> trunc(hints) or hints < 0 or hints > cardinality(target_notes)/2 then return false; end if;
  if progress ? 'attemptHints' then
    if jsonb_typeof(progress->'attemptHints') <> 'array' then return false; end if;
    if jsonb_array_length(progress->'attemptHints') <> attempt_count then return false; end if;
  end if;
  for item in select value from jsonb_array_elements(progress->'attemptIds') loop
    if jsonb_typeof(item) <> 'string' then return false; end if;
    attempt_id := item #>> '{}';
    if char_length(attempt_id) not between 1 and 1500 or attempt_id !~ '^[A-Za-z0-9:-]+$' or ids ? attempt_id then return false; end if;
    ids := ids || jsonb_build_object(attempt_id,true);
  end loop;
  for part,position in select value,ordinality from jsonb_array_elements((progress->'attempts') || jsonb_build_array(progress->'guess')) with ordinality loop
    if jsonb_typeof(part) <> 'array' then return false; end if;
    if (position <= attempt_count and jsonb_array_length(part) <> cardinality(target_notes))
      or jsonb_array_length(part) > cardinality(target_notes) then return false; end if;
    for note in select value from jsonb_array_elements(part) loop
      if jsonb_typeof(note) <> 'number' then return false; end if;
      pitch := note::text::numeric;
      if pitch <> trunc(pitch) or pitch not between 31 and 103 then return false; end if;
    end loop;
    if position <= attempt_count then
      item := coalesce(progress->'attemptHints'->(position::integer-1),'0'::jsonb);
      if jsonb_typeof(item) <> 'number' then return false; end if;
      used := item::text::numeric;
      if used <> trunc(used) or used < 0 or used > hints then return false; end if;
    else
      used := case when jsonb_array_length(part) = 0 then 0 else hints end;
      if jsonb_array_length(part) > 0 and jsonb_array_length(part) < used then return false; end if;
    end if;
    for hint_index in 0..used::integer-1 loop
      if (part->>hint_index)::integer is distinct from target_notes[hint_index+1] then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

create or replace function public.save_brodle_progress(p_user_id uuid,p_challenge_id text,p_target_notes integer[],p_progress jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare saved jsonb; part jsonb; step jsonb; position bigint; attempt_id text;
  attempts jsonb := '[]'::jsonb; attempt_ids jsonb := '[]'::jsonb; seen jsonb := '{}'::jsonb;
  attempt_hints jsonb := '[]'::jsonb; hints integer; hint_index integer; draft jsonb;
  finished boolean := false; selected_id text; selected integer; result jsonb;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'brodle_progress_owner_required' using errcode = '42501'; end if;
  if not public.brodle_valid_progress(p_target_notes,p_progress) then raise exception 'brodle_invalid_progress' using errcode = '23514'; end if;
  insert into public.brodle_player_progress(user_id,challenge_id,target_notes,progress)
    values(p_user_id,p_challenge_id,p_target_notes,'{"guess":[],"attempts":[],"attemptIds":[],"selectedAttempt":0}')
    on conflict(user_id,challenge_id,target_notes) do nothing;
  select progress into saved from public.brodle_player_progress
    where user_id=p_user_id and challenge_id=p_challenge_id and target_notes=p_target_notes for update;
  -- Hints are a shared, permanent prefix. Concurrent devices cannot reset the
  -- budget or remove revealed notes by saving an older draft.
  hints := greatest(coalesce((saved->>'hintsUsed')::integer,0),coalesce((p_progress->>'hintsUsed')::integer,0));
  for part in select value from jsonb_array_elements(jsonb_build_array(saved,p_progress)) loop
    for step,position in select value,ordinality from jsonb_array_elements(part->'attempts') with ordinality loop
      exit when finished;
      attempt_id := part->'attemptIds'->>(position::integer-1);
      if seen ? attempt_id then continue; end if;
      seen := seen || jsonb_build_object(attempt_id,true);
      attempts := attempts || jsonb_build_array(step);
      attempt_ids := attempt_ids || jsonb_build_array(attempt_id);
      attempt_hints := attempt_hints || jsonb_build_array(coalesce(part->'attemptHints'->(position::integer-1),'0'::jsonb));
      finished := step = to_jsonb(p_target_notes);
    end loop;
  end loop;
  selected_id := p_progress->'attemptIds'->>(p_progress->>'selectedAttempt')::integer;
  select ordinality::integer-1 into selected from jsonb_array_elements_text(attempt_ids) with ordinality where value=selected_id;
  draft := case when finished then '[]'::jsonb else p_progress->'guess' end;
  if not finished then
    for hint_index in 0..hints-1 loop
      draft := jsonb_set(draft,array[hint_index::text],to_jsonb(p_target_notes[hint_index+1]),true);
    end loop;
  end if;
  result := jsonb_build_object('attempts',attempts,'attemptIds',attempt_ids,'attemptHints',attempt_hints,
    'guess',draft,'hintsUsed',hints,'selectedAttempt',coalesce(selected,greatest(0,jsonb_array_length(attempts)-1)));
  update public.brodle_player_progress set progress=result,updated_at=now()
    where user_id=p_user_id and challenge_id=p_challenge_id and target_notes=p_target_notes;
  return result;
end $$;

notify pgrst, 'reload schema';
commit;
