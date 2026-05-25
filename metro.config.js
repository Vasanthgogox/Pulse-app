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

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
  minifierConfig: {
    compress: { reduce_funcs: false },
  },
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
