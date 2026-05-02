/**
 * Contact picker — shared logic for "Import from contacts" in Add Client, Add Supplier, Add Driver.
 * On web: uses the browser Contact Picker API (navigator.contacts) via contactPickerWeb.ts.
 * On native: uses expo-contacts (single selection) via contactPickerNative.ts.
 * Both are lazy-loaded so the app can start when expo-contacts native module is not installed.
 */
import { Platform } from "react-native";

export type PickedContact = { name: string; phone: string };

export type PickContactResult =
  | { ok: true; contact: PickedContact }
  | { ok: false; reason: "cancelled" | "no_phone" | "permission_denied" | "unavailable"; message?: string };

const DEFAULT_COUNTRY_CODE = "91";
const MIN_DIGITS_VALID = 10;

/**
 * Normalize phone to digits only (single pass, O(len(s))).
 * If prependCountryCode is false, returns digits only (for length check).
 * Otherwise formats with + and optional Indian country code.
 */
export function normalizePhoneNumber(raw: string, prependCountryCode = true): string {
  let digits = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c >= "0" && c <= "9") digits += c;
  }
  if (!digits) return "";
  if (digits.length > MIN_DIGITS_VALID && digits[0] === "0") digits = digits.slice(1);
  if (!prependCountryCode) return digits;
  if (digits.length === MIN_DIGITS_VALID && digits[0] !== "0") {
    return `+${DEFAULT_COUNTRY_CODE}${digits}`;
  }
  if (digits.length >= 10) {
    return `+${digits.startsWith(DEFAULT_COUNTRY_CODE) ? "" : DEFAULT_COUNTRY_CODE}${digits}`;
  }
  return `+${digits}`;
}

/**
 * Request contacts permission. Required on Android before using the native picker.
 * On web the browser handles permission via the Contact Picker API dialog — no pre-request needed.
 * Returns true if granted or already granted; false if denied or unavailable.
 */
export async function requestContactsPermission(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  try {
    const native = await import("./contactPickerNative");
    return native.requestContactsPermissionNative();
  } catch {
    return false;
  }
}

/**
 * Returns true when the contact picker is likely to work in the current environment.
 * On web this reflects browser support for navigator.contacts; on native always true.
 */
export function isContactPickerAvailable(): boolean {
  if (Platform.OS === "web") {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false;
    return "contacts" in navigator;
  }
  return true;
}

/**
 * Present the contact picker and return name + phone for the selected contact.
 * On web: uses the browser Contact Picker API.
 * On native: uses expo-contacts via contactPickerNative.ts (lazy import).
 */
export async function pickContactForNameAndPhone(): Promise<PickContactResult> {
  if (Platform.OS === "web") {
    try {
      const web = await import("./contactPickerWeb");
      return web.pickContactForNameAndPhoneWeb();
    } catch {
      return { ok: false, reason: "unavailable", message: "Contacts are not available. Add the contact manually." };
    }
  }
  try {
    const native = await import("./contactPickerNative");
    return native.pickContactForNameAndPhoneNative();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to open contacts";
    if (message.toLowerCase().includes("cancel") || message.toLowerCase().includes("permission")) {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: false, reason: "unavailable", message: "Contacts are not available. Add the contact manually." };
  }
}
