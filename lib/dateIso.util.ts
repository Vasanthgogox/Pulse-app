/** Local calendar date as YYYY-MM-DD (no timezone shift for date-only fields). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getTodayIso(): string {
  return toISODate(new Date());
}

export function getTomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}

export function getDayAfterTomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return toISODate(d);
}

export function isValidIsoDateString(iso: string): boolean {
  const trimmed = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const d = new Date(`${trimmed}T12:00:00`);
  return !Number.isNaN(d.getTime());
}

export function formatIsoDateForDisplay(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
