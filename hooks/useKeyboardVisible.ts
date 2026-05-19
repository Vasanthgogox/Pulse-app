import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/** Ignore visualViewport jitter from mobile browser chrome (URL bar, toolbars). */
const WEB_KEYBOARD_INSET_THRESHOLD_PX = 72;

function readWebKeyboardInset(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  const layoutH = window.innerHeight;
  const inset = Math.max(0, layoutH - vv.height - (vv.offsetTop ?? 0));
  return Math.round(inset);
}

/**
 * Tracks keyboard visibility and occluded height.
 *
 * - Native: React Native `Keyboard` events (`endCoordinates.height`).
 * - Mobile web: `visualViewport` vs layout viewport (`interactive-widget=overlays-content`
 *   in app/+html.tsx — the keyboard overlays content; RN Keyboard does not fire).
 */
export function useKeyboardVisible() {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;

      const sync = () => {
        const inset = readWebKeyboardInset();
        const open = inset >= WEB_KEYBOARD_INSET_THRESHOLD_PX;
        setKeyboardHeight(open ? inset : 0);
        setKeyboardVisible(open);
      };

      sync();
      const vv = window.visualViewport;
      vv?.addEventListener("resize", sync);
      vv?.addEventListener("scroll", sync);
      window.addEventListener("resize", sync);
      return () => {
        vv?.removeEventListener("resize", sync);
        vv?.removeEventListener("scroll", sync);
        window.removeEventListener("resize", sync);
      };
    }

    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return { keyboardVisible, keyboardHeight };
}

/** Bottom padding for a docked composer: safe area when closed, minimal when keyboard is up. */
export function dockPaddingBottom(
  bottomInset: number,
  keyboardVisible: boolean,
  closedMin = 4,
): number {
  return keyboardVisible ? closedMin : Math.max(bottomInset, closedMin);
}
