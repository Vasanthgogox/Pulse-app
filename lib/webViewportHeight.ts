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
 * Sets `--app-vh` from the layout viewport and freezes it while the keyboard is open so
 * shells do not collapse when `visualViewport.height` shrinks (iOS Safari / some Android).
 * Keyboard occlusion is handled separately via `--keyboard-height` in `useKeyboardVisible`.
 */
export function installWebViewportHeight(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  let stableLayoutHeight = Math.round(window.innerHeight);

  const setAppVh = () => {
    const vv = window.visualViewport;
    const inner = window.innerHeight;
    const visible = Math.round(vv?.height ?? inner);
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
