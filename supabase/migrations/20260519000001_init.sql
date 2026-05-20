-- =====================================================================
-- AcademyDesk — Initial schema (Phase 1 foundation)
-- =====================================================================
-- This migration creates the core tables, enums, helper functions, and
-- row-level security policies needed for ticket submission and triage.
-- Later migrations add SLA tracking, KB vectors, H&S append-only logic,
-- assets, maintenance scheduler, etc.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type user_role as enum (
  'submitter',
  'it_tech',
  'fac_tech',
  'hs_officer',
  'manager',
  'admin',
  'leadership'
);

create type department as enum ('IT', 'FAC', 'HS');

create type ticket_status as enum (
  'open',
  'in_progress',
  'on_hold',
  'resolved',
  'closed'
);

create type ticket_priority as enum ('low', 'normal', 'high', 'critical', 'urgent');

-- ---------------------------------------------------------------------
-- Profiles (mirrors auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  full_name    text,
  role         user_role not null default 'submitter',
  department   department,
  entra_oid    text unique,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Helper: current user role
-- ---------------------------------------------------------------------
create or replace function public.current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_role() = 'admin', false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_role() in
    ('it_tech','fac_tech','hs_officer','manager','admin','leadership'), false);
$$;

-- ---------------------------------------------------------------------
-- Locations (buildings / rooms)
-- ---------------------------------------------------------------------
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  building    text not null,
  floor       text,
  room        text,
  label       text generated always as (
    building
    || coalesce(' / ' || floor, '')
    || coalesce(' / ' || room, '')
  ) stored,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Categories (per-department, simple two-level tree)
-- ---------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  department  department not null,
  parent_id   uuid references public.categories(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (department, parent_id, name)
);

-- ---------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------
create sequence public.ticket_seq_it start 1;
create sequence public.ticket_seq_fac start 1;
create sequence public.ticket_seq_hs start 1;

create or replace function public.next_ticket_ref(dep department)
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  case dep
    when 'IT'  then n := nextval('public.ticket_seq_it');
                    return 'IT-'  || lpad(n::text, 4, '0');
    when 'FAC' then n := nextval('public.ticket_seq_fac');
                    return 'FAC-' || lpad(n::text, 4, '0');
    when 'HS'  then n := nextval('public.ticket_seq_hs');
                    return 'HS-'  || lpad(n::text, 4, '0');
  end case;
end;
$$;

create table public.tickets (
  id            uuid primary key default gen_random_uuid(),
  ref           text not null unique,
  department    department not null,
  category_id   uuid references public.categories(id) on delete set null,
  subject       text not null,
  description   text not null,
  status        ticket_status not null default 'open',
  priority      ticket_priority not null default 'normal',
  submitter_id  uuid not null references public.profiles(id) on delete restrict,
  assignee_id   uuid references public.profiles(id) on delete set null,
  location_id   uuid references public.locations(id) on delete set null,
  sla_due_at    timestamptz,
  resolved_at   timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index tickets_dept_status_idx on public.tickets (department, status);
create index tickets_assignee_idx    on public.tickets (assignee_id);
create index tickets_submitter_idx   on public.tickets (submitter_id);

-- Auto-assign ref on insert
create or replace function public.set_ticket_ref()
returns trigger
language plpgsql
as $$
begin
  if new.ref is null or new.ref = '' then
    new.ref := public.next_ticket_ref(new.department);
  end if;
  return new;
end;
$$;

create trigger trg_set_ticket_ref
  before insert on public.tickets
  for each row execute function public.set_ticket_ref();

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_tickets_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Ticket messages (public replies + internal notes)
-- ---------------------------------------------------------------------
create table public.ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete restrict,
  body        text not null,
  is_internal boolean not null default false,
  created_at  timestamptz not null default now()
);

create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);

-- ---------------------------------------------------------------------
-- Attachments (metadata; bytes live in Supabase Storage bucket 'attachments')
-- ---------------------------------------------------------------------
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid references public.tickets(id) on delete cascade,
  message_id   uuid references public.ticket_messages(id) on delete cascade,
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Knowledge base (Phase 1: simple articles; Phase 3 adds kb_chunks + vectors)
-- ---------------------------------------------------------------------
create table public.kb_articles (
  id           uuid primary key default gen_random_uuid(),
  department   department not null,
  title        text not null,
  body_md      text not null,
  restricted   boolean not null default false,
  author_id    uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_kb_articles_updated_at
  before update on public.kb_articles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Notifications outbox (drained by Edge Function; SendGrid / Twilio / Push)
-- ---------------------------------------------------------------------
create type notification_channel as enum ('email', 'sms', 'push');
create type notification_status  as enum ('pending', 'sent', 'failed');

create table public.notifications_outbox (
  id           uuid primary key default gen_random_uuid(),
  channel      notification_channel not null,
  recipient    text not null,
  template     text not null,
  payload      jsonb not null default '{}'::jsonb,
  status       notification_status not null default 'pending',
  attempts     int not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);

create index notifications_outbox_status_idx
  on public.notifications_outbox (status, created_at);

-- ---------------------------------------------------------------------
-- Audit log (writes to sensitive tables — extended in later migration)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id          bigserial primary key,
  actor_id    uuid,
  table_name  text not null,
  row_id      text,
  action      text not null,
  diff        jsonb,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.locations           enable row level security;
alter table public.categories          enable row level security;
alter table public.tickets             enable row level security;
alter table public.ticket_messages     enable row level security;
alter table public.attachments         enable row level security;
alter table public.kb_articles         enable row level security;
alter table public.notifications_outbox enable row level security;
alter table public.audit_log           enable row level security;

-- Profiles: read own + staff read all; update own basic fields
create policy "profiles read own or staff"
  on public.profiles for select
  using (id = auth.uid() or public.is_staff());

create policy "profiles update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles admin write"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Locations & categories: anyone authenticated can read; admins write
create policy "locations read all"  on public.locations  for select using (auth.role() = 'authenticated');
create policy "locations admin write" on public.locations for all
  using (public.is_admin()) with check (public.is_admin());

create policy "categories read all" on public.categories for select using (auth.role() = 'authenticated');
create policy "categories admin write" on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

-- Tickets
create policy "tickets submitter read own"
  on public.tickets for select
  using (submitter_id = auth.uid());

create policy "tickets staff read by dept"
  on public.tickets for select
  using (
    public.is_admin()
    or (public.current_role() = 'leadership')
    or (public.current_role() = 'it_tech'    and department = 'IT')
    or (public.current_role() = 'fac_tech'   and department = 'FAC')
    or (public.current_role() = 'hs_officer' and department = 'HS')
    or (public.current_role() = 'manager')
  );

create policy "tickets submitter insert"
  on public.tickets for insert
  with check (submitter_id = auth.uid());

create policy "tickets staff update by dept"
  on public.tickets for update
  using (
    public.is_admin()
    or (public.current_role() = 'it_tech'    and department = 'IT')
    or (public.current_role() = 'fac_tech'   and department = 'FAC')
    or (public.current_role() = 'hs_officer' and department = 'HS')
    or (public.current_role() = 'manager')
  );

-- Ticket messages
create policy "ticket_messages read"
  on public.ticket_messages for select
  using (
    -- staff can read everything they can read on the ticket
    exists (
      select 1 from public.tickets t
      where t.id = ticket_messages.ticket_id
        and (
          public.is_admin()
          or public.current_role() = 'leadership'
          or (public.current_role() = 'it_tech'    and t.department = 'IT')
          or (public.current_role() = 'fac_tech'   and t.department = 'FAC')
          or (public.current_role() = 'hs_officer' and t.department = 'HS')
          or (public.current_role() = 'manager')
          -- submitter sees their ticket but NOT internal notes
          or (t.submitter_id = auth.uid() and ticket_messages.is_internal = false)
        )
    )
  );

create policy "ticket_messages insert"
  on public.ticket_messages for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_messages.ticket_id
        and (
          t.submitter_id = auth.uid()
          or public.is_staff()
        )
    )
  );

-- Attachments: same logical scope as the parent ticket
create policy "attachments read"
  on public.attachments for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = attachments.ticket_id
        and (t.submitter_id = auth.uid() or public.is_staff())
    )
  );

create policy "attachments insert"
  on public.attachments for insert
  with check (
    uploaded_by = auth.uid()
    and (
      exists (
        select 1 from public.tickets t
        where t.id = attachments.ticket_id
          and (t.submitter_id = auth.uid() or public.is_staff())
      )
    )
  );

-- KB articles
create policy "kb read non-restricted"
  on public.kb_articles for select
  using (restricted = false or public.is_staff());

create policy "kb staff write"
  on public.kb_articles for all
  using (public.is_staff())
  with check (public.is_staff());

-- Outbox: service role only (no policies → only service role bypasses RLS)
-- Audit log: admins read; nobody writes via API (triggers use security definer)
create policy "audit_log admin read"
  on public.audit_log for select
  using (public.is_admin());
