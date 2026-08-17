import { Alert, Platform } from "react-native";

export interface ConfirmDialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Cross-platform yes/no confirm. React Native Web's `Alert.alert` does not
 * reliably invoke multi-button callbacks (no native dialog to back it), so on
 * web this falls back to `window.confirm`. On native it uses the real Alert.
 */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  const { title, message, confirmLabel = "Confirm", cancelLabel = "Cancel" } = options;

  if (Platform.OS === "web") {
    const body = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(body) : false);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: options.destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}
