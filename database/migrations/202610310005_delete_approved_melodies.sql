begin;

-- Daily challenges contain complete snapshots and remain playable after their
-- source is deleted. Keep the snapshot, date, and challenge identity intact.
alter table public.brodle_daily_challenges
  drop constraint brodle_daily_challenges_melody_id_fkey,
  alter column melody_id drop not null,
  add constraint brodle_daily_challenges_melody_id_fkey
    foreign key (melody_id) references public.brodle_melodies(id) on delete set null;

alter policy brodle_melody_delete on public.brodle_melodies
using (
  (created_by = (select auth.uid()) and status in ('draft','rejected','approved'))
  or (status = 'approved' and (select public.is_brodle_admin()))
);

commit;
