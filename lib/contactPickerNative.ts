/**
 * Native contact picker implementation. Loaded only when user taps "Import from contacts"
 * so the app can start without expo-contacts when the native module is not linked.
 */
import * as Contacts from "expo-contacts";
import { Platform } from "react-native";
import type { PickedContact, PickContactResult } from "./contactPicker";

const DEFAULT_COUNTRY_CODE = "91";
const MIN_DIGITS_VALID = 10;

function normalizePhoneNumber(raw: string, prependCountryCode = true): string {
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

function contactDisplayName(contact: { name?: string; firstName?: string; lastName?: string }): string {
  const name = contact.name?.trim();
  if (name) return name;
  const first = (contact.firstName ?? "").trim();
  const last = (contact.lastName ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || "Unknown";
}

function firstValidPhone(contact: { phoneNumbers?: Array<{ number?: string; digits?: string }> }): string | null {
  const list = contact.phoneNumbers;
  if (!list?.length) return null;
  for (let i = 0; i < list.length; i++) {
    const raw = (list[i]?.number ?? list[i]?.digits ?? "").trim();
    if (!raw) continue;
    const normalized = normalizePhoneNumber(raw, false);
    if (normalized.length >= MIN_DIGITS_VALID) return normalizePhoneNumber(raw, true);
  }
  return null;
}

export async function requestContactsPermissionNative(): Promise<boolean> {
  const { status } = await Contacts.requestPermissionsAsync();
  return status === "granted";
}

export async function pickContactForNameAndPhoneNative(): Promise<PickContactResult> {
  const available = await Contacts.isAvailableAsync();
  if (!available) {
    return { ok: false, reason: "unavailable", message: "Contacts are not available on this device." };
  }

  if (Platform.OS === "android") {
    const granted = await requestContactsPermissionNative();
    if (!granted) {
      return { ok: false, reason: "permission_denied", message: "Contact access was denied." };
    }
  }

  const contact = await Contacts.presentContactPickerAsync();
  if (!contact) {
    return { ok: false, reason: "cancelled" };
  }

  const name = contactDisplayName(contact);
  const phone = firstValidPhone(contact);
  if (!phone) {
    return { ok: false, reason: "no_phone", message: "This contact has no phone number." };
  }

  return { ok: true, contact: { name, phone } };
}
