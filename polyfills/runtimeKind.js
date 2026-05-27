/**
 * react-native-worklets boot-order polyfill.
 *
 * When Metro `inlineRequires` is enabled, deferred module-body evaluation can
 * cause `react-native-worklets/lib/module/PlatformChecker/index.js` to read
 * `globalThis.__RUNTIME_KIND` BEFORE `runtimeKind.js` has had a chance to set
 * it, so `SHOULD_BE_USE_WEB` stays `false` on web and the library walks the
 * native serialization path. That throws `createSerializableObject should
 * never be called in JSWorklets` at module load (e.g. through
 * `@gorhom/bottom-sheet`).
 *
 * The worklets source itself flags this hazard (see the eager-import note in
 * `react-native-worklets/lib/module/runtimeKind.js`). Setting the global here,
 * before any other import in `index.js`, guarantees the platform check sees
 * the correct runtime kind.
 *
 * Value `1` matches `RuntimeKind.ReactNative` (see runtimeKind.js).
 */
if (globalThis.__RUNTIME_KIND === undefined) {
  globalThis.__RUNTIME_KIND = 1;
}
