/**
 * Single source for the web HTML shell customizations. Consumed two ways:
 * - app/+html.tsx inlines these into the statically rendered HTML
 *   (web.output "static", used by `expo export`).
 * - ensureWebShellParity() injects them at runtime when the shell was NOT
 *   statically rendered — the dev server runs web.output "single" (SPA) to
 *   avoid per-request SSR Metro OOMs (see app.config.js webOutput), and
 *   "single" does not render +html.tsx.
 */

/** id on the reset <style> tag; its presence means the static shell already applied everything. */
export const SHELL_STYLE_ID = 'pulse-mobile-web-reset';

/**
 * maximum-scale=1, user-scalable=no: Prevents iOS Safari from auto-zooming when a
 * text input with font-size < 16px is focused. This is the primary fix for the
 * "form field zoom" bug on mobile web.
 *
 * viewport-fit=cover: Allows content to render under the device notch/home indicator,
 * so safe-area insets are applied correctly by the app.
 */
export const VIEWPORT_CONTENT =
  'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

/**
 * interactive-widget=overlays-content: Prevents Android Chrome from resizing the
 * layout viewport when the virtual keyboard appears. Without this, window.innerHeight
 * shrinks on keyboard open, causing Dimensions-based modal heights to recalculate and
 * visually collapse ("layout crash"). The keyboard overlays content instead, matching
 * native app behaviour.
 *
 * Must stay self-contained (no closures) — inlined into static HTML via toString().
 */
export function setupAndroidInteractiveWidgetViewport() {
  var ua = navigator.userAgent || '';
  var isAndroidChrome = /Android/i.test(ua) && /Chrome/i.test(ua);
  if (!isAndroidChrome) return;
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  var content = meta.getAttribute('content') || '';
  if (content.indexOf('interactive-widget=') >= 0) return;
  meta.setAttribute('content', content + ', interactive-widget=overlays-content');
}

/**
 * Keeps --app-vh in sync with the visual viewport (keyboard-aware height).
 * Must stay self-contained (no closures) — inlined into static HTML via toString().
 */
export function setupViewportHeightBootstrap() {
  function setAppVh() {
    // Once installWebViewportHeight (React runtime) takes over, stop writing.
    if ((window as any).__appVhOwned) return;
    var vv = window.visualViewport;
    var h = Math.round(vv && vv.height ? vv.height : window.innerHeight);
    document.documentElement.style.setProperty('--app-vh', h + 'px');
  }
  setAppVh();
  window.addEventListener('resize', setAppVh);
  window.addEventListener('orientationchange', setAppVh);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppVh);
    window.visualViewport.addEventListener('scroll', setAppVh);
  }
}

export const mobileWebReset = `
html, body, #root {
  /* Fallback chain: JS --app-vh (visualViewport) → dvh → legacy % / fill-available */
  height: 100%;
  height: 100dvh;
  height: var(--app-vh, 100dvh);
  min-height: 100%;
  min-height: 100dvh;
  min-height: var(--app-vh, 100dvh);
  max-height: var(--app-vh, 100dvh);
  overflow: hidden;
}

@supports (-webkit-touch-callout: none) {
  html, body, #root {
    min-height: -webkit-fill-available;
  }
}

body {
  /* Match Theme.screenBackground + native splash — avoids white/black flash on reload */
  background-color: #ffffff;
  /* Let env(safe-area-inset-*) resolve for RN web probes (viewport-fit=cover in meta). */
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
  /* Prevent pull-to-refresh and over-scroll bounce on iOS / Android */
  overscroll-behavior: none;
  /* Prevent iOS from enlarging small text (e.g. inside cards) */
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

/* Remove the gray/blue tap flash on tappable elements (iOS/Android) */
* {
  -webkit-tap-highlight-color: transparent;
}

/*
  Eliminate the 300 ms tap delay on interactive elements.
  "manipulation" allows single-tap and scroll but disables double-tap zoom,
  which is what causes the delay.
*/
a, button, input, textarea, select, label, [role="button"] {
  touch-action: manipulation;
}

/*
  Remove the browser's default blue focus ring from inputs on mobile web.
  React Native Web applies its own focus styles via StyleSheet.
*/
input:focus,
textarea:focus,
select:focus {
  outline: none;
}

/*
  Strip iOS Safari's inner shadow and system appearance from inputs so they
  render exactly as styled by React Native Web's StyleSheet.
*/
input,
textarea,
select {
  -webkit-appearance: none;
  appearance: none;
}
`;

/**
 * Runtime fallback for the SPA dev shell. No-ops when the static shell
 * (app/+html.tsx) already rendered, or off-web. Safe to call multiple times.
 */
export function ensureWebShellParity() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SHELL_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = SHELL_STYLE_ID;
  style.textContent = mobileWebReset;
  document.head.appendChild(style);

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute('content', VIEWPORT_CONTENT);
  } else {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    meta.setAttribute('content', VIEWPORT_CONTENT);
    document.head.appendChild(meta);
  }

  setupViewportHeightBootstrap();
  setupAndroidInteractiveWidgetViewport();
}
