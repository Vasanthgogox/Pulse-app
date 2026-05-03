import { isBlankOrPlaceholderPartyName } from "@/lib/partyAvatarDisplay";

const GENERIC_CHAT_PARTY = new Set([
  "client",
  "supplier",
  "driver",
  "unassigned",
  "not assigned",
  "not_assigned",
  "not assigned.",
  "no driver",
  "nodriver",
  "n/a",
  "na",
  "none",
  "party",
  "misc / unlinked",
]);

/** True when chat should not show a party name line (placeholders, unassigned, etc.). */
export function shouldHideChatPartyName(name: string | null | undefined): boolean {
  const t = String(name ?? "").trim();
  if (!t) return true;
  if (isBlankOrPlaceholderPartyName(t)) return true;
  const lower = t.toLowerCase();
  if (GENERIC_CHAT_PARTY.has(lower)) return true;
  if (lower.startsWith("unassigned")) return true;
  if (lower.includes("not assigned")) return true;
  return false;
}

/**
 * Uppercase party line for chat (transaction-style casing), or `null` when the row should be omitted.
 */
export function formatChatPartyName(name: string | null | undefined): string | null {
  if (shouldHideChatPartyName(name)) return null;
  return String(name).trim().toUpperCase();
}
