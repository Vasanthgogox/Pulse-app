#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
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
  const base = spec.startsWith('@/')
    ? path.resolve(ROOT, spec.slice(2))
    : path.resolve(path.dirname(fromFile), spec);
  for (const ext of EXTS) {
    try { await stat(`${base}${ext}`); return `${base}${ext}`; } catch {}
  }
  for (const ext of EXTS) {
    try { await stat(path.join(base, `index${ext}`)); return path.join(base, `index${ext}`); } catch {}
  }
  return null;
}

async function buildGraph(entries) {
  const visited = new Map();
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

const networkEntry = [path.resolve(ROOT, 'app/(tabs)/_network-screen.tsx')];
const sharedEntry = [path.resolve(ROOT, 'app/_layout.tsx')];

console.log('Building graphs...');
const [netGraph, sharedGraph] = await Promise.all([
  buildGraph(networkEntry),
  buildGraph(sharedEntry),
]);

// Exclusive to network (not already pulled in by startup/layout)
const exclusive = [...netGraph.entries()]
  .filter(([f]) => !sharedGraph.has(f))
  .sort((a, b) => b[1] - a[1]);

const exclusiveTotal = exclusive.reduce((s, [, n]) => s + n, 0);

console.log(`\n🌐  Network bundle — exclusive to _network-screen.tsx`);
console.log(`   Total: ${exclusive.length} files  ${bytes(exclusiveTotal)}\n`);

// Top 25
exclusive.slice(0, 25).forEach(([f, n]) => {
  const rel = path.relative(ROOT, f).padEnd(72);
  console.log(`   ${rel} ${bytes(n)}`);
});

// Group by feature
const byFeature = {};
for (const [f, n] of exclusive) {
  const rel = path.relative(ROOT, f);
  const parts = rel.split('/');
  const key = parts[0] === 'features' ? `${parts[0]}/${parts[1]}`
    : parts[0] === 'components' ? `components/${parts[1]?.replace(/\.[^.]+$/, '') ?? ''}`
    : parts[0];
  byFeature[key] = (byFeature[key] || 0) + n;
}

console.log('\n📊  By folder (exclusive to network):');
Object.entries(byFeature)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, n]) => {
    const pct = ((n / exclusiveTotal) * 100).toFixed(1);
    console.log(`   ${k.padEnd(40)} ${bytes(n).padStart(10)}  ${pct}%`);
  });

// Check what's in app/(tabs)/_network-screen.tsx that drives the size
console.log('\n🔍  Top-level imports of _network-screen.tsx:');
const src = await readFile(path.resolve(ROOT, 'app/(tabs)/_network-screen.tsx'), 'utf8');
const directImports = [];
STATIC_IMPORT_RE.lastIndex = 0;
let m;
while ((m = STATIC_IMPORT_RE.exec(src)) !== null) {
  const spec = m[1];
  if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
  const resolved = await resolveImport(path.resolve(ROOT, 'app/(tabs)/_network-screen.tsx'), spec);
  if (!resolved) continue;
  const sub = await buildGraph([resolved]);
  const subSize = [...sub.values()].reduce((s, n) => s + n, 0);
  directImports.push([spec, subSize]);
}
directImports.sort((a, b) => b[1] - a[1]);
directImports.forEach(([spec, n]) => {
  console.log(`   ${spec.padEnd(72)} → ${bytes(n)}`);
});
