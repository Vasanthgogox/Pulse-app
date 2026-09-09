#!/usr/bin/env node
/**
 * Backfill indents.supplier_rate_basis for historical rows where it is NULL.
 *
 * Why: `supplier_target` carries no unit of its own. Some rows store a ₹/MT
 * unit rate (IND197: 3200 over 38.83 t = ₹1,24,256 trip) and others store a
 * trip total (IND193: 89578). Every pricing surface reads the column as a
 * trip total, so per-MT rows render the unit rate as if it were the whole
 * trip — the Bhandara→Hosur bug. Tagging the basis lets
 * resolveCommercialPricing multiply the per-MT rows out by tonnage.
 *
 * Heuristic (a row must clear ALL of these to be flagged per_mt):
 *   1. supplier_target < PER_MT_CEILING (default 10000) — a plausible ₹/MT
 *      rate, never a trip total for a full truck.
 *   2. weight yields a sane tonnage (0.5 t .. 100 t).
 *   3. supplier_target x tonnes lands within TOLERANCE of client_price, and
 *      at or below it — the supplier buy price should not exceed the client
 *      sell price. This is the load-bearing check: it confirms the multiply
 *      reproduces the real commercial figure rather than guessing from
 *      magnitude alone.
 *
 * Rows that clear (1) and (2) but fail (3) are reported as NEEDS REVIEW and
 * left untouched — they are the genuinely ambiguous ones and want a human.
 *
 * Dry-run by default: prints the proposed UPDATEs and writes nothing.
 * Per the project's no-DDL/no-blind-writes rule, --apply is opt-in and
 * should only run in a confirmed quiet window.
 *
 *   node scripts/backfill-indent-sale-rate-basis.mjs              # dry run
 *   node scripts/backfill-indent-sale-rate-basis.mjs --json       # machine readable
 *   node scripts/backfill-indent-sale-rate-basis.mjs --apply      # writes
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env',
  );
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const AS_JSON = process.argv.includes('--json');

/** A supplier_target at or above this is read as a trip total, never ₹/MT. */
const PER_MT_CEILING = 10_000;
/** How far target x tonnes may sit from client_price and still count as aligned. */
const TOLERANCE = 0.15;
const MIN_TONNES = 0.5;
const MAX_TONNES = 100;

const inr = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function classify(row) {
  const target = Number(row.supplier_target);
  const clientPrice = Number(row.client_price);
  const tonnes = Number(row.weight) / 1000;

  if (!Number.isFinite(target) || target <= 0) {
    return { verdict: 'skip', reason: 'no supplier_target' };
  }
  if (target >= PER_MT_CEILING) {
    return {
      verdict: 'per_trip',
      reason: `target ${inr(target)} >= ${inr(PER_MT_CEILING)} ceiling`,
    };
  }
  if (!Number.isFinite(tonnes) || tonnes < MIN_TONNES || tonnes > MAX_TONNES) {
    return {
      verdict: 'review',
      reason: `target ${inr(target)} looks per-MT but weight is unusable (${row.weight} kg)`,
    };
  }

  const implied = target * tonnes;
  if (!Number.isFinite(clientPrice) || clientPrice <= 0) {
    return {
      verdict: 'review',
      reason: `target ${inr(target)} x ${tonnes}t = ${inr(implied)} but no client_price to corroborate`,
    };
  }

  const drift = Math.abs(implied - clientPrice) / clientPrice;
  if (implied <= clientPrice * (1 + TOLERANCE) && drift <= TOLERANCE) {
    return {
      verdict: 'per_mt',
      reason: `${inr(target)}/MT x ${tonnes}t = ${inr(implied)} vs client ${inr(clientPrice)} (${(drift * 100).toFixed(1)}% drift)`,
      impliedTotal: implied,
      tonnes,
    };
  }

  return {
    verdict: 'review',
    reason: `${inr(target)}/MT x ${tonnes}t = ${inr(implied)} does not align with client ${inr(clientPrice)} (${(drift * 100).toFixed(1)}% drift)`,
    impliedTotal: implied,
    tonnes,
  };
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from('indents')
  .select(
    'id, display_indent_id, pickup_area, drop_location, weight, supplier_target, client_price, supplier_rate_basis, status, created_at',
  )
  .is('supplier_rate_basis', null)
  .order('created_at', { ascending: false });

if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}

const buckets = { per_mt: [], per_trip: [], review: [], skip: [] };
for (const row of data ?? []) {
  const result = classify(row);
  buckets[result.verdict].push({ row, result });
}

const CSV = process.argv.includes('--csv');

function csvCell(v) {
  const str = v == null ? '' : String(v);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

if (CSV) {
  const header = [
    'bucket',
    'display_indent_id',
    'pickup_area',
    'drop_location',
    'supplier_target',
    'client_price',
    'weight_kg',
    'weight_tonnes',
    'implied_trip_total',
    'status',
    'reason',
  ];
  const lines = [header.join(',')];
  for (const bucket of ['review', 'per_mt']) {
    for (const { row, result } of buckets[bucket]) {
      const tonnes = Number(row.weight) / 1000;
      lines.push(
        [
          bucket,
          row.display_indent_id,
          row.pickup_area,
          row.drop_location,
          Number(row.supplier_target),
          Number(row.client_price),
          Number(row.weight),
          Number.isFinite(tonnes) ? tonnes : '',
          result.impliedTotal != null ? Math.round(result.impliedTotal) : '',
          row.status,
          result.reason,
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }
  console.log(lines.join('\n'));
} else if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        applied: APPLY,
        thresholds: { PER_MT_CEILING, TOLERANCE, MIN_TONNES, MAX_TONNES },
        counts: Object.fromEntries(
          Object.entries(buckets).map(([k, v]) => [k, v.length]),
        ),
        per_mt: buckets.per_mt.map(({ row, result }) => ({
          id: row.id,
          indent: row.display_indent_id,
          supplier_target: Number(row.supplier_target),
          weight_kg: Number(row.weight),
          client_price: Number(row.client_price),
          implied_trip_total: result.impliedTotal,
        })),
        review: buckets.review.map(({ row, result }) => ({
          id: row.id,
          indent: row.display_indent_id,
          supplier_target: Number(row.supplier_target),
          weight_kg: Number(row.weight),
          client_price: Number(row.client_price),
          reason: result.reason,
        })),
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `\nScanned ${data?.length ?? 0} indents with supplier_rate_basis IS NULL`,
  );
  console.log(
    `Thresholds: per-MT ceiling ${inr(PER_MT_CEILING)}, tolerance ${TOLERANCE * 100}%, tonnage ${MIN_TONNES}–${MAX_TONNES} t\n`,
  );

  console.log(`── FLAG AS per_mt (${buckets.per_mt.length}) ─────────────────`);
  for (const { row, result } of buckets.per_mt) {
    console.log(
      `  ${row.display_indent_id ?? row.id}  ${row.pickup_area ?? '?'} → ${row.drop_location ?? '?'}`,
    );
    console.log(`     ${result.reason}`);
  }

  console.log(`\n── NEEDS REVIEW, left NULL (${buckets.review.length}) ─────`);
  for (const { row, result } of buckets.review) {
    console.log(
      `  ${row.display_indent_id ?? row.id}  ${row.pickup_area ?? '?'} → ${row.drop_location ?? '?'}`,
    );
    console.log(`     ${result.reason}`);
  }

  console.log(
    `\n── Treat as per_trip (${buckets.per_trip.length}) — target already a total`,
  );
  console.log(`── No usable target, skipped (${buckets.skip.length})\n`);

  console.log('Proposed SQL:');
  if (buckets.per_mt.length > 0) {
    const ids = buckets.per_mt.map(({ row }) => `'${row.id}'`).join(',\n    ');
    console.log(
      `  UPDATE public.indents\n     SET supplier_rate_basis = 'per_mt'\n   WHERE supplier_rate_basis IS NULL\n     AND id IN (\n    ${ids}\n  );`,
    );
  } else {
    console.log('  (nothing to flag as per_mt)');
  }
  if (buckets.per_trip.length > 0) {
    console.log(
      `\n  -- Optional: pin the unambiguous totals so future reads never guess.\n  UPDATE public.indents SET supplier_rate_basis = 'per_trip'\n   WHERE supplier_rate_basis IS NULL AND supplier_target >= ${PER_MT_CEILING};`,
    );
  }
}

if (!APPLY) {
  if (!AS_JSON) {
    console.log(
      '\nDRY RUN — nothing written. Re-run with --apply in a confirmed quiet window.\n',
    );
  }
  process.exit(0);
}

// --apply: only the high-confidence per_mt rows. Review rows stay NULL.
let updated = 0;
let failed = 0;
for (const { row } of buckets.per_mt) {
  const { error: upErr } = await supabase
    .from('indents')
    .update({
      supplier_rate_basis: 'per_mt',
    })
    .eq('id', row.id)
    .is('supplier_rate_basis', null); // never clobber a basis set since the scan
  if (upErr) {
    failed += 1;
    console.error(`  FAILED ${row.display_indent_id ?? row.id}: ${upErr.message}`);
  } else {
    updated += 1;
  }
}
console.log(
  `\nApplied: ${updated} row(s) set to per_mt, ${failed} failed, ${buckets.review.length} left for review.\n`,
);
