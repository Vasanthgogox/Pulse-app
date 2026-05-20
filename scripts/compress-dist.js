#!/usr/bin/env node
/**
 * Post-build brotli + gzip compression for Expo static assets.
 * Netlify serves pre-compressed .br / .gz files automatically when present.
 * Run after: expo export --platform web
 *
 * Requires: brotli (brew install brotli), gzip (built-in)
 */
'use strict';

const { execSync } = require('child_process');
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

const files = walk(DIST_STATIC);
if (!files.length) {
  console.log('compress-dist: no files found in dist/_expo/static — run npm run build:web first');
  process.exit(0);
}

let brotliOk = false;
try { execSync('brotli --version', { stdio: 'ignore' }); brotliOk = true; } catch {}

let compressed = 0;
for (const f of files) {
  // gzip — always available
  if (!fs.existsSync(f + '.gz')) {
    execSync(`gzip -kf "${f}"`, { stdio: 'inherit' });
    compressed++;
  }
  // brotli — better compression, preferred by modern browsers
  if (brotliOk && !fs.existsSync(f + '.br')) {
    execSync(`brotli -fZ "${f}"`, { stdio: 'ignore' });
    compressed++;
  }
}

const totalKB = files.reduce((s, f) => s + (fs.statSync(f).size || 0), 0) / 1024;
console.log(`compress-dist: compressed ${files.length} files (${totalKB.toFixed(0)} KB total uncompressed)`);
