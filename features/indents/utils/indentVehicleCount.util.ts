/** Authoritative vehicle-count range for Create Indent Share copies. */
export const INDENT_VEHICLE_COUNT_MIN = 1;
export const INDENT_VEHICLE_COUNT_MAX = 50;

export const INDENT_VEHICLE_COUNT_CHIPS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;

export const INDENT_VEHICLE_COUNT_ERROR = `Enter a whole number of vehicles from ${INDENT_VEHICLE_COUNT_MIN} to ${INDENT_VEHICLE_COUNT_MAX}.`;

/**
 * Parse a vehicle-count field. Only a whole digit string is accepted
 * (`1.5`, `-1`, letters, and empty are invalid). Range is checked separately.
 */
export function parseIndentVehicleCount(
  raw: string | undefined,
): number | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return null;
  return n;
}

export function isValidIndentVehicleCount(raw: string | undefined): boolean {
  const n = parseIndentVehicleCount(raw);
  return (
    n != null &&
    n >= INDENT_VEHICLE_COUNT_MIN &&
    n <= INDENT_VEHICLE_COUNT_MAX
  );
}

/**
 * Strip letters and other junk. Keep digits, `.`, and `-` so decimals,
 * negatives, and empty values stay invalid instead of being coerced.
 */
export function sanitizeIndentVehicleCountInput(raw: string): string {
  return String(raw ?? "").replace(/[^\d.\-]/g, "");
}

/** Restore a saved draft vehicle count, or `"1"` if the stored value is invalid. */
export function resolvedDraftVehicleCount(stored: string | null | undefined): string {
  const v = String(stored ?? "").trim();
  return isValidIndentVehicleCount(v) ? v : "1";
}

/**
 * Multiple shared copies have no single indent detail page to land on — send
 * the user to Trips → Indents (own-org indent list) instead of Loads, which
 * no longer shows "My Load" (Slice 1, Trips IA). Same deep-link mechanism
 * TripsScreen already reads for the Indents sub-view (`?view=indents`).
 */
export function indentShareSuccessPath(
  requestedCount: number,
  firstIndentId: string,
): "/(tabs)/trips?view=indents" | `/indent/${string}` {
  if (requestedCount > 1) return "/(tabs)/trips?view=indents";
  return `/indent/${firstIndentId}`;
}

export function draftVehicleCountStorageKey(indentId: string): string {
  return `indent_vehicle_count_${indentId}`;
}
