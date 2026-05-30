import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  detectProvider,
  VIDEO_TAG_LABEL,
  type Video,
  type VideoTag,
} from '../lib/videos';

export default function VideoView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isManager } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['video', id],
    enabled: !!id,
    queryFn: async (): Promise<Video | null> => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('videos')
        .select(
          'id, title, description, url, provider, provider_video_id, thumbnail_url, tags, status, author_id, view_count, created_at, updated_at, published_at',
        )
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data as Video | null) ?? null;
    },
  });

  useEffect(() => {
    if (!supabase || !data || data.status !== 'published') return;
    supabase.rpc('video_increment_view', { p_id: data.id });
  }, [data?.id, data?.status]);

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) return <p className="text-sm text-rose-600">{(error as Error).message}</p>;
  if (!data) {
    return (
      <div className="text-sm text-slate-500">
        Video not found.{' '}
        <button onClick={() => navigate('/videos')} className="text-[#1a2744] underline">
          Back to library
        </button>
      </div>
    );
  }

  const detected = detectProvider(data.url);
  const embedUrl = detected.embedUrl || data.url;

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link to="/videos" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to library
        </Link>
        {isManager && (
          <Link
            to={`/videos/${data.id}/edit`}
            className="text-sm font-medium text-[#1a2744] hover:underline"
          >
            Edit
          </Link>
        )}
      </div>

      <h1 className="page-title">{data.title}</h1>

      {data.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {data.tags.map((t) => (
            <span
              key={t}
              className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600"
            >
              {VIDEO_TAG_LABEL[t as VideoTag] ?? t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-black">
        <iframe
          src={embedUrl}
          title={data.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>

      {data.description && (
        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{data.description}</p>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Source:{' '}
        <a href={data.url} target="_blank" rel="noreferrer" className="underline">
          {data.url}
        </a>
      </p>
    </section>
  );
}
