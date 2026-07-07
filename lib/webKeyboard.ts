/**
 * Mobile web keyboard / viewport platform detection.
 *
 * - iOS Safari: resizes `visualViewport` when the keyboard opens (no overlays-content).
 * - Android Chrome: `interactive-widget=overlays-content` keeps layout height; keyboard
 *   occludes from below — handled via `--keyboard-height` scroll/footer padding.
 */

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

/**
 * When false, the app shell shrinks with visualViewport (iOS Safari) and scroll
 * padding for keyboard height would double-count occlusion.
 */
export function shouldApplyWebKeyboardScrollInset(): boolean {
  if (typeof window === 'undefined') return true;
  return !isIOSWebSafari();
}

/**
 * Scroll the focused editable into view after the virtual keyboard animates.
 * Skipped on iOS Safari — shell shrink + native focus scroll are sufficient.
 */
export function scrollFocusedWebInputIntoView(): void {
  if (typeof document === 'undefined') return;
  if (isIOSWebSafari()) return;

  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) return;

  const run = () => {
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {
      el.scrollIntoView({ block: 'center' });
    }
  };

  requestAnimationFrame(() => requestAnimationFrame(run));
  setTimeout(run, 320);
}
