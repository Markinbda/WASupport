-- Categories & Locations: admin manage + soft-delete via is_active
-- and uniqueness for locations so we can upsert from the CSV import.

alter table public.categories
  add column if not exists is_active boolean not null default true;

alter table public.locations
  add column if not exists is_active boolean not null default true;

-- Locations don't have a natural unique constraint; add one for upserts.
-- Using coalesce so nullable floor/room participate cleanly.
create unique index if not exists locations_building_floor_room_uidx
  on public.locations (
    lower(building),
    lower(coalesce(floor, '')),
    lower(coalesce(room, ''))
  );

-- Allow managers/admins to manage categories & locations (was admin-only).
drop policy if exists "categories admin write" on public.categories;
create policy "categories manager write" on public.categories
  for all using (public.is_manager()) with check (public.is_manager());

drop policy if exists "locations admin write" on public.locations;
create policy "locations manager write" on public.locations
  for all using (public.is_manager()) with check (public.is_manager());
