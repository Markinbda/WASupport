-- Notifications audit log: every email send attempt is recorded here so
-- admins can troubleshoot deliverability without reading function logs.
create table if not exists public.notifications_log (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete cascade,
  event text not null check (event in ('ticket.created', 'ticket.reply', 'ticket.status_changed')),
  recipients text[] not null default '{}',
  status text not null check (status in ('sent', 'skipped', 'error')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_log_ticket_idx
  on public.notifications_log(ticket_id, created_at desc);

create index if not exists notifications_log_created_idx
  on public.notifications_log(created_at desc);

-- RLS: only admins/managers can read; service role bypasses RLS for inserts.
alter table public.notifications_log enable row level security;

drop policy if exists "notifications_log read for staff" on public.notifications_log;
create policy "notifications_log read for staff"
  on public.notifications_log for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager')
    )
  );
