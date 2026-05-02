/**
 * Indian driving licence (DL) validation — same pattern as Smart Card format:
 * state code (2 letters) + RTO code (2 digits) + year (4 digits) + serial (7 digits),
 * e.g. MH12 20180001234 → MH1220180001234 (15 alphanumeric chars after normalization).
 */

const DL_STRIP = /[\s-]/g;

/** Normalized DL: uppercase A–Z / 0–9 only, no spaces or hyphens. */
export function normalizeIndianDrivingLicense(raw: string): string {
  return (raw ?? "").trim().toUpperCase().replace(DL_STRIP, "");
}

/** Full format after normalization (15 characters). */
export const INDIAN_DL_NORMALIZED_REGEX = /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/;

/**
 * Uppercase; keep A–Z, 0–9, spaces, hyphens for typing; strip other characters.
 */
export function formatIndianDrivingLicenseInput(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9\s-]/g, "").slice(0, 24);
}

/**
 * Non-empty value must match Indian DL format. Empty returns null (use when field is optional until filled).
 */
export function validateIndianDrivingLicenseOptional(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const n = normalizeIndianDrivingLicense(trimmed);
  if (INDIAN_DL_NORMALIZED_REGEX.test(n)) return null;
  return "Enter a valid DL number (e.g. MH12 20180001234).";
}

/**
 * Required DL field: empty or invalid returns an error message.
 */
export function validateIndianDrivingLicenseRequired(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "Enter the driving licence number.";
  return validateIndianDrivingLicenseOptional(trimmed);
}
