const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable package exports resolution so Metro can resolve subpaths inside
// @supabase/realtime-js (e.g. ./RealtimeClient) correctly.
config.resolver.unstable_enablePackageExports = false;

// SVG as React components via react-native-svg-transformer
const { transformer, resolver } = config;
const metroResolveRequest = resolver.resolveRequest;
config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};
config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
  // Some deps expect CJS `require('tslib').default`; Metro can pick `tslib.es6.mjs`
  // (named exports only) → "Cannot destructure property '__extends' of 'tslib.default'".
  // Force the classic tslib.js entry (Expo web + Moti / TS-emitted libs). See expo#38103.
  resolveRequest(context, moduleName, platform) {
    if (moduleName === 'tslib' || moduleName.endsWith('/tslib')) {
      return {
        filePath: path.resolve(__dirname, 'node_modules/tslib/tslib.js'),
        type: 'sourceFile',
      };
    }
    if (metroResolveRequest) {
      return metroResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
