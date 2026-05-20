-- KB extend: the original init migration created kb_articles with a different
-- shape, so the `create table if not exists` block in 20260520000008_kb.sql
-- was a no-op against existing databases. This migration brings the table
-- forward in-place by adding the missing columns, indexes, triggers, RPC,
-- and RLS policies expected by the app.

-- 1) Columns ----------------------------------------------------------------

alter table public.kb_articles
  add column if not exists slug         text,
  add column if not exists summary      text,
  add column if not exists tags         text[] not null default '{}',
  add column if not exists status       text not null default 'draft',
  add column if not exists view_count   integer not null default 0,
  add column if not exists published_at timestamptz;

-- Status check constraint (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'kb_articles_status_check'
      and conrelid = 'public.kb_articles'::regclass
  ) then
    alter table public.kb_articles
      add constraint kb_articles_status_check
      check (status in ('draft', 'published'));
  end if;
end$$;

-- Backfill slug for any pre-existing rows from title
update public.kb_articles
   set slug = lower(regexp_replace(regexp_replace(coalesce(title, id::text), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'))
 where slug is null;

-- Make slug NOT NULL + UNIQUE (idempotent)
do $$
begin
  begin
    alter table public.kb_articles alter column slug set not null;
  exception when others then null;
  end;
  if not exists (
    select 1 from pg_constraint
    where conname = 'kb_articles_slug_key'
      and conrelid = 'public.kb_articles'::regclass
  ) then
    alter table public.kb_articles
      add constraint kb_articles_slug_key unique (slug);
  end if;
end$$;

-- 2) Indexes ----------------------------------------------------------------

create index if not exists kb_articles_status_dept_idx
  on public.kb_articles(status, department, updated_at desc);

create index if not exists kb_articles_slug_idx
  on public.kb_articles(slug);

create index if not exists kb_articles_tags_idx
  on public.kb_articles using gin(tags);

-- 3) Full-text search -------------------------------------------------------

alter table public.kb_articles
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body_md, '')), 'C')
  ) stored;

create index if not exists kb_articles_search_idx
  on public.kb_articles using gin(search_tsv);

-- 4) Triggers ---------------------------------------------------------------

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

-- 5) RLS --------------------------------------------------------------------

alter table public.kb_articles enable row level security;

drop policy if exists "kb read published"  on public.kb_articles;
drop policy if exists "kb_articles_select" on public.kb_articles;
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

drop policy if exists "kb write managers"  on public.kb_articles;
drop policy if exists "kb_articles_modify" on public.kb_articles;
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

-- 6) View counter RPC -------------------------------------------------------

create or replace function public.kb_increment_view(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.kb_articles
     set view_count = view_count + 1
   where slug = p_slug
     and status = 'published';
$$;

revoke all on function public.kb_increment_view(text) from public;
grant execute on function public.kb_increment_view(text) to authenticated;

-- 7) Force PostgREST schema cache reload
notify pgrst, 'reload schema';
