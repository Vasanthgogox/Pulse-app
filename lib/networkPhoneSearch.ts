import { normalizePhoneForInviteeLookup } from "@/lib/phoneLookup";

export const NETWORK_PHONE_SEARCH_MIN_DIGITS = 8;
export const NETWORK_PHONE_SEARCH_DEBOUNCE_MS = 400;

/** True when the query is primarily a phone number (not an org name search). */
export function isPhoneLikeNetworkSearch(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < NETWORK_PHONE_SEARCH_MIN_DIGITS) return false;
  const letterCount = (trimmed.match(/[a-zA-Z]/g) ?? []).length;
  return letterCount === 0 || digits.length >= letterCount * 2;
}

/** Discover org list search term — skip name discovery while user is typing a phone. */
export function discoverSearchTermForOrgs(query: string): string {
  return isPhoneLikeNetworkSearch(query) ? "" : query.trim();
}

export function normalizedDigitsForNetworkSearch(query: string): string {
  return normalizePhoneForInviteeLookup(query);
}
