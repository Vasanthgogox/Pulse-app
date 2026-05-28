import type { TripRow } from "@/features/trips/services/trips.service";
import type { PulseComplianceState, PulseDataset, PulseFilterState } from "../types";
import { applyPulseFilters } from "./pulseSelectors";

export type ContributionSlice = {
  key: string;
  label: string;
  revenue: number;
  margin: number;
  trips: number;
  sharePct: number;
};

export type PulseContributionBundle = {
  complianceStates: ContributionSlice[];
};

const MAX_SLICES = 8;

type FilterKey = keyof PulseFilterState;

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function tripRevenue(trip: TripRow): number {
  return Math.max(0, toNumber(trip.client_price));
}

function tripMargin(trip: TripRow): number {
  return tripRevenue(trip) - Math.max(0, toNumber(trip.supplier_rate));
}

function filtersExcluding(filters: PulseFilterState, keys: FilterKey[]): PulseFilterState {
  const next: PulseFilterState = { ...filters, dateRange: { ...filters.dateRange } };
  for (const key of keys) {
    if (key === "dateRange") {
      next.dateRange = { start: null, end: null };
    } else {
      next[key] = [];
    }
  }
  return next;
}

function truncateLabel(label: string, max = 22): string {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function bucketTrips(
  trips: TripRow[],
  keyForTrip: (trip: TripRow) => string | null,
  labelForKey: (key: string) => string,
): Map<string, { label: string; revenue: number; margin: number; trips: number }> {
  const buckets = new Map<string, { label: string; revenue: number; margin: number; trips: number }>();
  for (const trip of trips) {
    const key = keyForTrip(trip);
    if (!key) continue;
    const row = buckets.get(key) ?? { label: labelForKey(key), revenue: 0, margin: 0, trips: 0 };
    row.revenue += tripRevenue(trip);
    row.margin += tripMargin(trip);
    row.trips += 1;
    buckets.set(key, row);
  }
  return buckets;
}

function toSlices(
  buckets: Map<string, { label: string; revenue: number; margin: number; trips: number }>,
): ContributionSlice[] {
  const rows = Array.from(buckets.entries()).map(([key, row]) => ({ key, ...row }));
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  return rows
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, MAX_SLICES)
    .map((row) => ({
      key: row.key,
      label: truncateLabel(row.label),
      revenue: Number(row.revenue.toFixed(2)),
      margin: Number(row.margin.toFixed(2)),
      trips: row.trips,
      sharePct: totalRevenue > 0 ? Number(((row.revenue / totalRevenue) * 100).toFixed(1)) : 0,
    }));
}

function getDocumentExpiryStatuses(documents: unknown): PulseComplianceState[] {
  const list: PulseComplianceState[] = [];
  if (!documents || typeof documents !== "object") return ["missing"];
  const now = Date.now();
  for (const value of Object.values(documents as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const expiryDate = String((value as { expiryDate?: string }).expiryDate ?? "").trim();
    if (!expiryDate) {
      list.push("missing");
      continue;
    }
    const expiryTs = new Date(expiryDate).getTime();
    if (!Number.isFinite(expiryTs)) {
      list.push("missing");
      continue;
    }
    const daysLeft = Math.floor((expiryTs - now) / 86400000);
    if (daysLeft < 0) list.push("critical");
    else if (daysLeft <= 30) list.push("expiring_soon");
    else list.push("healthy");
  }
  return list.length > 0 ? list : ["missing"];
}

function collapseCompliance(states: PulseComplianceState[]): PulseComplianceState {
  if (states.includes("critical")) return "critical";
  if (states.includes("missing")) return "missing";
  if (states.includes("expiring_soon")) return "expiring_soon";
  return "healthy";
}

function complianceLabel(state: PulseComplianceState): string {
  if (state === "healthy") return "Compliance healthy";
  if (state === "critical") return "Compliance critical";
  if (state === "expiring_soon") return "Compliance expiring";
  if (state === "missing") return "Compliance missing";
  return state;
}

function scopedExcluding(dataset: PulseDataset, filters: PulseFilterState, exclude: FilterKey[]) {
  return applyPulseFilters(dataset, filtersExcluding(filters, exclude));
}

function inDateRange(value: string | null | undefined, start: string | null, end: string | null): boolean {
  if (!value) return true;
  const day = value.slice(0, 10);
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

export type TimePresetKey = "today" | "week" | "month" | "last_month" | "quarter" | "year" | "all";

export function selectTimePresetContributions(
  dataset: PulseDataset,
  filters: PulseFilterState,
  presets: Array<{ key: TimePresetKey; label: string; start: string | null; end: string | null }>,
): ContributionSlice[] {
  const base = scopedExcluding(dataset, filters, ["dateRange"]);
  const buckets = presets.map((preset) => {
    let revenue = 0;
    let margin = 0;
    let trips = 0;
    for (const trip of base.trips) {
      if (!inDateRange(trip.pickup_date ?? trip.created_at ?? null, preset.start, preset.end)) continue;
      revenue += tripRevenue(trip);
      margin += tripMargin(trip);
      trips += 1;
    }
    return {
      key: preset.key,
      label: preset.label,
      revenue: Number(revenue.toFixed(2)),
      margin: Number(margin.toFixed(2)),
      trips,
    };
  });
  const totalRevenue = buckets.reduce((sum, row) => sum + row.revenue, 0);
  return buckets.map((row) => ({
    ...row,
    sharePct: totalRevenue > 0 ? Number(((row.revenue / totalRevenue) * 100).toFixed(1)) : 0,
  }));
}

export function selectPulseFilterContributions(
  dataset: PulseDataset,
  filters: PulseFilterState,
): PulseContributionBundle {
  const complianceScoped = scopedExcluding(dataset, filters, ["complianceStates"]);
  const vehicleCompliance = new Map(
    complianceScoped.vehicles.map((vehicle) => [
      vehicle.id,
      collapseCompliance(getDocumentExpiryStatuses(vehicle.documents)),
    ]),
  );
  const complianceBuckets = bucketTrips(
    complianceScoped.trips,
    (trip) => vehicleCompliance.get(String(trip.vehicle_id ?? "")) ?? "healthy",
    (key) => complianceLabel(key as PulseComplianceState),
  );
  const complianceStates = toSlices(complianceBuckets);

  return { complianceStates };
}
