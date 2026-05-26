/**
 * App entry.
 *
 * Order matters:
 * 1. `polyfills/runtimeKind` sets `globalThis.__RUNTIME_KIND` before any
 *    react-native-worklets module can evaluate. Required because Metro's
 *    `inlineRequires` defers module-body evaluation and breaks the worklets
 *    package's own bootstrap on web (`createSerializableObject should never
 *    be called in JSWorklets`).
 * 2. `react-native-gesture-handler` must load before any other application
 *    code per its install docs.
 * @see https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/installation
 */
import './polyfills/runtimeKind';
import 'react-native-gesture-handler';
import 'expo-router/entry';
