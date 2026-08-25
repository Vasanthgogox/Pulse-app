import type { TextInputProps } from "react-native";

import {
  formatIndianVehicleNumberInput,
  normalizeVehicleNumberForMatch,
} from "@/lib/format";

/**
 * Standard Indian civilian plate — fixed mask only:
 *   AA 00 AA 0000  (e.g. TN 17 AS 2202)
 *   2 letters · 2 digits · 2 letters · 4 digits
 */
export const INDIAN_VEHICLE_SEGMENT_LENGTHS = [2, 2, 2, 4] as const;

/** Exact plate length after normalize (no spaces). */
export const INDIAN_VEHICLE_TOTAL_LENGTH = 10;

const VALID_PLATE = /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/;

export function getIndianVehicleNormalizedLength(display: string): number {
  return normalizeVehicleNumberForMatch(display).length;
}

/** True when the value is a complete AA 00 AA 0000 plate. */
export function isIndianVehiclePlateValid(display: string): boolean {
  return VALID_PLATE.test(normalizeVehicleNumberForMatch(display));
}

/** Continue-gate used by the wizards. */
export function isIndianVehiclePlateComplete(display: string): boolean {
  return isIndianVehiclePlateValid(display);
}

export type IndianVehicleKeyboardKind = "letters" | "numbers";

type PlateShape = {
  state: string;
  district: string;
  series: string;
  number: string;
};

/** Parse progressive input into fixed 2-2-2-4 segments. */
function parsePlate(normalized: string): PlateShape {
  return {
    state: normalized.slice(0, 2),
    district: normalized.slice(2, 4),
    series: normalized.slice(4, 6),
    number: normalized.slice(6, 10),
  };
}

/** Segment chips under the field (AA · 00 · AA · 0000). */
export function getIndianVehicleSegmentGuide(
  display: string,
): { label: string; done: boolean }[] {
  const p = parsePlate(normalizeVehicleNumberForMatch(display));
  return [
    { label: "AA", done: p.state.length === 2 },
    { label: "00", done: p.district.length === 2 },
    { label: "AA", done: p.series.length === 2 },
    { label: "0000", done: p.number.length === 4 },
  ];
}

/** Which character classes are legal as the next keystroke. */
export function getIndianVehicleAllowedNext(display: string): {
  letters: boolean;
  digits: boolean;
} {
  return allowedNext(normalizeVehicleNumberForMatch(display));
}

function allowedNext(normalized: string): { letters: boolean; digits: boolean } {
  const n = normalized.length;
  if (n >= INDIAN_VEHICLE_TOTAL_LENGTH) {
    return { letters: false, digits: false };
  }
  // 0–1: state letters · 2–3: district digits · 4–5: series letters · 6–9: number
  if (n < 2) return { letters: true, digits: false };
  if (n < 4) return { letters: false, digits: true };
  if (n < 6) return { letters: true, digits: false };
  return { letters: false, digits: true };
}

/** Which keypad to show — exclusive per segment (no ABC/123 toggle needed). */
export function getIndianVehicleKeyboardKind(
  normalizedLenOrValue: number | string,
): IndianVehicleKeyboardKind {
  if (typeof normalizedLenOrValue === "number") {
    const n = normalizedLenOrValue;
    if (n < 2) return "letters";
    if (n < 4) return "numbers";
    if (n < 6) return "letters";
    return "numbers";
  }
  const { letters } = allowedNext(
    normalizeVehicleNumberForMatch(normalizedLenOrValue),
  );
  return letters ? "letters" : "numbers";
}

export function getIndianVehicleKeyboardType(
  normalizedLenOrValue: number | string,
): TextInputProps["keyboardType"] {
  return getIndianVehicleKeyboardKind(normalizedLenOrValue) === "numbers"
    ? "number-pad"
    : "default";
}

export function getIndianVehicleFormatHint(
  normalizedLenOrValue: number | string,
): string {
  const n =
    typeof normalizedLenOrValue === "number"
      ? normalizedLenOrValue
      : normalizeVehicleNumberForMatch(normalizedLenOrValue).length;

  if (n < 2) return "Enter 2 letters (state code, e.g. TN)";
  if (n < 4) return "Enter 2 digits (district, e.g. 17)";
  if (n < 6) return "Enter 2 letters (series, e.g. AS)";
  if (n < 10) return "Enter 4 digits (number, e.g. 2202)";
  return "Format: AA 00 AA 0000 (e.g. TN 17 AS 2202)";
}

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
  for (
    let i = 0;
    i < norm.length && built.length < INDIAN_VEHICLE_TOTAL_LENGTH;
    i++
  ) {
    const ch = norm[i];
    const { letters, digits } = allowedNext(built);
    if (/[A-Z]/.test(ch)) {
      if (letters) built += ch;
    } else if (/[0-9]/.test(ch)) {
      if (digits) built += ch;
    }
  }
  return formatIndianVehicleNumberInput(built);
}
