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

  // Shared with webDeployRecovery.ts — the value is a COUNT, not a flag, and the
  // budget/loop rules below must stay in sync with recoverStaleWebDeploy() there.
  var RELOAD_GUARD_KEY = 'pulse_deploy_reload_v1';
  var RELOAD_LAST_AT_KEY = 'pulse_deploy_reload_at_v1';
  var MAX_RELOADS_PER_SESSION = 3;
  var RELOAD_LOOP_WINDOW_MS = 10000;

  // True once a recovery reload has been triggered this pageview. Concurrent
  // stale-chunk rejections (e.g. NetworkScreen + TripsScreen rejecting in the
  // same tick before location.replace unloads the page) must be swallowed too,
  // otherwise the 2nd+ rejection escapes to Sentry as noise (GX-PULSE-B).
  var recoveryInFlight = false;

  // Takes the "name: message" pair, because Metro's AsyncRequireError carries
  // only the failing URL in `message` — matching on message alone missed it and
  // let the rejection escape to Sentry unrecovered (GX-PULSE-1M).
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
    // Date.now is fine here — this is app runtime, not a workflow script.
    var now = Date.now();
    try {
      // One deploy can strand several lazy chunks, so allow a small budget of
      // reloads per session rather than a single one-shot. Bail once the budget
      // is spent — the chunk is genuinely missing and should reach Sentry.
      var count = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || '0') || 0;
      if (count >= MAX_RELOADS_PER_SESSION) return false;
      // Failing again moments after a reload means reloading is not fixing it.
      var lastAt = Number(sessionStorage.getItem(RELOAD_LAST_AT_KEY) || '0') || 0;
      if (lastAt && now - lastAt < RELOAD_LOOP_WINDOW_MS) return false;
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(count + 1));
      sessionStorage.setItem(RELOAD_LAST_AT_KEY, String(now));
    } catch {
      return false;
    }
    recoveryInFlight = true;
    var url = new URL(window.location.href);
    url.searchParams.set('_cb', String(now));
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
      var err = event.error;
      var message =
        ((err && err.name) || '') +
        ': ' +
        ((err && err.message) || event.message || '');
      if (isStaleWebChunkError(message) && recover()) event.preventDefault();
    },
    true,
  );

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var message =
      ((reason && reason.name) || '') +
      ': ' +
      ((reason && reason.message) ||
        (typeof reason === 'string' ? reason : ''));
    if (isStaleWebChunkError(message) && recover()) {
      event.preventDefault();
    }
  });
})();
