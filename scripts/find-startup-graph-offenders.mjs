#!/usr/bin/env node
/**
 * scripts/find-startup-graph-offenders.mjs
 *
 * Walks the static import graph rooted at `app/_layout.tsx`, follows every
 * local `@/...` or relative import, and flags **statically-imported feature
 * code** that ends up in the startup chunk.
 *
 * Use this to catch regressions where a new `import { Foo } from
 * '@/features/...'` is added to root layout / providers / preloaders.
 *
 * Run:
 *   node scripts/find-startup-graph-offenders.mjs
 *
 * Flags as offenders:
 *   - Any node whose path matches `features/{chat,finance,trips,network,
 *     ai,vehicles,clients,drivers,suppliers,indents,invoicing,ratings,
 *     tracking,maps}` AND is reachable via static import only.
 *   - Barrel files (index.ts/index.tsx) reachable from the startup graph.
 *
 * Counts:
 *   - Total static nodes touched at startup.
 *   - Per-feature byte size reachable at startup.
 *
 * Exit code:
 *   - 0  on clean run (only reports).
 *   - 1  with `--strict` if any offender is found (use in CI).
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.resolve(ROOT, 'app/_layout.tsx');

const ALIAS_PREFIXES = {
  '@/': '',
  '@/lib/': 'lib/',
  '@/ui/': 'components/',
  '@/features/': 'features/',
};

const EXTS = ['.tsx', '.ts', '.web.tsx', '.web.ts', '.jsx', '.js'];

const FEATURE_BUCKETS = [
  'features/chat',
  'features/finance',
  'features/trips',
  'features/network',
  'features/ai',
  'features/vehicles',
  'features/clients',
  'features/drivers',
  'features/suppliers',
  'features/indents',
  'features/invoicing',
  'features/ratings',
  'features/tracking',
  'features/maps',
];

const visited = new Set();
const byBucket = new Map();
const barrelHits = new Map();
const queue = [ENTRY];

/**
 * Static `import ... from '...';` patterns. Excludes:
 *   - `await import(...)`  → dynamic
 *   - `import type ...`    → erased by babel-preset-expo
 *   - `export type ...`    → erased
 *
 * Note: mixed `import { x, type Y } from ...` still drags the module because
 * `x` is a value — the regex captures these correctly via the negative
 * lookahead for the `type` keyword right after `import`/`export`.
 */
const STATIC_IMPORT_RE =
  /^\s*(?:import|export)\s+(?!type\b)(?:[^'"`]+from\s+)?['"]([^'"`]+)['"]/gm;

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function bucketFor(absPath) {
  const rel = path.relative(ROOT, absPath).replace(/\\/g, '/');
  return FEATURE_BUCKETS.find((b) => rel.startsWith(`${b}/`));
}

async function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null; // package, skip
  let baseRel = spec;
  if (spec.startsWith('@/')) {
    // Map alias -> repo path. Longest prefix wins.
    const matched = Object.entries(ALIAS_PREFIXES)
      .sort(([a], [b]) => b.length - a.length)
      .find(([prefix]) => spec.startsWith(prefix));
    if (matched) baseRel = matched[1] + spec.slice(matched[0].length);
  }
  const base = spec.startsWith('.')
    ? path.resolve(path.dirname(fromFile), spec)
    : path.resolve(ROOT, baseRel);

  for (const ext of EXTS) {
    try {
      const candidate = `${base}${ext}`;
      await stat(candidate);
      return candidate;
    } catch {}
  }
  for (const ext of EXTS) {
    try {
      const candidate = path.join(base, `index${ext}`);
      await stat(candidate);
      return candidate;
    } catch {}
  }
  return null;
}

async function walk() {
  while (queue.length) {
    const file = queue.pop();
    if (visited.has(file)) continue;
    visited.add(file);

    let src;
    try {
      src = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    const size = src.length;
    const bucket = bucketFor(file);
    if (bucket) byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + size);

    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (/(^|\/)index\.tsx?$/.test(rel) && !rel.startsWith('app/')) {
      barrelHits.set(rel, (barrelHits.get(rel) ?? 0) + size);
    }

    STATIC_IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = STATIC_IMPORT_RE.exec(src)) !== null) {
      const spec = m[1];
      const resolved = await resolveImport(file, spec);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
}

await walk();

console.log('\n📊  Startup graph reachable from app/_layout.tsx');
console.log(`   total files: ${visited.size}`);

if (byBucket.size > 0) {
  console.log('\n🚨  Feature code reachable at STARTUP (should be ~0):');
  const rows = [...byBucket.entries()].sort((a, b) => b[1] - a[1]);
  for (const [b, n] of rows) console.log(`   ${b.padEnd(22)} ${bytes(n)}`);
} else {
  console.log('\n✅  No feature code reachable at startup. Nice.');
}

if (barrelHits.size > 0) {
  console.log('\n🪣  Barrel files reachable from startup:');
  const rows = [...barrelHits.entries()].sort((a, b) => b[1] - a[1]);
  for (const [p, n] of rows) console.log(`   ${p.padEnd(60)} ${bytes(n)}`);
}

const strict = process.argv.includes('--strict');
if (strict && (byBucket.size > 0 || barrelHits.size > 0)) {
  console.error('\n❌  --strict: startup graph contamination detected.');
  process.exit(1);
}
