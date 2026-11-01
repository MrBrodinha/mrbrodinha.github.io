-- Repair installations whose table retained the old 1–5 rating constraint.
-- This also works after description removal; do not rerun migration 0007.
begin;
alter table public.redbull_rating
  drop constraint if exists redbull_rating_rating_check,
  add constraint redbull_rating_rating_check check (rating between 0 and 10);
commit;
