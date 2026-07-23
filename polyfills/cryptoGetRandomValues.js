/**
 * Hermes `crypto` polyfill (native only).
 *
 * The Hermes engine on Android/iOS does not expose the Web Crypto API global.
 * The Supabase JS client (and some of its transitive deps) reach for
 * `crypto.getRandomValues` / `crypto.randomUUID` bare during normal flows
 * (e.g. a trip update), which throws `ReferenceError: Property 'crypto'
 * doesn't exist` on Hermes (GX-PULSE-M).
 *
 * We install a minimal shim BEFORE any app module runs (registered via Metro
 * `getModulesRunBeforeMainModule` in metro.config.js), so it is guaranteed to
 * be present before the Supabase client initializes. Entropy is `Math.random`
 * — the same non-crypto fallback the app's own id helpers already use on
 * runtimes without Web Crypto (see lib/uuidv7.ts, lib/globalId.ts). These ids
 * are used for client-side idempotency keys, never for security tokens.
 *
 * No-ops on web and anywhere a real `crypto.getRandomValues` already exists.
 */
(function installCryptoPolyfill() {
  var g = typeof globalThis !== 'undefined' ? globalThis : this;
  if (!g) return;

  var existing = g.crypto;
  var hasGetRandom =
    existing && typeof existing.getRandomValues === 'function';

  function getRandomValues(typedArray) {
    if (typedArray == null) return typedArray;
    var bytes = new Uint8Array(
      typedArray.buffer,
      typedArray.byteOffset,
      typedArray.byteLength,
    );
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return typedArray;
  }

  function randomUUID() {
    // RFC-4122 v4 shape.
    var buf = new Uint8Array(16);
    getRandomValues(buf);
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    var hex = [];
    for (var i = 0; i < 16; i++) {
      hex.push((buf[i] + 0x100).toString(16).slice(1));
    }
    return (
      hex[0] + hex[1] + hex[2] + hex[3] + '-' +
      hex[4] + hex[5] + '-' +
      hex[6] + hex[7] + '-' +
      hex[8] + hex[9] + '-' +
      hex[10] + hex[11] + hex[12] + hex[13] + hex[14] + hex[15]
    );
  }

  if (!existing) {
    g.crypto = { getRandomValues: getRandomValues, randomUUID: randomUUID };
    return;
  }

  if (!hasGetRandom) {
    try {
      existing.getRandomValues = getRandomValues;
    } catch (_e) {
      /* read-only host object — best effort */
    }
  }
  if (typeof existing.randomUUID !== 'function') {
    try {
      existing.randomUUID = randomUUID;
    } catch (_e) {
      /* read-only host object — best effort */
    }
  }
})();
