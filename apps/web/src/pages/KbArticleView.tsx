import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { DEPARTMENT_LABEL, type KbArticle } from '../lib/types';

export default function KbArticleView() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { isManager } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['kb-article', slug],
    enabled: !!slug,
    queryFn: async (): Promise<KbArticle | null> => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('kb_articles')
        .select(
          'id, slug, title, body_md, summary, department, tags, status, author_id, view_count, created_at, updated_at, published_at',
        )
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return (data as KbArticle | null) ?? null;
    },
  });

  // Increment view counter once on load (published only).
  useEffect(() => {
    if (!supabase || !data || data.status !== 'published') return;
    supabase.rpc('kb_increment_view', { p_slug: slug }).then(() => {
      /* fire-and-forget */
    });
  }, [slug, data]);

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) return <p className="alert-error">{(error as Error).message}</p>;
  if (!data) {
    return (
      <section>
        <p className="alert-warn">Article not found.</p>
        <Link to="/kb" className="text-sm text-sky-700 hover:underline">
          ← Back to knowledge base
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link to="/kb" className="text-sm text-sky-700 hover:underline">
          ← Back to knowledge base
        </Link>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {data.department && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
            {DEPARTMENT_LABEL[data.department]}
          </span>
        )}
        {data.status === 'draft' && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            Draft (not yet visible to others)
          </span>
        )}
        {data.tags.map((t) => (
          <span key={t} className="text-xs text-slate-500">
            #{t}
          </span>
        ))}
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <h1 className="page-title">{data.title}</h1>
        {isManager && (
          <button
            onClick={() => navigate(`/kb/${data.slug}/edit`)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
        )}
      </div>

      {data.summary && (
        <p className="mb-6 text-base italic text-slate-600">{data.summary}</p>
      )}

      <article className="kb-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.body_md}</ReactMarkdown>
      </article>

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
        <div>
          {data.view_count} view{data.view_count === 1 ? '' : 's'} ·
          {' '}Updated {new Date(data.updated_at).toLocaleDateString()}
          {data.published_at && (
            <> · Published {new Date(data.published_at).toLocaleDateString()}</>
          )}
        </div>
      </footer>
    </section>
  );
}
