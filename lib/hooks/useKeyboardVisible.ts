import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

import { shouldApplyWebKeyboardScrollInset } from "@/lib/webKeyboard";

/** Ignore visualViewport jitter from mobile browser chrome (URL bar). */
const WEB_KEYBOARD_INSET_THRESHOLD_PX = 48;

/** CSS custom property written synchronously on every viewport event — bypasses React re-render lag. */
const CSS_VAR_KEYBOARD_HEIGHT = "--keyboard-height";

function setCssKeyboardHeight(px: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(CSS_VAR_KEYBOARD_HEIGHT, `${px}px`);
}

interface VirtualKeyboardApi {
  boundingRect: { height: number };
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

type NavigatorWithVK = Navigator & {
  virtualKeyboard?: VirtualKeyboardApi;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return target.isContentEditable;
}

function readVisualViewportInset(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const layoutH = window.innerHeight;
  return Math.max(0, Math.round(layoutH - vv.height - (vv.offsetTop ?? 0)));
}

/** Chrome overlays-content: keyboard geometry via Virtual Keyboard API. */
function readVirtualKeyboardInset(): number {
  const vk = (navigator as NavigatorWithVK).virtualKeyboard;
  if (!vk) return 0;
  const h = vk.boundingRect.height;
  return h > 0 ? Math.round(h) : 0;
}

/**
 * Tracks keyboard visibility and occluded height.
 *
 * - Native: React Native `Keyboard` events.
 * - Mobile web (`interactive-widget=overlays-content`): visualViewport when it
 *   shrinks, Virtual Keyboard API `geometrychange`, focus fallback, and resize.
 */
export function useKeyboardVisible() {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") {
      if (typeof window === "undefined" || typeof document === "undefined") {
        return;
      }

      let rafId = 0;
      let focusOutTimer: ReturnType<typeof setTimeout> | undefined;

      const applyInset = (inset: number) => {
        const open = inset >= WEB_KEYBOARD_INSET_THRESHOLD_PX;
        const height = open ? inset : 0;
        // Write CSS var synchronously — no React lag, layout adjusts this frame.
        setCssKeyboardHeight(height);
        setKeyboardHeight(height);
        setKeyboardVisible(open);
      };

      const readInset = (): number => {
        const measured = Math.max(
          readVisualViewportInset(),
          readVirtualKeyboardInset(),
        );
        return measured >= WEB_KEYBOARD_INSET_THRESHOLD_PX ? measured : 0;
      };

      const sync = () => {
        applyInset(readInset());
      };

      const scheduleSync = () => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(sync);
      };

      const onFocusIn = (e: FocusEvent) => {
        if (!isEditableTarget(e.target)) return;
        scheduleSync();
        // Single delayed sync after keyboard has fully animated open (~350ms on Android Chrome).
        setTimeout(sync, 350);
      };

      const onFocusOut = () => {
        focusOutTimer = setTimeout(() => {
          const active = document.activeElement;
          if (isEditableTarget(active)) return;
          // Reset immediately in CSS so layout doesn't wait for React re-render.
          setCssKeyboardHeight(0);
          sync();
        }, 200);
      };

      sync();
      const vv = window.visualViewport;
      vv?.addEventListener("resize", scheduleSync);
      vv?.addEventListener("scroll", scheduleSync);
      window.addEventListener("resize", scheduleSync);

      document.addEventListener("focusin", onFocusIn, true);
      document.addEventListener("focusout", onFocusOut, true);

      const vk = (navigator as NavigatorWithVK).virtualKeyboard;
      vk?.addEventListener("geometrychange", scheduleSync);

      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(focusOutTimer);
        vv?.removeEventListener("resize", scheduleSync);
        vv?.removeEventListener("scroll", scheduleSync);
        window.removeEventListener("resize", scheduleSync);
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("focusout", onFocusOut, true);
        vk?.removeEventListener("geometrychange", scheduleSync);
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

/**
 * Lift for bottom-docked composers when the keyboard occludes the viewport.
 * Mobile web may report `keyboardVisible` before `keyboardHeight` is measured.
 */
export function effectiveKeyboardInset(
  keyboardVisible: boolean,
  keyboardHeight: number,
  fallbackWhenVisible = 240,
): number {
  if (!keyboardVisible) return 0;
  if (Platform.OS === "web" && !shouldApplyWebKeyboardScrollInset()) {
    return 0;
  }
  return keyboardHeight >= WEB_KEYBOARD_INSET_THRESHOLD_PX
    ? keyboardHeight
    : fallbackWhenVisible;
}
