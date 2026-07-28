#!/usr/bin/env node
/**
 * Post-build brotli + gzip compression for Expo static assets.
 * Netlify serves pre-compressed .br / .gz files automatically when present.
 * Run after: expo export --platform web
 *
 * Uses Node built-in zlib (no shell spawns) with full parallelism.
 */
'use strict';

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const DIST_STATIC = path.join(__dirname, '..', 'dist', '_expo', 'static');
const EXTS        = ['.js', '.css', '.html'];

// Brotli quality. Measured on 58 files / 24 MB:
//   q9  → 0.70s, 4.36 MB     q10 → 8.02s, 4.01 MB     q11 → 20.23s, 3.94 MB
// The cost cliff is between q9 and q10 (11.5x time for 8.9% size), so q9 is
// the optimum. Chunks are served `immutable`, so the +10.7% vs q11 is a
// one-time-per-release download.
const BROTLI_QUALITY = Number(process.env.BROTLI_QUALITY) || 9;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) entries.push(...walk(p));
    else if (EXTS.some((e) => f.name.endsWith(e))) entries.push(p);
  }
  return entries;
}

function compressFile(src, dest, fn) {
  return new Promise((resolve, reject) => {
    const input  = fs.readFileSync(src);
    fn(input, (err, result) => {
      if (err) return reject(err);
      fs.writeFileSync(dest, result);
      resolve();
    });
  });
}

async function main() {
  const files = walk(DIST_STATIC);
  if (!files.length) {
    console.log('compress-dist: no files found in dist/_expo/static — run npm run build:web first');
    process.exit(0);
  }

  // Always recompress. Skipping when a sidecar already exists made two bugs
  // possible: changing BROTLI_QUALITY silently did nothing, and a .br could
  // survive next to a .js whose contents had changed (serving stale JS to
  // brotli clients). Unconditional rewrite costs ~1s and removes both.
  const tasks = [];
  for (const f of files) {
    tasks.push(compressFile(f, f + '.gz', zlib.gzip));
    tasks.push(compressFile(f, f + '.br', (buf, cb) =>
      zlib.brotliCompress(buf, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
      }, cb)));
  }

  await Promise.all(tasks);

  const totalKB = files.reduce((s, f) => s + (fs.statSync(f).size || 0), 0) / 1024;
  console.log(`compress-dist: compressed ${files.length} files at brotli q${BROTLI_QUALITY} (${totalKB.toFixed(0)} KB total uncompressed)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
