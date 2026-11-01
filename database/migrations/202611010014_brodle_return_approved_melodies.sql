begin;

-- Administrators may return approved originals to their creators for editing.
-- Daily challenges retain the immutable copies taken when they were scheduled.
create or replace function public.review_brodle_melody(melody_id uuid, decision text, note text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_brodle_admin() then raise exception 'brodle_admin_required'; end if;
  if decision is null or decision not in ('approved','rejected') or note is null or char_length(note) > 1000 then
    raise exception 'brodle_invalid_review';
  end if;
  update public.brodle_melodies set status = decision, review_note = note, reviewed_at = now()
    where id = melody_id and (status = 'submitted' or (status = 'approved' and decision = 'rejected'));
  if not found then raise exception 'brodle_not_reviewable'; end if;
  return melody_id;
end $$;
revoke all on function public.review_brodle_melody(uuid,text,text) from public;
grant execute on function public.review_brodle_melody(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
