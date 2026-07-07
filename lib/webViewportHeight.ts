import {
  applyIOSWebSafariViewportPin,
  isIOSWebSafari,
  readWebVisualViewportMetrics,
  WEB_KEYBOARD_INSET_THRESHOLD_PX,
} from "./webKeyboard";

export { WEB_KEYBOARD_INSET_THRESHOLD_PX };

/**
 * Mobile web: `100vh` is taller than the visible viewport when browser chrome is shown.
 *
 * - iOS Safari: pin `#root` to `visualViewport` (height + offsetTop) via CSS vars.
 * - Android Chrome (overlays-content): freeze layout height while keyboard is open;
 *   occlusion is handled via `--keyboard-height` in `useKeyboardVisible`.
 */
export function installWebViewportHeight(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  // Claim ownership — suppresses setupViewportHeightBootstrap from the static HTML shell.
  (window as any).__appVhOwned = true;

  let stableLayoutHeight = Math.round(window.innerHeight);

  const setAppVh = () => {
    if (isIOSWebSafari()) {
      applyIOSWebSafariViewportPin();
      return;
    }

    const { height: visible, keyboardOpen } = readWebVisualViewportMetrics();
    const inner = window.innerHeight;

    if (!keyboardOpen) {
      stableLayoutHeight = Math.max(visible, inner);
    }

    document.documentElement.style.setProperty(
      "--app-vh",
      `${stableLayoutHeight}px`,
    );
    document.documentElement.style.setProperty("--app-vt", "0px");
  };

  setAppVh();
  window.addEventListener("resize", setAppVh);
  window.addEventListener("orientationchange", setAppVh);
  const vv = window.visualViewport;
  vv?.addEventListener("resize", setAppVh);
  vv?.addEventListener("scroll", setAppVh);

  return () => {
    (window as any).__appVhOwned = false;
    window.removeEventListener("resize", setAppVh);
    window.removeEventListener("orientationchange", setAppVh);
    vv?.removeEventListener("resize", setAppVh);
    vv?.removeEventListener("scroll", setAppVh);
  };
}

/** RN Web shell style — pairs with `app/+html.tsx` CSS on html/body/#root. */
export const WEB_APP_VIEWPORT_STYLE = {
  minHeight: "var(--app-vh, 100dvh)",
  height: "var(--app-vh, 100dvh)",
  maxHeight: "var(--app-vh, 100dvh)",
} as const;
