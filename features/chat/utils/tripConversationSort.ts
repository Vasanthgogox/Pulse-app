const TERMINAL_TRIP_STATUSES = new Set(["completed", "delivered", "done", "cancelled"]);

export function isTerminalTripStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return TERMINAL_TRIP_STATUSES.has(normalized);
}

export function parseTripIdSortKey(label: string): number {
  const normalized = String(label ?? "").trim();
  if (!normalized) return 0;

  const trailingDigits = normalized.match(/(\d+)(?!.*\d)/);
  if (!trailingDigits) return 0;

  const value = Number.parseInt(trailingDigits[1], 10);
  return Number.isFinite(value) ? value : 0;
}
