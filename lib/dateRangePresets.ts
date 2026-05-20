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

/** Local calendar YYYY-MM-DD from a date-only or ISO datetime string. */
export function isoStringToLocalDayIso(
  raw: string | null | undefined,
): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const dateOnly = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
  if (s.length === 10) return dateOnly;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? toIsoDateLocal(new Date(ms)) : dateOnly;
}

/** Pickup day and created day (for hub presets — match if either falls in range). */
export function tripFilterDayCandidates(trip: {
  pickup_date?: string | null;
  created_at?: string | null;
}): string[] {
  const out: string[] = [];
  const pickup = isoStringToLocalDayIso(trip.pickup_date);
  if (pickup) out.push(pickup);
  const created = isoStringToLocalDayIso(trip.created_at);
  if (created && !out.includes(created)) out.push(created);
  return out;
}

/** Trip sort / filter day: scheduled pickup if set, else created (local calendar). */
export function tripDayIso(trip: {
  pickup_date?: string | null;
  created_at?: string | null;
}): string {
  return tripFilterDayCandidates(trip)[0] ?? "";
}

/** Sort key: noon local on filter day, else created_at instant. */
export function tripSortAnchorMs(trip: {
  pickup_date?: string | null;
  created_at?: string | null;
}): number {
  const day = tripDayIso(trip);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split("-").map(Number);
    const ms = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  const ms = new Date(trip.created_at ?? "").getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function compareTripsByScheduleDesc(
  a: { pickup_date?: string | null; created_at?: string | null },
  b: { pickup_date?: string | null; created_at?: string | null },
): number {
  return tripSortAnchorMs(b) - tripSortAnchorMs(a);
}

export function compareTripsByScheduleAsc(
  a: { pickup_date?: string | null; created_at?: string | null },
  b: { pickup_date?: string | null; created_at?: string | null },
): number {
  return tripSortAnchorMs(a) - tripSortAnchorMs(b);
}

export function indentDayIso(indent: {
  pickup_date?: string | null;
  created_at?: string | null;
}): string {
  const p = isoStringToLocalDayIso(indent.pickup_date);
  if (p) return p;
  return isoStringToLocalDayIso(indent.created_at) ?? "";
}

export type CalendarPeriodFilter =
  | "TODAY"
  | "YESTERDAY"
  | "WEEK"
  | "MONTH"
  | "RANGE"
  | "CUSTOM";

export type TripHubDateFilter =
  | "all"
  | "today"
  | "yesterday"
  | "tomorrow"
  | "this_week"
  | "this_month"
  | "custom";

export type CalendarPeriodFilterOptions = {
  customFrom?: string | null;
  customTo?: string | null;
};

export function dayIsoMatchesPeriod(
  dayIso: string,
  period: CalendarPeriodFilter,
  opts?: CalendarPeriodFilterOptions,
): boolean {
  if (!dayIso || dayIso.length < 10) return period === "RANGE";
  const d = dayIso.slice(0, 10);
  const now = new Date();
  const today = toIsoDateLocal(now);

  if (period === "RANGE") return true;

  if (period === "CUSTOM") {
    const from = (opts?.customFrom ?? "").slice(0, 10);
    const to = (opts?.customTo ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return true;
    }
    return d >= from && d <= to;
  }

  if (period === "TODAY") return d === today;

  if (period === "YESTERDAY") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return d === toIsoDateLocal(y);
  }

  if (period === "WEEK") {
    const s = toIsoDateLocal(startOfIsoWeekMonday(now));
    const e = toIsoDateLocal(endOfIsoWeekMonday(now));
    return d >= s && d <= e;
  }

  if (period === "MONTH") {
    const s = toIsoDateLocal(startOfMonth(now));
    const e = toIsoDateLocal(endOfMonth(now));
    return d >= s && d <= e;
  }

  return true;
}

/** Trips hub date pills — matches pickup or created local day (not started_at). */
export function tripDayMatchesHubDateFilter(
  trip: {
    pickup_date?: string | null;
    created_at?: string | null;
  },
  preset: TripHubDateFilter,
  opts?: CalendarPeriodFilterOptions,
): boolean {
  if (preset === "all") return true;
  const days = tripFilterDayCandidates(trip);
  if (days.length === 0) return false;

  if (preset === "tomorrow") {
    const now = new Date();
    const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrow = toIsoDateLocal(tmr);
    return days.some((d) => d === tomorrow);
  }

  const periodByPreset: Record<
    Exclude<TripHubDateFilter, "all" | "tomorrow">,
    CalendarPeriodFilter
  > = {
    today: "TODAY",
    yesterday: "YESTERDAY",
    this_week: "WEEK",
    this_month: "MONTH",
    custom: "CUSTOM",
  };
  const period = periodByPreset[preset];
  return days.some((d) => dayIsoMatchesPeriod(d, period, opts));
}
