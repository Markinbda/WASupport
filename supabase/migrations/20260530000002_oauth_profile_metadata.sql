-- Capture OAuth (Microsoft Entra ID) provider metadata on signup.
--
-- When a user signs in via Supabase's Azure provider, supabase-auth inserts
-- a row in `auth.users` with:
--   raw_user_meta_data->>'full_name'    (or 'name')   → display name
--   raw_user_meta_data->>'email'                       → primary email
--   raw_user_meta_data->>'provider_id'                 → Entra object ID (sub)
--   raw_app_meta_data->>'provider'      = 'azure'      → which provider
--
-- The original `handle_new_user` trigger only copied email + full_name. This
-- migration extends it to also stamp `profiles.entra_oid` (a unique column
-- added in init.sql) when an Azure OID is present, and to prefer the OAuth
-- display name over the email when full_name is blank.
--
-- Safe to run multiple times — `create or replace function`.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  app_meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  display_name text := coalesce(
    nullif(meta->>'full_name', ''),
    nullif(meta->>'name', ''),
    new.email
  );
  oid text := nullif(meta->>'provider_id', '');
begin
  insert into public.profiles (id, email, full_name, entra_oid)
  values (
    new.id,
    new.email,
    display_name,
    case when app_meta->>'provider' = 'azure' then oid else null end
  )
  on conflict (id) do update
    set full_name = coalesce(public.profiles.full_name, excluded.full_name),
        entra_oid = coalesce(public.profiles.entra_oid, excluded.entra_oid);
  return new;
end;
$$;

-- Backfill: existing rows where we already have OAuth metadata but the
-- profile predates this trigger update.
update public.profiles p
   set entra_oid = u.raw_user_meta_data->>'provider_id'
  from auth.users u
 where u.id = p.id
   and p.entra_oid is null
   and coalesce(u.raw_app_meta_data->>'provider', '') = 'azure'
   and nullif(u.raw_user_meta_data->>'provider_id', '') is not null;
