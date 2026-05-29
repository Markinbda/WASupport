#!/usr/bin/env node
/**
 * Seed 20 demo tickets spread across the last 7 days, with a mix of
 * open / pending / closed statuses.
 *
 *   node --env-file=.env.local scripts/seed-demo-tickets.mjs
 *
 * - Uses the service role key (bypasses RLS).
 * - Submitter = first admin profile found (falls back to any profile).
 * - Categories & locations are picked at random from existing rows
 *   (left null if none exist).
 * - Idempotent on the `demo:` marker in `imported_from`: re-running
 *   first deletes any prior demo tickets so the dashboard stays clean.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_TAG = 'demo-seed';

// --- helpers ---
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

function isoDaysAgo(days, hourJitter = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(d.getUTCHours() - hourJitter);
  return d.toISOString();
}

const slaWindowHours = { urgent: 4, critical: 4, high: 8, normal: 48, low: 168 };

// --- demo content ---
/** @type {{subject:string, description:string, department:'IT'|'FAC'|'HS', priority:'low'|'normal'|'high'|'critical'|'urgent'}[]} */
const TEMPLATES = [
  { subject: 'Projector in Room 204 not turning on', description: 'The HDMI input is dead and the bulb indicator is amber. Affecting period 3 lessons.', department: 'IT', priority: 'high' },
  { subject: 'Outlook stuck on "Trying to connect…"', description: 'Restarted laptop twice, still cannot send/receive. OWA in browser works fine.', department: 'IT', priority: 'normal' },
  { subject: 'New starter laptop setup — Jane Smith', description: 'Joining Maths dept on Monday. Needs standard staff image, Teams, and printer access.', department: 'IT', priority: 'normal' },
  { subject: 'Teams audio cutting out in Y10 lessons', description: 'Audio drops every ~30 seconds when sharing screen. Headset is school-issued Jabra.', department: 'IT', priority: 'normal' },
  { subject: 'Wi-Fi very slow in the Library', description: 'Speedtest shows ~2 Mbps on Warwick-Staff. Other parts of the school are fine.', department: 'IT', priority: 'high' },
  { subject: 'Cannot print to MFD-Staffroom', description: 'Job goes to spool then disappears. Other printers work from the same laptop.', department: 'IT', priority: 'low' },
  { subject: 'OneDrive sync paused with red X', description: 'Tooltip says "Account requires attention". Tried sign out / sign in.', department: 'IT', priority: 'normal' },
  { subject: 'Smartboard pen calibration drift', description: 'Touch point is ~3cm off from cursor. Calibration tool runs but does not save.', department: 'IT', priority: 'normal' },
  { subject: 'Leaking tap in Science Prep Room', description: 'Cold tap on the left sink dripping continuously overnight.', department: 'FAC', priority: 'normal' },
  { subject: 'Broken chair in Room 117', description: 'Back rest snapped off. Removed from room and placed in corridor.', department: 'FAC', priority: 'low' },
  { subject: 'Air-con not cooling in IT Office', description: 'Unit runs but only blows ambient-temperature air. Started yesterday afternoon.', department: 'FAC', priority: 'high' },
  { subject: 'Ceiling tile damp patch above stairs', description: 'Brown stain ~30cm wide near the south stairwell. Suspect roof leak after Tuesday storm.', department: 'FAC', priority: 'high' },
  { subject: 'Door closer too tight on Hall fire exit', description: 'Door slams shut hard enough to startle students. Needs adjustment.', department: 'FAC', priority: 'normal' },
  { subject: 'Light flickering in corridor B', description: 'Single fluorescent tube flickering near the staff toilets.', department: 'FAC', priority: 'low' },
  { subject: 'Student grazed knee on playground', description: 'Y4 student, cleaned and dressed. Parent notified at pickup.', department: 'HS', priority: 'normal' },
  { subject: 'Allergy plan update for Y7 student', description: 'New EpiPen prescription, please update on iSAMS and notify Boarding.', department: 'HS', priority: 'high' },
  { subject: 'Restock plasters in PE office', description: 'Down to last box of fabric plasters; also need saline pods.', department: 'HS', priority: 'low' },
  { subject: 'Eye-wash station check overdue', description: 'Chemistry prep room station last checked over 30 days ago per log.', department: 'HS', priority: 'normal' },
  { subject: 'Wasp nest near Art block entrance', description: 'Spotted activity around the door frame. Cordoned off temporarily.', department: 'FAC', priority: 'high' },
  { subject: 'Password reset for supply teacher', description: 'Supply teacher covering Y6 today, account locked after MFA prompts.', department: 'IT', priority: 'urgent' },
];

// --- bootstrap: submitter, categories, locations ---
async function pickSubmitter() {
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, role')
    .order('role', { ascending: true })
    .limit(50);
  if (error) throw error;
  if (!data?.length) throw new Error('No profiles found — cannot pick a submitter.');
  const admin = data.find((p) => p.role === 'admin');
  return admin ?? data[0];
}

async function loadCategoriesByDept() {
  const { data, error } = await sb.from('categories').select('id, department');
  if (error) throw error;
  const map = { IT: [], FAC: [], HS: [] };
  for (const r of data ?? []) {
    if (map[r.department]) map[r.department].push(r.id);
  }
  return map;
}

async function loadLocations() {
  const { data, error } = await sb.from('locations').select('id').limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

// --- ref helpers: assign client-side to avoid trigger / sequence races ---
async function nextRefStart() {
  // String ordering can't be trusted ('IT-9999' > 'IT-11100' lexically), so
  // page through all refs per dept and compute the max numerically.
  const next = { IT: 1, FAC: 1, HS: 1 };
  for (const d of /** @type {const} */ (['IT', 'FAC', 'HS'])) {
    let from = 0;
    const pageSize = 1000;
    let max = 0;
    while (true) {
      const { data, error } = await sb
        .from('tickets')
        .select('ref')
        .like('ref', `${d}-%`)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) {
        const m = r.ref?.match(/-(\d+)$/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > max) max = n;
        }
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
    next[d] = max + 1;
  }
  return next;
}

// --- delete any prior demo tickets so we don't pile up on re-runs ---
async function clearPriorDemo() {
  const { error, count } = await sb
    .from('tickets')
    .delete({ count: 'exact' })
    .eq('imported_from', DEMO_TAG);
  if (error) throw error;
  console.log(`Cleared prior demo tickets: ${count ?? 0}`);
}

// --- build the 20 rows ---
function buildRows({ submitterId, catsByDept, locIds, nextRef }) {
  // Distribution: 7 open-ish, 6 pending-ish, 7 closed-ish = 20
  const buckets = [
    ...Array(3).fill('open'),
    ...Array(2).fill('in_progress'),
    ...Array(2).fill('awaiting_triage'),
    ...Array(3).fill('on_hold'),
    ...Array(3).fill('awaiting_triage'), // more pending flavour
    ...Array(4).fill('closed'),
    ...Array(3).fill('resolved'),
  ];
  // shuffle
  for (let i = buckets.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [buckets[i], buckets[j]] = [buckets[j], buckets[i]];
  }

  // pick 20 templates (with replacement only if we ever exceed list size)
  const templates = TEMPLATES.slice().sort(() => Math.random() - 0.5).slice(0, 20);

  const now = new Date().toISOString();
  const rows = [];
  for (let i = 0; i < 20; i++) {
    const t = templates[i] ?? pick(TEMPLATES);
    const status = buckets[i];

    // created within last 7 days
    const daysAgo = rand(7);
    const hourJitter = rand(24);
    const createdAt = isoDaysAgo(daysAgo, hourJitter);

    // ref
    const dep = t.department;
    const n = nextRef[dep]++;
    const ref = `${dep}-${String(n).padStart(4, '0')}`;

    // optional category / location
    const catPool = catsByDept[dep] ?? [];
    const categoryId = catPool.length ? pick(catPool) : null;
    const locationId = locIds.length ? pick(locIds) : null;

    // SLA fields — set explicitly because the trigger only fires on UPDATE
    const triagedAt = status === 'awaiting_triage' ? null : createdAt;
    const slaDueAt = triagedAt
      ? new Date(new Date(triagedAt).getTime() + slaWindowHours[t.priority] * 3600_000).toISOString()
      : null;

    // resolved / closed timestamps somewhere between creation and now
    let resolvedAt = null;
    let closedAt = null;
    if (status === 'resolved' || status === 'closed') {
      const span = Date.now() - new Date(createdAt).getTime();
      const resolveAt = new Date(new Date(createdAt).getTime() + Math.max(1, Math.floor(span * (0.3 + Math.random() * 0.6))));
      resolvedAt = resolveAt.toISOString();
      if (status === 'closed') {
        closedAt = new Date(resolveAt.getTime() + rand(6) * 3600_000).toISOString();
      }
    }

    rows.push({
      ref,
      department: dep,
      category_id: categoryId,
      subject: t.subject,
      description: t.description,
      status,
      priority: t.priority,
      submitter_id: submitterId,
      assignee_id: null,
      location_id: locationId,
      triaged_at: triagedAt,
      sla_due_at: slaDueAt,
      resolved_at: resolvedAt,
      closed_at: closedAt,
      created_at: createdAt,
      updated_at: now,
      imported_from: DEMO_TAG,
      imported_at: now,
    });
  }
  return rows;
}

// --- main ---
const submitter = await pickSubmitter();
console.log(`Submitter: ${submitter.email} (${submitter.role})`);

const [catsByDept, locIds] = await Promise.all([loadCategoriesByDept(), loadLocations()]);
console.log(
  `Categories: IT=${catsByDept.IT.length} FAC=${catsByDept.FAC.length} HS=${catsByDept.HS.length}; Locations=${locIds.length}`,
);

await clearPriorDemo();

const nextRef = await nextRefStart();
console.log('Starting refs from:', nextRef);

const rows = buildRows({ submitterId: submitter.id, catsByDept, locIds, nextRef });

const { error, count } = await sb.from('tickets').insert(rows, { count: 'exact' });
if (error) {
  console.error('Insert failed:', error);
  process.exit(1);
}

console.log(`Inserted ${count ?? rows.length} demo tickets.`);
const summary = rows.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
console.log('Status breakdown:', summary);
