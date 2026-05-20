import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  DEPARTMENT_LABEL,
  type Department,
  type KbArticle,
  type KbStatus,
} from '../lib/types';

export default function KbList() {
  const { isManager } = useAuth();
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState<'' | Department>('');
  const [statusFilter, setStatusFilter] = useState<'' | KbStatus>('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['kb-list', search, dept, statusFilter, isManager],
    queryFn: async (): Promise<KbArticle[]> => {
      if (!supabase) throw new Error('Supabase not configured');
      let q = supabase
        .from('kb_articles')
        .select(
          'id, slug, title, body_md, summary, department, tags, status, author_id, view_count, created_at, updated_at, published_at',
        )
        .order('updated_at', { ascending: false })
        .limit(100);
      if (!isManager) q = q.eq('status', 'published');
      else if (statusFilter) q = q.eq('status', statusFilter);
      if (dept) q = q.eq('department', dept);
      if (search.trim()) {
        q = q.textSearch('search_tsv', search.trim(), {
          type: 'websearch',
          config: 'english',
        });
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as KbArticle[];
    },
  });

  return (
    <section>
      <div className="page-header">
        <div>
          <h1 className="page-title">Knowledge base</h1>
          <p className="text-sm italic text-slate-500">
            Browse articles by department or search by keyword. Try things like
            <em> printer offline</em> or <em> password reset</em>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles…"
            className="field-sm w-64"
          />
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value as typeof dept)}
            className="field-select-sm"
          >
            <option value="">All departments</option>
            <option value="IT">IT Support</option>
            <option value="FAC">Facilities</option>
            <option value="HS">Health &amp; Safety</option>
          </select>
          {isManager && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="field-select-sm"
            >
              <option value="">Published + drafts</option>
              <option value="published">Published only</option>
              <option value="draft">Drafts only</option>
            </select>
          )}
          {isManager && (
            <Link to="/kb/new" className="btn-pill">
              + New article
            </Link>
          )}
        </div>
      </div>

      {error && <p className="mb-4 alert-error">{(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-slate-500">Loading articles…</p>}

      {data && data.length === 0 && (
        <p className="text-sm text-slate-500">
          No articles found. {isManager && 'Click + New article to write the first one.'}
        </p>
      )}

      {data && data.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.map((a) => (
            <li
              key={a.id}
              className="rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
            >
              <Link to={`/kb/${a.slug}`} className="block">
                <div className="mb-1 flex items-center gap-2">
                  {a.department && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {DEPARTMENT_LABEL[a.department]}
                    </span>
                  )}
                  {a.status === 'draft' && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      Draft
                    </span>
                  )}
                </div>
                <h2 className="text-base font-semibold text-slate-900">{a.title}</h2>
                {a.summary && (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{a.summary}</p>
                )}
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {a.tags.length > 0 ? a.tags.slice(0, 3).map((t) => `#${t}`).join(' ') : ''}
                  </span>
                  <span>
                    {a.view_count} view{a.view_count === 1 ? '' : 's'}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
