#!/usr/bin/env node
/**
 * Import Spiceworks ticket CSV export into AcademyDesk.
 *
 * Usage:
 *   node scripts/import-spiceworks.mjs <path-to-csv>
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (the service role key bypasses RLS so we can write historical rows
 * without an auth user).
 *
 * Idempotent: rows are matched on legacy_ref (Spiceworks "Ticket Number")
 * and skipped if already imported.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const csvPath = process.argv[2] ?? '.local/spiceworks_export.csv';
const BATCH = 200;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------- mapping helpers ----------
function mapDepartment(category) {
  const v = (category ?? '').trim().toLowerCase();
  if (v.startsWith('facilit')) return 'FAC';
  if (v.startsWith('health')) return 'HS';
  return 'IT'; // default for "IT" and blanks
}

function mapPriority(p) {
  const v = (p ?? '').trim().toLowerCase();
  if (v === 'high') return 'high';
  if (v === 'low') return 'low';
  if (v === 'critical' || v === 'urgent') return v;
  return 'normal';
}

function mapStatus(s) {
  const v = (s ?? '').trim().toLowerCase();
  if (v === 'closed') return 'closed';
  if (v === 'open') return 'open';
  return 'open';
}

function parseDate(s) {
  if (!s) return null;
  // CSV format: "5/6/2013 1:03 pm UTC"
  const cleaned = s.replace(/\s+UTC$/i, '').trim();
  const d = new Date(cleaned + ' UTC');
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------- read & dedup headers ----------
const raw = readFileSync(resolve(csvPath), 'utf8');
const rows = parse(raw, {
  bom: true,
  columns: (header) => {
    const seen = {};
    return header.map((h) => {
      if (seen[h]) {
        seen[h] += 1;
        return `${h}_${seen[h]}`;
      }
      seen[h] = 1;
      return h;
    });
  },
  skip_empty_lines: true,
  relax_quotes: true,
  relax_column_count: true,
});

console.log(`Parsed ${rows.length} rows from ${csvPath}`);

// ---------- existing legacy_refs (skip already-imported) ----------
const existing = new Set();
{
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('tickets')
      .select('legacy_ref')
      .not('legacy_ref', 'is', null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) existing.add(r.legacy_ref);
    if (data.length < pageSize) break;
    from += pageSize;
  }
}
console.log(`Already imported: ${existing.size}`);

// ---------- max refs per dept (so we can assign refs client-side and
// skip the trigger entirely — avoids sequence/concurrency issues) ------
const nextN = { IT: 1, FAC: 1, HS: 1 };
for (const d of ['IT', 'FAC', 'HS']) {
  const { data, error } = await supabase
    .from('tickets')
    .select('ref')
    .like('ref', `${d}-%`)
    .order('ref', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (data && data[0]?.ref) {
    const m = data[0].ref.match(/-(\d+)$/);
    if (m) nextN[d] = parseInt(m[1], 10) + 1;
  }
}
console.log('Starting refs from:', nextN);

function makeRef(dep) {
  const n = nextN[dep]++;
  return `${dep}-${String(n).padStart(4, '0')}`;
}

// ---------- map rows ----------
const now = new Date().toISOString();
const toInsert = [];
for (const r of rows) {
  const legacyRef = String(r['Ticket Number'] ?? '').trim();
  if (!legacyRef) continue;
  if (existing.has(legacyRef)) continue;

  const department = mapDepartment(r['Category']);
  const status = mapStatus(r['Status']);
  const closedAt = status === 'closed' ? parseDate(r['Closed On']) : null;
  const createdAt = parseDate(r['Created On']) ?? now;

  toInsert.push({
    legacy_ref: legacyRef,
    ref: makeRef(department),
    department,
    subject: (r['Summary'] || '(no subject)').slice(0, 500),
    description: r['Description'] || '',
    priority: mapPriority(r['Priority']),
    status,
    submitter_id: null,
    legacy_submitter_name: (r['Created By'] || '').trim() || null,
    legacy_assignee_name: (r['Assigned To'] || '').trim() || null,
    legacy_subcategory: (r['Category_2'] || '').trim() || null,
    legacy_location:
      [r['Room Number / Location'], r['Department']].filter(Boolean).join(' / ') || null,
    legacy_link: r['Link to Ticket'] || null,
    imported_from: 'spiceworks',
    imported_at: now,
    created_at: createdAt,
    sla_due_at: parseDate(r['Due On']),
    resolved_at: closedAt,
    closed_at: closedAt,
  });
}
console.log(`To insert: ${toInsert.length}`);

// ---------- insert in batches ----------
// Tickets currently auto-assign a ref via trigger using ticket_seq_*; we'll
// let that happen so new refs don't clash with existing/future tickets.
let inserted = 0;
let failed = 0;
for (let i = 0; i < toInsert.length; i += BATCH) {
  const batch = toInsert.slice(i, i + BATCH);
  const { error, count } = await supabase
    .from('tickets')
    .insert(batch, { count: 'exact' });
  if (error) {
    failed += batch.length;
    console.error(`Batch ${i / BATCH + 1} failed:`, error.message);
  } else {
    inserted += count ?? batch.length;
    process.stdout.write(`  +${inserted}/${toInsert.length}\r`);
  }
}
console.log(`\nDone. inserted=${inserted} failed=${failed} skipped=${existing.size}`);
