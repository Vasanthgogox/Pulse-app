/** Display phone on network cards — hide linked-org placeholders and raw UUIDs. */
export function formatPartyContactPhone(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  if (!s) return "NA";
  if (/^linked-/i.test(s)) return "NA";
  if (s.toLowerCase().includes("linked-")) return "NA";
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
  ) {
    return "NA";
  }
  return s;
}

/**
 * Mask a GSTIN for cross-org public profile display: keep the 2-digit state code
 * and the last 3 characters, mask the middle (e.g. 29ABCDE1256F1Z6 -> 29XXXXXXXX1Z6).
 * Owner-facing edit surfaces render the full value and must not use this.
 */
export function maskGstin(value: string | null | undefined): string | null {
  const s = (value ?? "").trim();
  if (!s) return null;
  if (s.length <= 5) return s;
  const head = s.slice(0, 2);
  const tail = s.slice(-3);
  return `${head}${"X".repeat(s.length - 5)}${tail}`;
}
