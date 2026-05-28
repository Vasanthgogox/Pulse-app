/**
 * Period-over-period compare for Business Pulse (MoM / QoQ / YoY).
 */
export type ComparePreset = "none" | "mom" | "qoq" | "yoy";

export type TimePreset =
  | "today"
  | "week"
  | "month"
  | "last_month"
  | "quarter"
  | "year"
  | "all";

/** Side-scroll date window tabs for Business Pulse. */
export const PULSE_DATE_RANGE_TABS: ReadonlyArray<{ key: TimePreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
  { key: "all", label: "All time" },
];

export type PulseDateRange = {
  start: string | null;
  end: string | null;
};

export function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getPresetDateRange(preset: TimePreset): PulseDateRange {
  if (preset === "all") return { start: null, end: null };
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  if (preset === "today") return { start: toYmd(start), end: toYmd(end) };
  if (preset === "week") {
    start.setDate(now.getDate() - 6);
    return { start: toYmd(start), end: toYmd(end) };
  }
  if (preset === "month") {
    start.setDate(1);
    return { start: toYmd(start), end: toYmd(end) };
  }
  if (preset === "last_month") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: toYmd(s), end: toYmd(e) };
  }
  if (preset === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const s = new Date(now.getFullYear(), quarterStartMonth, 1);
    return { start: toYmd(s), end: toYmd(end) };
  }
  const s = new Date(now.getFullYear(), 0, 1);
  return { start: toYmd(s), end: toYmd(end) };
}

/** Resolved window used for metrics (explicit range wins, else time preset). */
export function getEffectiveDateRange(
  timePreset: TimePreset,
  dateRange: PulseDateRange,
  compare: ComparePreset = "none",
): PulseDateRange | null {
  const fromPreset = getPresetDateRange(timePreset);
  const start = dateRange.start ?? fromPreset.start;
  const end = dateRange.end ?? fromPreset.end;
  if (start && end) return { start, end };

  if (timePreset === "all") {
    const now = new Date();
    const endYmd = toYmd(now);
    if (compare && compare !== "none") {
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 29);
      return { start: toYmd(startDate), end: endYmd };
    }
    return null;
  }
  return null;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysInclusive(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86400000)) + 1;
}

/** Prior period aligned to MoM / QoQ / YoY for the effective current range. */
export function getCompareDateRange(
  effective: PulseDateRange | null,
  compare: ComparePreset,
): PulseDateRange | null {
  if (compare === "none" || !effective?.start || !effective?.end) return null;

  const start = new Date(effective.start);
  const end = new Date(effective.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;

  if (compare === "yoy") {
    const s = new Date(start);
    const e = new Date(end);
    s.setFullYear(s.getFullYear() - 1);
    e.setFullYear(e.getFullYear() - 1);
    return { start: toYmd(s), end: toYmd(e) };
  }

  if (compare === "qoq") {
    const s = addMonths(start, -3);
    const e = addMonths(end, -3);
    return { start: toYmd(s), end: toYmd(e) };
  }

  // MoM: immediately preceding window of equal length
  const spanDays = daysInclusive(start, end);
  const compareEnd = new Date(start);
  compareEnd.setDate(compareEnd.getDate() - 1);
  const compareStart = new Date(compareEnd);
  compareStart.setDate(compareStart.getDate() - (spanDays - 1));
  return { start: toYmd(compareStart), end: toYmd(compareEnd) };
}

export function formatRangeLabel(range: PulseDateRange | null): string {
  if (!range?.start || !range?.end) return "All time";
  if (range.start === range.end) return range.start;
  return `${range.start} → ${range.end}`;
}

export function formatCompareCaption(
  compare: ComparePreset,
  current: PulseDateRange | null,
  prior: PulseDateRange | null,
): string {
  if (compare === "none") return "Live scope (no comparison)";
  const label =
    compare === "mom" ? "MoM" : compare === "qoq" ? "QoQ" : "YoY";
  if (!current?.start || !prior?.start) {
    return `${label} · select a bounded time period to compare`;
  }
  return `${label} · ${formatRangeLabel(current)} vs ${formatRangeLabel(prior)}`;
}

export function computePeriodDeltaPct(nowValue: number, priorValue: number): number {
  if (priorValue === 0) return nowValue === 0 ? 0 : 100;
  return Number((((nowValue - priorValue) / Math.abs(priorValue)) * 100).toFixed(2));
}