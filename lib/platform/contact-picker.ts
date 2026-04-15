/**
 * Contact picker — shared logic for "Import from contacts" in Add Client, Add Supplier, Add Driver.
 * Uses native contact picker (single selection). Permission requested on Android; iOS picker works without full access.
 * Name and phone extraction + normalization in O(n) over the single contact's string lengths.
 * expo-contacts is loaded only when the user taps "Import from contacts" (via contact-picker.native.ts)
 * so the app can start when the native module is not installed.
 */

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
 * Request contacts permission. Required on Android before using the picker.
 * Returns true if granted or already granted; false if denied or if expo-contacts is unavailable.
 */
export async function requestContactsPermission(): Promise<boolean> {
  try {
    const native = await import("./contact-picker.native");
    return native.requestContactsPermissionNative();
  } catch {
    return false;
  }
}

/**
 * Present native contact picker and return name + phone for the selected contact.
 * If expo-contacts native module is not available, returns reason 'unavailable' so the app still runs.
 */
export async function pickContactForNameAndPhone(): Promise<PickContactResult> {
  try {
    const native = await import("./contact-picker.native");
    return native.pickContactForNameAndPhoneNative();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to open contacts";
    if (message.toLowerCase().includes("cancel") || message.toLowerCase().includes("permission")) {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: false, reason: "unavailable", message: "Contacts are not available. Add the contact manually." };
  }
}
