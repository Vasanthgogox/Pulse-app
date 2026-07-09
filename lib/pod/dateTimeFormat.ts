import { format, parseISO, isValid, parse, differenceInMinutes } from 'date-fns';

/**
 * Format an ISO date/time string for display (e.g. "2026-02-03T22:00" → "3 Feb 2026, 10:00 PM").
 * Handles date-only (YYYY-MM-DD) and datetime (YYYY-MM-DDTHH:mm, with or without seconds/Z).
 * Returns the original value as string if it's not a parseable date.
 */
export function formatDateTimeDisplay(value: unknown): string {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  if (!s) return '';
  try {
    // ISO with time (e.g. 2026-02-03T22:00 or 2026-02-03T22:00:00)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      const d = parseISO(s.slice(0, 16));
      if (isValid(d)) return format(d, 'd MMM yyyy, h:mm a');
      const d2 = parseISO(s.slice(0, 19));
      if (isValid(d2)) return format(d2, 'd MMM yyyy, h:mm a');
    }
    // Date only (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = parseISO(s);
      if (isValid(d)) return format(d, 'd MMM yyyy');
    }
  } catch {
    // fall through to return raw
  }
  return s;
}

/**
 * Parse a user-friendly or ISO date/time string back to ISO (YYYY-MM-DD or YYYY-MM-DDTHH:mm).
 * Used when the user edits a date/time field so we store ISO in the extraction.
 */
export function parseDateTimeDisplay(input: string): string | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  try {
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      const d = parseISO(s.slice(0, 16));
      if (isValid(d)) return format(d, "yyyy-MM-dd'T'HH:mm");
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = parseISO(s);
      if (isValid(d)) return format(d, 'yyyy-MM-dd');
    }
    // Try common display format: "3 Feb 2026, 10:00 PM"
    const d = parse(s, 'd MMM yyyy, h:mm a', new Date());
    if (isValid(d)) return format(d, "yyyy-MM-dd'T'HH:mm");
    const dDateOnly = parse(s, 'd MMM yyyy', new Date());
    if (isValid(dDateOnly)) return format(dDateOnly, 'yyyy-MM-dd');
  } catch {
    // ignore
  }
  return null;
}

/** Keys that hold date or datetime values (for display formatting). */
export const HEADER_DATE_TIME_KEYS = new Set([
  'date',
  'arrival_date_time',
  'unload_start_date_time',
  'unload_end_date_time',
  'release_date_time',
]);

export const INSPECTION_DATE_TIME_KEYS = new Set(['actual_vs_standard_time']);

export function isHeaderDateTimeKey(key: string): boolean {
  return HEADER_DATE_TIME_KEYS.has(key);
}

/** Header keys that are date-only (no time); use type="date" picker. */
export const HEADER_DATE_ONLY_KEYS = new Set(['date']);

export function isHeaderDateOnlyKey(key: string): boolean {
  return HEADER_DATE_ONLY_KEYS.has(key);
}

export function isInspectionDateTimeKey(key: string): boolean {
  return INSPECTION_DATE_TIME_KEYS.has(key);
}

/** Parse ISO date/time string to Date; returns null if invalid. */
function parseISODateTime(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      const d = parseISO(s.slice(0, 16));
      return isValid(d) ? d : null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = parseISO(s);
      return isValid(d) ? d : null;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Format a duration in minutes as user-friendly text (e.g. "10h 0m" or "2h 30m").
 */
export function formatDurationMinutes(totalMinutes: number): string {
  if (totalMinutes < 0) return '';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Format duration with days when >= 24h (e.g. "1d 6h 20m"). Useful for in-transit.
 */
export function formatDurationWithDays(totalMinutes: number): string {
  if (totalMinutes < 0) return '';
  const days = Math.floor(totalMinutes / (24 * 60));
  const remainder = totalMinutes % (24 * 60);
  const hours = Math.floor(remainder / 60);
  const minutes = remainder % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

/** Shared implementation: diff two header timestamp fields and format the duration. */
function headerDuration(
  startRaw: unknown,
  endRaw: unknown,
  formatter: (minutes: number) => string,
): string | null {
  const start = parseISODateTime(startRaw);
  const end = parseISODateTime(endRaw);
  if (!start || !end) return null;
  const minutes = differenceInMinutes(end, start);
  if (minutes < 0) return null;
  return formatter(minutes);
}

/**
 * Compute unloading duration from header (unload_end - unload_start).
 * Returns formatted string like "10h 0m" or null if either time is missing.
 */
export function getUnloadingDuration(header: { unload_start_date_time?: { value?: unknown }; unload_end_date_time?: { value?: unknown } } | undefined): string | null {
  if (!header) return null;
  return headerDuration(header.unload_start_date_time?.value, header.unload_end_date_time?.value, formatDurationMinutes);
}

/**
 * Loading duration: Loading In Time → Loading Out Time (arrival_date_time → release_date_time).
 */
export function getLoadingDuration(header: { arrival_date_time?: { value?: unknown }; release_date_time?: { value?: unknown } } | undefined): string | null {
  if (!header) return null;
  return headerDuration(header.arrival_date_time?.value, header.release_date_time?.value, formatDurationMinutes);
}

/**
 * In-transit duration: Loading Out Time → Unloading In Time (release_date_time → unload_start_date_time).
 * Uses days when >= 24h (e.g. "1d 6h 20m").
 */
export function getInTransitDuration(header: { release_date_time?: { value?: unknown }; unload_start_date_time?: { value?: unknown } } | undefined): string | null {
  if (!header) return null;
  return headerDuration(header.release_date_time?.value, header.unload_start_date_time?.value, formatDurationWithDays);
}

/**
 * Compute time from arrival to unload end (arrival_date_time → unload_end_date_time).
 * Returns formatted string like "9h 40m" or null if either time is missing.
 */
export function getArrivalToUnloadEndDuration(header: { arrival_date_time?: { value?: unknown }; unload_end_date_time?: { value?: unknown } } | undefined): string | null {
  if (!header) return null;
  return headerDuration(header.arrival_date_time?.value, header.unload_end_date_time?.value, formatDurationWithDays);
}

/** Return ISO string in YYYY-MM-DDTHH:mm form for datetime-local input, or YYYY-MM-DD for date-only. */
export function toInputValue(isoOrDate: unknown, hasTime: boolean): string {
  if (isoOrDate == null || isoOrDate === '') return '';
  const s = String(isoOrDate).trim();
  if (!s) return '';
  const d = parseISODateTime(isoOrDate);
  if (!d) return s;
  return hasTime ? format(d, "yyyy-MM-dd'T'HH:mm") : format(d, 'yyyy-MM-dd');
}

/** Toggle AM/PM on an ISO datetime string; returns new ISO string. */
export function toggleAmPm(isoDateTime: string): string | null {
  const d = parseISODateTime(isoDateTime);
  if (!d) return null;
  const hours = d.getHours();
  const newHours = hours >= 12 ? hours - 12 : hours + 12;
  d.setHours(newHours);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}
