# Netlify Build Audit — pulse

**Framework:** Expo SDK 54 · React Native Web · Expo Router 6  
**Build command:** `expo export --platform web && node scripts/compress-dist.js`  
**Generated:** 2026-05-19

## Summary

| Severity | Count |
|---|---|
| 🟠 HIGH | 2 |
| 🟡 MEDIUM | 2 |

**Estimated saving:** 10–15 min per deploy (target < 5 min with caching enabled)

## Findings & Checklist

### 1. 🟠 HIGH — Asset upload

**7 unoptimized PNG assets (6.3 MB total)**

```
    2.0 MB  assets/avatars/female_woman_icon.png
    1.1 MB  assets/avatars/elegant-3d-female-witch-avatar-with-brown-eyes-and-long-curly-hair-png.png
    1.1 MB  assets/avatars/3d-icon-avatar-cartoon-man-with-glasses-is-smiling-and-wearing-on-transparent-background-png.png
    0.6 MB  assets/avatars/3d-happy-cartoon-doctor-cartoon-doctor-on-transparent-background-generative-ai-png- female.png
    0.5 MB  assets/avatars/modern-male-avatar-with-black-hair-and-hoodie-illustration-free-png copy.webp
    0.5 MB  assets/avatars/modern-male-avatar-with-black-hair-and-hoodie-illustration-free-png.webp
  … +1 more
```

**Fixes:**
- [ ] Run: npx sharp-cli --input "assets/**/*.png" --output assets/ --format webp  (70–90% size reduction)
- [ ] Or install netlify-plugin-image-optim for automatic on-deploy compression
- [ ] Convert avatar PNGs to WebP — female_woman_icon.png alone is 11 MB
- [ ] Use expo-image with blurhash placeholders so large avatars load lazily

> Estimated saving: **1–3 min upload time + faster initial page load**

### 2. 🟠 HIGH — Bundle size

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

### 3. 🟡 MEDIUM — Dependency install

**patch-package applies 4 patch(es) on every postinstall**

```
Each patch-package run re-applies patches after npm ci. This blocks the install step and prevents full node_modules caching (patched files differ from lock hash).
```

**Fixes:**
- [ ] Rely on Netlify native npm cache (NODE_VERSION + package-lock.json); do not use netlify-plugin-cache
- [ ] Long term: upstream patches or fork packages to avoid postinstall cost

> Estimated saving: **15–60 s**

### 4. 🟡 MEDIUM — Bundle size / transform time

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
| node_modules size | 15488.1 MB |
| assets/ size | 26.3 MB |
| dist/ size | 43.0 MB |
| Prod deps | 67 |
| Dev deps | 23 |
| Lock file | package-lock.json |
| Expo SDK | 54 |
| Unoptimized PNGs >500 KB | 7 |
| Main JS bundle | 10.9 MB |

## Largest Assets

- `assets/images/adaptive-icon.png` — 4.3 MB
- `assets/images/icon.png` — 4.3 MB
- `assets/images/splash-icon.png` — 4.3 MB
- `assets/avatars/female_woman_icon.png` — 2.0 MB
- `assets/avatars/elegant-3d-female-witch-avatar-with-brown-eyes-and-long-curly-hair-png.png` — 1.1 MB
- `assets/avatars/3d-icon-avatar-cartoon-man-with-glasses-is-smiling-and-wearing-on-transparent-background-png.png` — 1.1 MB
- `assets/avatars/3d-happy-cartoon-doctor-cartoon-doctor-on-transparent-background-generative-ai-png- female.png` — 0.6 MB
- `assets/avatars/modern-male-avatar-with-black-hair-and-hoodie-illustration-free-png copy.webp` — 0.5 MB

## Recommended netlify.toml

```toml
[build]
  command = "npm run build:web"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
  NPM_FLAGS    = "--prefer-offline"
  NODE_OPTIONS = "--max-old-space-size=4096"

# Native npm cache only — no netlify-plugin-cache
```

## Quick Win Priority Order

1. **Pin NODE_VERSION = "20"** + `.nvmrc` → stable Netlify npm cache hits
2. **Remove netlify-plugin-cache** if present → avoids EISDIR on `node_modules/.bin`
3. **Compress PNGs → WebP** → faster upload + smaller dist
4. **Lazy-load heavy screens** (map, chat, opsAgent) → smaller initial bundle
5. **brotli/gzip post-build** → CDN serves pre-compressed files
