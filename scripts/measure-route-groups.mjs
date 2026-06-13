#!/usr/bin/env node
/**
 * scripts/measure-route-groups.mjs
 *
 * Traces the static import graph from each route group and reports
 * exclusive vs shared module sizes — shows the potential savings from
 * role-based lazy splitting.
 *
 * Run:
 *   node scripts/measure-route-groups.mjs
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const EXTS = ['.tsx', '.ts', '.web.tsx', '.web.ts', '.jsx', '.js'];
const STATIC_IMPORT_RE =
  /^\s*(?:import|export)\s+(?!type\b)(?:[^'"`]+from\s+)?['"]([^'"`]+)['"]/gm;

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null;
  let base;
  if (spec.startsWith('@/')) {
    base = path.resolve(ROOT, spec.slice(2));
  } else {
    base = path.resolve(path.dirname(fromFile), spec);
  }
  for (const ext of EXTS) {
    try { await stat(`${base}${ext}`); return `${base}${ext}`; } catch {}
  }
  for (const ext of EXTS) {
    try { await stat(path.join(base, `index${ext}`)); return path.join(base, `index${ext}`); } catch {}
  }
  return null;
}

async function buildGraph(entries) {
  const visited = new Map(); // file -> size
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (visited.has(file)) continue;
    let src;
    try { src = await readFile(file, 'utf8'); } catch { continue; }
    visited.set(file, src.length);
    STATIC_IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = STATIC_IMPORT_RE.exec(src)) !== null) {
      const resolved = await resolveImport(file, m[1]);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return visited;
}

async function getRouteFiles(dir) {
  const { readdirSync, statSync } = await import('node:fs');
  const results = [];
  function scan(d) {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const entry of entries) {
      const full = path.join(d, entry);
      const s = statSync(full);
      if (s.isDirectory()) scan(full);
      else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) results.push(full);
    }
  }
  scan(path.resolve(ROOT, dir));
  return results;
}

function res(...parts) { return path.resolve(ROOT, ...parts); }

// Define route groups
const GROUPS = {
  driver:          await getRouteFiles('app/(driver)'),
  dispatcher:      [
    ...await getRouteFiles('app/(tabs)'),
    ...await getRouteFiles('app/trip'),
    ...await getRouteFiles('app/(modals)'),
  ],
  // Per-feature traces from the individual tab entry points
  finance:         [res('app/(tabs)/finance.tsx'), res('app/(modals)/ledger-sync.tsx')],
  trips_tab:       [res('app/(tabs)/_trips-screen.tsx'), res('app/(tabs)/trips.tsx')],
  network:         [res('app/(tabs)/_network-screen.tsx')],
  chat:            [res('app/chat.tsx')],
  shared_layout:   [res('app/_layout.tsx')],
};

console.log('\n📐  Route Group Import Tree Analysis');
console.log('   (static imports only, excludes dynamic import())\n');

// Build graphs for each group
const graphs = {};
for (const [name, files] of Object.entries(GROUPS)) {
  graphs[name] = await buildGraph(files);
}

// Report each group
for (const [name, graph] of Object.entries(graphs)) {
  const total = [...graph.values()].reduce((s, n) => s + n, 0);
  console.log(`📦  ${name.padEnd(20)} ${String(graph.size).padStart(4)} files  ${bytes(total)}`);
}

// Compute exclusives (driver-only vs dispatcher-only)
const driverFiles = new Set(graphs.driver.keys());
const dispatcherFiles = new Set(graphs.dispatcher.keys());
const sharedFiles = new Set([...driverFiles].filter(f => dispatcherFiles.has(f)));
const driverOnly = new Set([...driverFiles].filter(f => !dispatcherFiles.has(f)));
const dispatcherOnly = new Set([...dispatcherFiles].filter(f => !driverFiles.has(f)));

const sizeOf = (set) => [...set].reduce((s, f) => {
  const g = graphs.driver.get(f) ?? graphs.dispatcher.get(f) ?? 0;
  return s + g;
}, 0);

console.log('\n📊  Driver vs Dispatcher overlap:');
console.log(`   shared (in both)            ${sharedFiles.size} files  ${bytes(sizeOf(sharedFiles))}`);
console.log(`   driver-only                 ${driverOnly.size} files  ${bytes(sizeOf(driverOnly))}`);
console.log(`   dispatcher-only             ${dispatcherOnly.size} files  ${bytes(sizeOf(dispatcherOnly))}`);

console.log('\n💡  Role-split potential:');
console.log(`   If dispatcher users skip driver-only code:  save ~${bytes(sizeOf(driverOnly))}`);
console.log(`   If driver users skip dispatcher-only code:  save ~${bytes(sizeOf(dispatcherOnly))}`);

// Top 15 largest driver-only files
console.log('\n🚗  Largest driver-only files:');
const driverOnlySorted = [...driverOnly]
  .map(f => [f, graphs.driver.get(f) ?? 0])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15);
for (const [f, n] of driverOnlySorted) {
  console.log(`   ${path.relative(ROOT, f).padEnd(60)} ${bytes(n)}`);
}

// Top 15 largest dispatcher-only files
console.log('\n🖥️  Largest dispatcher-only files:');
const dispatcherOnlySorted = [...dispatcherOnly]
  .map(f => [f, graphs.dispatcher.get(f) ?? 0])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15);
for (const [f, n] of dispatcherOnlySorted) {
  console.log(`   ${path.relative(ROOT, f).padEnd(60)} ${bytes(n)}`);
}
