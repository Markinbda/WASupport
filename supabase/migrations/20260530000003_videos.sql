-- Video library: short curated videos with embeddable URLs, tagged for
-- discoverability. Managers/admins create + maintain entries, every signed-in
-- user can browse published videos.

create table if not exists public.videos (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  url             text not null,
  provider        text,                 -- 'youtube' | 'vimeo' | 'other'
  provider_video_id text,
  thumbnail_url   text,
  tags            text[] not null default '{}',
  status          text not null default 'draft' check (status in ('draft','published')),
  author_id       uuid references public.profiles(id) on delete set null,
  view_count      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  published_at    timestamptz
);

-- Indexes
create index if not exists videos_status_idx
  on public.videos(status, updated_at desc);

create index if not exists videos_tags_idx
  on public.videos using gin(tags);

-- Wrapper marked IMMUTABLE so Postgres accepts it inside a generated column.
-- (Bare to_tsvector(regconfig, text) is technically immutable but recent PG
-- versions reject it inside generated columns; wrapping in our own SQL
-- function with an explicit immutable label sidesteps the check.)
create or replace function public.videos_build_tsv(
  p_title text,
  p_description text,
  p_tags text[]
) returns tsvector
language sql
immutable
as $$
  select setweight(to_tsvector('english'::regconfig, coalesce(p_title, '')), 'A') ||
         setweight(to_tsvector('english'::regconfig, coalesce(p_description, '')), 'B') ||
         setweight(to_tsvector('english'::regconfig, array_to_string(coalesce(p_tags, '{}'::text[]), ' ')), 'C');
$$;

alter table public.videos
  add column if not exists search_tsv tsvector
  generated always as (public.videos_build_tsv(title, description, tags)) stored;

create index if not exists videos_search_idx
  on public.videos using gin(search_tsv);

-- updated_at trigger
create or replace function public.videos_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_videos_updated on public.videos;
create trigger trg_videos_updated
  before update on public.videos
  for each row execute function public.videos_set_updated_at();

-- published_at trigger
create or replace function public.videos_set_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_videos_published on public.videos;
create trigger trg_videos_published
  before insert or update on public.videos
  for each row execute function public.videos_set_published_at();

-- RLS
alter table public.videos enable row level security;

drop policy if exists "videos read published" on public.videos;
create policy "videos read published"
  on public.videos for select
  using (
    auth.role() = 'authenticated' and (
      status = 'published'
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('admin', 'manager')
      )
    )
  );

drop policy if exists "videos write managers" on public.videos;
create policy "videos write managers"
  on public.videos for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager')
    )
  );

-- View counter RPC
create or replace function public.video_increment_view(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.videos
     set view_count = view_count + 1
   where id = p_id
     and status = 'published';
$$;

revoke all on function public.video_increment_view(uuid) from public;
grant execute on function public.video_increment_view(uuid) to authenticated;

-- Grants (Data API)
grant select, insert, update, delete on public.videos to authenticated;
grant all on public.videos to service_role;

notify pgrst, 'reload schema';
