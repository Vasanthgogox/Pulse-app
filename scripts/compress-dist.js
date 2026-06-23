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

  const tasks = [];
  for (const f of files) {
    if (!fs.existsSync(f + '.gz')) {
      tasks.push(compressFile(f, f + '.gz', zlib.gzip));
    }
    if (!fs.existsSync(f + '.br')) {
      tasks.push(compressFile(f, f + '.br', zlib.brotliCompress));
    }
  }

  await Promise.all(tasks);

  const totalKB = files.reduce((s, f) => s + (fs.statSync(f).size || 0), 0) / 1024;
  console.log(`compress-dist: compressed ${files.length} files (${totalKB.toFixed(0)} KB total uncompressed)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
