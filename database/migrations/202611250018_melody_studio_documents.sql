begin;

-- Lossless editor source is private under the melody's existing RLS policies.
create function public.brodle_valid_studio_document(doc jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare part jsonb; name text;
begin
  if doc is null then return true; end if;
  if jsonb_typeof(doc) is distinct from 'object' or doc->'version' is distinct from '1'::jsonb or octet_length(doc::text) > 524288 then return false; end if;
  foreach name in array array['main','final'] loop
    part := doc->name;
    if jsonb_typeof(part) is distinct from 'object' or jsonb_typeof(part->'score') is distinct from 'string'
      or char_length(part->>'score') not between 1 and 100000 or not(part ? 'codeDraft') then return false; end if;
    if jsonb_typeof(part->'codeDraft') is distinct from 'null' and
      (jsonb_typeof(part->'codeDraft') is distinct from 'string' or char_length(part->>'codeDraft') > 100000) then return false; end if;
  end loop;
  return true;
end $$;
alter table public.brodle_melodies add column studio_document jsonb
  check(public.brodle_valid_studio_document(studio_document));

-- Only this RPC may write studio_document. Stable IDs make retries idempotent;
-- the expected timestamp prevents a stale tab/device from overwriting new music.
create function public.save_brodle_studio(melody_id uuid, expected_updated_at timestamptz, content jsonb)
returns public.brodle_melodies language plpgsql security definer set search_path = '' as $$
declare m public.brodle_melodies; existing jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if melody_id is null or jsonb_typeof(content) is distinct from 'object' or content->'studio_document' is null
    or not public.brodle_valid_studio_document(content->'studio_document') then raise check_violation; end if;
  -- Serialize first inserts too, including requests retried after a lost response.
  perform pg_advisory_xact_lock(hashtextextended(melody_id::text,0));
  select * into m from public.brodle_melodies where id = melody_id for update;
  if found then
    if m.created_by <> auth.uid() or m.status not in ('draft','rejected') then raise exception 'brodle_not_editable'; end if;
    existing := jsonb_build_object('title',m.title,'source',m.source,'hint',m.hint,'bpm',m.bpm,'key_signature',m.key_signature,
      'time_signature',m.time_signature,'final_bpm',m.final_bpm,'final_key_signature',m.final_key_signature,
      'notes',m.notes,'final_notes',m.final_notes,'final_bass_notes',m.final_bass_notes,'final_clef',m.final_clef,
      'final_bass_clef',m.final_bass_clef,'studio_document',m.studio_document);
    if existing = content then return m; end if;
    if expected_updated_at is null or expected_updated_at <> m.updated_at then raise exception 'brodle_studio_conflict'; end if;
    update public.brodle_melodies set title=content->>'title',source=content->>'source',hint=content->>'hint',
      bpm=(content->>'bpm')::integer,key_signature=content->>'key_signature',time_signature=content->>'time_signature',
      final_bpm=(content->>'final_bpm')::integer,final_key_signature=content->>'final_key_signature',
      notes=content->'notes',final_notes=nullif(content->'final_notes','null'::jsonb),
      final_bass_notes=nullif(content->'final_bass_notes','null'::jsonb),final_clef=content->>'final_clef',final_bass_clef=content->>'final_bass_clef',
      studio_document=content->'studio_document' where id=melody_id returning * into m;
  else
    if expected_updated_at is not null then raise exception 'brodle_not_found'; end if;
    insert into public.brodle_melodies(id,created_by,title,source,hint,bpm,key_signature,time_signature,final_bpm,final_key_signature,
      notes,final_notes,final_bass_notes,final_clef,final_bass_clef,studio_document)
    values(melody_id,auth.uid(),content->>'title',content->>'source',content->>'hint',(content->>'bpm')::integer,content->>'key_signature',content->>'time_signature',
      (content->>'final_bpm')::integer,content->>'final_key_signature',content->'notes',nullif(content->'final_notes','null'::jsonb),
      nullif(content->'final_bass_notes','null'::jsonb),content->>'final_clef',content->>'final_bass_clef',content->'studio_document') returning * into m;
  end if;
  return m;
end $$;

-- Defense in depth: other clients cannot submit unapplied source drafts either.
create function public.brodle_studio_submission_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status in ('submitted','approved') and new.studio_document is not null and
    (new.studio_document#>'{main,codeDraft}' is distinct from 'null'::jsonb or new.studio_document#>'{final,codeDraft}' is distinct from 'null'::jsonb) then
    raise exception 'brodle_studio_unapplied';
  end if;
  return new;
end $$;
create trigger brodle_studio_submission_guard before insert or update on public.brodle_melodies
for each row execute function public.brodle_studio_submission_guard();

revoke all on function public.brodle_valid_studio_document(jsonb),public.save_brodle_studio(uuid,timestamptz,jsonb),public.brodle_studio_submission_guard() from public;
grant execute on function public.brodle_valid_studio_document(jsonb),public.save_brodle_studio(uuid,timestamptz,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
