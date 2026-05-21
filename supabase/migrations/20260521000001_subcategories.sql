-- ---------------------------------------------------------------------
-- Subcategories
--
-- 1. Add `subcategory_id` to tickets (nullable, FK -> categories).
-- 2. Seed 10 canonical subcategories under the main IT/FAC/HS category
--    of each department. The names mirror the top issue buckets surfaced
--    by analysing 19,401 historical ticket subjects.
--
-- The categories table already has parent_id and unique(department,
-- parent_id, name), so re-running this migration is a no-op via
-- ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------

alter table public.tickets
  add column if not exists subcategory_id uuid references public.categories(id) on delete set null;

create index if not exists tickets_subcategory_idx on public.tickets (subcategory_id);

-- Seed subcategories. We resolve the parent ids dynamically so the
-- migration works regardless of how the parent rows were originally
-- inserted (the canonical names below match the rows already in prod).
do $$
declare
  it_parent  uuid;
  fac_parent uuid;
  hs_parent  uuid;
begin
  select id into it_parent  from public.categories
    where department = 'IT'  and parent_id is null and name = 'IT'                  limit 1;
  select id into fac_parent from public.categories
    where department = 'FAC' and parent_id is null and name = 'Facilities'          limit 1;
  select id into hs_parent  from public.categories
    where department = 'HS'  and parent_id is null and name = 'Health  and Safety'  limit 1;

  if it_parent is not null then
    insert into public.categories (department, parent_id, name) values
      ('IT', it_parent, 'Printer / Photocopier / Toner'),
      ('IT', it_parent, 'Computer / Laptop / Desktop'),
      ('IT', it_parent, 'Software install / license'),
      ('IT', it_parent, 'Smartboard / Interactive panel'),
      ('IT', it_parent, 'Wi-Fi / Network'),
      ('IT', it_parent, 'Email / Outlook'),
      ('IT', it_parent, 'Projector / AV / Display'),
      ('IT', it_parent, 'Phone / VoIP / Extension'),
      ('IT', it_parent, 'SIS / Portal access (SIMS, Edulink, Firefly)'),
      ('IT', it_parent, 'Password reset / Locked account')
    on conflict (department, parent_id, name) do nothing;
  end if;

  if fac_parent is not null then
    insert into public.categories (department, parent_id, name) values
      ('FAC', fac_parent, 'HVAC / Air conditioning'),
      ('FAC', fac_parent, 'Plumbing / Leak / Toilet / Sink'),
      ('FAC', fac_parent, 'Door / Lock / Hinge / Key'),
      ('FAC', fac_parent, 'Lighting / Bulb'),
      ('FAC', fac_parent, 'Furniture (chair / desk / table)'),
      ('FAC', fac_parent, 'Cleaning / Spill'),
      ('FAC', fac_parent, 'Wall / Ceiling / Roof'),
      ('FAC', fac_parent, 'Window / Blind / Screen'),
      ('FAC', fac_parent, 'Pest control'),
      ('FAC', fac_parent, 'Box delivery / Item move')
    on conflict (department, parent_id, name) do nothing;
  end if;

  if hs_parent is not null then
    insert into public.categories (department, parent_id, name) values
      ('HS', hs_parent, 'First aid / Injury'),
      ('HS', hs_parent, 'Fire alarm / Extinguisher'),
      ('HS', hs_parent, 'Hazard / Trip / Slip / Fall'),
      ('HS', hs_parent, 'Spill / Chemical / Hazmat'),
      ('HS', hs_parent, 'Safeguarding / Child protection'),
      ('HS', hs_parent, 'Playground safety'),
      ('HS', hs_parent, 'Vehicle / Traffic safety'),
      ('HS', hs_parent, 'Safety inspection / Audit'),
      ('HS', hs_parent, 'Lockdown / Evacuation drill'),
      ('HS', hs_parent, 'PPE / Safety equipment')
    on conflict (department, parent_id, name) do nothing;
  end if;
end $$;
