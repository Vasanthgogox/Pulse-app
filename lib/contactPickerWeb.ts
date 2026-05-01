/**
 * Web Contact Picker implementation using the browser's Contact Picker API.
 * Supported: Chrome 80+ on Android. Not available on desktop Chrome, Safari, or Firefox.
 * Falls back gracefully with a clear "unavailable" result when the API is absent.
 */
import type { PickContactResult } from "./contactPicker";

const DEFAULT_COUNTRY_CODE = "91";
const MIN_DIGITS_VALID = 10;

function normalizePhone(raw: string): string {
  let digits = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c >= "0" && c <= "9") digits += c;
  }
  if (!digits) return "";
  if (digits.length > MIN_DIGITS_VALID && digits[0] === "0") digits = digits.slice(1);
  if (digits.length === MIN_DIGITS_VALID && digits[0] !== "0") {
    return `+${DEFAULT_COUNTRY_CODE}${digits}`;
  }
  if (digits.length > MIN_DIGITS_VALID) {
    return `+${digits.startsWith(DEFAULT_COUNTRY_CODE) ? "" : DEFAULT_COUNTRY_CODE}${digits}`;
  }
  return `+${digits}`;
}

type ContactsSelectResult = Array<{ name?: string[]; tel?: string[] }>;

interface ContactsManager {
  select(
    properties: string[],
    options?: { multiple?: boolean }
  ): Promise<ContactsSelectResult>;
  getProperties(): Promise<string[]>;
}

function getContactsAPI(): ContactsManager | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { contacts?: ContactsManager };
  return nav.contacts ?? null;
}

/** Returns true when the browser supports the Contact Picker API. */
export function isWebContactPickerAvailable(): boolean {
  return getContactsAPI() !== null;
}

export async function pickContactForNameAndPhoneWeb(): Promise<PickContactResult> {
  const api = getContactsAPI();
  if (!api) {
    return {
      ok: false,
      reason: "unavailable",
      message:
        "Contact picker is not supported in this browser. Please type the name and phone manually.",
    };
  }

  try {
    const results = await api.select(["name", "tel"], { multiple: false });
    if (!results || results.length === 0) {
      return { ok: false, reason: "cancelled" };
    }

    const contact = results[0];
    const name = contact.name?.find((n) => n.trim())?.trim() ?? "";
    const rawPhone = contact.tel?.find((t) => t.trim()) ?? "";

    if (!name) {
      return {
        ok: false,
        reason: "unavailable",
        message: "Could not read the contact name.",
      };
    }
    if (!rawPhone) {
      return {
        ok: false,
        reason: "no_phone",
        message: "This contact has no phone number.",
      };
    }

    const phone = normalizePhone(rawPhone);
    return { ok: true, contact: { name, phone } };
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("abort") || msg.includes("cancel") || msg.includes("closed")) {
      return { ok: false, reason: "cancelled" };
    }
    if (msg.includes("security") || msg.includes("permission") || msg.includes("denied")) {
      return { ok: false, reason: "permission_denied", message: "Contact access was denied." };
    }
    return {
      ok: false,
      reason: "unavailable",
      message: "Could not open contacts. Please type the details manually.",
    };
  }
}
