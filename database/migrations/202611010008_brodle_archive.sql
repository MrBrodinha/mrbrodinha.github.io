-- Public archive navigation exposes only already-published challenge snapshots.
begin;

create function public.get_brodle_day(p_date date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with clock as (
    select (now() at time zone 'Europe/Lisbon')::date as today
  ), selected as (
    select c.id, c.play_date, c.snapshot from public.brodle_daily_challenges c, clock
    where c.play_date <= clock.today and (p_date is null or c.play_date = p_date)
    order by c.play_date desc limit 1
  )
  select jsonb_build_object(
    'today', clock.today, 'serverNow', now(),
    'nextChangeAt', ((clock.today + 1)::timestamp at time zone 'Europe/Lisbon'),
    'challenge', (select jsonb_build_object('id', id, 'playDate', play_date, 'snapshot', snapshot) from selected),
    'previousDate', (select max(c.play_date) from public.brodle_daily_challenges c
      where c.play_date < (select play_date from selected) and c.play_date <= clock.today),
    'nextDate', (select min(c.play_date) from public.brodle_daily_challenges c
      where c.play_date > (select play_date from selected) and c.play_date <= clock.today)
  ) from clock;
$$;

-- Keep existing clients and daily rollover compatible.
create or replace function public.get_daily_brodle() returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.get_brodle_day(null);
$$;

revoke all on function public.get_brodle_day(date) from public;
grant execute on function public.get_brodle_day(date) to anon, authenticated;

commit;
