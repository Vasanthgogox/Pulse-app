/**
 * Shared date-window helpers for Treasury pills, trip lists, and load board.
 * Uses local calendar day boundaries (YYYY-MM-DD).
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoDateLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Monday-start week containing `ref`. */
export function startOfIsoWeekMonday(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function endOfIsoWeekMonday(ref: Date): Date {
  const s = startOfIsoWeekMonday(ref);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return e;
}

export function startOfMonth(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth(), 1);
}

export function endOfMonth(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
}

/** Trip sort / filter day: pickup date if valid YYYY-MM-DD, else created_at. */
export function tripDayIso(trip: {
  pickup_date?: string | null;
  created_at?: string | null;
}): string {
  const p = (trip.pickup_date ?? "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  return (trip.created_at ?? "").trim().slice(0, 10);
}

export function indentDayIso(indent: {
  pickup_date?: string | null;
  created_at?: string | null;
}): string {
  const p = (indent.pickup_date ?? "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  return (indent.created_at ?? "").trim().slice(0, 10);
}
