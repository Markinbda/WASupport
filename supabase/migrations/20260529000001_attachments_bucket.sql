-- Attachments storage bucket + RLS policies
--
-- Creates the 'attachments' bucket referenced by public.attachments and the
-- NewTicket form (image upload, up to 3 files). Files are stored under
-- `tickets/<ticket_id>/<uuid>.<ext>`. RLS mirrors the attachments-table
-- policies: a user can read/insert objects only for tickets they can
-- read/insert (i.e. their own tickets, or any ticket if they are
-- staff/manager/admin per the existing helpers).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  10 * 1024 * 1024,                          -- 10 MiB per file
  array['image/png','image/jpeg','image/jpg','image/webp','image/gif']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;

-- Helper: ticket id from a storage object name shaped 'tickets/<uuid>/...'
create or replace function public.attachment_ticket_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when object_name like 'tickets/%/%' then
      nullif(split_part(object_name, '/', 2), '')::uuid
    else null
  end;
$$;

-- Drop any prior versions of these policies (idempotent re-runs)
drop policy if exists "attachments storage read"   on storage.objects;
drop policy if exists "attachments storage insert" on storage.objects;
drop policy if exists "attachments storage delete" on storage.objects;

-- Read: signed URLs are issued via the API, but direct reads should still
-- be limited to authenticated users with access to the parent ticket.
create policy "attachments storage read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and (
      -- Staff/managers/admins (and ticket owner) — defer to tickets RLS.
      exists (
        select 1 from public.tickets t
        where t.id = public.attachment_ticket_id(storage.objects.name)
      )
    )
  );

-- Insert: any authenticated user may upload to a tickets/<id>/ path, but
-- only if they can also read that ticket (i.e. submitter or staff).
create policy "attachments storage insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and name like 'tickets/%/%'
    and exists (
      select 1 from public.tickets t
      where t.id = public.attachment_ticket_id(storage.objects.name)
    )
  );

-- Delete: owner of the upload, or staff via tickets RLS.
create policy "attachments storage delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.tickets t
        where t.id = public.attachment_ticket_id(storage.objects.name)
      )
    )
  );
