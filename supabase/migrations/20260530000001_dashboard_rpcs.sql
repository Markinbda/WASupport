-- Dashboard aggregation RPCs (Tech Team only — UI is gated by RequireStaff;
-- DB-side, all functions are SECURITY INVOKER so they only see rows the
-- caller can read under existing public.tickets RLS policies).

-- Daily opened vs closed counts per department, padded with zero-rows for
-- every day in the requested window so the line chart has a continuous x-axis.
create or replace function public.dashboard_ticket_flow(
  from_date date,
  to_date   date
)
returns table (
  day        date,
  department text,
  opened     bigint,
  closed     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with days as (
    select generate_series(from_date, to_date, interval '1 day')::date as day
  ),
  depts as (
    select unnest(enum_range(null::department))::text as department
  ),
  opened as (
    select created_at::date as d, department::text as dept, count(*)::bigint as n
    from public.tickets
    where created_at::date between from_date and to_date
    group by 1, 2
  ),
  closed as (
    select closed_at::date as d, department::text as dept, count(*)::bigint as n
    from public.tickets
    where closed_at is not null
      and closed_at::date between from_date and to_date
    group by 1, 2
  )
  select
    d.day,
    dp.department,
    coalesce(o.n, 0) as opened,
    coalesce(c.n, 0) as closed
  from days d
  cross join depts dp
  left join opened o on o.d = d.day and o.dept = dp.department
  left join closed c on c.d = d.day and c.dept = dp.department
  order by d.day, dp.department;
$$;

-- Headline KPI tiles for the current window plus delta vs the prior
-- equally-sized window for arrow indicators.
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
  )
  select
    (select count(*) from public.tickets
       where created_at::date between from_date and to_date),
    (select count(*) from public.tickets
       where created_at::date between (select p_from from prev) and (select p_to from prev)),
    (select count(*) from public.tickets
       where status in ('awaiting_triage','open','in_progress','on_hold')),
    (select count(*) from public.tickets
       where assignee_id is null
         and status in ('awaiting_triage','open','in_progress','on_hold')),
    (select count(*) from public.tickets
       where resolved_at is not null
         and resolved_at::date between from_date and to_date),
    (select count(*) from public.tickets
       where resolved_at is not null
         and resolved_at::date between (select p_from from prev) and (select p_to from prev));
$$;

-- Category breakdown for the donut. Rolls subcategories up to their parent
-- so the chart isn't a cloud of fine-grained labels.
create or replace function public.dashboard_category_breakdown(
  from_date date,
  to_date   date
)
returns table (
  category   text,
  department text,
  n          bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(parent.name, leaf.name, 'Uncategorised') as category,
    t.department::text                                 as department,
    count(*)::bigint                                   as n
  from public.tickets t
  left join public.categories leaf   on leaf.id = t.category_id
  left join public.categories parent on parent.id = leaf.parent_id
  where t.created_at::date between from_date and to_date
  group by 1, 2
  order by n desc
  limit 12;
$$;

grant execute on function public.dashboard_ticket_flow(date, date)         to authenticated;
grant execute on function public.dashboard_kpis(date, date)                to authenticated;
grant execute on function public.dashboard_category_breakdown(date, date)  to authenticated;
