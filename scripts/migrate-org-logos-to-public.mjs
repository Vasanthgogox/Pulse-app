#!/usr/bin/env node
/**
 * Migrate org logos from the private `userprofiles` bucket to the public
 * `org-assets` bucket, then rewrite organizations.logo_url to the new path.
 *
 * Why: logos are shown across the network directory, so every render was
 * calling createSignedUrl on a private bucket — ~340 of 375 storage requests
 * in a 1000-line log sample, each holding a Storage->Postgres connection.
 * A public bucket serves them as plain static files: zero DB connections.
 *
 * Safe to re-run: copies are skipped when the destination already exists, and
 * the source file is left in place (nothing is deleted).
 *
 *   node scripts/migrate-org-logos-to-public.mjs --dry-run
 *   node scripts/migrate-org-logos-to-public.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SRC_BUCKET = 'userprofiles';
const DST_BUCKET = 'org-assets';
const DRY = process.argv.includes('--dry-run');

if (!URL_ || !KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(URL_, KEY, { auth: { persistSession: false } });

const { data: orgs, error } = await db
  .from('organizations')
  .select('id, name, logo_url')
  .not('logo_url', 'is', null);

if (error) { console.error('Query failed:', error.message); process.exit(1); }

// Already-migrated rows store `org-logos/<id>...`; skip them.
const pending = orgs.filter((o) => !o.logo_url.startsWith('org-logos/'));
console.log(`${orgs.length} orgs with a logo, ${pending.length} to migrate${DRY ? ' (DRY RUN)' : ''}\n`);

let moved = 0, skipped = 0, failed = 0;

for (const org of pending) {
  const srcPath = org.logo_url;
  const dstPath = `org-logos/${org.id}/${srcPath.split('/').pop()}`;

  if (DRY) {
    console.log(`  would copy ${srcPath}\n           -> ${dstPath}`);
    moved++;
    continue;
  }

  const dl = await db.storage.from(SRC_BUCKET).download(srcPath);
  if (dl.error) {
    console.error(`  FAIL download ${org.name}: ${dl.error.message}`);
    failed++;
    continue;
  }

  const up = await db.storage
    .from(DST_BUCKET)
    .upload(dstPath, dl.data, { contentType: dl.data.type || 'image/jpeg', upsert: false });

  if (up.error && !/exists/i.test(up.error.message)) {
    console.error(`  FAIL upload ${org.name}: ${up.error.message}`);
    failed++;
    continue;
  }
  if (up.error) skipped++;

  const { error: updErr } = await db
    .from('organizations')
    .update({ logo_url: dstPath })
    .eq('id', org.id);

  if (updErr) {
    console.error(`  FAIL update ${org.name}: ${updErr.message}`);
    failed++;
    continue;
  }

  console.log(`  ok ${org.name} -> ${dstPath}`);
  moved++;
}

console.log(`\nmoved=${moved} already-present=${skipped} failed=${failed}`);
if (failed) process.exit(1);
