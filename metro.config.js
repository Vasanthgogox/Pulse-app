const path = require('path');
const { FileStore } = require('metro-cache');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// On CI/Netlify: store inside repo so netlify-plugin-cache can persist it.
// On local dev: use os.tmpdir() so Watchman never triggers a rebuild loop.
const metroCacheRoot = process.env.CI
  ? path.join(__dirname, '.metro-cache')
  : path.join(require('os').tmpdir(), 'q-web-metro-cache');

config.cacheStores = [
  new FileStore({ root: metroCacheRoot }),
];

// Disable package exports resolution so Metro can resolve subpaths inside
// @supabase/realtime-js (e.g. ./RealtimeClient) correctly.
config.resolver.unstable_enablePackageExports = false;

// SVG as React components via react-native-svg-transformer
const { transformer, resolver } = config;
config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
  minifierConfig: {
    compress: { reduce_funcs: false },
  },
};
const upstreamResolveRequest = resolver.resolveRequest;

config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
  // Framer Motion / moti pull in tslib; Metro can pick ESM entries and break CJS default interop.
  // Force the classic tslib.js entry (Expo web + Moti / TS-emitted libs). See expo#38103.
  resolveRequest(context, moduleName, platform) {
    if (moduleName === 'tslib' || moduleName.endsWith('/tslib')) {
      return {
        filePath: path.resolve(__dirname, 'node_modules/tslib/tslib.js'),
        type: 'sourceFile',
      };
    }
    if (typeof upstreamResolveRequest === 'function') {
      return upstreamResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
