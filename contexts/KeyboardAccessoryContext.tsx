import {
  APP_KEYBOARD_ACCESSORY_ID,
  AppKeyboardAccessory,
  CREATE_TRIP_KEYBOARD_ACCESSORY_ID,
} from "@/components/AppKeyboardAccessory";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Keyboard, Platform } from "react-native";

export { APP_KEYBOARD_ACCESSORY_ID, CREATE_TRIP_KEYBOARD_ACCESSORY_ID };

/** Ignore accessory "Next" for this long after a field registers (iOS blur/submit race). */
const KEYBOARD_NEXT_COOLDOWN_MS = 500;

type KeyboardAccessoryContextValue = {
  accessoryBarActive: boolean;
  accessoryId: string | undefined;
  registerKeyboardNext: (
    action: (() => void) | null,
    label?: string,
    preview?: string,
  ) => void;
  /** Updates the live preview shown above the numeric keypad. */
  updateAccessoryPreview: (text: string) => void;
  /** Hide Done/Next bar without dismissing keyboard (e.g. chat composer focus). */
  releaseAccessoryBar: () => void;
  dismissKeyboard: () => void;
};

const KeyboardAccessoryContext = createContext<KeyboardAccessoryContextValue | null>(
  null,
);

export function KeyboardAccessoryProvider({ children }: { children: ReactNode }) {
  const [keyboardNextLabel, setKeyboardNextLabel] = useState("Next");
  const [accessoryPreviewText, setAccessoryPreviewText] = useState("");
  const [hasNextAction, setHasNextAction] = useState(false);
  const [accessoryBarActive, setAccessoryBarActive] = useState(false);

  const accessoryBarActiveRef = useRef(false);
  const keyboardNextActionRef = useRef<(() => void) | null>(null);
  const nextAllowedAfterRef = useRef(0);

  const releaseAccessoryBar = useCallback(() => {
    accessoryBarActiveRef.current = false;
    keyboardNextActionRef.current = null;
    nextAllowedAfterRef.current = 0;
    setAccessoryBarActive(false);
    setHasNextAction(false);
    setAccessoryPreviewText("");
  }, []);

  const updateAccessoryPreview = useCallback((text: string) => {
    if (!accessoryBarActiveRef.current) return;
    setAccessoryPreviewText(text);
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => releaseAccessoryBar(),
    );
    return () => hideSub.remove();
  }, [releaseAccessoryBar]);

  const registerKeyboardNext = useCallback(
    (action: (() => void) | null, label = "Next", preview = "") => {
      accessoryBarActiveRef.current = true;
      keyboardNextActionRef.current = action;
      // Block stray Next from the previous field's blur (shared InputAccessoryView on iOS).
      nextAllowedAfterRef.current = Date.now() + KEYBOARD_NEXT_COOLDOWN_MS;
      setAccessoryBarActive(true);
      setHasNextAction(action != null);
      setKeyboardNextLabel(label);
      setAccessoryPreviewText(preview);
    },
    [],
  );

  const runKeyboardNext = useCallback(() => {
    if (Date.now() < nextAllowedAfterRef.current) return;
    const action = keyboardNextActionRef.current;
    if (!action) return;
    nextAllowedAfterRef.current = Date.now() + KEYBOARD_NEXT_COOLDOWN_MS;
    action();
  }, []);

  const dismissKeyboard = useCallback(() => {
    releaseAccessoryBar();
    Keyboard.dismiss();
  }, [releaseAccessoryBar]);

  const value = useMemo(
    () => ({
      accessoryBarActive,
      accessoryId:
        Platform.OS === "ios" ? APP_KEYBOARD_ACCESSORY_ID : undefined,
      registerKeyboardNext,
      updateAccessoryPreview,
      releaseAccessoryBar,
      dismissKeyboard,
    }),
    [
      accessoryBarActive,
      registerKeyboardNext,
      updateAccessoryPreview,
      releaseAccessoryBar,
      dismissKeyboard,
    ],
  );

  return (
    <KeyboardAccessoryContext.Provider value={value}>
      {children}
      {Platform.OS !== "web" ? (
        <AppKeyboardAccessory
          visible={accessoryBarActive}
          previewText={accessoryPreviewText}
          showNext={hasNextAction}
          onNext={runKeyboardNext}
          onDone={dismissKeyboard}
          nextLabel={keyboardNextLabel}
        />
      ) : null}
    </KeyboardAccessoryContext.Provider>
  );
}

export function useKeyboardAccessory() {
  const ctx = useContext(KeyboardAccessoryContext);
  if (!ctx) {
    throw new Error("useKeyboardAccessory must be used within KeyboardAccessoryProvider");
  }
  return ctx;
}

/** Optional — returns undefined when provider is not mounted (e.g. tests). */
export function useOptionalKeyboardAccessory() {
  return useContext(KeyboardAccessoryContext);
}

/**
 * Wire `decimal-pad` / `number-pad` fields to the global Done / Next bar.
 * Call `onFocus` from TextInput; pass `onNext` when another field should follow.
 */
export function useKeyboardAccessoryField(
  previewValue = "",
  onNext?: () => void,
  nextLabel = "Next",
) {
  const ctx = useOptionalKeyboardAccessory();
  const accessoryId = ctx?.accessoryId;

  const onFocus = useCallback(() => {
    if (!ctx) return;
    ctx.registerKeyboardNext(onNext ?? null, nextLabel, previewValue);
  }, [ctx, onNext, nextLabel, previewValue]);

  const onChangeText = useCallback(
    (text: string, forward?: (t: string) => void) => {
      forward?.(text);
    },
    [],
  );

  return { inputAccessoryViewID: accessoryId, onFocus, onChangeText };
}
