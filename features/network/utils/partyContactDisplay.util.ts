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
