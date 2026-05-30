import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  VIDEO_TAGS,
  VIDEO_TAG_LABEL,
  type Video,
  type VideoStatus,
  type VideoTag,
} from '../lib/videos';

export default function VideoLibrary() {
  const { isManager } = useAuth();
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<VideoTag[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | VideoStatus>('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['videos', search, activeTags, statusFilter, isManager],
    queryFn: async (): Promise<Video[]> => {
      if (!supabase) throw new Error('Supabase not configured');
      let q = supabase
        .from('videos')
        .select(
          'id, title, description, url, provider, provider_video_id, thumbnail_url, tags, status, author_id, view_count, created_at, updated_at, published_at',
        )
        .order('updated_at', { ascending: false })
        .limit(120);

      if (!isManager) q = q.eq('status', 'published');
      else if (statusFilter) q = q.eq('status', statusFilter);

      if (activeTags.length > 0) q = q.contains('tags', activeTags);

      if (search.trim()) {
        q = q.textSearch('search_tsv', search.trim(), {
          type: 'websearch',
          config: 'english',
        });
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Video[];
    },
  });

  const toggleTag = (t: VideoTag) =>
    setActiveTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const items = useMemo(() => data ?? [], [data]);

  return (
    <section>
      <div className="page-header">
        <div>
          <h1 className="page-title">Video library</h1>
          <p className="text-sm italic text-slate-500">
            Short how-to videos for Warwick Academy systems. Filter by tag or search by title.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search videos…"
            className="field-sm w-64"
          />
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
            <Link to="/videos/new" className="btn-pill">
              + New video
            </Link>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {VIDEO_TAGS.map((t) => {
          const active = activeTags.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition',
                active
                  ? 'bg-[#1a2744] text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              {VIDEO_TAG_LABEL[t]}
            </button>
          );
        })}
        {activeTags.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTags([])}
            className="text-xs text-slate-500 underline hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-rose-600">{(error as Error).message}</p>}

      {!isLoading && items.length === 0 && (
        <p className="text-sm text-slate-500">No videos match your filters yet.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((v) => (
          <Link
            key={v.id}
            to={`/videos/${v.id}`}
            className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
          >
            <div className="relative aspect-video w-full bg-slate-100">
              {v.thumbnail_url ? (
                <img
                  src={v.thumbnail_url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <svg viewBox="0 0 24 24" className="h-12 w-12" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
              {v.status === 'draft' && (
                <span className="absolute left-2 top-2 rounded bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Draft
                </span>
              )}
            </div>
            <div className="p-3">
              <h3 className="line-clamp-2 text-sm font-semibold text-slate-900 group-hover:text-[#1a2744]">
                {v.title}
              </h3>
              {v.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {v.tags.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600"
                    >
                      {VIDEO_TAG_LABEL[t as VideoTag] ?? t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
