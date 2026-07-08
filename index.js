/**
 * Legacy entry shim — package.json main is `expo-router/entry`.
 * `polyfills/runtimeKind.js` runs via Metro `getModulesRunBeforeMainModule`.
 */
require('expo-router/entry');
