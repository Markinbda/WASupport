-- =====================================================================
-- AcademyDesk — Roles refinement + Spiceworks import support
-- =====================================================================
-- Runs AFTER 20260520000001_add_support_role.sql so the new enum value
-- is committed before being referenced here.
--
-- - is_manager() / is_support() helpers
-- - is_staff() refreshed to include 'support'
-- - legacy_* columns on tickets for historical import
-- - submitter_id made nullable for archive-only tickets
-- - RLS: manager + support can view all; support is close-only (enforced
--   by trigger); dept techs still scoped to their department
-- =====================================================================

create or replace function public.is_manager()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_role() in ('manager','admin'), false);
$$;

create or replace function public.is_support()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_role() = 'support', false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_role() in
    ('it_tech','fac_tech','hs_officer','support','manager','admin','leadership'), false);
$$;

alter table public.tickets
  add column if not exists legacy_ref            text unique,
  add column if not exists legacy_assignee_name  text,
  add column if not exists legacy_submitter_name text,
  add column if not exists legacy_subcategory    text,
  add column if not exists legacy_location       text,
  add column if not exists legacy_link           text,
  add column if not exists imported_from         text,
  add column if not exists imported_at           timestamptz;

create index if not exists tickets_legacy_ref_idx on public.tickets (legacy_ref);

alter table public.tickets
  alter column submitter_id drop not null;

drop policy if exists "tickets staff read by dept" on public.tickets;
create policy "tickets staff read"
  on public.tickets for select
  using (
    public.is_admin()
    or public.current_role() = 'leadership'
    or public.is_manager()
    or public.is_support()
    or (public.current_role() = 'it_tech'    and department = 'IT')
    or (public.current_role() = 'fac_tech'   and department = 'FAC')
    or (public.current_role() = 'hs_officer' and department = 'HS')
  );

drop policy if exists "tickets staff update by dept" on public.tickets;
create policy "tickets manager update"
  on public.tickets for update
  using (public.is_admin() or public.is_manager())
  with check (public.is_admin() or public.is_manager());

create policy "tickets dept tech update"
  on public.tickets for update
  using (
    (public.current_role() = 'it_tech'    and department = 'IT')
    or (public.current_role() = 'fac_tech'   and department = 'FAC')
    or (public.current_role() = 'hs_officer' and department = 'HS')
  )
  with check (
    (public.current_role() = 'it_tech'    and department = 'IT')
    or (public.current_role() = 'fac_tech'   and department = 'FAC')
    or (public.current_role() = 'hs_officer' and department = 'HS')
  );

create policy "tickets support close"
  on public.tickets for update
  using (public.is_support())
  with check (public.is_support());

create or replace function public.enforce_support_close_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role user_role;
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role is distinct from 'support' then
    return new;
  end if;

  if (new.status not in ('resolved','closed')) then
    raise exception 'support role may only close or resolve tickets';
  end if;

  if  new.subject     is distinct from old.subject
   or new.description is distinct from old.description
   or new.priority    is distinct from old.priority
   or new.department  is distinct from old.department
   or new.category_id is distinct from old.category_id
   or new.location_id is distinct from old.location_id
   or new.assignee_id is distinct from old.assignee_id
   or new.submitter_id is distinct from old.submitter_id
   or new.ref         is distinct from old.ref
  then
    raise exception 'support role may only modify status / closed_at / resolved_at';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_support_close_only on public.tickets;
create trigger trg_enforce_support_close_only
  before update on public.tickets
  for each row execute function public.enforce_support_close_only();
