-- Audio/Visual requests, recurring event prompts, and private attachments.

create table public.av_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete restrict,
  requester_name text not null,
  requester_email text not null,
  requested_date date not null,
  setup_time time not null,
  equipment text[] not null default '{}',
  music_request text not null check (music_request in ('Soft Music', 'Upbeat Music', 'N/A')),
  location text not null,
  details text,
  links text[] not null default '{}',
  calendar_event_id text,
  calendar_status text not null default 'pending' check (calendar_status in ('pending', 'created', 'failed')),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.av_request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.av_requests(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 25 * 1024 * 1024),
  created_at timestamptz not null default now()
);

create table public.av_recurring_events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  contact_name text not null,
  contact_email text not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_date date not null,
  end_date date,
  setup_time time not null,
  location text not null,
  calendar_event_id text,
  calendar_status text not null default 'pending' check (calendar_status in ('pending', 'created', 'failed')),
  last_reminder_occurrence date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index av_requests_date_idx on public.av_requests(requested_date);
create index av_recurring_events_active_idx
  on public.av_recurring_events(is_active, weekday, start_date, end_date);

create or replace function public.av_request_set_requester()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(p.full_name, p.email), p.email
    into new.requester_name, new.requester_email
    from public.profiles p
   where p.id = new.requester_id;
  return new;
end;
$$;

create trigger trg_av_request_set_requester
  before insert on public.av_requests
  for each row execute function public.av_request_set_requester();

alter table public.av_requests enable row level security;
alter table public.av_request_files enable row level security;
alter table public.av_recurring_events enable row level security;

create policy "av requests read"
  on public.av_requests for select to authenticated
  using (requester_id = auth.uid() or public.is_staff());

create policy "av requests insert own"
  on public.av_requests for insert to authenticated
  with check (requester_id = auth.uid());

create policy "av requests delete own pending"
  on public.av_requests for delete to authenticated
  using (requester_id = auth.uid() and calendar_status = 'pending');

create policy "av request files read"
  on public.av_request_files for select to authenticated
  using (exists (select 1 from public.av_requests r where r.id = request_id));

create policy "av request files insert"
  on public.av_request_files for insert to authenticated
  with check (exists (
    select 1 from public.av_requests r
    where r.id = request_id and r.requester_id = auth.uid()
  ));

create policy "av recurring read"
  on public.av_recurring_events for select to authenticated
  using (public.is_manager());

create policy "av recurring insert"
  on public.av_recurring_events for insert to authenticated
  with check (public.is_manager() and created_by = auth.uid());

create policy "av recurring update"
  on public.av_recurring_events for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'av-request-files',
  'av-request-files',
  false,
  25 * 1024 * 1024,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png','image/jpeg','image/jpg','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime',
    'audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/ogg'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "av request storage read" on storage.objects;
drop policy if exists "av request storage insert" on storage.objects;
drop policy if exists "av request storage delete" on storage.objects;

create policy "av request storage read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'av-request-files'
    and exists (
      select 1 from public.av_requests r
      where r.id::text = split_part(name, '/', 2)
        and (r.requester_id = auth.uid() or public.is_staff())
    )
  );

create policy "av request storage insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'av-request-files'
    and name like 'requests/%/%'
    and exists (
      select 1 from public.av_requests r
      where r.id::text = split_part(name, '/', 2)
        and r.requester_id = auth.uid()
    )
  );

create policy "av request storage delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'av-request-files'
    and exists (
      select 1 from public.av_requests r
      where r.id::text = split_part(name, '/', 2)
        and r.requester_id = auth.uid()
        and r.calendar_status = 'pending'
    )
  );

grant select, insert, delete on public.av_requests to authenticated;
grant select, insert on public.av_request_files to authenticated;
grant select, insert, update on public.av_recurring_events to authenticated;

notify pgrst, 'reload schema';