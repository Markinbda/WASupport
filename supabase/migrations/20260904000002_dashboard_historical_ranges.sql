-- Make dashboard open/unassigned KPIs reflect the selected period end rather
-- than the current ticket status. Assignment is the current known assignee;
-- assignment history is not stored.

create or replace function public.dashboard_kpis(
  from_date date,
  to_date   date
)
returns table (
  new_tickets       bigint,
  new_tickets_prev  bigint,
  open_tickets      bigint,
  unassigned        bigint,
  resolved_tickets  bigint,
  resolved_prev     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with span as (
    select (to_date - from_date + 1) as days
  ),
  prev as (
    select
      (from_date - (select days from span))::date as p_from,
      (from_date - 1)::date as p_to
  ),
  open_at_end as (
    select *
    from public.tickets
    where created_at < (to_date + 1)::timestamp
      and (
        coalesce(closed_at, resolved_at) is null
        or coalesce(closed_at, resolved_at) >= (to_date + 1)::timestamp
      )
  )
  select
    (select count(*) from public.tickets
       where created_at::date between from_date and to_date),
    (select count(*) from public.tickets
       where created_at::date between (select p_from from prev) and (select p_to from prev)),
    (select count(*) from open_at_end),
    (select count(*) from open_at_end where assignee_id is null),
    (select count(*) from public.tickets
       where resolved_at is not null
         and resolved_at::date between from_date and to_date),
    (select count(*) from public.tickets
       where resolved_at is not null
         and resolved_at::date between (select p_from from prev) and (select p_to from prev));
$$;

grant execute on function public.dashboard_kpis(date, date) to authenticated;