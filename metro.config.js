const path = require('path');
const { FileStore } = require('metro-cache');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.cacheStores = [
  new FileStore({
    root: path.join(__dirname, '.metro-cache'),
  }),
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
  /** Framer Motion / moti import tslib; Metro can pick `tslib/modules/index.mjs` and break CJS default interop (`tslib.default` undefined). */
  resolveRequest(context, moduleName, platform) {
    if (moduleName === 'tslib') {
      return { type: 'sourceFile', filePath: require.resolve('tslib') };
    }
    if (typeof upstreamResolveRequest === 'function') {
      return upstreamResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
