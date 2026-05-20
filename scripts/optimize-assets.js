#!/usr/bin/env node
/**
 * Compress bundled PNG/JPEG assets in-place using sharp.
 * Safe: skips app-store assets (icon, splash, adaptive-icon, favicon).
 * Run once: node scripts/optimize-assets.js
 * Idempotent: re-running it is safe (won't degrade already-compressed files).
 */
'use strict';

const sharp  = require('sharp');
const fs     = require('fs');
const path   = require('path');

const ROOT       = path.join(__dirname, '..');
const ASSET_DIRS = ['assets/avatars', 'assets/drivers', 'assets/trucks', 'assets/images'];

// Never touch app-store / EAS build assets
const SKIP = new Set([
  'icon.png', 'splash-icon.png', 'adaptive-icon.png',
  'favicon.png', 'splash.png', 'notification-icon.png',
]);

function walk(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) result.push(...walk(p, exts));
    else if (exts.some((e) => f.name.toLowerCase().endsWith(e))) result.push(p);
  }
  return result;
}

async function optimizeFile(filePath) {
  const name    = path.basename(filePath);
  const before  = fs.statSync(filePath).size;
  const ext     = path.extname(filePath).toLowerCase();
  const tmp     = filePath + '.tmp';

  let pipeline = sharp(filePath);

  if (ext === '.png') {
    // Lossy PNG quantization — 80% quality keeps visual fidelity, cuts 60–90% file size
    pipeline = pipeline.png({ quality: 80, compressionLevel: 9, effort: 10 });
  } else if (ext === '.jpg' || ext === '.jpeg') {
    pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
  } else {
    return null;
  }

  await pipeline.toFile(tmp);

  const after = fs.statSync(tmp).size;
  if (after < before) {
    fs.renameSync(tmp, filePath);
    return { before, after, saved: before - after };
  } else {
    // Already well-compressed; discard the attempt
    fs.unlinkSync(tmp);
    return { before, after: before, saved: 0 };
  }
}

async function main() {
  const files = ASSET_DIRS.flatMap((d) =>
    walk(path.join(ROOT, d), ['.png', '.jpg', '.jpeg'])
  ).filter((f) => !SKIP.has(path.basename(f)));

  console.log(`\nOptimizing ${files.length} image files…\n`);

  let totalBefore = 0;
  let totalAfter  = 0;

  for (const f of files) {
    const rel = f.replace(ROOT + '/', '');
    const result = await optimizeFile(f);
    if (!result) continue;

    totalBefore += result.before;
    totalAfter  += result.after;

    const pct   = result.saved > 0 ? ((result.saved / result.before) * 100).toFixed(0) : '0';
    const mb    = (result.before / 1024 / 1024).toFixed(1);
    const saved = (result.saved  / 1024 / 1024).toFixed(1);
    const status = result.saved > 0 ? `−${saved} MB (${pct}%)` : 'already optimal';
    console.log(`  ${mb.padStart(5)} MB  →  ${status.padEnd(20)}  ${rel}`);
  }

  const totalSaved = totalBefore - totalAfter;
  console.log(`\n─────────────────────────────────────────────`);
  console.log(`  Before: ${(totalBefore / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  After:  ${(totalAfter  / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Saved:  ${(totalSaved  / 1024 / 1024).toFixed(1)} MB (${((totalSaved / totalBefore) * 100).toFixed(0)}%)`);
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
