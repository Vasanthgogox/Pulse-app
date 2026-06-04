import type { TextInputProps } from "react-native";

import {
  formatIndianVehicleNumberInput,
  normalizeVehicleNumberForMatch,
} from "@/lib/format";

/** Indian plate segments: 2 letters · 2 digits · 2 letters · 4 digits (10 chars). */
export const INDIAN_VEHICLE_SEGMENT_LENGTHS = [2, 2, 2, 4] as const;
export const INDIAN_VEHICLE_TOTAL_LENGTH = 10;

export function getIndianVehicleNormalizedLength(display: string): number {
  return normalizeVehicleNumberForMatch(display).length;
}

export function isIndianVehiclePlateComplete(display: string): boolean {
  return getIndianVehicleNormalizedLength(display) >= INDIAN_VEHICLE_TOTAL_LENGTH;
}

export type IndianVehicleKeyboardKind = "letters" | "numbers";

/** Which character class is expected at the current cursor position. */
export function getIndianVehicleKeyboardKind(normalizedLen: number): IndianVehicleKeyboardKind {
  if (normalizedLen <= 1) return "letters";
  if (normalizedLen <= 3) return "numbers";
  if (normalizedLen <= 5) return "letters";
  return "numbers";
}

export function getIndianVehicleKeyboardType(
  normalizedLen: number,
): TextInputProps["keyboardType"] {
  return getIndianVehicleKeyboardKind(normalizedLen) === "numbers"
    ? "number-pad"
    : "default";
}

export function getIndianVehicleFormatHint(normalizedLen: number): string {
  if (normalizedLen < 2) return "Enter 2 letters (state code, e.g. TN)";
  if (normalizedLen < 4) return "Enter 2 digits (district number)";
  if (normalizedLen < 6) return "Enter 2 letters (series)";
  if (normalizedLen < INDIAN_VEHICLE_TOTAL_LENGTH) {
    const need = INDIAN_VEHICLE_TOTAL_LENGTH - normalizedLen;
    return `Enter ${need} digit${need === 1 ? "" : "s"} (registration number)`;
  }
  return "Format: XX NN LL NNNN (e.g. TN 12 AB 3456)";
}

/**
 * Filters keystrokes to match segment rules, then applies display spacing.
 */
/** Remove the last plate character (display spacing preserved). */
export function deleteIndianVehicleLastChar(display: string): string {
  const norm = normalizeVehicleNumberForMatch(display);
  if (norm.length === 0) return "";
  return formatIndianVehicleNumberInput(norm.slice(0, -1));
}

/** Append one character if it matches the current segment rules. */
export function appendIndianVehicleChar(display: string, char: string): string {
  const upper = char.toUpperCase();
  return applyIndianVehicleKeystroke(display + upper);
}

export function applyIndianVehicleKeystroke(nextRaw: string): string {
  const norm = normalizeVehicleNumberForMatch(nextRaw);
  let built = "";
  for (let i = 0; i < norm.length && built.length < INDIAN_VEHICLE_TOTAL_LENGTH; i++) {
    const ch = norm[i];
    const pos = built.length;
    if (pos <= 1) {
      if (/[A-Z]/.test(ch)) built += ch;
    } else if (pos <= 3) {
      if (/[0-9]/.test(ch)) built += ch;
    } else if (pos <= 5) {
      if (/[A-Z]/.test(ch)) built += ch;
    } else if (pos <= 9) {
      if (/[0-9]/.test(ch)) built += ch;
    }
  }
  return formatIndianVehicleNumberInput(built);
}
