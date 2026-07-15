/**
 * Mobile web keyboard / viewport platform detection.
 *
 * - Any iOS browser (Safari, Chrome/CriOS, Firefox/FxiOS, Edge/EdgiOS): all run
 *   on WebKit — Apple requires it — so all of them resize `visualViewport` and
 *   scroll the layout document via `offsetTop` the same way. htmlShell's
 *   `@supports (-webkit-touch-callout: none)` CSS block (which pins html/body/
 *   #root to `position: fixed`) is an engine-level feature query and applies to
 *   all of them identically — it cannot distinguish Safari from Chrome. The JS
 *   that keeps `--app-vh`/`--app-vt` in sync with that CSS must therefore also
 *   run for all of them (gate on isIOSWeb, not isIOSWebSafari) or non-Safari
 *   iOS browsers get the fixed-position cage with no compensating offset sync,
 *   which is what allowed the page to still scroll on iOS Chrome.
 * - Android Chrome: `interactive-widget=overlays-content` keeps layout height;
 *   keyboard occludes from below — handled via `--keyboard-height` padding.
 */

export const WEB_KEYBOARD_INSET_THRESHOLD_PX = 48;

export function isIOSWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** Safari on iOS (not Chrome/Firefox/Edge iOS wrappers). */
export function isIOSWebSafari(): boolean {
  if (!isIOSWeb()) return false;
  const ua = navigator.userAgent || '';
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/i.test(ua);
}

export function isAndroidChromeOverlayKeyboard(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  if (!/Android/i.test(ua) || !/Chrome/i.test(ua)) return false;
  const meta = document.querySelector('meta[name="viewport"]');
  const content = meta?.getAttribute('content') || '';
  return content.includes('interactive-widget=overlays-content');
}

export interface WebVisualViewportMetrics {
  height: number;
  offsetTop: number;
  keyboardInset: number;
  keyboardOpen: boolean;
}

/** Read visual viewport geometry for keyboard + shell pinning. */
export function readWebVisualViewportMetrics(): WebVisualViewportMetrics {
  if (typeof window === 'undefined') {
    return { height: 0, offsetTop: 0, keyboardInset: 0, keyboardOpen: false };
  }

  const vv = window.visualViewport;
  const inner = window.innerHeight;
  const height = Math.round(vv?.height ?? inner);
  const offsetTop = Math.round(vv?.offsetTop ?? 0);
  const heightShrink = Math.max(0, inner - height);

  if (isIOSWeb()) {
    // Do not subtract offsetTop — WebKit (Safari and every other iOS browser,
    // since Apple mandates WebKit) moves the layout viewport instead of
    // reporting occlusion in (inner - height - offsetTop), which reads 0 and
    // breaks detection.
    const keyboardOpen =
      heightShrink >= WEB_KEYBOARD_INSET_THRESHOLD_PX ||
      offsetTop >= WEB_KEYBOARD_INSET_THRESHOLD_PX;
    return {
      height,
      offsetTop,
      keyboardInset: heightShrink,
      keyboardOpen,
    };
  }

  const keyboardInset = Math.max(0, Math.round(inner - height - offsetTop));
  const keyboardOpen = keyboardInset >= WEB_KEYBOARD_INSET_THRESHOLD_PX;
  return { height, offsetTop, keyboardInset, keyboardOpen };
}

/**
 * Pin the React root to the visible viewport on iOS (any browser — see the
 * file-level comment on why this is isIOSWeb, not isIOSWebSafari).
 * Called once by installWebViewportHeight (initial paint) and then from inside
 * useKeyboardVisible's web sync() on every visualViewport/focus event — that is
 * the single place this runs on an ongoing basis, so the pin and the React
 * keyboard-inset state always update in the same synchronous pass.
 *
 * While the soft keyboard has shrunk visualViewport.height, keep `--app-vt` at 0.
 * Chasing `offsetTop` mid-gesture moves the whole `#root` shell while an RN
 * ScrollView is also scrolling (Org name / onboarding fields) and reads as
 * "scroll cuts off". Document pan is cancelled via `window.scrollTo(0, 0)`.
 */
export function applyIOSWebSafariViewportPin(): void {
  if (!isIOSWeb() || typeof document === 'undefined') return;
  const { height, offsetTop, keyboardInset } = readWebVisualViewportMetrics();
  const keyboardOpenByHeight = keyboardInset >= WEB_KEYBOARD_INSET_THRESHOLD_PX;
  document.documentElement.style.setProperty('--app-vh', `${height}px`);
  document.documentElement.style.setProperty(
    '--app-vt',
    `${keyboardOpenByHeight ? 0 : offsetTop}px`,
  );
  window.scrollTo(0, 0);
}

/** True when `node` is (or is inside) a web editable control. */
export function isWebEditableDomTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof Node)) {
    return false;
  }
  let node: Node | null = target;
  while (node) {
    if (node instanceof HTMLElement) {
      const tag = node.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (node.isContentEditable) return true;
    }
    node = node.parentNode;
  }
  return false;
}

/**
 * Blur the focused web input/textarea so iOS dismisses the keyboard and the
 * viewport pin can expand again. Safe no-op on native / no focus.
 */
export function blurActiveWebEditable(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) {
    return false;
  }
  el.blur();
  return true;
}

/**
 * When false, `#root` is pinned to visualViewport height (iOS — any browser,
 * see file-level comment) and scroll padding for keyboard height would
 * double-count occlusion.
 */
export function shouldApplyWebKeyboardScrollInset(): boolean {
  if (typeof window === 'undefined') return true;
  return !isIOSWeb();
}

/**
 * Scroll the focused editable into view after the virtual keyboard animates.
 * iOS: nearest + auto only — smooth multi-pass scrollIntoView flickers against
 * the signup ScrollView (City / office fields).
 */
export function scrollFocusedWebInputIntoView(): void {
  if (typeof document === 'undefined') return;

  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) return;

  const ios = isIOSWeb();
  const block: ScrollLogicalPosition = ios || isIOSWebSafari() ? 'nearest' : 'center';

  const run = () => {
    try {
      el.scrollIntoView({ block, behavior: ios ? 'auto' : 'smooth' });
    } catch {
      el.scrollIntoView({ block });
    }
  };

  requestAnimationFrame(run);
  if (!ios) {
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 320);
  }
}
