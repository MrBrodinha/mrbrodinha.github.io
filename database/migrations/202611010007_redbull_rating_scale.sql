-- Expand the scale without changing existing scores or access settings.
begin;

alter table public.redbull_rating
  drop constraint redbull_rating_rating_check,
  add constraint redbull_rating_rating_check check (rating between 0 and 10);

create or replace function public.create_redbull_entry(
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
  if p_rating is null or p_rating not between 0 and 10 then raise exception 'redbull_rating_required' using errcode='22023'; end if;
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
commit;
