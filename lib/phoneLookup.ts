/**
 * Phone normalization helpers used for invitee lookup.
 *
 * Important: this must match the normalization used by backend RPCs
 * (`get_invitee_by_phone` / `get_invitees_by_phones`) so lookups are consistent.
 */
export function normalizePhoneForInviteeLookup(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("91")) return digits.slice(-10);
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export function uniqueNormalizedPhonesForLookup(
  phones: Array<string | null | undefined>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of phones) {
    const norm = normalizePhoneForInviteeLookup(String(p ?? ""));
    if (!norm) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

/**
 * Format a phone for UI display (best-effort).
 * - Keeps existing +E.164 intact
 * - For 10-digit Indian numbers, prefixes +91
 * - For 12-digit numbers starting with 91, prefixes +
 */
export function formatPhoneForDisplay(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("+")) return s;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return s;
}

