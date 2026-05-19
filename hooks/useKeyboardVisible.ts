import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/** Tracks native keyboard visibility and height (mobile only). */
export function useKeyboardVisible() {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") return;

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
