import type { TextInputProps } from "react-native";

import {
  formatIndianVehicleNumberInput,
  normalizeVehicleNumberForMatch,
} from "@/lib/format";

/**
 * Indian plates are variable-length, not a fixed 2-2-2-4 mask:
 *   - state:    2 letters               (TN)
 *   - district: 1–3 digits              (1, 01, 100)
 *   - series:   0–3 letters (optional)  (—, C, CM, ABC)
 *   - number:   1–4 digits              (2026)
 * Plus the Bharat (BH) series, which starts with digits: 22 BH 1234 AB.
 * The keystroke filter below is structural (what may come next given what is
 * already typed), never index-based.
 */
export const INDIAN_VEHICLE_SEGMENT_LENGTHS = [2, 2, 2, 4] as const;

/** Longest accepted plate: 2 + 3 + 3 + 4 = 12 (BH tops out at 9). */
export const INDIAN_VEHICLE_TOTAL_LENGTH = 12;

/** Shortest plausible plate: LL + 1 digit + 1 digit, e.g. "TN 1 2" is still rejected by the regexes below. */
const INDIAN_VEHICLE_MIN_LENGTH = 5;

/** Full-plate validity — the real gate. Partial input fails these on purpose. */
const VALID_PLATE_PATTERNS: readonly RegExp[] = [
  /** Standard civilian: TN 01 CM 2026, TN 01 C 2026, TN 09 1234, UP 32 ABC 1234. */
  /^[A-Z]{2}[0-9]{1,3}[A-Z]{0,3}[0-9]{1,4}$/,
  /** Bharat series: 22 BH 1234 AB. */
  /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/,
];

export function getIndianVehicleNormalizedLength(display: string): number {
  return normalizeVehicleNumberForMatch(display).length;
}

/** True when the value is a complete, well-formed plate. */
export function isIndianVehiclePlateValid(display: string): boolean {
  const norm = normalizeVehicleNumberForMatch(display);
  if (norm.length < INDIAN_VEHICLE_MIN_LENGTH) return false;
  return VALID_PLATE_PATTERNS.some((re) => re.test(norm));
}

/**
 * Continue-gate used by the wizards. Kept as the historical name; it now means
 * "structurally valid plate" rather than "10 characters typed", so short-series
 * and no-series plates can advance.
 */
export function isIndianVehiclePlateComplete(display: string): boolean {
  return isIndianVehiclePlateValid(display);
}

export type IndianVehicleKeyboardKind = "letters" | "numbers";

/**
 * Labels for the little segment-guide chips under the field, sized to what has
 * actually been typed (series is dropped once the plate clearly has none).
 */
export function getIndianVehicleSegmentGuide(
  display: string,
): { label: string; done: boolean }[] {
  const norm = normalizeVehicleNumberForMatch(display);
  const p = parsePlate(norm);

  if (p.bh) {
    return [
      { label: "00", done: p.state.length === 2 },
      { label: "BH", done: p.district === "BH" },
      { label: "0000", done: p.series.length === 4 },
      { label: "AA", done: p.number.length >= 1 },
    ];
  }

  const seriesTyped = p.series.length;
  // Always show series capacity as AA (1–3 letters allowed). Shrinking to a
  // single "A" after the first letter made it look like only one was allowed.
  const guide = [
    { label: "AA", done: p.state.length === 2 },
    { label: "00", done: p.district.length >= 1 },
    { label: "AA", done: seriesTyped > 0 },
    { label: "0000", done: p.number.length >= 1 },
  ];
  return guide;
}

type PlateShape = {
  /** true once the value looks like a BH-series plate (leading digits). */
  bh: boolean;
  state: string;
  district: string;
  series: string;
  number: string;
};

/** Parse whatever has been typed so far into its segments. */
function parsePlate(normalized: string): PlateShape {
  const bh = /^[0-9]/.test(normalized);
  if (bh) {
    const m = normalized.match(/^([0-9]{0,2})([A-Z]{0,2})([0-9]{0,4})([A-Z]{0,2})$/);
    return {
      bh: true,
      state: m?.[1] ?? normalized,
      district: m?.[2] ?? "",
      series: m?.[3] ?? "",
      number: m?.[4] ?? "",
    };
  }
  const m = normalized.match(/^([A-Z]{0,2})([0-9]*)([A-Z]{0,3})([0-9]{0,4})$/);
  if (!m) {
    return { bh: false, state: normalized, district: "", series: "", number: "" };
  }
  let district = m[2];
  let number = m[4];
  // No series letter typed yet, so the whole digit run is one block. The last 4
  // digits belong to the number; anything before them is the district
  // (TN 09 1234 → district "09", number "1234"; TN 01 → district "01", no number).
  if (!m[3] && !number && district.length > 3) {
    number = district.slice(-4);
    district = district.slice(0, -4);
  }
  return { bh: false, state: m[1], district, series: m[3], number };
}

/** Which character classes are legal as the next keystroke, for a display value. */
export function getIndianVehicleAllowedNext(display: string): {
  letters: boolean;
  digits: boolean;
} {
  return allowedNext(normalizeVehicleNumberForMatch(display));
}

/** Which character classes are legal as the next keystroke. */
function allowedNext(normalized: string): { letters: boolean; digits: boolean } {
  if (normalized.length >= INDIAN_VEHICLE_TOTAL_LENGTH) {
    return { letters: false, digits: false };
  }
  // Empty: a letter starts a civilian plate, a digit starts a BH plate.
  if (normalized.length === 0) return { letters: true, digits: true };

  const p = parsePlate(normalized);

  if (p.bh) {
    // NN BH NNNN LL
    if (p.state.length < 2 && !p.district) return { letters: false, digits: true };
    if (p.district.length < 2) return { letters: true, digits: false };
    if (p.series.length < 4) return { letters: false, digits: true };
    return { letters: p.number.length < 2, digits: false };
  }

  // LL NNN LLL NNNN — series is optional, so once the district has a digit both
  // a series letter and a number digit are legal.
  if (p.state.length < 2) return { letters: true, digits: false };
  if (p.district.length === 0) return { letters: false, digits: true };
  if (p.series.length === 0 && p.number.length === 0) {
    // Digits here are ambiguous: they may still be district (TN 100 …) or already
    // the number on a series-less plate (TN 09 1234). Keep accepting them — the
    // parser re-splits on every keystroke and the final regex decides validity.
    return { letters: true, digits: true };
  }
  if (p.number.length === 0) {
    return { letters: p.series.length < 3, digits: true };
  }
  if (p.series.length === 0) {
    // Series-less plate: the digits are still one run, so keep accepting until
    // district + number hit their combined maximum (3 + 4).
    return { letters: false, digits: p.district.length + p.number.length < 7 };
  }
  return { letters: false, digits: p.number.length < 4 };
}

/**
 * Which keypad to show by default. When both classes are legal the other class
 * stays reachable via the ABC/123 toggle (mobile) or the physical keyboard
 * (desktop) — this only picks the primary pad.
 *
 * Prefer digits until the typical 2-digit district is filled; jumping to letters
 * after a single district digit blocked plates like TN 09 CD 7788.
 */
export function getIndianVehicleKeyboardKind(
  normalizedLenOrValue: number | string,
): IndianVehicleKeyboardKind {
  // Back-compat: callers historically passed the normalized length. A length alone
  // cannot disambiguate variable-length plates, so fall back to the old mask there.
  if (typeof normalizedLenOrValue === "number") {
    const n = normalizedLenOrValue;
    if (n <= 1) return "letters";
    if (n <= 3) return "numbers";
    if (n <= 5) return "letters";
    return "numbers";
  }
  const norm = normalizeVehicleNumberForMatch(normalizedLenOrValue);
  const { letters, digits } = allowedNext(norm);
  if (letters && !digits) return "letters";
  if (digits && !letters) return "numbers";
  if (!letters && !digits) return "numbers";
  const p = parsePlate(norm);
  if (p.bh) return digits ? "numbers" : "letters";
  // Mid-district (0–1 digits so far): keep the number pad so TN 0 → 9 works.
  if (p.series.length === 0 && p.number.length === 0 && p.district.length < 2) {
    return "numbers";
  }
  // District looks complete, series not started: offer letters (series).
  if (p.series.length === 0 && p.number.length === 0) {
    return "letters";
  }
  // Series started (more letters still legal) or number phase: prefer digits,
  // but letters remain allowed via toggle / physical keyboard.
  return "numbers";
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
  if (typeof normalizedLenOrValue === "number") {
    // Length-only callers keep the original fixed-mask copy.
    const n = normalizedLenOrValue;
    if (n < 2) return "Enter 2 letters (state code, e.g. TN)";
    if (n < 4) return "Enter 2 digits (district number)";
    if (n < 6) return "Enter 2 letters (series)";
    if (n < 10) return "Enter the registration number";
    return "Format: XX NN LL NNNN (e.g. TN 12 AB 3456)";
  }

  const norm = normalizeVehicleNumberForMatch(normalizedLenOrValue);
  if (norm.length === 0) return "Enter 2 letters (state code, e.g. TN)";

  const p = parsePlate(norm);

  if (p.bh) {
    if (p.state.length < 2 && !p.district) return "Enter 2 digits (year, e.g. 22)";
    if (p.district.length < 2) return "Enter BH (Bharat series)";
    if (p.series.length < 4) return "Enter 4 digits (registration number)";
    return "Enter 1–2 letters to finish";
  }

  if (p.state.length < 2) return "Enter 2 letters (state code, e.g. TN)";
  if (p.district.length === 0) return "Enter district number (1–3 digits)";
  if (p.series.length === 0 && p.number.length === 0) {
    if (p.district.length < 2) {
      return "Enter more district digits, series letters, or the number";
    }
    return "Enter series letters (optional) or the number";
  }
  if (p.number.length === 0) {
    if (p.series.length < 3) {
      return "Enter more series letters (up to 3) or the number (1–4 digits)";
    }
    return "Enter the registration number (1–4 digits)";
  }
  if (isIndianVehiclePlateValid(norm)) return "Looks good";
  return "Enter the registration number (1–4 digits)";
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
  for (let i = 0; i < norm.length && built.length < INDIAN_VEHICLE_TOTAL_LENGTH; i++) {
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
