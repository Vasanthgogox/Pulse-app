#!/usr/bin/env node
/**
 * Compress bundled PNG/JPEG assets in-place using sharp.
 * Safe: skips app-store assets (icon, splash, adaptive-icon, favicon).
 * Run once: node scripts/optimize-assets.js
 *
 * Idempotent: a file already within MAX_EDGE and already below the
 * RE_ENCODE_MIN_BYTES floor is left untouched. This matters because the PNG
 * re-encode is lossy — without the skip, every extra run re-quantised an
 * already-optimised image to a slightly smaller file (kept, since the script
 * keeps any smaller result) and quality degraded cumulatively.
 */
'use strict';

const sharp  = require('sharp');
const fs     = require('fs');
const path   = require('path');

const ROOT       = path.join(__dirname, '..');
const ASSET_DIRS = [
  'assets/avatars', 'assets/drivers', 'assets/trucks', 'assets/images',
  'assets/file type icons', 'assets/icon and logos',
];

// Cap the longest edge. These are picker avatars / icons rendered at 24–64px,
// but ship as 3000x3000 source exports (one is 34 MB), so they dominate the
// deploy upload. 512px is ~8x headroom for retina. `withoutEnlargement` means
// already-small images are never upscaled.
const MAX_EDGE = Number(process.env.ASSET_MAX_EDGE) || 512;

// Files at/below MAX_EDGE and under this size are treated as already optimised
// and skipped, making re-runs a true no-op. An optimised 512px PNG lands around
// 27–40 KB, so 150 KB clears them comfortably while still letting genuinely
// heavy in-bounds images through for a first compression pass.
const RE_ENCODE_MIN_BYTES = Number(process.env.ASSET_SKIP_UNDER_BYTES) || 150 * 1024;

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
  const before  = fs.statSync(filePath).size;
  const ext     = path.extname(filePath).toLowerCase();
  const tmp     = filePath + '.tmp';

  // Idempotency gate: an image already inside MAX_EDGE and already small has
  // nothing left to win, and re-encoding it would only re-quantise (lossy).
  // Skipping leaves the first pass's output bit-identical on every later run.
  if (before <= RE_ENCODE_MIN_BYTES) {
    const meta = await sharp(filePath).metadata();
    if ((meta.width || 0) <= MAX_EDGE && (meta.height || 0) <= MAX_EDGE) {
      return { before, after: before, saved: 0, skipped: true };
    }
  }

  let pipeline = sharp(filePath).resize(MAX_EDGE, MAX_EDGE, {
    fit: 'inside',
    withoutEnlargement: true,
  });

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
    const status = result.saved > 0
      ? `−${saved} MB (${pct}%)`
      : result.skipped ? 'skipped (already optimised)' : 'already optimal';
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
