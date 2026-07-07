import { isIOSWebSafari } from "./webKeyboard";

/** Match `useKeyboardVisible` — keyboard open when visual viewport inset exceeds this. */
export const WEB_KEYBOARD_INSET_THRESHOLD_PX = 48;

function readVisualViewportKeyboardInset(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(
    0,
    Math.round(window.innerHeight - vv.height - (vv.offsetTop ?? 0)),
  );
}

/**
 * Mobile web: `100vh` is taller than the visible viewport when browser chrome is shown.
 *
 * - iOS Safari: shrink `--app-vh` to `visualViewport.height` so shells fit the visible
 *   area when the keyboard resizes the viewport (no overlays-content).
 * - Android Chrome (overlays-content): freeze layout height while the keyboard is open;
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
    const vv = window.visualViewport;
    const inner = window.innerHeight;
    const visible = Math.round(vv?.height ?? inner);

    if (isIOSWebSafari()) {
      document.documentElement.style.setProperty("--app-vh", `${visible}px`);
      // Safari scrolls the document when focusing inputs; reset drift that jumps content up.
      if (vv && (vv.offsetTop ?? 0) > 0) {
        window.scrollTo(0, 0);
      }
      return;
    }

    const keyboardOpen =
      readVisualViewportKeyboardInset() >= WEB_KEYBOARD_INSET_THRESHOLD_PX;

    if (!keyboardOpen) {
      stableLayoutHeight = Math.max(visible, inner);
    }

    document.documentElement.style.setProperty(
      "--app-vh",
      `${stableLayoutHeight}px`,
    );
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
