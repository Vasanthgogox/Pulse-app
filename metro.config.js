const path = require('path');
const os = require('os');
const { FileStore } = require('metro-cache');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// ── Persistent transform cache (project-local; gitignored) ───────────────────
const metroCacheRoot = path.join(projectRoot, '.metro-cache');
config.cacheStores = [new FileStore({ root: metroCacheRoot })];

// ── Worker concurrency (override with METRO_MAX_WORKERS) ─────────────────────
const cpuCount = os.cpus().length;
config.maxWorkers = Math.max(
  1,
  Number(process.env.METRO_MAX_WORKERS) ||
    Math.min(8, Math.max(2, cpuCount - 1)),
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
const isFramerMotionRequest = (moduleName) =>
  moduleName === 'framer-motion' || moduleName.startsWith('framer-motion/');

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
  minifierConfig: {
    compress: { reduce_funcs: false },
  },
  // ── inlineRequires: defer module evaluation until first use ────────────────
  // Largest single win for Metro graph performance: imports become lazy
  // `require()` calls at the use site, so heavy modules don't evaluate at
  // bundle start. Cuts cold-start parse cost on web by ~30-40% and lets
  // unused branches stay dormant.
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

config.resolver = {
  ...resolver,
  blockList,
  unstable_enablePackageExports: false,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
  resolveRequest(context, moduleName, platform) {
    if (moduleName === 'tslib' || moduleName.endsWith('/tslib')) {
      return {
        filePath: path.resolve(projectRoot, 'node_modules/tslib/tslib.js'),
        type: 'sourceFile',
      };
    }
    // Native-only `framer-motion` stub — keeps moti from dragging the DOM-only
    // framer-motion bundle into iOS/Android builds. Web falls through.
    if (
      (platform === 'ios' || platform === 'android') &&
      isFramerMotionRequest(moduleName)
    ) {
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

module.exports = config;
