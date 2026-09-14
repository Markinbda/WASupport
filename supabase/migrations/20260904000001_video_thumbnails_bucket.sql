-- Public thumbnails for video library cards. Only managers and admins may
-- upload or delete objects. Files are stored under videos/<user_id>/<uuid>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-thumbnails',
  'video-thumbnails',
  true,
  5 * 1024 * 1024,
  array['image/png','image/jpeg','image/jpg','image/webp']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;

drop policy if exists "video thumbnails insert" on storage.objects;
drop policy if exists "video thumbnails delete" on storage.objects;

create policy "video thumbnails insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'video-thumbnails'
    and name like 'videos/%/%'
    and split_part(name, '/', 2) = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager')
    )
  );

create policy "video thumbnails delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'video-thumbnails'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager')
    )
  );