-- Knowledge Base
-- Articles authored by managers/admins; readable by any authenticated user.
-- Drafts are visible to managers only. Department is optional (null = global).

create table if not exists public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body_md text not null default '',
  summary text,
  department text check (department in ('IT', 'FAC', 'HS')),
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  author_id uuid references public.profiles(id) on delete set null,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists kb_articles_status_dept_idx
  on public.kb_articles(status, department, updated_at desc);

create index if not exists kb_articles_slug_idx
  on public.kb_articles(slug);

create index if not exists kb_articles_tags_idx
  on public.kb_articles using gin(tags);

-- Full-text search column for title + summary + body
alter table public.kb_articles
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body_md, '')), 'C')
  ) stored;

create index if not exists kb_articles_search_idx
  on public.kb_articles using gin(search_tsv);

-- updated_at trigger
drop trigger if exists trg_kb_articles_updated on public.kb_articles;
create trigger trg_kb_articles_updated
  before update on public.kb_articles
  for each row execute function public.set_updated_at();

-- Auto-stamp published_at when status flips to 'published'
create or replace function public.kb_set_published_at()
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

drop trigger if exists trg_kb_set_published on public.kb_articles;
create trigger trg_kb_set_published
  before insert or update on public.kb_articles
  for each row execute function public.kb_set_published_at();

-- RLS
alter table public.kb_articles enable row level security;

-- Read: published → any authenticated user; drafts → managers/admins only
drop policy if exists "kb read published" on public.kb_articles;
create policy "kb read published"
  on public.kb_articles for select
  using (
    auth.role() = 'authenticated' and (
      status = 'published'
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('admin', 'manager')
      )
    )
  );

-- Insert/update/delete: managers/admins only
drop policy if exists "kb write managers" on public.kb_articles;
create policy "kb write managers"
  on public.kb_articles for all
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

-- RPC to increment view_count without granting full update privileges
create or replace function public.kb_increment_view(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.kb_articles
     set view_count = view_count + 1
   where slug = p_slug and status = 'published';
$$;

grant execute on function public.kb_increment_view(text) to authenticated;
