import { useEffect } from "react";
import { Platform } from "react-native";

import type { IndianVehicleKeyboardKind } from "@/lib/indianVehicleInput.util";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function numpadDigit(key: string): string | null {
  if (!key.startsWith("Numpad") || key.length !== 7) return null;
  const digit = key.slice(6);
  return /^[0-9]$/.test(digit) ? digit : null;
}

/**
 * Maps physical keyboard keys to Indian plate keypad presses (web desktop only).
 */
export function useIndianVehiclePhysicalKeypad({
  enabled,
  kind,
  onKey,
}: {
  enabled: boolean;
  kind: IndianVehicleKeyboardKind;
  onKey: (key: string) => void;
}): void {
  useEffect(() => {
    if (!enabled || Platform.OS !== "web") return;
    if (typeof window === "undefined") return;

    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const { key } = event;

      if (key === "Backspace" || key === "Delete") {
        event.preventDefault();
        onKey("⌫");
        return;
      }

      if (kind === "letters" && /^[a-zA-Z]$/.test(key)) {
        event.preventDefault();
        onKey(key.toUpperCase());
        return;
      }

      if (kind === "numbers") {
        if (/^[0-9]$/.test(key)) {
          event.preventDefault();
          onKey(key);
          return;
        }
        const digit = numpadDigit(key);
        if (digit) {
          event.preventDefault();
          onKey(digit);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, kind, onKey]);
}
