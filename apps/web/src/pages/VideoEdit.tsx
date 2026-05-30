import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  detectProvider,
  VIDEO_TAGS,
  VIDEO_TAG_LABEL,
  type Video,
  type VideoStatus,
  type VideoTag,
} from '../lib/videos';

export default function VideoEdit() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const { isManager, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState<VideoTag[]>([]);
  const [status, setStatus] = useState<VideoStatus>('draft');
  const [thumbnailOverride, setThumbnailOverride] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: ['video-edit', id],
    enabled: !isNew && !!id,
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
    if (existing) {
      setTitle(existing.title);
      setDescription(existing.description ?? '');
      setUrl(existing.url);
      setTags(existing.tags.filter((t): t is VideoTag => (VIDEO_TAGS as readonly string[]).includes(t)));
      setStatus(existing.status);
      setThumbnailOverride(existing.thumbnail_url ?? '');
    }
  }, [existing]);

  const detected = useMemo(() => detectProvider(url), [url]);
  const previewEmbed = detected.embedUrl;
  const previewThumb = thumbnailOverride.trim() || detected.thumbnailUrl;

  const toggleTag = (t: VideoTag) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const save = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      if (!title.trim()) throw new Error('Title is required.');
      if (!url.trim()) throw new Error('Video URL is required.');

      const row = {
        title: title.trim(),
        description: description.trim() || null,
        url: url.trim(),
        provider: detected.provider,
        provider_video_id: detected.videoId,
        thumbnail_url: thumbnailOverride.trim() || detected.thumbnailUrl,
        tags,
        status,
        author_id: existing?.author_id ?? user?.id ?? null,
      };

      if (isNew) {
        const { data, error } = await supabase
          .from('videos')
          .insert(row)
          .select('id')
          .single();
        if (error) throw error;
        return data.id as string;
      }
      const { error } = await supabase.from('videos').update(row).eq('id', id!);
      if (error) throw error;
      return id!;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['video', newId] });
      navigate(`/videos/${newId}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!supabase || !id) return;
      const { error } = await supabase.from('videos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      navigate('/videos');
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!isManager) {
    return (
      <p className="text-sm text-slate-600">
        Only managers and admins can add or edit videos.{' '}
        <Link to="/videos" className="underline">
          Back to library
        </Link>
        .
      </p>
    );
  }

  if (!isNew && isLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="page-title">{isNew ? 'New video' : 'Edit video'}</h1>
        <Link to="/videos" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to library
        </Link>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field w-full"
            placeholder="e.g. How to log in to ManageBac"
          />
        </div>

        <div>
          <label className="label" htmlFor="url">Video URL</label>
          <input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="field w-full"
            placeholder="Paste a YouTube, Vimeo, or other embeddable URL"
          />
          {url && (
            <p className="mt-1 text-xs text-slate-500">
              Detected: <strong>{detected.provider}</strong>
              {detected.videoId && <> · id <code>{detected.videoId}</code></>}
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="description">Description (optional)</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="field w-full"
            rows={4}
          />
        </div>

        <div>
          <span className="label">Tags</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {VIDEO_TAGS.map((t) => {
              const active = tags.includes(t);
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
          </div>
        </div>

        <div>
          <label className="label" htmlFor="thumb">Thumbnail URL override (optional)</label>
          <input
            id="thumb"
            value={thumbnailOverride}
            onChange={(e) => setThumbnailOverride(e.target.value)}
            className="field w-full"
            placeholder="Leave blank to auto-detect from YouTube"
          />
        </div>

        <div>
          <label className="label" htmlFor="status">Status</label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as VideoStatus)}
            className="field-select"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>

        {previewEmbed && (
          <div>
            <span className="label">Preview</span>
            <div className="mt-1 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="aspect-video overflow-hidden rounded-md border border-slate-200 bg-black">
                <iframe
                  src={previewEmbed}
                  title="Preview"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              </div>
              {previewThumb && (
                <div className="aspect-video overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                  <img src={previewThumb} alt="" className="h-full w-full object-cover" />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="btn-pill"
          >
            {save.isPending ? 'Saving…' : isNew ? 'Create video' : 'Save changes'}
          </button>
          {!isNew && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete this video? This cannot be undone.')) remove.mutate();
              }}
              disabled={remove.isPending}
              className="text-sm text-rose-600 hover:underline"
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
