#!/usr/bin/env node
/**
 * Identity Load Test — Phase 2 Priority 5
 *
 * Simulates concurrent ID generation at scale:
 *   100 / 1000 / 5000 / 10000 simultaneous operations
 *
 * Tests:
 *   ✓ Zero collisions across all generated IDs
 *   ✓ Zero duplicate business references
 *   ✓ UUIDv7 monotonic ordering within same millisecond
 *   ✓ Crockford base32 reference uniqueness
 *   ✓ Client-side generation throughput
 *
 * Run: node scripts/identity-load-test.js [concurrency]
 */

'use strict';

// ── UUIDv7 implementation (mirrors lib/uuidv7.ts) ────────────────────────────

let _wallMs = 0;
let _logMs  = 0;
let _seq    = 0;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function uuidv7() {
  const wallMs = Date.now();
  if (wallMs > _wallMs) { _wallMs = wallMs; _logMs = wallMs; _seq = Math.floor(Math.random() * 4096); }
  else { _seq++; if (_seq > 0xfff) { _logMs++; _seq = 0; } }
  const nowMs = _logMs;

  const tsHex     = nowMs.toString(16).padStart(12, '0');
  const randAHex  = _seq.toString(16).padStart(3, '0');
  const randB     = [];
  for (let i = 0; i < 8; i++) randB.push(Math.floor(Math.random() * 256));
  randB[0] = (randB[0] & 0x3f) | 0x80;
  const randBHex = randB.map(b => b.toString(16).padStart(2, '0')).join('');

  const hex = tsHex + '7' + randAHex + randBHex;
  return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20,32)].join('-');
}

function crockfordRandom(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += CROCKFORD[Math.floor(Math.random() * 32)];
  return s;
}

function globalRef(entityType) {
  const prefix = ({ trip:'TRP', indent:'IND', driver:'DRV', vehicle:'VEH', invoice:'INV', booking:'BKG' })[entityType] || 'UNK';
  const yy = String(new Date().getFullYear() % 100).padStart(2, '0');
  return `${prefix}-${yy}-${crockfordRandom(6)}`;
}

// ── Test runner ───────────────────────────────────────────────────────────────

function formatNumber(n) { return n.toLocaleString(); }
function pad(s, n) { return String(s).padStart(n); }

async function runLoadTest(concurrency, _entityType = 'trip') {
  const ids   = new Set();
  const refs  = new Set();
  const times = [];

  const entityCounts = {
    trip: Math.ceil(concurrency * 0.4),
    indent: Math.ceil(concurrency * 0.3),
    driver: Math.ceil(concurrency * 0.15),
    vehicle: concurrency - Math.ceil(concurrency * 0.4) - Math.ceil(concurrency * 0.3) - Math.ceil(concurrency * 0.15),
  };

  const t0 = Date.now();

  // Simulate concurrent creation bursts
  const tasks = [];
  const types = Object.entries(entityCounts);
  for (const [type, count] of types) {
    for (let i = 0; i < count; i++) {
      tasks.push({ type, index: i });
    }
  }

  // Process all tasks "simultaneously" (synchronous in Node, but measures collision)
  const t1 = performance.now();
  for (const task of tasks) {
    const id  = uuidv7();
    const ref = globalRef(task.type);
    ids.add(id);
    refs.add(ref);
    times.push(performance.now() - t1);
  }
  const elapsed = Date.now() - t0;

  // Analyze results
  const collisions     = tasks.length - ids.size;
  const refCollisions  = tasks.length - refs.size;
  const avgLatency     = times.reduce((a, b) => a + b, 0) / times.length;
  const p99Latency     = times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)];
  const throughput     = Math.round(tasks.length / (elapsed / 1000));

  return {
    concurrency,
    totalTasks:     tasks.length,
    collisions,
    refCollisions,
    uniqueIds:      ids.size,
    uniqueRefs:     refs.size,
    elapsed_ms:     elapsed,
    throughput_per_sec: throughput,
    avgLatency_us:  (avgLatency * 1000).toFixed(3),
    p99Latency_us:  (p99Latency * 1000).toFixed(3),
    pass:           collisions === 0 && refCollisions === 0,
  };
}

// ── UUIDv7 ordering test ──────────────────────────────────────────────────────

function testUUIDv7Ordering(count = 10000) {
  const ids = [];
  for (let i = 0; i < count; i++) ids.push(uuidv7());

  let outOfOrder = 0;
  for (let i = 1; i < ids.length; i++) {
    if (ids[i] < ids[i - 1]) outOfOrder++;
  }

  // Extract timestamps and verify monotonic
  let tsViolations = 0;
  for (let i = 1; i < ids.length; i++) {
    const tsPrev = parseInt(ids[i-1].replace(/-/g, '').slice(0, 12), 16);
    const tsCurr = parseInt(ids[i].replace(/-/g, '').slice(0, 12), 16);
    if (tsCurr < tsPrev) tsViolations++;
  }

  return { count, outOfOrder, tsViolations, pass: outOfOrder === 0 };
}

// ── Reference format validation ───────────────────────────────────────────────

function testReferenceFormat() {
  const GLOBAL_RE  = /^[A-Z]{3}-\d{2}-[0-9A-HJ-NP-TV-Z]{6}$/;
  const NETWORK_RE = /^[A-Z]{3}-[0-9A-HJ-NP-TV-Z]{6}$/;

  const globalRefs  = ['trip', 'indent', 'driver', 'vehicle', 'invoice'].map(t => globalRef(t));
  const networkRefs = ['BKG', 'SHR', 'COL'].map(p => `${p}-${crockfordRandom(6)}`);

  const failures = [];
  globalRefs.forEach(r => { if (!GLOBAL_RE.test(r)) failures.push(`BAD_GLOBAL: ${r}`); });
  networkRefs.forEach(r => { if (!NETWORK_RE.test(r)) failures.push(`BAD_NETWORK: ${r}`); });

  return { globalRefs, networkRefs, failures, pass: failures.length === 0 };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2];
  const customConcurrency = arg && !isNaN(parseInt(arg)) ? [parseInt(arg)] : null;

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Pulse Phase 2 — Identity Load Test                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Test 1: UUIDv7 ordering ────────────────────────────────────────────────
  console.log('▶ Test 1: UUIDv7 monotonic ordering (10,000 IDs)');
  const orderResult = testUUIDv7Ordering(10_000);
  const orderIcon = orderResult.pass ? '✅' : '❌';
  console.log(`  ${orderIcon} Out-of-order: ${orderResult.outOfOrder} | TS violations: ${orderResult.tsViolations}`);
  console.log();

  // ── Test 2: Reference format validation ───────────────────────────────────
  console.log('▶ Test 2: Reference format validation');
  const fmtResult = testReferenceFormat();
  const fmtIcon = fmtResult.pass ? '✅' : '❌';
  console.log(`  ${fmtIcon} Global refs:  ${fmtResult.globalRefs.join('  ')}`);
  console.log(`     Network refs: ${fmtResult.networkRefs.join('  ')}`);
  if (fmtResult.failures.length > 0) {
    fmtResult.failures.forEach(f => console.log(`     ❌ ${f}`));
  }
  console.log();

  // ── Test 3: Collision detection under concurrency ─────────────────────────
  const concurrencyLevels = customConcurrency ?? [100, 1_000, 5_000, 10_000];

  console.log('▶ Test 3: Concurrent ID generation — collision detection');
  console.log('');
  console.log(`  ${'Conc'.padStart(7)}  ${'Tasks'.padStart(7)}  ${'ID Coll'.padStart(8)}  ${'Ref Coll'.padStart(9)}  ${'Elapsed'.padStart(9)}  ${'Throughput'.padStart(12)}  ${'p99 lat'.padStart(9)}  Status`);
  console.log(`  ${'-'.repeat(7)}  ${'-'.repeat(7)}  ${'-'.repeat(8)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}  ${'-'.repeat(12)}  ${'-'.repeat(9)}  ------`);

  let allPassed = true;
  const results = [];

  for (const concurrency of concurrencyLevels) {
    const r = await runLoadTest(concurrency);
    results.push(r);
    if (!r.pass) allPassed = false;
    const icon = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(
      `  ${pad(formatNumber(r.concurrency), 7)}  ` +
      `${pad(formatNumber(r.totalTasks), 7)}  ` +
      `${pad(r.collisions, 8)}  ` +
      `${pad(r.refCollisions, 9)}  ` +
      `${pad(r.elapsed_ms + 'ms', 9)}  ` +
      `${pad(formatNumber(r.throughput_per_sec) + '/s', 12)}  ` +
      `${pad(r.p99Latency_us + 'µs', 9)}  ` +
      icon
    );
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Results: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}${' '.repeat(allPassed ? 30 : 27)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');

  const maxR = results[results.length - 1];
  if (maxR) {
    console.log(`║  Peak concurrency:  ${formatNumber(maxR.concurrency)} users${' '.repeat(Math.max(0, 30 - formatNumber(maxR.concurrency).length))}║`);
    console.log(`║  Peak throughput:   ${formatNumber(maxR.throughput_per_sec)}/s${' '.repeat(Math.max(0, 29 - formatNumber(maxR.throughput_per_sec).length))}║`);
    console.log(`║  Total IDs (max):   ${formatNumber(maxR.uniqueIds)} unique${' '.repeat(Math.max(0, 26 - formatNumber(maxR.uniqueIds).length))}║`);
    console.log(`║  Collisions (max):  ${maxR.collisions}${' '.repeat(Math.max(0, 35 - String(maxR.collisions).length))}║`);
  }

  console.log('║                                                          ║');
  console.log('║  Architecture:                                           ║');
  console.log('║    • Internal PKs: UUIDv7 (time-sortable, crypto-safe)  ║');
  console.log('║    • Business refs: TRP-26-AB4K7F (Crockford base32)    ║');
  console.log('║    • Network refs:  BKG-H8K2P7 (cross-org workflows)    ║');
  console.log('║    • Fallback:     FTRP-0000000001 (global DB sequence)  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => { console.error('Load test failed:', err); process.exit(1); });
