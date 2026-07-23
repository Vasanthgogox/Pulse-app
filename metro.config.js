const path = require('path');
const os = require('os');
const http = require('http');
require('./scripts/expo-env');
const { FileStore } = require('metro-cache');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// ── Transform cache ───────────────────────────────────────────────────────────
// Persistent FileStore speeds CI/production builds but in dev it often leaves
// stale module IDs after HMR / graph changes → "Requiring unknown module 5xxx"
// and importedAll crashes. Use in-memory cache only while developing.
const metroCacheRoot = path.join(projectRoot, '.metro-cache');
const usePersistentMetroCache =
  process.env.NODE_ENV === 'production' ||
  process.env.METRO_PERSISTENT_CACHE === '1';
if (usePersistentMetroCache) {
  config.cacheStores = [new FileStore({ root: metroCacheRoot })];
}

// ── Worker concurrency (override with METRO_MAX_WORKERS) ─────────────────────
const cpuCount = os.cpus().length;
// Cap workers — 8+ workers on large graphs routinely OOMs Node during web/iOS bundles.
config.maxWorkers = Math.max(
  1,
  Number(process.env.METRO_MAX_WORKERS) ||
    Math.min(4, Math.max(2, cpuCount - 1)),
);

// ── Keep file watcher off heavy / non-app trees ───────────────────────────────
// Project `dist/` only — do NOT use `/\/dist\//` (blocks react-native-web/dist).
const projectDistBlock = new RegExp(
  `${path.resolve(projectRoot, 'dist').replace(/[/\\]/g, '[/\\\\]')}[/\\\\]`,
);
const extraBlockList = [
  /\.git\//,
  /\.expo\//,
  /\.metro-cache\//,
  projectDistBlock,
  /\/web-build\//,
  /\/playwright-report\//,
  /\/test-results\//,
  /\/coverage\//,
  /\/supabase\/migrations\//,
  /\/supabase\/functions\//,
  /\/supabase\/\.temp\//,
  /\/data-analytics\//,
  /\/\.claude\//,
  /\/\.cursor\//,
  /\/docs\//,
  /\/scripts\/sql\//,
  /\/dist-test-bundle\//,
  /\/android\/build\//,
  /\/ios\/build\//,
];

const { transformer, resolver } = config;
const existingBlock = resolver.blockList;
const blockList = Array.isArray(existingBlock)
  ? [...existingBlock, ...extraBlockList]
  : existingBlock
    ? [existingBlock, ...extraBlockList]
    : extraBlockList;

const upstreamResolveRequest = resolver.resolveRequest;

// ── Native shim for `framer-motion` ──────────────────────────────────────────
// `moti` ships a `react-native: "src/index.tsx"` entry that runtime-imports
// `AnimatePresence` / `usePresence` / `PresenceContext` from `framer-motion`,
// which is a DOM-only library. On Hermes/JSC the framer-motion CJS bundle
// fails at module init with `Cannot set property 'importedAll' of undefined`
// and corrupts Metro's lazy-chunk module-ID table — the symptom in the
// Finance screen was the cascade of `Requiring unknown module "5064/65/70/72"`
// errors blocking the customer / supplier / driver sub-tabs from rendering
// any party details.
//
// On native we point `framer-motion` (and any subpath import) at a tiny
// no-op shim that exposes the three symbols moti actually uses. Web keeps
// the real package via the default upstream resolver.
const framerMotionNativeShimPath = path.resolve(
  projectRoot,
  'polyfills/framer-motion-native.js',
);
const runtimeKindPolyfillPath = path.resolve(
  projectRoot,
  'polyfills/runtimeKind.js',
);
// Native-only. Installs a `crypto.getRandomValues`/`randomUUID` shim before the
// Supabase client initializes — Hermes has no Web Crypto global, so bare
// `crypto` access throws ReferenceError (see polyfills/cryptoGetRandomValues.js).
const cryptoPolyfillPath = path.resolve(
  projectRoot,
  'polyfills/cryptoGetRandomValues.js',
);
// Web-only, RN-free. Attaches stale-chunk recovery listeners before the first
// lazy import runs (the useEffect install in _layout.tsx was too late — see
// polyfills/webChunkRecovery.js). No-op on native (guards on `document`).
const webChunkRecoveryPolyfillPath = path.resolve(
  projectRoot,
  'polyfills/webChunkRecovery.js',
);
const metroRuntimePath = path.resolve(
  projectRoot,
  'node_modules/@expo/metro-runtime/src/index.ts',
);
const motiFramerShimPath = path.resolve(
  projectRoot,
  'node_modules/moti/build/framer-motion-shim.js',
);
const isFramerMotionRequest = (moduleName) =>
  moduleName === 'framer-motion' || moduleName.startsWith('framer-motion/');

/** Metro passes `ios` / `android`; graph walks sometimes omit platform — still native. */
const isNativePlatform = (platform) =>
  platform == null || platform === 'ios' || platform === 'android' || platform === 'native';

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
  minifierConfig: {
    compress: { reduce_funcs: false },
  },
  // inlineRequires defers native module init and can run gesture-handler / worklets
  // before the RN runtime is ready ([runtime not ready]: RNGestureHandlerModule).
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: false,
    },
  }),
};

const upstreamGetModulesRunBeforeMainModule =
  config.serializer?.getModulesRunBeforeMainModule;

config.serializer = {
  ...config.serializer,
  getModulesRunBeforeMainModule: () => {
    const upstream = upstreamGetModulesRunBeforeMainModule?.() ?? [];
    return [cryptoPolyfillPath, runtimeKindPolyfillPath, webChunkRecoveryPolyfillPath, ...upstream];
  },
};

config.resolver = {
  ...resolver,
  blockList,
  unstable_enablePackageExports: false,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
  resolveRequest(context, moduleName, platform) {
    if (moduleName === '@expo/metro-runtime') {
      return {
        filePath: metroRuntimePath,
        type: 'sourceFile',
      };
    }
    if (
      moduleName === '../framer-motion-shim' &&
      context.originModulePath?.includes(`${path.sep}moti${path.sep}`)
    ) {
      return {
        filePath: motiFramerShimPath,
        type: 'sourceFile',
      };
    }
    if (moduleName === 'tslib' || moduleName.endsWith('/tslib')) {
      return {
        filePath: path.resolve(projectRoot, 'node_modules/tslib/tslib.js'),
        type: 'sourceFile',
      };
    }
    // react-native-webview ships both `src/` (package "react-native" field) and
    // compiled `lib/` — resolving both registers RNCWebView twice on native.
    if (isNativePlatform(platform) && moduleName === 'react-native-webview') {
      return {
        filePath: path.resolve(
          projectRoot,
          'node_modules/react-native-webview/index.js',
        ),
        type: 'sourceFile',
      };
    }
    // Native-only `framer-motion` stub — keeps moti from dragging the DOM-only
    // framer-motion bundle into iOS/Android builds. Web falls through.
    // `platform` is occasionally undefined during Metro graph walks — treat as native.
    if (isNativePlatform(platform) && isFramerMotionRequest(moduleName)) {
      return {
        filePath: framerMotionNativeShimPath,
        type: 'sourceFile',
      };
    }
    if (typeof upstreamResolveRequest === 'function') {
      return upstreamResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

// ── Watcher: less health-check churn on large repos ─────────────────────────
config.watcher = {
  ...config.watcher,
  healthCheck: {
    enabled: false,
  },
};

// ── Commerce (/oms) dev proxy ───────────────────────────────────────────────
// Expo Router cannot host the Vite SPA. In dev, proxy /oms/* to the Commerce
// Vite server (npm run oms:dev / scripts/dev-with-oms.js) on the same origin
// so shared Supabase session + post-auth redirects work on localhost:8081.
const OMS_DEV_PORT = Number(process.env.OMS_DEV_PORT || 3004);
const OMS_DEV_HOST = process.env.OMS_DEV_HOST || '127.0.0.1';

function isOmsDevRequest(url) {
  if (!url) return false;
  const pathOnly = url.split('?')[0];
  return pathOnly === '/oms' || pathOnly.startsWith('/oms/');
}

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      if (!isOmsDevRequest(req.url)) {
        return middleware(req, res, next);
      }

      const proxyReq = http.request(
        {
          hostname: OMS_DEV_HOST,
          port: OMS_DEV_PORT,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: `${OMS_DEV_HOST}:${OMS_DEV_PORT}`,
          },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );

      proxyReq.on('error', () => {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(
          '<!doctype html><html><body style="font-family:system-ui;padding:2rem;max-width:40rem">' +
            '<h1>Commerce dev server is not running</h1>' +
            '<p>The Pulse proxy could not reach Vite on ' +
            `<code>${OMS_DEV_HOST}:${OMS_DEV_PORT}</code>.</p>` +
            '<p>From the repo root, run <code>npm run dev</code> (starts Commerce, waits until it is ready, then Expo).</p>' +
            '<p>Or in a second terminal: <code>npm run oms:dev</code>, then reload this page.</p>' +
            `<p>Direct check: <a href="http://${OMS_DEV_HOST}:${OMS_DEV_PORT}/oms/">` +
            `http://${OMS_DEV_HOST}:${OMS_DEV_PORT}/oms/</a></p>` +
            '</body></html>',
        );
      });

      if (req.method === 'GET' || req.method === 'HEAD') {
        proxyReq.end();
      } else {
        req.pipe(proxyReq);
      }
    };
  },
};

module.exports = config;
