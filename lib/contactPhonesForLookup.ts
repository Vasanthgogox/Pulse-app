/**
 * Read device contacts (native only) for batch invitee lookup on Network.
 */
import { Platform } from "react-native";
import { normalizePhoneForInviteeLookup } from "@/lib/phoneLookup";

export type ContactPhoneEntry = {
  contactName: string;
  phoneRaw: string;
  normalized: string;
};

const MAX_CONTACT_PAGES = 200;

function contactDisplayName(contact: {
  name?: string;
  firstName?: string;
  lastName?: string;
}): string {
  const name = contact.name?.trim();
  if (name) return name;
  const first = (contact.firstName ?? "").trim();
  const last = (contact.lastName ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || "Contact";
}

export async function loadContactPhonesForNetworkLookup(): Promise<{
  entries: ContactPhoneEntry[];
  error: "permission_denied" | "unavailable" | null;
}> {
  if (Platform.OS === "web") {
    return { entries: [], error: "unavailable" };
  }
  try {
    const Contacts = await import("expo-contacts");
    const available = await Contacts.isAvailableAsync();
    if (!available) return { entries: [], error: "unavailable" };

    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") {
      return { entries: [], error: "permission_denied" };
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Name,
        Contacts.Fields.FirstName,
        Contacts.Fields.LastName,
      ],
      pageSize: MAX_CONTACT_PAGES,
    });

    const byNormalized = new Map<string, ContactPhoneEntry>();
    for (const contact of data ?? []) {
      const contactName = contactDisplayName(contact);
      for (const pn of contact.phoneNumbers ?? []) {
        const raw = (pn.number ?? pn.digits ?? "").trim();
        if (!raw) continue;
        const normalized = normalizePhoneForInviteeLookup(raw);
        if (normalized.length < 8) continue;
        if (byNormalized.has(normalized)) continue;
        byNormalized.set(normalized, {
          contactName,
          phoneRaw: raw,
          normalized,
        });
      }
    }

    return { entries: [...byNormalized.values()], error: null };
  } catch {
    return { entries: [], error: "unavailable" };
  }
}
