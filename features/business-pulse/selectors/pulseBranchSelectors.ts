import type { TripRow } from "@/features/trips/services/trips.service";
import type { PulseDataset, PulseFilterState } from "../types";
import { applyPulseFilters } from "./pulseSelectors";

export type BranchCitySlice = {
  key: string;
  label: string;
  revenue: number;
  margin: number;
  trips: number;
  sharePct: number;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function branchKey(trip: TripRow): string | null {
  const branch = String(trip.pickup_area ?? "").split(",")[0]?.trim();
  return branch || null;
}

export function selectBranchCitySlicesFromTrips(
  trips: TripRow[],
  limit = 8,
): BranchCitySlice[] {
  const buckets = new Map<string, { revenue: number; margin: number; trips: number }>();

  for (const trip of trips) {
    const key = branchKey(trip);
    if (!key) continue;
    const row = buckets.get(key) ?? { revenue: 0, margin: 0, trips: 0 };
    const revenue = Math.max(0, toNumber(trip.client_price));
    const cost = Math.max(0, toNumber(trip.supplier_rate));
    row.revenue += revenue;
    row.margin += revenue - cost;
    row.trips += 1;
    buckets.set(key, row);
  }

  const totalRevenue = Array.from(buckets.values()).reduce((sum, row) => sum + row.revenue, 0);

  return Array.from(buckets.entries())
    .map(([key, row]) => ({
      key,
      label: key.length > 22 ? `${key.slice(0, 21)}…` : key,
      revenue: Number(row.revenue.toFixed(2)),
      margin: Number(row.margin.toFixed(2)),
      trips: row.trips,
      sharePct: totalRevenue > 0 ? Number(((row.revenue / totalRevenue) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/** Branch / city concentration for in-tab widgets (not a global filter dimension). */
export function selectBranchCitySlices(
  dataset: PulseDataset,
  filters: PulseFilterState,
  limit = 8,
): BranchCitySlice[] {
  const scoped = applyPulseFilters(dataset, filters);
  return selectBranchCitySlicesFromTrips(scoped.trips, limit);
}
