/**
 * Mobile web keyboard / viewport platform detection.
 *
 * - iOS Safari: resizes `visualViewport` and scrolls the layout document via
 *   `offsetTop` — pin `#root` with `--app-vh` + `--app-vt` (see htmlShell).
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

  if (isIOSWebSafari()) {
    // Do not subtract offsetTop — Safari moves the layout viewport instead of reporting
    // occlusion in (inner - height - offsetTop), which reads 0 and breaks detection.
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
 * Pin the React root to the visible viewport on iOS Safari.
 * Called once by installWebViewportHeight (initial paint) and then from inside
 * useKeyboardVisible's web sync() on every visualViewport/focus event — that is
 * the single place this runs on an ongoing basis, so the pin and the React
 * keyboard-inset state always update in the same synchronous pass.
 */
export function applyIOSWebSafariViewportPin(): void {
  if (!isIOSWebSafari() || typeof document === 'undefined') return;
  const { height, offsetTop } = readWebVisualViewportMetrics();
  document.documentElement.style.setProperty('--app-vh', `${height}px`);
  document.documentElement.style.setProperty('--app-vt', `${offsetTop}px`);
  window.scrollTo(0, 0);
}

/**
 * When false, `#root` is pinned to visualViewport height (iOS Safari) and scroll
 * padding for keyboard height would double-count occlusion.
 */
export function shouldApplyWebKeyboardScrollInset(): boolean {
  if (typeof window === 'undefined') return true;
  return !isIOSWebSafari();
}

/**
 * Scroll the focused editable into view after the virtual keyboard animates.
 */
export function scrollFocusedWebInputIntoView(): void {
  if (typeof document === 'undefined') return;

  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) return;

  const block: ScrollLogicalPosition = isIOSWebSafari() ? 'nearest' : 'center';

  const run = () => {
    try {
      el.scrollIntoView({ block, behavior: 'smooth' });
    } catch {
      el.scrollIntoView({ block });
    }
  };

  requestAnimationFrame(() => requestAnimationFrame(run));
  setTimeout(run, 320);
}
