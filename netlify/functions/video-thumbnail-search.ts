/** Manager-only thumbnail search using CC0 and public-domain Openverse images. */
import type { Handler } from '@netlify/functions';

type OpenverseImage = {
  id: string;
  title?: string | null;
  creator?: string | null;
  thumbnail?: string | null;
  url?: string | null;
  foreign_landing_url?: string | null;
  license?: string | null;
};

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

  const auth = event.headers.authorization ?? event.headers.Authorization;
  if (!auth?.startsWith('Bearer ')) return json(401, { error: 'Missing bearer token' });

  const query = (event.queryStringParameters?.q ?? '').trim().slice(0, 300);
  if (query.length < 2) return json(400, { error: 'Enter at least two characters' });

  const supabaseUrl = env('SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const callerJwt = auth.slice(7);

  const meResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${callerJwt}` },
  });
  if (!meResponse.ok) return json(401, { error: 'Invalid session' });
  const me = (await meResponse.json()) as { id: string };

  const profileResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${me.id}&select=role`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!profileResponse.ok) return json(502, { error: 'Could not verify role' });
  const profiles = (await profileResponse.json()) as { role: string }[];
  if (!['admin', 'manager'].includes(profiles[0]?.role ?? '')) {
    return json(403, { error: 'Managers and admins only' });
  }

  const searchUrl = new URL('https://api.openverse.org/v1/images/');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('page_size', '12');
  searchUrl.searchParams.set('license', 'cc0,pdm');
  searchUrl.searchParams.set('mature', 'false');

  const searchResponse = await fetch(searchUrl, {
    headers: { 'user-agent': 'WA Support Center thumbnail search' },
  });
  if (!searchResponse.ok) {
    return json(502, { error: 'Image search is temporarily unavailable' });
  }

  const body = (await searchResponse.json()) as { results?: OpenverseImage[] };
  const results = (body.results ?? []).flatMap((image) => {
    const imageUrl = image.thumbnail || image.url;
    if (!imageUrl) return [];
    return [{
      id: image.id,
      title: image.title?.trim() || 'Untitled image',
      creator: image.creator?.trim() || null,
      thumbnailUrl: imageUrl,
      sourceUrl: image.foreign_landing_url || null,
      license: image.license?.toUpperCase() || 'Public domain',
    }];
  });

  return json(200, { results });
};