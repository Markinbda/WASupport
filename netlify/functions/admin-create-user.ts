/**
 * Admin-only: invite a new user by email.
 *
 * POST /api/admin-create-user
 * Headers:
 *   Authorization: Bearer <caller-jwt>     (admin's Supabase access token)
 * Body:
 *   { email: string; full_name?: string; role: UserRole }
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import type { Handler } from '@netlify/functions';

type UserRole =
  | 'submitter'
  | 'it_tech'
  | 'fac_tech'
  | 'hs_officer'
  | 'support'
  | 'manager'
  | 'admin'
  | 'leadership';

const VALID_ROLES: UserRole[] = [
  'submitter',
  'it_tech',
  'fac_tech',
  'hs_officer',
  'support',
  'manager',
  'admin',
  'leadership',
];

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function json(status: number, body: unknown) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const auth = event.headers.authorization ?? event.headers.Authorization;
  if (!auth?.startsWith('Bearer ')) return json(401, { error: 'Missing bearer token' });
  const callerJwt = auth.slice(7);

  let body: { email?: string; full_name?: string; role?: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const email = body.email?.trim().toLowerCase();
  const full_name = body.full_name?.trim() || null;
  const role = body.role as UserRole | undefined;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'Valid email required' });
  }
  if (!role || !VALID_ROLES.includes(role)) {
    return json(400, { error: 'Valid role required' });
  }

  const supabaseUrl = env('SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');

  // 1. Identify caller from their JWT.
  const meRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${callerJwt}` },
  });
  if (!meRes.ok) return json(401, { error: 'Invalid session' });
  const me = (await meRes.json()) as { id: string };

  // 2. Verify caller is admin (via service role to bypass RLS).
  const profRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${me.id}&select=role`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const prof = (await profRes.json()) as { role: UserRole }[];
  if (prof[0]?.role !== 'admin') return json(403, { error: 'Admin only' });

  // 3. Invite the new user (sends email via Supabase's configured provider).
  //    Netlify auto-sets `URL` to the site's primary URL; fall back to the live site.
  const siteUrl = (process.env.PUBLIC_SITE_URL || process.env.URL || 'https://warwickacademy.netlify.app').replace(/\/$/, '');
  const redirectTo = `${siteUrl}/auth/callback`;

  const inviteRes = await fetch(`${supabaseUrl}/auth/v1/invite`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      data: full_name ? { full_name } : undefined,
      redirect_to: redirectTo,
    }),
  });
  const inviteBody = await inviteRes.text();
  if (!inviteRes.ok) {
    return json(inviteRes.status, { error: 'Invite failed', detail: inviteBody });
  }
  let invited: { id?: string };
  try {
    invited = JSON.parse(inviteBody) as { id?: string };
  } catch {
    invited = {};
  }

  // 4. Promote the freshly-created profile row to the requested role + name.
  //    The handle_new_user trigger has already inserted (id, email, full_name=email).
  if (invited.id) {
    const patch: Record<string, unknown> = { role };
    if (full_name) patch.full_name = full_name;
    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${invited.id}`,
      {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'content-type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(patch),
      },
    );
    if (!patchRes.ok) {
      return json(500, {
        error: 'Invited, but failed to set role',
        detail: await patchRes.text(),
      });
    }
  }

  return json(200, { ok: true, id: invited.id ?? null, email });
};
