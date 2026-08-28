/**
 * Letter + space entry for tracking names (driver name keypad).
 * Auto title-cases each word; collapses duplicate spaces.
 */

export const PERSON_NAME_MAX_LENGTH = 40;

export function appendPersonNameKey(value: string, key: string): string {
  if (key === "⌫") {
    return value.slice(0, -1);
  }

  if (key === " ") {
    // Allow a single separating space between words; ignore leading / duplicate taps.
    if (!value.length || value.endsWith(" ")) return value;
    if (value.length >= PERSON_NAME_MAX_LENGTH) return value;
    return `${value} `;
  }

  if (!/^[A-Za-z]$/.test(key)) return value;
  if (value.length >= PERSON_NAME_MAX_LENGTH) return value;

  const atWordStart = value.length === 0 || value.endsWith(" ");
  const next = atWordStart ? key.toUpperCase() : key.toLowerCase();
  return `${value}${next}`;
}

export function normalizePersonNameDisplay(value: string): string {
  return value.replace(/\s+/g, " ").trimStart();
}
