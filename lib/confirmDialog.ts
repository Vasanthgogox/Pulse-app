import { Alert, Platform } from "react-native";

type ConfirmOptions = {
  confirmText?: string;
  destructive?: boolean;
};

/**
 * Two-button confirmation. On web, uses `window.confirm` because React Native Web's
 * `Alert.alert` is unreliable for multi-button flows (see app/(driver)/index.tsx).
 */
export function confirmDialog(
  title: string,
  message: string,
  options?: ConfirmOptions,
): Promise<boolean> {
  const confirmText = options?.confirmText ?? "OK";
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmText,
        style: options?.destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}
