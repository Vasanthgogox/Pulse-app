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

/** Page size for `Contacts.getContactsAsync`. We paginate until exhausted
 *  or we hit `MAX_CONTACTS_HARD_CAP` to keep memory predictable on devices
 *  with very large address books. */
const CONTACTS_PAGE_SIZE = 500;
/** Safety ceiling — keeps us under 10 paged calls on the worst-case
 *  address book (~5k contacts), which is still cheap. */
const MAX_CONTACTS_HARD_CAP = 5000;

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

    // Check current status first — avoids re-triggering the OS dialog on every
    // sync if the user previously made a choice. requestPermissionsAsync() would
    // still return "denied" silently on iOS, but skipping the request when already
    // granted also removes an unnecessary async round-trip.
    let { status } = await Contacts.getPermissionsAsync();
    if (status === "undetermined") {
      ({ status } = await Contacts.requestPermissionsAsync());
    }
    if (status !== "granted") {
      return { entries: [], error: "permission_denied" };
    }

    const fields = [
      Contacts.Fields.PhoneNumbers,
      Contacts.Fields.Name,
      Contacts.Fields.FirstName,
      Contacts.Fields.LastName,
    ];

    /** Walk every page of the address book — `getContactsAsync` returns
     *  at most `pageSize` rows, so we must loop until `hasNextPage` is
     *  false (or we hit the hard cap). The previous implementation only
     *  read the first 200 entries, which silently dropped recommendations
     *  for any contact whose phone lived later in the book. */
    const byNormalized = new Map<string, ContactPhoneEntry>();
    let pageOffset = 0;
    let totalRead = 0;
     
    while (true) {
      const { data, hasNextPage } = await Contacts.getContactsAsync({
        fields,
        pageSize: CONTACTS_PAGE_SIZE,
        pageOffset,
      });
      const rows = data ?? [];
      for (const contact of rows) {
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
      totalRead += rows.length;
      if (!hasNextPage || rows.length === 0 || totalRead >= MAX_CONTACTS_HARD_CAP) {
        break;
      }
      pageOffset += CONTACTS_PAGE_SIZE;
    }

    return { entries: [...byNormalized.values()], error: null };
  } catch {
    return { entries: [], error: "unavailable" };
  }
}
