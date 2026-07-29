import { useEffect, useState } from "react";
import { Platform, useWindowDimensions, type ViewStyle } from "react-native";

import { readWebVisualViewportMetrics } from "@/lib/webKeyboard";

/**
 * Cap a full-page shell to the visible viewport so its docked footer cannot
 * land below the fold.
 *
 * Web: `100dvh` is the *current* viewport height, so the dock follows the
 * mobile URL bar showing/hiding with no JS measurement. Pair with `flex: 1`.
 * Native: no browser chrome, so the measured height is exact.
 */
export function viewportCapStyle(height: number): ViewStyle {
  if (Platform.OS !== "web") return { height, maxHeight: height };
  // `100dvh` is a CSS value RN Web forwards verbatim; RN's DimensionValue type
  // predates dynamic viewport units, hence the cast.
  return { maxHeight: "100dvh" as unknown as ViewStyle["maxHeight"] };
}

/**
 * Height of the area the user can actually see, in px.
 *
 * Native: `useWindowDimensions().height` is already the visible height.
 *
 * Web: `useWindowDimensions()` reports the *layout* viewport, which does not
 * shrink when the mobile URL bar expands or the soft keyboard opens. Anything
 * pinned against it (wizard action docks) can land below the fold. Read
 * `visualViewport` instead — the same source `useKeyboardVisible` uses — so the
 * shell and the keyboard logic never disagree about the current geometry.
 */
export function useViewportHeight(): number {
  const { height: windowHeight } = useWindowDimensions();
  const [visualHeight, setVisualHeight] = useState<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined") return;

    const sync = () => {
      const { height } = readWebVisualViewportMetrics();
      setVisualHeight(height > 0 ? height : null);
    };

    sync();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  if (Platform.OS !== "web") return windowHeight;
  return visualHeight ?? windowHeight;
}
