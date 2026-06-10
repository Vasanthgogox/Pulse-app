#!/usr/bin/env node
/**
 * Netlify Build Audit — pulse (Expo + React Native Web)
 *
 * Usage:
 *   node scripts/netlify-build-audit.js                  # static project analysis only
 *   node scripts/netlify-build-audit.js deploy.log       # + parse a pasted Netlify log file
 *   node scripts/netlify-build-audit.js --output=report  # write report.md
 *
 * Pipe a Netlify log:  pbpaste > deploy.log && node scripts/netlify-build-audit.js deploy.log
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── helpers ──────────────────────────────────────────────────────────────────

const ROOT   = path.resolve(__dirname, '..');
const FMT_MB = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;
const dim    = (s) => `\x1b[2m${s}\x1b[0m`;
void yellow; // used in renderChecklist via sev map

const OUTPUT_FLAG = process.argv.find((a) => a.startsWith('--output='));
const LOG_FILE    = process.argv.find((a) => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);
const WRITE_MD    = OUTPUT_FLAG ? OUTPUT_FLAG.split('=')[1] + '.md' : null;

// ── log parser ───────────────────────────────────────────────────────────────

function parseNetlifyLog(logPath) {
  const raw  = fs.readFileSync(logPath, 'utf8');
  const lines = raw.split('\n');

  // Timestamp formats: [12:34:56] or 12:34:56.123 or HH:MM:SS
  const TS_RE = /^(?:\[?(\d{2}:\d{2}:\d{2})(?:\.\d+)?\]?\s+)/;

  const steps = [];
  let lastTs = null;
  let lastLabel = null;

  const STEP_RE = /(?:▲|►|▸|›|>|Running|Started|Starting|Installing|Uploading|Caching|Bundling|Compiling|Building|Restoring|Saving|Transforming|Processing|Exporting|Optimizing)\s+(.{5,80})/i;

  for (const line of lines) {
    const tsMatch = TS_RE.exec(line);
    if (!tsMatch) continue;

    const [h, m, s] = tsMatch[1].split(':').map(Number);
    const ts = h * 3600 + m * 60 + s;

    const rest = line.slice(tsMatch[0].length).trim();
    if (!rest) continue;

    if (lastTs !== null && lastLabel) {
      const duration = ts - lastTs;
      if (duration >= 0 && duration < 3600) {
        steps.push({ label: lastLabel, duration, line: rest });
      }
    }

    const stepMatch = STEP_RE.exec(rest);
    if (stepMatch) {
      lastLabel = rest.slice(0, 120);
      lastTs    = ts;
    }
  }

  // Detect top patterns
  const slow = steps
    .filter((s) => s.duration > 5)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);

  // npm install detection
  const npmLine  = lines.find((l) => /npm (ci|install|i )/i.test(l));
  const yarnLine = lines.find((l) => /yarn (install|add)/i.test(l));
  const totalRe  = /Build\s+(?:completed|finished|done)[^\d]*(\d+m?\s*\d*s?)/i;
  const totalMatch = lines.map((l) => totalRe.exec(l)).find(Boolean);

  // Upload detection
  const uploadLines = lines.filter((l) => /upload(?:ing|ed)|asset.*\d+\s*(?:KB|MB)/i.test(l));

  // Cache hit/miss
  const cacheHit  = lines.some((l) => /cache restored|cache hit/i.test(l));
  const cacheMiss = lines.some((l) => /cache not found|no cache/i.test(l));

  return { slow, npmLine, yarnLine, totalMatch, uploadLines, cacheHit, cacheMiss, lineCount: lines.length };
}

// ── static project analysis ───────────────────────────────────────────────────

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    total += f.isDirectory() ? dirSize(p) : (fs.statSync(p).size || 0);
  }
  return total;
}

function largestFiles(dir, exts, topN = 10) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (exts.some((e) => f.name.endsWith(e))) {
        results.push({ file: p.replace(ROOT + '/', ''), size: fs.statSync(p).size });
      }
    }
  }
  walk(dir);
  return results.sort((a, b) => b.size - a.size).slice(0, topN);
}

function analyzeProject() {
  const pkg          = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const netlifyToml  = fs.existsSync(path.join(ROOT, 'netlify.toml'))
    ? fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8') : '';
  const lockFile     = fs.existsSync(path.join(ROOT, 'package-lock.json')) ? 'package-lock.json'
                     : fs.existsSync(path.join(ROOT, 'yarn.lock'))          ? 'yarn.lock' : null;

  // Deps
  const deps    = Object.keys(pkg.dependencies    || {});
  const devDeps = Object.keys(pkg.devDependencies || {});

  // Build command
  const buildCmd = pkg.scripts?.['build:web'] || pkg.scripts?.build || '(none)';

  // Expo SDK version
  const expoVersion = (pkg.dependencies?.expo || '').replace(/[^0-9.]/g, '').split('.')[0];

  // Node modules size
  const nmSize = dirSize(path.join(ROOT, 'node_modules'));

  // Assets — skip app-store/EAS assets that must stay as PNG
  const APP_STORE_ASSETS = new Set([
    'icon.png', 'splash-icon.png', 'adaptive-icon.png',
    'favicon.png', 'splash.png', 'notification-icon.png',
  ]);
  const assetDir    = path.join(ROOT, 'assets');
  const assetSize   = dirSize(assetDir);
  const bigImages   = largestFiles(assetDir, ['.png', '.jpg', '.jpeg', '.gif', '.webp']);
  const unoptPngs   = bigImages.filter(
    (f) => f.size > 500 * 1024 && !APP_STORE_ASSETS.has(path.basename(f.file))
  );

  // Dist
  const distDir   = path.join(ROOT, 'dist');
  const distSize  = dirSize(distDir);
  const distBundles = largestFiles(path.join(distDir, '_expo', 'static', 'js'), ['.js']);

  // Netlify checks
  const hasNodePlugin  = netlifyToml.includes('netlify-plugin-node');
  const hasLegacyCachePlugin = netlifyToml.includes('netlify-plugin-cache') || netlifyToml.includes('cache-node-modules');
  const hasNodeVersion = netlifyToml.includes('NODE_VERSION') || fs.existsSync(path.join(ROOT, '.node-version')) || fs.existsSync(path.join(ROOT, '.nvmrc'));
  const hasNpmCi       = !netlifyToml.includes('npm install ') || netlifyToml.includes('npm ci');

  // Metro cache — only flag if tmpdir is used unconditionally (not behind process.env.CI guard)
  const metroConfig = fs.existsSync(path.join(ROOT, 'metro.config.js'))
    ? fs.readFileSync(path.join(ROOT, 'metro.config.js'), 'utf8') : '';
  const metroTmp      = metroConfig.includes('tmpdir') || metroConfig.includes('os.tmpdir');
  const metroCacheDir = metroTmp ? os.tmpdir() + '/pulse-metro-cache' : null;

  // SVG transformer
  const hasSvgTransformer = metroConfig.includes('svg-transformer');

  // Reanimated plugin
  const babelConfig = fs.existsSync(path.join(ROOT, 'babel.config.js'))
    ? fs.readFileSync(path.join(ROOT, 'babel.config.js'), 'utf8') : '';
  const hasReanimated = babelConfig.includes('reanimated');

  // patch-package
  const hasPatches = fs.existsSync(path.join(ROOT, 'patches'));
  const patchCount = hasPatches
    ? fs.readdirSync(path.join(ROOT, 'patches')).filter((f) => f.endsWith('.patch')).length : 0;

  // Heavy deps that slow web bundles
  const heavyWebDeps = [
    '@maplibre/maplibre-react-native', 'maplibre-gl', 'react-map-gl',
    'leaflet', 'html2canvas', '@google/genai', '@shopify/flash-list',
    'react-native-reanimated', 'react-native-gesture-handler',
  ].filter((d) => deps.includes(d));

  return {
    pkg, lockFile, deps, devDeps, buildCmd, expoVersion,
    nmSize, assetSize, bigImages, unoptPngs,
    distSize, distBundles,
    hasNodePlugin, hasLegacyCachePlugin, hasNodeVersion, hasNpmCi,
    metroTmp, metroCacheDir, hasSvgTransformer, hasReanimated,
    hasPatches, patchCount,
    heavyWebDeps, netlifyToml,
  };
}

// ── findings builder ──────────────────────────────────────────────────────────

function buildFindings(project, log) {
  const findings = [];

  // ── 1. Legacy cache plugin (breaks on Node 20 + symlinks) ─────────────────
  if (project.hasLegacyCachePlugin) {
    findings.push({
      severity: 'critical',
      area: 'Cache',
      title: 'netlify-plugin-cache is configured — remove it',
      detail: 'Caching node_modules/.bin symlinks fails with EISDIR on Netlify (cpy + Node 20). '
            + 'Netlify already caches npm from package-lock.json when NODE_VERSION is pinned.',
      fix: [
        'Remove [[plugins]] netlify-plugin-cache from netlify.toml',
        'npm uninstall netlify-plugin-cache',
        'Keep NODE_VERSION, .nvmrc, and NPM_FLAGS = "--prefer-offline"',
        'Clear deploy cache once in Netlify UI after removing the plugin',
      ],
      estimatedSaving: 'fixes post-build cache failures',
    });
  } else if (!project.hasNodeVersion || !project.lockFile) {
    findings.push({
      severity: 'high',
      area: 'Dependency install',
      title: 'Unstable Netlify dependency cache keys',
      detail: `${project.deps.length} prod + ${project.devDeps.length} dev deps (~${FMT_MB(project.nmSize)} node_modules). `
            + 'Pin Node and commit package-lock.json so Netlify native npm cache hits reliably.',
      fix: [
        'Set NODE_VERSION = "20" in netlify.toml and add .nvmrc',
        'Use npm ci (default on Netlify when package-lock.json exists)',
        'Set NPM_FLAGS = "--prefer-offline" in netlify.toml',
        'Do not cache node_modules with a custom plugin',
      ],
      estimatedSaving: '1–3 min on warm installs',
    });
  }

  // ── 2. No pinned Node version ───────────────────────────────────────────────
  if (!project.hasNodeVersion) {
    findings.push({
      severity: 'high',
      area: 'Environment',
      title: 'Node version not pinned',
      detail: 'Netlify may pick a different Node version between builds, causing full cold installs or cache misses.',
      fix: [
        'Add NODE_VERSION = "20" to [build.environment] in netlify.toml',
        'Or add a .nvmrc / .node-version file at the repo root',
      ],
      estimatedSaving: '1–2 min (cache hit rate)',
    });
  }

  // ── 3. Metro cache in /tmp (expected on CI) ───────────────────────────────
  if (project.metroTmp) {
    findings.push({
      severity: 'info',
      area: 'Build cache',
      title: 'Metro transform cache is ephemeral on Netlify (expected)',
      detail: `metro.config.js uses ${project.metroCacheDir}. `
            + 'Netlify containers wipe /tmp each build. Avoid caching node_modules or .metro-cache with custom plugins (symlink EISDIR).',
      fix: [
        'Accept cold Metro transform on CI, or optimize bundle size / lazy imports instead',
        'Keep tmpdir for Metro locally to avoid Watchman rebuild loops',
      ],
      estimatedSaving: 'n/a (reliability tradeoff)',
    });
  }

  // ── 4. Unoptimized large PNG assets ─────────────────────────────────────────
  if (project.unoptPngs.length > 0) {
    const totalWaste = project.unoptPngs.reduce((s, f) => s + f.size, 0);
    findings.push({
      severity: 'high',
      area: 'Asset upload',
      title: `${project.unoptPngs.length} unoptimized PNG assets (${FMT_MB(totalWaste)} total)`,
      detail: project.unoptPngs.slice(0, 6).map((f) => `  ${FMT_MB(f.size).padStart(8)}  ${f.file}`).join('\n')
            + (project.unoptPngs.length > 6 ? `\n  … +${project.unoptPngs.length - 6} more` : ''),
      fix: [
        'Run: npx sharp-cli --input "assets/**/*.png" --output assets/ --format webp  (70–90% size reduction)',
        'Or install netlify-plugin-image-optim for automatic on-deploy compression',
        'Convert avatar PNGs to WebP — female_woman_icon.png alone is 11 MB',
        'Use expo-image with blurhash placeholders so large avatars load lazily',
      ],
      estimatedSaving: '1–3 min upload time + faster initial page load',
    });
  }

  // ── 5. Monolithic JS bundle ──────────────────────────────────────────────────
  if (project.distBundles.length > 0) {
    const mainBundle = project.distBundles[0];
    if (mainBundle.size > 5 * 1024 * 1024) {
      findings.push({
        severity: 'high',
        area: 'Bundle size',
        title: `Main JS bundle is ${FMT_MB(mainBundle.size)} — no code splitting`,
        detail: 'expo export --platform web currently emits a single entry chunk. '
              + 'Lazy-loading screens via React.lazy() + Expo Router\'s built-in lazy flag reduces initial transfer by 40–70%.',
        fix: [
          'Enable Expo Router\'s lazy loading: set `experiments.reactLazy: true` in app.json (Expo SDK 50+)',
          'Audit heavy deps loaded at startup: @google/genai, maplibre-gl, html2canvas should be dynamically imported',
          'Use `import()` for opsAgent.service.ts (69 KB) — only needed in the chat screen',
          'Consider `expo-modules-core` tree-shaking: set `bundler.optimizeAssets: true` in app.json',
        ],
        estimatedSaving: '1–2 min upload/cache-push + faster TTI',
      });
    }
  }

  // ── 6. patch-package postinstall ─────────────────────────────────────────────
  if (project.hasPatches && project.patchCount > 0) {
    findings.push({
      severity: 'medium',
      area: 'Dependency install',
      title: `patch-package applies ${project.patchCount} patch(es) on every postinstall`,
      detail: 'Each patch-package run re-applies patches after npm ci. '
            + 'This blocks the install step and prevents full node_modules caching (patched files differ from lock hash).',
      fix: [
        'Long term: upstream patches or fork packages to avoid postinstall cost',
        'Netlify re-runs postinstall after npm ci; keep patch count small',
      ],
      estimatedSaving: '15–60 s',
    });
  }

  // ── 7. Heavy web-incompatible native deps ────────────────────────────────────
  if (project.heavyWebDeps.length > 0) {
    findings.push({
      severity: 'medium',
      area: 'Bundle size / transform time',
      title: `${project.heavyWebDeps.length} heavy/native deps included in web bundle`,
      detail: project.heavyWebDeps.join(', '),
      fix: [
        'Use .web.tsx platform extensions to exclude native-only modules from the web build',
        'Dynamic-import maplibre-gl / react-map-gl — only needed on map screens',
        'Dynamic-import @google/genai — only needed in chat; large SDK',
        'Audit with: EXPO_DEBUG_BUNDLE=1 npx expo export --platform web 2>&1 | grep "size"',
      ],
      estimatedSaving: '30–90 s transform time + bundle reduction',
    });
  }

  // ── 8. Log-specific findings ──────────────────────────────────────────────────
  if (log) {
    if (log.cacheMiss && !log.cacheHit) {
      findings.push({
        severity: 'critical',
        area: 'Cache',
        title: 'Every build is a full cold build (cache miss detected in logs)',
        detail: 'Netlify logs show "cache not found". No build cache is being restored.',
        fix: [
          'Pin NODE_VERSION + package-lock.json for Netlify native npm cache',
          'Remove netlify-plugin-cache if present (symlink copy failures)',
        ],
        estimatedSaving: '4–8 min per deploy',
      });
    }

    if (log.slow.length > 0) {
      findings.push({
        severity: 'info',
        area: 'Build steps (from logs)',
        title: 'Slowest build steps detected',
        detail: log.slow.map((s) => `  ${String(s.duration).padStart(4)}s  ${s.label.slice(0, 90)}`).join('\n'),
        fix: ['Focus caching/optimization on the steps above'],
        estimatedSaving: 'depends on step',
      });
    }

    if (log.uploadLines.length > 5) {
      findings.push({
        severity: 'medium',
        area: 'Asset upload',
        title: `${log.uploadLines.length} asset upload log lines — large deploy payload`,
        detail: 'Many files are being uploaded. Netlify only uploads changed files; ensure static assets use content hashes so unchanged files are skipped.',
        fix: [
          'Expo Router already content-hashes JS chunks — verify assets/ folder also uses hashed filenames',
          'Compress assets before deploy (see PNG optimization above)',
        ],
        estimatedSaving: '30–90 s upload time',
      });
    }
  }

  return findings;
}

// ── checklist generator ───────────────────────────────────────────────────────

function renderChecklist(findings) {
  const sev = { critical: '🔴', high: '🟠', medium: '🟡', info: '🔵' };
  const lines = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  PULSE NETLIFY BUILD AUDIT REPORT');
  lines.push('  Framework: Expo SDK 54 + React Native Web + Expo Router 6');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Summary
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const high     = findings.filter((f) => f.severity === 'high').length;
  const medium   = findings.filter((f) => f.severity === 'medium').length;

  lines.push(`  ${red('CRITICAL')} ${critical}   ${yellow('HIGH')} ${high}   MEDIUM ${medium}`);
  lines.push('');

  lines.push(`  Estimated total saving: up to 10–15 min per deploy`);
  lines.push('  (current cold build is likely 12–18 min; target < 5 min with cache)');
  lines.push('');

  // Findings
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    lines.push(`─────────────────────────────────────────────────────────────`);
    lines.push(`  ${sev[f.severity] || '⚪'} [${f.severity.toUpperCase()}] ${f.area}`);
    lines.push(`  ${f.title}`);
    if (f.detail) {
      lines.push('');
      for (const l of f.detail.split('\n')) lines.push(`    ${l}`);
    }
    if (f.fix?.length) {
      lines.push('');
      lines.push('  Fixes:');
      for (const fix of f.fix) lines.push(`    ✓ ${fix}`);
    }
    if (f.estimatedSaving) lines.push(`\n  Estimated saving: ${green(f.estimatedSaving)}`);
    lines.push('');
  }

  return lines.join('\n');
}

function renderConfig(project) {
  const lines = [];

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  RECOMMENDED netlify.toml');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`[build]
  command = "npm run build:web"
  publish = "dist"

[build.environment]
  NODE_VERSION  = "20"
  NPM_FLAGS     = "--prefer-offline"
  # Speeds up npm ci by using the local cache when possible
  NODE_OPTIONS  = "--max-old-space-size=4096"

# Netlify caches npm from package-lock.json when NODE_VERSION is pinned.
# Do not use netlify-plugin-cache for node_modules (symlink EISDIR on Node 20).

[functions]
  directory = "netlify/functions"

# SPA fallback
[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200

[[headers]]
  for = "/"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"

# Hashed static assets — immutable cache
[[headers]]
  for = "/_expo/static/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

# Pre-compressed assets (add brotli/gzip step to build command)
[[headers]]
  for = "/_expo/static/*.js"
  [headers.values]
    Content-Encoding = "br"
`);

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  RECOMMENDED build:web script upgrade');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`// package.json — compress output after expo export:
"build:web": "expo export --platform web && node scripts/compress-dist.js",
`);
  lines.push(`// scripts/compress-dist.js (brotli + gzip for _expo/static/):
const { execSync } = require('child_process');
const { globSync }  = require('glob');
for (const f of globSync('dist/_expo/static/**/*.{js,css}')) {
  execSync('brotli -f ' + f);          // creates .br sidecar
  execSync('gzip -kf ' + f);           // creates .gz sidecar
}
console.log('Compressed static assets.');
`);

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  IMAGE OPTIMIZATION ONE-LINER');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`# Convert oversized PNGs to WebP (requires: npm i -g @squoosh/cli)
npx @squoosh/cli --webp '{"quality":80}' assets/avatars/*.png assets/images/*.png
# Or use sharp-cli:
npx sharp-cli -i "assets/**/*.png" -o assets/ -f webp -q 80
`);

  return lines.join('\n');
}

function renderMarkdown(project, _log, findings) {
  const sev = { critical: '🔴 CRITICAL', high: '🟠 HIGH', medium: '🟡 MEDIUM', info: '🔵 INFO' };
  let md = '';

  md += '# Netlify Build Audit — pulse\n\n';
  md += `**Framework:** Expo SDK 54 · React Native Web · Expo Router 6  \n`;
  md += `**Build command:** \`${project.buildCmd}\`  \n`;
  md += `**Generated:** ${new Date().toISOString().slice(0, 10)}\n\n`;

  md += '## Summary\n\n';
  md += `| Severity | Count |\n|---|---|\n`;
  ['critical', 'high', 'medium', 'info'].forEach((s) => {
    const n = findings.filter((f) => f.severity === s).length;
    if (n) md += `| ${sev[s]} | ${n} |\n`;
  });
  md += '\n**Estimated saving:** 10–15 min per deploy (target < 5 min with caching enabled)\n\n';

  md += '## Findings & Checklist\n\n';
  findings.forEach((f, i) => {
    md += `### ${i + 1}. ${sev[f.severity]} — ${f.area}\n\n`;
    md += `**${f.title}**\n\n`;
    if (f.detail) md += '```\n' + f.detail + '\n```\n\n';
    if (f.fix?.length) {
      md += '**Fixes:**\n';
      f.fix.forEach((fix) => { md += `- [ ] ${fix}\n`; });
      md += '\n';
    }
    if (f.estimatedSaving) md += `> Estimated saving: **${f.estimatedSaving}**\n\n`;
  });

  md += '## Project Stats\n\n';
  md += `| Item | Value |\n|---|---|\n`;
  md += `| node_modules size | ${FMT_MB(project.nmSize)} |\n`;
  md += `| assets/ size | ${FMT_MB(project.assetSize)} |\n`;
  md += `| dist/ size | ${FMT_MB(project.distSize)} |\n`;
  md += `| Prod deps | ${project.deps.length} |\n`;
  md += `| Dev deps | ${project.devDeps.length} |\n`;
  md += `| Lock file | ${project.lockFile || 'none'} |\n`;
  md += `| Expo SDK | ${project.expoVersion} |\n`;
  md += `| Unoptimized PNGs >500 KB | ${project.unoptPngs.length} |\n`;
  if (project.distBundles[0]) {
    md += `| Main JS bundle | ${FMT_MB(project.distBundles[0].size)} |\n`;
  }
  md += '\n';

  md += '## Largest Assets\n\n';
  project.bigImages.slice(0, 8).forEach((f) => {
    md += `- \`${f.file}\` — ${FMT_MB(f.size)}\n`;
  });
  md += '\n';

  md += '## Recommended netlify.toml\n\n';
  md += '```toml\n[build]\n  command = "npm run build:web"\n  publish = "dist"\n\n';
  md += '[build.environment]\n  NODE_VERSION = "20"\n  NPM_FLAGS    = "--prefer-offline"\n  NODE_OPTIONS = "--max-old-space-size=4096"\n\n';
  md += '# Native npm cache only — no netlify-plugin-cache\n```\n\n';

  md += '## Quick Win Priority Order\n\n';
  md += '1. **Pin NODE_VERSION = "20"** + `.nvmrc` → stable Netlify npm cache hits\n';
  md += '2. **Remove netlify-plugin-cache** if present → avoids EISDIR on node_modules/.bin\n';
  md += '3. **Compress PNGs → WebP** → faster upload + smaller dist\n';
  md += '4. **Lazy-load heavy screens** (map, chat, opsAgent) → smaller initial bundle\n';
  md += '5. **brotli/gzip post-build** → CDN serves pre-compressed files\n';

  return md;
}

// ── main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log(bold('\nAnalyzing project…'));

  const project = analyzeProject();
  let log = null;

  if (LOG_FILE && fs.existsSync(LOG_FILE)) {
    console.log(`Parsing log file: ${LOG_FILE}`);
    log = parseNetlifyLog(LOG_FILE);
    console.log(`  ${log.lineCount} log lines, ${log.slow.length} timed steps found`);
    if (log.cacheHit)  console.log(green('  Cache HIT detected in logs'));
    if (log.cacheMiss) console.log(red('  Cache MISS detected in logs'));
  } else if (LOG_FILE) {
    console.log(yellow(`Log file "${LOG_FILE}" not found — running static analysis only`));
  } else {
    console.log(dim('  No log file provided. Run with: node scripts/netlify-build-audit.js deploy.log'));
  }

  const findings = buildFindings(project, log);

  // Print to terminal
  console.log(renderChecklist(findings));
  console.log(renderConfig(project));

  // Write markdown report if requested
  if (WRITE_MD) {
    const md = renderMarkdown(project, log, findings);
    fs.writeFileSync(path.join(ROOT, WRITE_MD), md);
    console.log(green(`\nMarkdown report written to: ${WRITE_MD}\n`));
  }

  // Exit code: non-zero if critical findings
  const criticals = findings.filter((f) => f.severity === 'critical').length;
  process.exit(criticals > 0 ? 1 : 0);
}

main();
