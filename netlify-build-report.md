# Netlify Build Audit — q-web

**Framework:** Expo SDK 54 · React Native Web · Expo Router 6  
**Build command:** `expo export --platform web`  
**Generated:** 2026-05-19

## Summary

| Severity | Count |
|---|---|
| 🔴 CRITICAL | 1 |
| 🟠 HIGH | 4 |
| 🟡 MEDIUM | 2 |

**Estimated saving:** 10–15 min per deploy (target < 5 min with caching enabled)

## Findings & Checklist

### 1. 🔴 CRITICAL — Dependency install

**node_modules not cached between deploys**

```
67 prod deps + 21 dev deps re-installed every build. node_modules is ~16524.6 MB. With netlify-plugin-cache this is restored in seconds.
```

**Fixes:**
- [ ] Add netlify-plugin-cache to netlify.toml (see recommended config below)
- [ ] Cache key: package-lock.json hash so cache auto-busts on dep changes

> Estimated saving: **3–6 min**

### 2. 🟠 HIGH — Environment

**Node version not pinned**

```
Netlify may pick a different Node version between builds, causing full cold installs or cache misses.
```

**Fixes:**
- [ ] Add NODE_VERSION = "20" to [build.environment] in netlify.toml
- [ ] Or add a .nvmrc / .node-version file at the repo root

> Estimated saving: **1–2 min (cache hit rate)**

### 3. 🟠 HIGH — Build cache

**Metro transform cache stored in /tmp — never restored on Netlify**

```
metro.config.js routes its FileStore to /var/folders/7_/kqvb7kks4pvcj23j_ynlwj8h0000gp/T/q-web-metro-cache. Netlify build containers are ephemeral: /tmp is wiped each build, so Metro re-transforms every module from scratch.
```

**Fixes:**
- [ ] Change Metro cacheStores root to a path inside the repo (e.g. .metro-cache/) so netlify-plugin-cache can save/restore it
- [ ] Cache key: concatenation of package-lock.json + metro.config.js hashes

> Estimated saving: **2–4 min**

### 4. 🟠 HIGH — Asset upload

**10 unoptimized PNG assets (43.0 MB total)**

```
   10.6 MB  assets/avatars/female_woman_icon.png
    5.9 MB  assets/images/image.png
    4.3 MB  assets/avatars/3d-icon-avatar-cartoon-man-with-glasses-is-smiling-and-wearing-on-transparent-background-png.png
    4.3 MB  assets/images/adaptive-icon.png
    4.3 MB  assets/images/icon.png
    4.3 MB  assets/images/splash-icon.png
  … +4 more
```

**Fixes:**
- [ ] Run: npx sharp-cli --input "assets/**/*.png" --output assets/ --format webp  (70–90% size reduction)
- [ ] Or install netlify-plugin-image-optim for automatic on-deploy compression
- [ ] Convert avatar PNGs to WebP — female_woman_icon.png alone is 11 MB
- [ ] Use expo-image with blurhash placeholders so large avatars load lazily

> Estimated saving: **1–3 min upload time + faster initial page load**

### 5. 🟠 HIGH — Bundle size

**Main JS bundle is 10.9 MB — no code splitting**

```
expo export --platform web currently emits a single entry chunk. Lazy-loading screens via React.lazy() + Expo Router's built-in lazy flag reduces initial transfer by 40–70%.
```

**Fixes:**
- [ ] Enable Expo Router's lazy loading: set `experiments.reactLazy: true` in app.json (Expo SDK 50+)
- [ ] Audit heavy deps loaded at startup: @google/genai, maplibre-gl, html2canvas should be dynamically imported
- [ ] Use `import()` for opsAgent.service.ts (69 KB) — only needed in the chat screen
- [ ] Consider `expo-modules-core` tree-shaking: set `bundler.optimizeAssets: true` in app.json

> Estimated saving: **1–2 min upload/cache-push + faster TTI**

### 6. 🟡 MEDIUM — Dependency install

**patch-package applies 4 patch(es) on every postinstall**

```
Each patch-package run re-applies patches after npm ci. This blocks the install step and prevents full node_modules caching (patched files differ from lock hash).
```

**Fixes:**
- [ ] Cache node_modules AFTER postinstall (netlify-plugin-cache caches the post-patch state)
- [ ] Long term: upstream patches or fork packages to avoid postinstall cost

> Estimated saving: **15–60 s**

### 7. 🟡 MEDIUM — Bundle size / transform time

**8 heavy/native deps included in web bundle**

```
@maplibre/maplibre-react-native, maplibre-gl, leaflet, html2canvas, @google/genai, @shopify/flash-list, react-native-reanimated, react-native-gesture-handler
```

**Fixes:**
- [ ] Use .web.tsx platform extensions to exclude native-only modules from the web build
- [ ] Dynamic-import maplibre-gl / react-map-gl — only needed on map screens
- [ ] Dynamic-import @google/genai — only needed in chat; large SDK
- [ ] Audit with: EXPO_DEBUG_BUNDLE=1 npx expo export --platform web 2>&1 | grep "size"

> Estimated saving: **30–90 s transform time + bundle reduction**

## Project Stats

| Item | Value |
|---|---|
| node_modules size | 16524.6 MB |
| assets/ size | 64.1 MB |
| dist/ size | 38.3 MB |
| Prod deps | 67 |
| Dev deps | 21 |
| Lock file | package-lock.json |
| Expo SDK | 54 |
| Unoptimized PNGs >500 KB | 10 |
| Main JS bundle | 10.9 MB |

## Largest Assets

- `assets/avatars/female_woman_icon.png` — 10.6 MB
- `assets/images/image.png` — 5.9 MB
- `assets/avatars/3d-icon-avatar-cartoon-man-with-glasses-is-smiling-and-wearing-on-transparent-background-png.png` — 4.3 MB
- `assets/images/adaptive-icon.png` — 4.3 MB
- `assets/images/icon.png` — 4.3 MB
- `assets/images/splash-icon.png` — 4.3 MB
- `assets/avatars/elegant-3d-female-witch-avatar-with-brown-eyes-and-long-curly-hair-png.png` — 4.1 MB
- `assets/avatars/3d-happy-cartoon-doctor-cartoon-doctor-on-transparent-background-generative-ai-png- female.png` — 2.1 MB

## Recommended netlify.toml

```toml
[build]
  command = "npm run build:web"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
  NPM_FLAGS    = "--prefer-offline"
  NODE_OPTIONS = "--max-old-space-size=4096"

[[plugins]]
  package = "netlify-plugin-cache"
  [plugins.inputs]
    paths = ["node_modules", ".metro-cache", ".expo"]
```

## Quick Win Priority Order

1. **netlify-plugin-cache** → restores node_modules + Metro cache (~6 min saving)
2. **Pin NODE_VERSION = "20"** in netlify.toml → stable cache hits (~1 min)
3. **Move Metro cacheStores to `.metro-cache/`** → Metro re-transforms nothing on cache hit (~3 min)
4. **Compress PNGs → WebP** → faster upload + smaller dist (~2 min upload)
5. **Lazy-load heavy screens** (map, chat, opsAgent) → smaller initial bundle
6. **Add brotli/gzip post-build step** → CDN serves pre-compressed files
