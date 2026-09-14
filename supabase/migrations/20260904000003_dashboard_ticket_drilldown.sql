-- Return the exact tickets represented by a dashboard KPI tile. This uses the
-- same date predicates as dashboard_kpis and remains subject to ticket RLS.

create or replace function public.dashboard_ticket_drilldown(
  metric text,
  from_date date,
  to_date date
)
returns setof public.tickets
language sql
stable
security invoker
set search_path = public
as $$
  select t.*
  from public.tickets t
  where
    (metric = 'new' and t.created_at::date between from_date and to_date)
    or (
      metric in ('open', 'unassigned')
      and t.created_at < (to_date + 1)::timestamp
      and (
        coalesce(t.closed_at, t.resolved_at) is null
        or coalesce(t.closed_at, t.resolved_at) >= (to_date + 1)::timestamp
      )
      and (metric <> 'unassigned' or t.assignee_id is null)
    )
    or (
      metric = 'resolved'
      and t.resolved_at is not null
      and t.resolved_at::date between from_date and to_date
    )
  order by t.created_at desc;
$$;

grant execute on function public.dashboard_ticket_drilldown(text, date, date)
  to authenticated;