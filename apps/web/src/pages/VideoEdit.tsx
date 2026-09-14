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

type ThumbnailResult = {
  id: string;
  title: string;
  creator: string | null;
  thumbnailUrl: string;
  sourceUrl: string | null;
  license: string;
};

const THUMBNAIL_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

function uploadedThumbnailPath(url: string | null | undefined) {
  if (!url) return null;
  const marker = '/storage/v1/object/public/video-thumbnails/';
  try {
    const path = new URL(url).pathname;
    const markerIndex = path.indexOf(marker);
    return markerIndex >= 0 ? decodeURIComponent(path.slice(markerIndex + marker.length)) : null;
  } catch {
    return null;
  }
}

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
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailFilePreview, setThumbnailFilePreview] = useState('');
  const [thumbnailQuery, setThumbnailQuery] = useState('');
  const [thumbnailResults, setThumbnailResults] = useState<ThumbnailResult[]>([]);
  const [thumbnailSearchPending, setThumbnailSearchPending] = useState(false);
  const [thumbnailSearchError, setThumbnailSearchError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!thumbnailFile) {
      setThumbnailFilePreview('');
      return;
    }
    const objectUrl = URL.createObjectURL(thumbnailFile);
    setThumbnailFilePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [thumbnailFile]);

  const detected = useMemo(() => detectProvider(url), [url]);
  const previewEmbed = detected.embedUrl;
  const previewThumb = thumbnailFilePreview || thumbnailOverride.trim() || detected.thumbnailUrl;

  const toggleTag = (t: VideoTag) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  async function searchThumbnails(query: string) {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2 || !supabase) {
      setThumbnailSearchError('Enter at least two characters to search.');
      return;
    }

    setThumbnailQuery(trimmedQuery);
    setThumbnailSearchPending(true);
    setThumbnailSearchError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Your session has expired. Sign in again to search.');

      const response = await fetch(`/api/video-thumbnail-search?q=${encodeURIComponent(trimmedQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        results?: ThumbnailResult[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || `Image search failed with HTTP ${response.status}`);
      setThumbnailResults(body.results ?? []);
    } catch (caught) {
      setThumbnailResults([]);
      setThumbnailSearchError(caught instanceof Error ? caught.message : 'Image search failed.');
    } finally {
      setThumbnailSearchPending(false);
    }
  }

  function titleAndDescriptionQuery() {
    return [title.trim(), description.trim()].filter(Boolean).join(' ').slice(0, 300);
  }

  function chooseThumbnailFile(file: File | null) {
    if (!file) return;
    if (!THUMBNAIL_TYPES.includes(file.type)) {
      setError('Thumbnail must be a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > MAX_THUMBNAIL_BYTES) {
      setError('Thumbnail must be 5 MB or smaller.');
      return;
    }
    setError(null);
    setThumbnailFile(file);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      if (!title.trim()) throw new Error('Title is required.');
      if (!url.trim()) throw new Error('Video URL is required.');

      let thumbnailUrl = thumbnailOverride.trim() || detected.thumbnailUrl;
      let uploadedPath: string | null = null;
      if (thumbnailFile) {
        if (!user) throw new Error('Sign in again before uploading a thumbnail.');
        const extension = (thumbnailFile.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 8);
        uploadedPath = `videos/${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('video-thumbnails')
          .upload(uploadedPath, thumbnailFile, {
            contentType: thumbnailFile.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        thumbnailUrl = supabase.storage.from('video-thumbnails').getPublicUrl(uploadedPath).data.publicUrl;
      }

      const row = {
        title: title.trim(),
        description: description.trim() || null,
        url: url.trim(),
        provider: detected.provider,
        provider_video_id: detected.videoId,
        thumbnail_url: thumbnailUrl,
        tags,
        status,
        author_id: existing?.author_id ?? user?.id ?? null,
      };

      try {
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
        const previousUpload = uploadedThumbnailPath(existing?.thumbnail_url);
        if (previousUpload && existing?.thumbnail_url !== thumbnailUrl) {
          await supabase.storage.from('video-thumbnails').remove([previousUpload]);
        }
        return id!;
      } catch (saveError) {
        if (uploadedPath) {
          await supabase.storage.from('video-thumbnails').remove([uploadedPath]);
        }
        throw saveError;
      }
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
      const previousUpload = uploadedThumbnailPath(existing?.thumbnail_url);
      if (previousUpload) {
        await supabase.storage.from('video-thumbnails').remove([previousUpload]);
      }
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
          <label className="label" htmlFor="thumb">Thumbnail</label>
          <input
            id="thumb"
            value={thumbnailOverride}
            onChange={(e) => {
              setThumbnailOverride(e.target.value);
              setThumbnailFile(null);
            }}
            className="field w-full"
            placeholder="Leave blank to auto-detect from YouTube"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="btn-ghost cursor-pointer px-4 py-2 text-xs">
              Upload image
              <input
                type="file"
                accept={THUMBNAIL_TYPES.join(',')}
                className="sr-only"
                onChange={(e) => {
                  chooseThumbnailFile(e.target.files?.[0] ?? null);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            {thumbnailFile && (
              <>
                <span className="max-w-72 truncate text-xs text-slate-600">
                  {thumbnailFile.name} ({(thumbnailFile.size / 1024 / 1024).toFixed(1)} MB)
                </span>
                <button
                  type="button"
                  onClick={() => setThumbnailFile(null)}
                  className="text-xs font-medium text-rose-600 hover:underline"
                >
                  Remove upload
                </button>
              </>
            )}
          </div>
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-52 flex-1">
                <label className="field-label" htmlFor="thumbnail-search">Search images</label>
                <input
                  id="thumbnail-search"
                  value={thumbnailQuery}
                  onChange={(e) => setThumbnailQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void searchThumbnails(thumbnailQuery);
                    }
                  }}
                  className="field-sm w-full"
                  placeholder="Describe the image you need"
                />
              </div>
              <button
                type="button"
                onClick={() => void searchThumbnails(thumbnailQuery)}
                disabled={thumbnailSearchPending || thumbnailQuery.trim().length < 2}
                className="btn-primary px-4 py-2"
              >
                {thumbnailSearchPending ? 'Searching…' : 'Search'}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void searchThumbnails(title)}
                disabled={thumbnailSearchPending || title.trim().length < 2}
                className="btn-ghost px-3 py-2 text-xs"
              >
                Suggest from title
              </button>
              <button
                type="button"
                onClick={() => void searchThumbnails(titleAndDescriptionQuery())}
                disabled={thumbnailSearchPending || titleAndDescriptionQuery().length < 2}
                className="btn-ghost px-3 py-2 text-xs"
              >
                Use title + description
              </button>
              {thumbnailOverride && (
                <button
                  type="button"
                  onClick={() => {
                    setThumbnailFile(null);
                    setThumbnailOverride('');
                  }}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Use video thumbnail
                </button>
              )}
            </div>

            {thumbnailSearchError && <p className="mt-3 alert-error">{thumbnailSearchError}</p>}
            {!thumbnailSearchPending && !thumbnailSearchError && thumbnailResults.length === 0 && thumbnailQuery && (
              <p className="mt-3 text-xs text-slate-500">No image results yet. Try a broader description.</p>
            )}

            {thumbnailResults.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {thumbnailResults.map((image) => {
                  const selected = thumbnailOverride === image.thumbnailUrl;
                  return (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => {
                        setThumbnailFile(null);
                        setThumbnailOverride(image.thumbnailUrl);
                      }}
                      className={`overflow-hidden rounded-md border-2 bg-slate-50 text-left transition ${
                        selected
                          ? 'border-brand-amber ring-2 ring-brand-amber/30'
                          : 'border-transparent hover:border-slate-400'
                      }`}
                      aria-pressed={selected}
                      title={`Use ${image.title}`}
                    >
                      <div className="aspect-video bg-slate-100">
                        <img
                          src={image.thumbnailUrl}
                          alt={image.title}
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <div className="h-14 px-2 py-1.5">
                        <div className="line-clamp-1 text-xs font-medium text-slate-800">{image.title}</div>
                        <div className="line-clamp-1 text-[10px] text-slate-500">
                          {[image.creator, image.license].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-500">
              Search results are CC0 or public-domain images provided by Openverse.
            </p>
          </div>
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
                  <img src={previewThumb} alt="" className="h-full w-full object-contain" />
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
