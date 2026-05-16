const path = require('path');
const { FileStore } = require('metro-cache');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Persistent disk cache speeds CI/production; in dev it can serve stale 1-module
// stubs after large file moves (HMR "Got unexpected undefined" → "Could not load bundle").
if (process.env.EXPO_USE_METRO_CACHE === '1') {
  config.cacheStores = [
    new FileStore({
      root: path.join(__dirname, '.metro-cache'),
    }),
  ];
}

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
