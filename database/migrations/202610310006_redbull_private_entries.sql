begin;

-- Administrators change redbull_enabled in Table Editor or SQL. The internal
-- slot constraint enforces the two-account limit even with concurrent changes.
alter table public.users
  add column redbull_enabled boolean not null default false,
  add column redbull_access_slot smallint unique check (redbull_access_slot in (1,2)),
  add constraint redbull_enabled_has_slot check (redbull_enabled = (redbull_access_slot is not null));

create function public.assign_redbull_access_slot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(87791006);
  if not new.redbull_enabled then new.redbull_access_slot := null; return new; end if;
  select slot into new.redbull_access_slot from generate_series(1,2) slot
    where not exists(select 1 from public.users u where u.redbull_access_slot = slot and u.id <> new.id)
    order by slot limit 1;
  if new.redbull_access_slot is null then raise exception 'redbull_two_user_limit'; end if;
  return new;
end $$;
revoke all on function public.assign_redbull_access_slot() from public;
create trigger assign_redbull_access_slot before insert or update of redbull_enabled,redbull_access_slot
  on public.users for each row execute function public.assign_redbull_access_slot();

create function public.can_use_redbull() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.users where id = (select auth.uid()) and redbull_enabled);
$$;
revoke all on function public.can_use_redbull() from public;
grant execute on function public.can_use_redbull() to anon, authenticated;

-- Restrictive policies also close any older permissive policies. Existing
-- rating ownership policies/triggers and shared username access are retained.
create policy redbull_access_guard on public.redbull as restrictive for all to anon,authenticated
  using ((select public.can_use_redbull())) with check ((select public.can_use_redbull()));
create policy redbull_rating_access_guard on public.redbull_rating as restrictive for all to anon,authenticated
  using ((select public.can_use_redbull())) with check ((select public.can_use_redbull()));

alter table public.redbull
  add column created_by uuid references public.users(id) on delete set null,
  add column image_path text,
  add constraint redbull_one_image_source check (image_path is null or image_url is null);
grant select(description,image_path,created_by) on public.redbull to authenticated;
revoke insert,update,delete on public.redbull from public,anon,authenticated;
do $$ declare col record; begin
  for col in select column_name from information_schema.columns where table_schema='public' and table_name='redbull' loop
    execute format('revoke insert (%I), update (%I) on public.redbull from public,anon,authenticated', col.column_name,col.column_name);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('redbull-images','redbull-images',false,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy redbull_images_read on storage.objects for select to authenticated
  using (bucket_id='redbull-images' and (select public.can_use_redbull()));
create policy redbull_images_upload on storage.objects for insert to authenticated
  with check (bucket_id='redbull-images' and (select public.can_use_redbull()) and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy redbull_images_cleanup on storage.objects for delete to authenticated
  using (bucket_id='redbull-images' and (select public.can_use_redbull()) and (storage.foldername(name))[1]=(select auth.uid())::text
    and not exists(select 1 from public.redbull r where r.image_path=storage.objects.name));
-- Other buckets are unaffected; broad legacy policies cannot expose this one.
create policy redbull_images_read_guard on storage.objects as restrictive for select to anon,authenticated
  using (bucket_id<>'redbull-images' or (select public.can_use_redbull()));
create policy redbull_images_upload_guard on storage.objects as restrictive for insert to anon,authenticated
  with check (bucket_id<>'redbull-images' or ((select public.can_use_redbull()) and (storage.foldername(name))[1]=(select auth.uid())::text));
create policy redbull_images_immutable on storage.objects as restrictive for update to anon,authenticated
  using (bucket_id<>'redbull-images') with check (bucket_id<>'redbull-images');
create policy redbull_images_cleanup_guard on storage.objects as restrictive for delete to anon,authenticated
  using (bucket_id<>'redbull-images' or ((select public.can_use_redbull()) and (storage.foldername(name))[1]=(select auth.uid())::text
    and not exists(select 1 from public.redbull r where r.image_path=storage.objects.name)));

-- A drink and its creator's first review are committed together. The caller
-- never chooses an author ID. A stable request ID makes retries idempotent.
create function public.create_redbull_entry(
  p_id uuid, p_name text, p_flavour text, p_description text, p_source_url text,
  p_image_url text, p_image_path text, p_rating smallint, p_opinion text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare drink public.redbull; review public.redbull_rating; actor uuid := auth.uid();
begin
  if actor is null or not public.can_use_redbull() then raise exception 'redbull_access_required' using errcode='42501'; end if;
  p_name:=btrim(p_name); p_flavour:=nullif(btrim(p_flavour),''); p_description:=nullif(btrim(p_description),'');
  p_source_url:=nullif(btrim(p_source_url),''); p_image_url:=nullif(btrim(p_image_url),'');
  p_image_path:=nullif(btrim(p_image_path),''); p_opinion:=btrim(coalesce(p_opinion,''));
  if p_id is null or p_name is null or p_name='' then raise exception 'redbull_name_required' using errcode='22023'; end if;
  if char_length(p_name)>160 or char_length(p_flavour)>200 or char_length(p_description)>2000
    or char_length(p_source_url)>2048 or char_length(p_image_url)>2048 or char_length(p_image_path)>512 or char_length(p_opinion)>2000
    then raise exception 'redbull_entry_too_long' using errcode='22023'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'redbull_rating_required' using errcode='22023'; end if;
  if (p_source_url is not null and p_source_url !~ '^https?://[^[:space:]@/?#]+([/?#][^[:space:]]*)?$')
    or (p_image_url is not null and p_image_url !~ '^https://[^[:space:]@/?#]+([/?#][^[:space:]]*)?$')
    or (p_image_url is not null and p_image_path is not null)
    then raise exception 'redbull_invalid_image_or_url' using errcode='22023'; end if;
  if p_image_path is not null and (p_image_path not like actor::text||'/'||p_id::text||'/%'
    or not exists(select 1 from storage.objects where bucket_id='redbull-images' and name=p_image_path))
    then raise exception 'redbull_invalid_upload' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('redbull-entry:'||p_id::text,0));
  select * into drink from public.redbull where id=p_id;
  if found then
    select * into review from public.redbull_rating where redbull_id=p_id and user_id=actor;
    if drink.created_by is distinct from actor or drink.name is distinct from p_name or drink.flavour is distinct from p_flavour
      or drink.description is distinct from p_description or drink.source_url is distinct from p_source_url
      or drink.image_url is distinct from p_image_url or drink.image_path is distinct from p_image_path
      or review.rating is distinct from p_rating or review.opinion is distinct from p_opinion
      then raise exception 'redbull_entry_already_created'; end if;
  else
    insert into public.redbull(id,name,flavour,description,source_url,image_url,image_path,created_by)
      values(p_id,p_name,p_flavour,p_description,p_source_url,p_image_url,p_image_path,actor) returning * into drink;
    insert into public.redbull_rating(user_id,redbull_id,rating,opinion)
      values(actor,p_id,p_rating,p_opinion) returning * into review;
  end if;
  return jsonb_build_object('drink',to_jsonb(drink),'rating',jsonb_build_object('rating',review.rating,'opinion',review.opinion));
exception when unique_violation then raise exception 'redbull_duplicate_source';
end $$;
revoke all on function public.create_redbull_entry(uuid,text,text,text,text,text,text,smallint,text) from public;
grant execute on function public.create_redbull_entry(uuid,text,text,text,text,text,text,smallint,text) to authenticated;

commit;
