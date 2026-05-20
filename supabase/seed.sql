-- =====================================================================
-- Seed data for local development
-- =====================================================================
-- Run with: supabase db reset  (executes migrations + this seed)
-- =====================================================================

-- Sample locations
insert into public.locations (building, floor, room) values
  ('Main Block',   '1', '101'),
  ('Main Block',   '1', '102'),
  ('Science Wing', '2', 'Lab A'),
  ('Sports Hall',  null, null),
  ('Admin Office', '1', null)
on conflict do nothing;

-- Sample categories (top-level only; sub-categories can be added later)
insert into public.categories (department, name) values
  ('IT',  'Hardware'),
  ('IT',  'Software'),
  ('IT',  'Network & Connectivity'),
  ('IT',  'Accounts & Access'),
  ('IT',  'Audio/Visual'),
  ('FAC', 'Electrical'),
  ('FAC', 'Plumbing'),
  ('FAC', 'Structural'),
  ('FAC', 'Climate Control'),
  ('FAC', 'Cleaning & Hygiene'),
  ('HS',  'Incident Report'),
  ('HS',  'Hazard Identification'),
  ('HS',  'Fire Safety'),
  ('HS',  'First Aid')
on conflict do nothing;

-- A couple of KB articles
insert into public.kb_articles (department, title, body_md) values
  ('IT',  'Projector won''t turn on',
   '## Quick checks\n\n1. Confirm the wall socket is switched on.\n2. Hold the projector power button for 5 seconds.\n3. Check the HDMI cable is fully seated at both ends.\n4. If a red light is flashing, the lamp may need replacement — submit a ticket.'),
  ('FAC', 'Reporting a leak',
   'If water is actively flowing, **call Facilities on extension 200 first**, then submit a ticket so it is tracked. Include the room number and a photo if safe to do so.'),
  ('HS',  'What counts as a near miss?',
   'A near miss is any event that *could* have caused injury or damage but did not. Log it the same way as an incident — these reports help prevent future harm.')
on conflict do nothing;
