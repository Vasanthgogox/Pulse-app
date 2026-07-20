/**
 * Web stale-chunk recovery — installed BEFORE the main module (see
 * metro.config.js `getModulesRunBeforeMainModule`).
 *
 * Why not `lib/webDeployRecovery.ts`?
 * That module's listeners were attached in RootLayout's `useEffect`, which runs
 * only AFTER React mounts. The chunk failures we see in Sentry (GX-PULSE-9/A:
 * `Requiring unknown module`, `AsyncRequireError`, `Unexpected token '<'`) fire
 * during entry-bundle evaluation / first `React.lazy` resolve — before mount —
 * so those listeners were never attached in time and the error escaped to
 * Sentry's global handler with no recovery reload.
 *
 * This file attaches the same listeners at module-load time. It is web-only and
 * intentionally does NOT import `react-native` (loading RN before init breaks
 * StyleSheet etc — see index.js / runtimeKind.js). Platform is detected via the
 * DOM. `lib/webDeployRecovery.ts` stays the source of truth for the native path
 * and its `installWebDeployRecoveryListener()` is now idempotent, so the old
 * useEffect call is a harmless no-op on web.
 */

(function installWebChunkRecovery() {
  // Web only: no `document` means native/SSR — nothing to attach.
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__qWebChunkRecoveryInstalled) return;
  window.__qWebChunkRecoveryInstalled = true;

  var RELOAD_GUARD_KEY = 'pulse_deploy_reload_v1'; // shared with webDeployRecovery.ts

  // True once a recovery reload has been triggered this pageview. Concurrent
  // stale-chunk rejections (e.g. NetworkScreen + TripsScreen rejecting in the
  // same tick before location.replace unloads the page) must be swallowed too,
  // otherwise the 2nd+ rejection escapes to Sentry as noise (GX-PULSE-B).
  var recoveryInFlight = false;

  function isStaleWebChunkError(msg) {
    if (!msg) return false;
    return (
      /Requiring unknown module/i.test(msg) ||
      /Unexpected token '<'/i.test(msg) ||
      /Loading chunk [\w-]+ failed/i.test(msg) ||
      /Loading module .* failed/i.test(msg) ||
      /AsyncRequireError/i.test(msg) ||
      /Failed to fetch dynamically imported module/i.test(msg) ||
      /error loading dynamically imported module/i.test(msg) ||
      /Importing a module script failed/i.test(msg)
    );
  }

  // Returns true when this pageview's stale-chunk error is being handled by a
  // recovery reload — so the caller should suppress it — whether this call
  // triggered the reload or an earlier concurrent one already did.
  function recover() {
    if (recoveryInFlight) return true;
    try {
      // A prior pageview already cache-busted and it still failed: don't loop.
      // The error is real (chunk genuinely missing) and should reach Sentry.
      if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return false;
      sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
    } catch {
      return false;
    }
    recoveryInFlight = true;
    var url = new URL(window.location.href);
    // Date.now is fine here — this is app runtime, not a workflow script.
    url.searchParams.set('_cb', String(Date.now()));
    window.location.replace(url.toString());
    return true;
  }

  // Capture phase: script/link load failures don't bubble.
  window.addEventListener(
    'error',
    function (event) {
      var target = event.target;
      if (
        target &&
        target.tagName === 'SCRIPT' &&
        typeof target.src === 'string' &&
        target.src.indexOf('.js') !== -1
      ) {
        if (recover()) event.preventDefault();
        return;
      }
      var message = (event.error && event.error.message) || event.message || '';
      if (isStaleWebChunkError(message) && recover()) event.preventDefault();
    },
    true,
  );

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var message =
      (reason && reason.message) || (typeof reason === 'string' ? reason : '');
    if (isStaleWebChunkError(message) && recover()) {
      event.preventDefault();
    }
  });
})();
