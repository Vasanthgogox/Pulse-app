/**
 * Mobile web: `100vh` is taller than the visible viewport when browser chrome is shown.
 * Sets `--app-vh` from visualViewport so shells and fixed footers align with the real screen.
 */
export function installWebViewportHeight(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const setAppVh = () => {
    const vv = window.visualViewport;
    const height = Math.round(vv?.height ?? window.innerHeight);
    document.documentElement.style.setProperty("--app-vh", `${height}px`);
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
