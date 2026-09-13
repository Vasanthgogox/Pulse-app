/** Parse a rupee asking rate. Commas allowed. Sales invoice totals must never be used as a fallback. */
export function parseSupplierTargetInr(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}
