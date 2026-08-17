import { Alert, Platform } from "react-native";

export interface ConfirmDialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export type ConfirmDialogImplementation = (
  options: ConfirmDialogOptions,
) => Promise<boolean>;

let registeredImplementation: ConfirmDialogImplementation | null = null;

/** Registers the themed confirm UI (see `ConfirmDialogHost`). */
export function registerConfirmDialogImplementation(
  impl: ConfirmDialogImplementation | null,
): void {
  registeredImplementation = impl;
}

/**
 * Cross-platform yes/no confirm. When `ConfirmDialogHost` is mounted, shows
 * the themed modal. Otherwise falls back to `window.confirm` on web (React
 * Native Web's `Alert.alert` cannot invoke multi-button callbacks — there's
 * no native dialog to back it, so its buttons silently never fire) or the
 * real `Alert.alert` on native.
 */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  if (registeredImplementation) {
    return registeredImplementation(options);
  }

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
