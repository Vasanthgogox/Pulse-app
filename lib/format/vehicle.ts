/**
 * Indian vehicle registration format: XX NN LL NNNN (state 2 letters, district 2 digits, series 2 letters, number 1–4 digits).
 */
const INDIAN_VEHICLE_PARTIAL = /^([A-Z]{2})([0-9]{0,2})([A-Z]{0,2})([0-9]{0,4})$/;

/** Normalize vehicle number for matching (alphanumeric, uppercase, no spaces). Use when comparing trip.vehicle_display_number to vehicle.vehicle_number. */
export function normalizeVehicleNumberForMatch(s: string | null | undefined): string {
  return (s ?? '').replace(/\s/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function normalizeRawVehicleInput(s: string): string {
  return normalizeVehicleNumberForMatch(s);
}

/**
 * Format for display: e.g. "TN25CM7892" or "TN 25 CM 7892" → "TN 25 CM 7892".
 * Non-Indian values (e.g. "TRK-SEED-001") are returned trimmed, unchanged.
 */
export function formatIndianVehicleNumber(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const normalized = normalizeRawVehicleInput(trimmed);
  if (!normalized) return trimmed;
  const m = normalized.match(INDIAN_VEHICLE_PARTIAL);
  if (!m) return trimmed;
  const parts = [m[1], m[2], m[3], m[4]].filter(Boolean);
  return parts.join(' ');
}

/**
 * Format as user types in vehicle number input. Applies Indian spacing when pattern matches; otherwise uppercase + trim.
 * Use in onChangeText so pasted "tn25cm7892" or "TN 25 CM 7892" and typing both show "TN 25 CM 7892".
 */
export function formatIndianVehicleNumberInput(next: string): string {
  const normalized = normalizeRawVehicleInput(next);
  if (!normalized) return '';
  const m = normalized.match(INDIAN_VEHICLE_PARTIAL);
  if (!m) return normalized;
  const parts = [m[1], m[2], m[3], m[4]].filter(Boolean);
  return parts.join(' ');
}
