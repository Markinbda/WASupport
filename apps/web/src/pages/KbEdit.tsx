import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { Department, KbArticle, KbStatus } from '../lib/types';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export default function KbEdit() {
  const { slug } = useParams<{ slug?: string }>();
  const isNew = !slug;
  const { isManager, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [summary, setSummary] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const [department, setDepartment] = useState<'' | Department>('');
  const [tagsText, setTagsText] = useState('');
  const [status, setStatus] = useState<KbStatus>('draft');
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: ['kb-article-edit', slug],
    enabled: !isNew && !!slug,
    queryFn: async (): Promise<KbArticle | null> => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('kb_articles')
        .select(
          'id, slug, title, body_md, summary, department, tags, status, author_id, view_count, created_at, updated_at, published_at',
        )
        .eq('slug', slug!)
        .maybeSingle();
      if (error) throw error;
      return (data as KbArticle | null) ?? null;
    },
  });

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setSlugInput(existing.slug);
      setSlugTouched(true);
      setSummary(existing.summary ?? '');
      setBodyMd(existing.body_md);
      setDepartment(existing.department ?? '');
      setTagsText(existing.tags.join(', '));
      setStatus(existing.status);
    }
  }, [existing]);

  // Auto-derive slug from title until user manually edits it
  useEffect(() => {
    if (!slugTouched && isNew) setSlugInput(slugify(title));
  }, [title, slugTouched, isNew]);

  const tags = useMemo(
    () =>
      tagsText
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0)
        .slice(0, 12),
    [tagsText],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      if (!title.trim()) throw new Error('Title is required.');
      if (!slugInput.trim()) throw new Error('Slug is required.');

      const row = {
        title: title.trim(),
        slug: slugInput.trim(),
        summary: summary.trim() || null,
        body_md: bodyMd,
        department: department || null,
        tags,
        status,
        author_id: existing?.author_id ?? user?.id ?? null,
      };

      if (isNew) {
        const { data, error } = await supabase
          .from('kb_articles')
          .insert(row)
          .select('slug')
          .single();
        if (error) throw error;
        return data!.slug as string;
      }
      const { error } = await supabase
        .from('kb_articles')
        .update(row)
        .eq('id', existing!.id);
      if (error) throw error;
      return row.slug;
    },
    onSuccess: (savedSlug) => {
      queryClient.invalidateQueries({ queryKey: ['kb-list'] });
      queryClient.invalidateQueries({ queryKey: ['kb-article', savedSlug] });
      navigate(`/kb/${savedSlug}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!supabase || !existing) throw new Error('Cannot delete');
      const { error } = await supabase.from('kb_articles').delete().eq('id', existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-list'] });
      navigate('/kb');
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!isManager) {
    return <p className="alert-warn">Managers and admins only.</p>;
  }
  if (!isNew && isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!isNew && !existing && !isLoading) {
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
    <section className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link to="/kb" className="text-sm text-sky-700 hover:underline">
          ← Back to knowledge base
        </Link>
      </div>

      <div className="page-header">
        <h1 className="page-title">{isNew ? 'New article' : 'Edit article'}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview((p) => !p)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
          {!isNew && (
            <button
              onClick={() => {
                if (window.confirm('Delete this article? This cannot be undone.')) {
                  remove.mutate();
                }
              }}
              disabled={remove.isPending}
              className="rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="btn-pill disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 alert-error">{error}</p>}

      {showPreview ? (
        <div>
          <h2 className="mb-2 text-2xl font-semibold text-slate-900">{title || 'Untitled'}</h2>
          {summary && <p className="mb-4 italic text-slate-600">{summary}</p>}
          <article className="kb-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyMd || '_(empty)_'}</ReactMarkdown>
          </article>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block">
              <span className="field-label">Title *</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="field"
                placeholder="How to reset your password"
              />
            </label>
            <label className="block">
              <span className="field-label">Slug *</span>
              <input
                value={slugInput}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlugInput(slugify(e.target.value));
                }}
                className="field font-mono text-sm"
                placeholder="how-to-reset-your-password"
              />
            </label>
          </div>

          <label className="block">
            <span className="field-label">Summary</span>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="field"
              placeholder="One-line teaser shown in article cards."
            />
          </label>

          <div className="grid gap-2 md:grid-cols-3">
            <label className="block">
              <span className="field-label">Department</span>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value as typeof department)}
                className="field-select"
              >
                <option value="">Global (any)</option>
                <option value="IT">IT Support</option>
                <option value="FAC">Facilities</option>
                <option value="HS">Health &amp; Safety</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as KbStatus)}
                className="field-select"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Tags (comma-separated)</span>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                className="field"
                placeholder="password, sso, account"
              />
            </label>
          </div>

          <label className="block">
            <span className="field-label">Body (Markdown)</span>
            <textarea
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              rows={20}
              className="field font-mono text-sm"
              placeholder={`## Steps\n\n1. Go to …\n2. Click …\n3. Done.`}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Supports GitHub-flavored markdown: headings, lists, tables, code blocks, links.
            </span>
          </label>
        </div>
      )}
    </section>
  );
}
