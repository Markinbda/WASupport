-- SLA timers + assignment review workflow.
--
-- After submission, every new ticket sits in `awaiting_triage` until staff
-- review it, set a priority, pick an assignee, and move it to `open` /
-- `in_progress`. The SLA clock starts at triage time and uses:
--
--   urgent / critical →   4 h
--   high              →   8 h   (same-day)
--   normal            →  48 h   (medium)
--   low               → 168 h   (one week)
--
-- A scheduled Netlify function pings the assignee when a ticket is within
-- an hour of breach, and again once it has actually breached.

-- 1) Triage + reminder columns (sla_due_at already exists from init.sql)
alter table public.tickets
  add column if not exists triaged_at                    timestamptz,
  add column if not exists triaged_by                    uuid references public.profiles(id) on delete set null,
  add column if not exists sla_reminder_approaching_sent boolean not null default false,
  add column if not exists sla_reminder_overdue_sent     boolean not null default false;

-- 2) Helper: priority → SLA window
create or replace function public.sla_window(p ticket_priority)
returns interval
language sql
immutable
as $$
  select case p
    when 'urgent'   then interval '4 hours'
    when 'critical' then interval '4 hours'
    when 'high'     then interval '8 hours'
    when 'normal'   then interval '48 hours'
    when 'low'      then interval '168 hours'
  end
$$;

-- 3) Backfill so existing tickets don't all suddenly need triage
update public.tickets
   set triaged_at = coalesce(triaged_at, created_at),
       sla_due_at = coalesce(sla_due_at, created_at + public.sla_window(priority))
 where triaged_at is null or sla_due_at is null;

-- 4) New tickets default to awaiting_triage
alter table public.tickets
  alter column status set default 'awaiting_triage';

-- 5) Trigger: stamp triaged_at + sla_due_at on the first transition out of
--    awaiting_triage; recompute sla_due_at if priority changes pre-resolution.
create or replace function public.tickets_apply_sla()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'awaiting_triage' and new.status <> 'awaiting_triage' then
    if new.triaged_at is null then
      new.triaged_at := now();
    end if;
    new.sla_due_at := new.triaged_at + public.sla_window(new.priority);
    new.sla_reminder_approaching_sent := false;
    new.sla_reminder_overdue_sent     := false;
  end if;

  if new.triaged_at is not null
     and new.priority is distinct from old.priority
     and new.status not in ('resolved', 'closed') then
    new.sla_due_at := new.triaged_at + public.sla_window(new.priority);
    new.sla_reminder_approaching_sent := false;
    new.sla_reminder_overdue_sent     := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tickets_apply_sla on public.tickets;
create trigger trg_tickets_apply_sla
  before update on public.tickets
  for each row execute function public.tickets_apply_sla();

-- 6) Indexes for the reminder sweep + queue filtering
create index if not exists tickets_sla_due_idx
  on public.tickets (sla_due_at)
  where status in ('open', 'in_progress');

create index if not exists tickets_status_dept_assignee_idx
  on public.tickets (status, department, assignee_id);
