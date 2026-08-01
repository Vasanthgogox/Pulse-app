#!/usr/bin/env node
/**
 * Marketplace M0 Gate 3 — true concurrent bid harness (regression suite).
 *
 * Fires N parallel harness_submit_marketplace_bid RPCs (service_role only),
 * then optionally hammers get_network_feed and cleans up harness rows.
 *
 * Usage:
 *   node scripts/marketplace/parallel-bid-harness.mjs              # 10,25,50
 *   node scripts/marketplace/parallel-bid-harness.mjs 10 25
 *   HARNESS_POST_ID=<uuid> node scripts/marketplace/parallel-bid-harness.mjs 25
 *   HARNESS_KEEP=1 node ...   # skip cleanup (debug)
 *
 * Env (.env):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Keep this harness. Re-run before releasing changes to bidding, campaigns,
 * visibility, pricing, or notifications.
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, '../../.env') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.service_role_key;
const KEEP = process.env.HARNESS_KEEP === '1';
const NOTE_PREFIX = 'm0-harness';
const levels = (process.argv.slice(2).map(Number).filter((n) => n > 0).length
  ? process.argv.slice(2).map(Number).filter((n) => n > 0)
  : [10, 25, 50]);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing Supabase URL or service role key in .env (EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or service_role_key)',
  );
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[i] * 10) / 10;
}

function summarize(latenciesMs, errors) {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: latenciesMs.length + errors.length,
    ok: latenciesMs.length,
    fail: errors.length,
    successRate: latenciesMs.length + errors.length
      ? Math.round((1000 * latenciesMs.length) / (latenciesMs.length + errors.length)) / 10
      : 0,
    avgMs: sorted.length ? Math.round((sum / sorted.length) * 10) / 10 : null,
    p50Ms: pct(sorted, 50),
    p95Ms: pct(sorted, 95),
    maxMs: sorted.length ? sorted[sorted.length - 1] : null,
    errors: errors.slice(0, 8),
  };
}

async function resolveTargetPost() {
  if (process.env.HARNESS_POST_ID) {
    const { data, error } = await sb
      .from('posts')
      .select('id, organization_id, source_indent_id, is_active')
      .eq('id', process.env.HARNESS_POST_ID)
      .maybeSingle();
    if (error || !data) throw new Error(`HARNESS_POST_ID not found: ${error?.message ?? 'null'}`);
    return data;
  }

  const { data, error } = await sb
    .from('posts')
    .select('id, organization_id, source_indent_id, is_active')
    .eq('type', 'LOAD')
    .not('source_indent_id', 'is', null)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const { data: open } = await sb.rpc('indent_open_for_marketplace_bids', {
      p_indent_id: row.source_indent_id,
    });
    if (open) return row;
  }
  throw new Error('No open LOAD story found for harness (set HARNESS_POST_ID)');
}

async function resolveBidders(shipperOrgId, n) {
  const { data: orgs, error } = await sb
    .from('organizations')
    .select('id')
    .neq('id', shipperOrgId)
    .order('created_at', { ascending: true })
    .limit(Math.max(n * 4, 120));
  if (error) throw new Error(error.message);

  const unique = [];
  for (const org of orgs ?? []) {
    if (unique.length >= n) break;
    const { data: mem } = await sb
      .from('organization_members')
      .select('user_id, organization_id')
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .not('user_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (mem?.user_id) {
      unique.push({ orgId: mem.organization_id, userId: mem.user_id });
    }
  }
  if (unique.length === 0) {
    throw new Error('No bidder orgs with active members found');
  }

  // Pad by cycling unique orgs when the DB has fewer than N orgs.
  // Extra slots stress concurrent upsert / already_bid idempotency on the same post.
  const bidders = [];
  for (let i = 0; i < n; i++) {
    bidders.push(unique[i % unique.length]);
  }
  if (unique.length < n) {
    console.warn(
      `  (only ${unique.length} unique bidder orgs; padding to ${n} for concurrency + idempotency pressure)`,
    );
  }
  return { bidders, uniqueOrgCount: unique.length };
}

async function oneBid(postId, bidder, amount, note) {
  const t0 = performance.now();
  const { data, error } = await sb.rpc('harness_submit_marketplace_bid', {
    p_post_id: postId,
    p_bidder_org_id: bidder.orgId,
    p_bidder_user_id: bidder.userId,
    p_amount: amount,
    p_note: note,
  });
  const ms = performance.now() - t0;
  if (error) return { ok: false, ms, error: error.message, already: false };
  return {
    ok: true,
    ms,
    error: null,
    already: Boolean(data?.already_bid),
    bidId: data?.bid_id ?? null,
  };
}

async function feedProbe(orgId, samples = 5) {
  const latencies = [];
  const errors = [];
  await Promise.all(
    Array.from({ length: samples }, async () => {
      const t0 = performance.now();
      const { error } = await sb.rpc('get_network_feed', {
        p_org_id: orgId,
        p_limit: 30,
        p_offset: 0,
      });
      const ms = performance.now() - t0;
      if (error) errors.push(error.message);
      else latencies.push(ms);
    }),
  );
  return summarize(latencies, errors.map((e) => ({ error: e })));
}

async function cleanup(postId) {
  const { error: e1 } = await sb.from('bids').delete().eq('post_id', postId).like('note', `${NOTE_PREFIX}%`);
  if (e1) console.warn('cleanup bids:', e1.message);
  // direct_quotes: delete by notes prefix for this indent
  const { data: post } = await sb.from('posts').select('source_indent_id').eq('id', postId).maybeSingle();
  if (post?.source_indent_id) {
    const { error: e2 } = await sb
      .from('direct_quotes')
      .delete()
      .eq('indent_id', post.source_indent_id)
      .like('notes', `${NOTE_PREFIX}%`);
    if (e2) console.warn('cleanup quotes:', e2.message);
  }
}

async function runLevel(concurrency, post) {
  const { bidders, uniqueOrgCount } = await resolveBidders(post.organization_id, concurrency);
  const note = `${NOTE_PREFIX}-${concurrency}-${Date.now()}`;
  const tWall0 = performance.now();

  const results = await Promise.all(
    bidders.map((b, i) => oneBid(post.id, b, 15000 + concurrency * 100 + i, note)),
  );

  const wallMs = Math.round(performance.now() - tWall0);
  const okLat = results.filter((r) => r.ok).map((r) => r.ms);
  const fails = results.filter((r) => !r.ok).map((r) => ({ error: r.error, ms: r.ms }));
  const already = results.filter((r) => r.ok && r.already).length;
  const stats = summarize(okLat, fails);
  const feed = await feedProbe(bidders[0].orgId, Math.min(8, concurrency));

  if (!KEEP) await cleanup(post.id);

  return {
    concurrency,
    uniqueOrgCount,
    wallMs,
    ...stats,
    duplicateOrUpdate: already,
    feedRefresh: feed,
  };
}

async function main() {
  console.log('Marketplace Gate 3 — parallel bid harness');
  console.log(`URL: ${SUPABASE_URL}`);
  console.log(`Levels: ${levels.join(', ')}`);

  // Ensure harness RPC exists
  const { error: pingErr } = await sb.rpc('harness_submit_marketplace_bid', {
    p_post_id: '00000000-0000-0000-0000-000000000000',
    p_bidder_org_id: '00000000-0000-0000-0000-000000000001',
    p_bidder_user_id: '00000000-0000-0000-0000-000000000002',
    p_amount: 1,
    p_note: `${NOTE_PREFIX}-ping`,
  });
  if (pingErr && /Could not find the function|PGRST202/i.test(pingErr.message)) {
    console.error(
      'harness_submit_marketplace_bid missing. Push migration 20270130120000_marketplace_bid_harness_rpc.sql first.',
    );
    process.exit(1);
  }

  const post = await resolveTargetPost();
  console.log(`Target post: ${post.id} (indent ${post.source_indent_id})`);

  const report = {
    at: new Date().toISOString(),
    postId: post.id,
    indentId: post.source_indent_id,
    levels: [],
  };

  for (const n of levels) {
    console.log(`\n── ${n} concurrent bidders ──`);
    const row = await runLevel(n, post);
    report.levels.push(row);
    console.log(
      JSON.stringify(
        {
          concurrency: row.concurrency,
          uniqueOrgCount: row.uniqueOrgCount,
          successRate: `${row.successRate}%`,
          ok: row.ok,
          fail: row.fail,
          avgMs: row.avgMs,
          p50Ms: row.p50Ms,
          p95Ms: row.p95Ms,
          maxMs: row.maxMs,
          wallMs: row.wallMs,
          duplicateOrUpdate: row.duplicateOrUpdate,
          feedAvgMs: row.feedRefresh.avgMs,
          feedP95Ms: row.feedRefresh.p95Ms,
          feedFail: row.feedRefresh.fail,
          sampleErrors: row.errors,
        },
        null,
        2,
      ),
    );
  }

  const outDir = path.join(process.cwd(), 'scripts/marketplace/reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `gate3-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outFile}`);

  const failed = report.levels.some((l) => l.fail > 0 || l.successRate < 100);
  if (failed) {
    console.error('\nGATE 3: FAIL — unexpected bid failures');
    process.exit(2);
  }
  console.log('\nGATE 3: PASS — all concurrent levels 100% success (review latency/feed metrics above)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
