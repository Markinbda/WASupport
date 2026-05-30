/** Shared helpers + types for the Video Library. */

export type VideoStatus = 'draft' | 'published';

export interface Video {
  id: string;
  title: string;
  description: string | null;
  url: string;
  provider: string | null;
  provider_video_id: string | null;
  thumbnail_url: string | null;
  tags: string[];
  status: VideoStatus;
  author_id: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/** Tag taxonomy users can pick from. Stored lower-case in DB. */
export const VIDEO_TAGS = [
  'office',
  'primary',
  'secondary',
  'applications',
  'hardware',
  'software',
] as const;

export type VideoTag = (typeof VIDEO_TAGS)[number];

export const VIDEO_TAG_LABEL: Record<VideoTag, string> = {
  office: 'Office',
  primary: 'Primary',
  secondary: 'Secondary',
  applications: 'Applications',
  hardware: 'Using Hardware',
  software: 'Using Software',
};

type DetectedProvider = {
  provider: 'youtube' | 'vimeo' | 'other';
  videoId: string | null;
  embedUrl: string;
  thumbnailUrl: string | null;
};

/** Inspect a pasted URL and return embed + thumbnail metadata. */
export function detectProvider(rawUrl: string): DetectedProvider {
  const url = rawUrl.trim();
  if (!url) {
    return { provider: 'other', videoId: null, embedUrl: '', thumbnailUrl: null };
  }

  // YouTube
  const yt =
    url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt && yt[1]) {
    const id = yt[1];
    return {
      provider: 'youtube',
      videoId: id,
      embedUrl: `https://www.youtube.com/embed/${id}`,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  }

  // Vimeo
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d{5,})/);
  if (vm && vm[1]) {
    const id = vm[1];
    return {
      provider: 'vimeo',
      videoId: id,
      embedUrl: `https://player.vimeo.com/video/${id}`,
      thumbnailUrl: null,
    };
  }

  // Fallback: try to embed directly (works for .mp4 in some cases via <video>,
  // and for any site that allows iframe embedding).
  return {
    provider: 'other',
    videoId: null,
    embedUrl: url,
    thumbnailUrl: null,
  };
}
