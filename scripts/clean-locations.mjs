#!/usr/bin/env node
/**
 * Soft-delete locations that are either:
 *   - shorter than 3 characters (after trim)
 *   - look like they contain a person's name (titles, possessives)
 *
 * Sets is_active = false so the rows remain for FK integrity but disappear
 * from the new-ticket combobox. Admins can re-enable them in AdminLocations.
 *
 *   node --env-file=.env.local scripts/clean-locations.mjs            # dry run
 *   node --env-file=.env.local scripts/clean-locations.mjs --apply    # actually deactivate
 */
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Titles likely to indicate a person. Word-boundary, case-insensitive.
const TITLE_RE = /\b(mr|mrs|ms|miss|dr|sir|madam|mr\.|mrs\.|ms\.|dr\.)\b/i;
// Possessive: "Smith's", "Nubret's", "John's" (straight or curly apostrophe).
const POSSESSIVE_RE = /\b[a-z]{2,}[\u2019']s\b/i;
// Single initial + dotted surname pattern: "N. Nubret", "J. Smith"
const INITIAL_NAME_RE = /\b[a-z]\.\s*[a-z]{2,}/i;
// Known non-name abbreviations that match INITIAL_NAME_RE — skip them.
const ABBREV_RE = /\b(i\.t\.|a\.k\.a|e\.g\.|i\.e\.|u\.s\.|p\.e\.|n\.\s*pantry)\b/i;

function classify(label) {
  const trimmed = (label ?? '').trim();
  if (trimmed.length < 3) return 'too-short';
  if (TITLE_RE.test(trimmed)) return 'title';
  if (POSSESSIVE_RE.test(trimmed)) return 'possessive';
  if (INITIAL_NAME_RE.test(trimmed) && !ABBREV_RE.test(trimmed)) return 'initial-name';
  return null;
}

async function main() {
  console.log(apply ? '== APPLY mode ==' : '== DRY RUN (use --apply to commit) ==');

  // Page through all active locations.
  const PAGE = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('locations')
      .select('id, building, floor, room, label, is_active')
      .eq('is_active', true)
      .order('building')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Loaded ${all.length} active locations.`);

  const buckets = { 'too-short': [], title: [], possessive: [], 'initial-name': [] };
  for (const loc of all) {
    const reason = classify(loc.label ?? loc.building ?? '');
    if (reason) buckets[reason].push(loc);
  }

  const total = Object.values(buckets).reduce((n, b) => n + b.length, 0);
  for (const [reason, list] of Object.entries(buckets)) {
    console.log(`\n[${reason}] ${list.length} match(es)`);
    list.slice(0, 15).forEach((l) => console.log(`  - ${JSON.stringify(l.label ?? l.building)}`));
    if (list.length > 15) console.log(`  … and ${list.length - 15} more`);
  }
  console.log(`\nTotal to deactivate: ${total}`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to commit.');
    return;
  }

  const ids = Object.values(buckets).flat().map((l) => l.id);
  if (ids.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Batch update so we stay under URL/payload limits.
  const CHUNK = 200;
  let done = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('locations')
      .update({ is_active: false })
      .in('id', chunk);
    if (error) throw error;
    done += chunk.length;
    process.stdout.write(`\r  deactivated ${done}/${ids.length}`);
  }
  console.log(`\nDone. Deactivated ${done} location(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
