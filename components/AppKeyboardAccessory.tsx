/**
 * iOS InputAccessoryView + Android sticky bar for numeric / pad keyboards without a return key.
 * Mount once via `KeyboardAccessoryProvider` in the app root.
 */
import Theme from "@/constants/Theme";
import { useEffect, useState } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export const APP_KEYBOARD_ACCESSORY_ID = "app-keyboard-accessory";

/** @deprecated Use `APP_KEYBOARD_ACCESSORY_ID`. */
export const CREATE_TRIP_KEYBOARD_ACCESSORY_ID = APP_KEYBOARD_ACCESSORY_ID;

/** Height of Done / preview / Next strip (iOS accessory + Android overlay). */
export const KEYBOARD_ACCESSORY_BAR_HEIGHT = 44;

export type AppKeyboardAccessoryProps = {
  /** When false, bar is hidden (e.g. chat default keyboard). */
  visible?: boolean;
  /** Live value for the focused pad field — replaces the system keypad preview. */
  previewText?: string;
  onNext?: () => void;
  onDone?: () => void;
  showNext?: boolean;
  nextLabel?: string;
};

function KeyboardBar({
  previewText = "",
  onNext,
  onDone,
  showNext = true,
  nextLabel = "Next",
}: AppKeyboardAccessoryProps) {
  const preview = previewText.trim();
  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={styles.doneBtn}
        onPress={() => {
          onDone?.();
          Keyboard.dismiss();
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Minimize keyboard"
      >
        <Text style={styles.doneText}>Done</Text>
      </TouchableOpacity>
      <View style={styles.previewWrap} pointerEvents="none">
        <Text
          style={[styles.previewText, !preview && styles.previewPlaceholder]}
          numberOfLines={1}
          accessibilityRole="text"
          accessibilityLabel={preview ? `Typing ${preview}` : "Type preview"}
        >
          {preview || " "}
        </Text>
      </View>
      {showNext && onNext ? (
        <TouchableOpacity
          style={styles.nextBtn}
          onPress={() => onNext()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
        >
          <Text style={styles.nextText}>{nextLabel}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.nextSpacer} />
      )}
    </View>
  );
}

export function AppKeyboardAccessory({
  visible = false,
  ...props
}: AppKeyboardAccessoryProps) {
  const [androidKbHeight, setAndroidKbHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android" || !visible) {
      setAndroidKbHeight(0);
      return;
    }
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setAndroidKbHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKbHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  if (!visible) {
    return Platform.OS === "ios" ? (
      <InputAccessoryView nativeID={APP_KEYBOARD_ACCESSORY_ID}>
        <View style={styles.iosAccessoryPlaceholder} />
      </InputAccessoryView>
    ) : null;
  }

  return (
    <>
      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={APP_KEYBOARD_ACCESSORY_ID}>
          <KeyboardBar {...props} />
        </InputAccessoryView>
      ) : null}
      {Platform.OS === "android" && androidKbHeight > 0 ? (
        <View
          style={styles.androidBarWrap}
          pointerEvents="box-none"
        >
          <KeyboardBar {...props} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  iosAccessoryPlaceholder: {
    height: 0,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: KEYBOARD_ACCESSORY_BAR_HEIGHT,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#C6C6C8",
    backgroundColor: "#F0F0F3",
  },
  androidBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    elevation: 8,
    backgroundColor: "#F0F0F3",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#C6C6C8",
    minHeight: KEYBOARD_ACCESSORY_BAR_HEIGHT,
  },
  previewWrap: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  previewText: {
    fontSize: 17,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    width: "100%",
  },
  previewPlaceholder: {
    opacity: 0,
  },
  doneBtn: {
    paddingHorizontal: 4,
    paddingVertical: 6,
    minHeight: 36,
    justifyContent: "center",
  },
  doneText: {
    fontSize: 17,
    fontWeight: "400",
    color: Theme.primary,
  },
  nextBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    justifyContent: "center",
  },
  nextSpacer: {
    width: 72,
  },
  nextText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
});
