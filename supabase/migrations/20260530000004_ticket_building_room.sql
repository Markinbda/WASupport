-- Replace the location dropdown with two free-text fields on tickets.
-- The existing `location_id` FK and the `locations` admin table are left
-- intact so legacy tickets keep their references and existing reports keep
-- working; new tickets just write `building` / `room` text instead.

alter table public.tickets
  add column if not exists building text,
  add column if not exists room     text;

create index if not exists tickets_building_idx on public.tickets (building);
create index if not exists tickets_room_idx     on public.tickets (room);

notify pgrst, 'reload schema';
