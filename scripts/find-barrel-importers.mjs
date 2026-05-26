#!/usr/bin/env node
/**
 * scripts/find-barrel-importers.mjs
 *
 * Lists every consumer of a barrel `index.ts(x)` file, plus a count.
 * Run after killing a barrel re-export to know the blast radius.
 *
 *   node scripts/find-barrel-importers.mjs           # all barrels
 *   node scripts/find-barrel-importers.mjs lib/queries features/finance
 *
 * A "barrel" is matched as `'@/<args>'` (no trailing slash) — those imports
 * resolve via Metro to `<args>/index.{ts,tsx}` and drag every re-export's
 * graph into the consumer.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  '.metro-cache',
  'dist',
  'web-build',
  'playwright-report',
  'test-results',
  'coverage',
  'docs',
  'android',
  'ios',
  '.claude',
  '.cursor',
  'data-analytics',
]);

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const argBarrels = process.argv.slice(2);

async function findBarrels() {
  const found = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      if (IGNORE_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (
        entry.isFile() &&
        (entry.name === 'index.ts' || entry.name === 'index.tsx')
      ) {
        found.push(full);
      }
    }
  }
  await walk(ROOT);
  return found;
}

async function fileSize(p) {
  try {
    return (await stat(p)).size;
  } catch {
    return 0;
  }
}

async function listSourceFiles() {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      if (IGNORE_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (SOURCE_EXTS.has(path.extname(entry.name))) out.push(full);
    }
  }
  await walk(ROOT);
  return out;
}

const allBarrels = await findBarrels();
const barrelsToCheck = argBarrels.length
  ? argBarrels.map((a) => path.resolve(ROOT, a.replace(/\/+$/, '')))
  : allBarrels.map((p) => path.dirname(p));

const sources = await listSourceFiles();

const result = [];
for (const dir of barrelsToCheck) {
  const rel = path.relative(ROOT, dir).replace(/\\/g, '/');
  const importPattern = new RegExp(
    `^\\s*(?:import|export)\\s+(?:[^'"\`]+from\\s+)?['"]@/${rel.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )}['"]`,
    'gm',
  );
  const consumers = [];
  for (const file of sources) {
    if (path.dirname(file).startsWith(dir)) continue; // ignore self
    const src = await readFile(file, 'utf8');
    if (importPattern.test(src)) {
      consumers.push(path.relative(ROOT, file).replace(/\\/g, '/'));
    }
  }
  const indexPath =
    (await fileSize(path.join(dir, 'index.ts'))) > 0
      ? path.join(dir, 'index.ts')
      : path.join(dir, 'index.tsx');
  result.push({
    barrel: rel,
    indexBytes: await fileSize(indexPath),
    consumerCount: consumers.length,
    consumers,
  });
}

result.sort((a, b) => b.consumerCount - a.consumerCount);

for (const r of result) {
  console.log(
    `\n@/${r.barrel}  ·  ${r.consumerCount} consumer(s)  ·  index ${r.indexBytes}B`,
  );
  for (const c of r.consumers) console.log(`   ${c}`);
}
