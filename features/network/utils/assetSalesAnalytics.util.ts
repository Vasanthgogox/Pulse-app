import {
  computeVehiclePerformanceScore,
  deriveVehicleBadges,
  type ScoreLevel,
  type VehicleScoreTripInput,
} from "@/features/analytics";
import {
  filterActiveFleetRelationshipDrivers,
  type DriverRow,
} from "@/features/drivers/services/drivers.service";
import { isAssetExecutionTrip } from "@/features/trips/domain/tripExecutionModel";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import {
  getMonthKeys,
  getTripDestination,
  getTripLane,
  getTripOrigin,
  monthsForRange,
  paginateRows,
  type SalesBarItem,
  type SalesDateRange,
  type SalesSlice,
  type SalesTrendPoint,
} from "@/features/network/utils/connectionSalesAnalytics.util";

export { paginateRows, type SalesDateRange };

const MS_PER_DAY = 86_400_000;

const LANE_COLORS = [
  "#3E97FF",
  "#50CD89",
  "#F1416C",
  "#7239EA",
  "#FFC700",
  "#009EF7",
  "#47BE7D",
  "#E78B2F",
] as const;

const DRIVER_COLORS = [
  "#3E97FF",
  "#50CD89",
  "#7239EA",
  "#FFC700",
  "#F1416C",
  "#009EF7",
] as const;

const VEHICLE_COLORS = [
  "#009EF7",
  "#47BE7D",
  "#7239EA",
  "#FFC700",
  "#F1416C",
  "#3E97FF",
] as const;

const VEHICLE_BADGE_LABELS: Record<string, string> = {
  top_earner: "Top earner",
  high_risk: "High risk",
  most_utilized: "High util",
  underutilized: "Low util",
  cost_efficient: "Cost efficient",
  expensive: "High cost",
  consistent: "Consistent",
};

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export type AssetDriverStatus = "active" | "idle";

export type AssetFleetStatus = AssetDriverStatus;

export type AssetSalesCrossFilters = {
  lanes: Set<string>;
  drivers: Set<string>;
  vehicles: Set<string>;
  statuses: Set<AssetFleetStatus>;
  monthKey: string | null;
  laneSlice: string | null;
  originSlice: string | null;
  destinationSlice: string | null;
  driverSlice: string | null;
  vehicleSlice: string | null;
  clientSlice: string | null;
  minOnTimePct: number | null;
  minUtilizationPct: number | null;
  search: string;
  onlyWithTrips: boolean;
  dateRange: SalesDateRange;
};

export type AssetDriverTableRow = {
  id: string;
  name: string;
  subtitle: string;
  trips: number;
  revenue: number;
  margin: number;
  earnings: number;
  contributionPct: number;
  revenueContributionPct: number;
  marginContributionPct: number;
  avgMarginPct: number;
  onTimePct: number;
  performanceScore: number;
  topLane: string;
  lastTripLabel: string | null;
  isActive: boolean;
  driver: DriverRow;
};

export type AssetVehicleTableRow = {
  id: string;
  name: string;
  subtitle: string;
  trips: number;
  revenue: number;
  margin: number;
  kmDriven: number;
  revenuePerKm: number;
  utilizationPct: number;
  completionPct: number;
  contributionPct: number;
  revenueContributionPct: number;
  avgMarginPct: number;
  performanceScore: number;
  scoreLevel: ScoreLevel;
  primaryBadge: string | null;
  topLane: string;
  primaryDriver: string | null;
  lastTripLabel: string | null;
  isActive: boolean;
  vehicle: VehicleRow;
  scoreBreakdown: {
    profitability: number;
    utilization: number;
    completion: number;
    costEfficiency: number;
    consistency: number;
  } | null;
};

export type AssetSalesKpis = {
  totalTrips: number;
  totalRevenue: number;
  totalMargin: number;
  totalEarnings: number;
  activeDrivers: number;
  activeVehicles: number;
  fleetOnTimePct: number;
  avgUtilizationPct: number;
  totalKm: number;
  topLane: string | null;
  laneCount: number;
};

type EntityTripStats = {
  trips: number;
  revenue: number;
  margin: number;
  earnings: number;
  onTime: number;
  onTimeEligible: number;
  completed: number;
  kmDriven: number;
  activeDays: Set<string>;
  lastMonth: string | null;
  topLane: string | null;
  laneCounts: Map<string, number>;
  driverCounts: Map<string, number>;
};

type DriverStats = EntityTripStats;
type VehicleStats = EntityTripStats;

function monthLabelShort(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_SHORT[idx] ?? m} '${y.slice(2)}`;
}

function tripMonthKey(trip: TripRow): string | null {
  const raw = trip.pickup_date ?? trip.completed_at ?? trip.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function tripRevenue(trip: TripRow): number {
  const v = Number(trip.client_price);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function tripMargin(trip: TripRow): number {
  const stored = Number(trip.margin);
  if (Number.isFinite(stored)) return stored;
  const client = Number(trip.client_price);
  const supplier = Number(trip.supplier_rate);
  if (!Number.isFinite(client) || !Number.isFinite(supplier)) return 0;
  return client - supplier;
}

function tripEarnings(trip: TripRow): number {
  const v = Number(trip.driver_commission ?? trip.supplier_rate ?? 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function filterAssetTrips(trips: readonly TripRow[]): TripRow[] {
  return trips.filter(isAssetExecutionTrip);
}

function tripInDateRange(trip: TripRow, filters: AssetSalesCrossFilters): boolean {
  const monthKey = tripMonthKey(trip);
  if (!monthKey) return filters.dateRange === "all";
  const keys = getMonthKeys(monthsForRange(filters.dateRange));
  if (!keys.includes(monthKey)) return false;
  if (filters.monthKey && monthKey !== filters.monthKey) return false;
  return true;
}

function tripMatchesLaneFilters(
  trip: TripRow,
  filters: AssetSalesCrossFilters,
  opts?: { ignoreLaneSlice?: boolean; ignoreOrigin?: boolean; ignoreDest?: boolean },
): boolean {
  const lane = getTripLane(trip);
  const origin = getTripOrigin(trip);
  const dest = getTripDestination(trip);
  if (!opts?.ignoreLaneSlice && filters.laneSlice && lane !== filters.laneSlice) {
    return false;
  }
  if (filters.lanes.size > 0 && !filters.lanes.has(lane)) return false;
  if (!opts?.ignoreOrigin && filters.originSlice && origin !== filters.originSlice) {
    return false;
  }
  if (!opts?.ignoreDest && filters.destinationSlice && dest !== filters.destinationSlice) {
    return false;
  }
  if (filters.driverSlice && trip.driver_id !== filters.driverSlice) return false;
  if (filters.vehicleSlice && trip.vehicle_id !== filters.vehicleSlice) return false;
  if (filters.clientSlice && trip.client_id !== filters.clientSlice) return false;
  if (filters.drivers.size > 0 && trip.driver_id && !filters.drivers.has(trip.driver_id)) {
    return false;
  }
  if (filters.vehicles.size > 0 && trip.vehicle_id && !filters.vehicles.has(trip.vehicle_id)) {
    return false;
  }
  return true;
}

function tripDistanceKm(trip: TripRow): number {
  const raw = trip.distance;
  if (raw == null) return 0;
  const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function tripDayKey(trip: TripRow): string | null {
  const raw = trip.pickup_date ?? trip.completed_at ?? trip.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function emptyEntityStats(): EntityTripStats {
  return {
    trips: 0,
    revenue: 0,
    margin: 0,
    earnings: 0,
    onTime: 0,
    onTimeEligible: 0,
    completed: 0,
    kmDriven: 0,
    activeDays: new Set(),
    lastMonth: null,
    topLane: null,
    laneCounts: new Map(),
    driverCounts: new Map(),
  };
}

function periodDayCount(filters: AssetSalesCrossFilters): number {
  return Math.max(1, monthsForRange(filters.dateRange) * 30);
}

function tripToVehicleScoreInput(trip: TripRow): VehicleScoreTripInput {
  return {
    id: trip.id,
    vehicle_id: trip.vehicle_id ?? null,
    client_price: trip.client_price ?? null,
    status: trip.status ?? null,
    distance: tripDistanceKm(trip) || null,
    pickup_date: trip.pickup_date ?? null,
    created_at: trip.created_at ?? null,
  };
}

function accumulateTripStats(
  prev: EntityTripStats,
  trip: TripRow,
): EntityTripStats {
  const monthKey = tripMonthKey(trip);
  const dayKey = tripDayKey(trip);
  const lane = getTripLane(trip);
  const laneCounts = new Map(prev.laneCounts);
  laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1);
  const topLane =
    [...laneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const driverCounts = new Map(prev.driverCounts);
  if (trip.driver_id) {
    driverCounts.set(trip.driver_id, (driverCounts.get(trip.driver_id) ?? 0) + 1);
  }

  const activeDays = new Set(prev.activeDays);
  if (dayKey) activeDays.add(dayKey);

  let onTime = prev.onTime;
  let onTimeEligible = prev.onTimeEligible;
  if (trip.completed_at && trip.pickup_date) {
    onTimeEligible += 1;
    const completed = new Date(trip.completed_at);
    const pickup = new Date(trip.pickup_date);
    if (
      Number.isFinite(completed.getTime()) &&
      Number.isFinite(pickup.getTime()) &&
      completed <= new Date(pickup.getTime() + MS_PER_DAY)
    ) {
      onTime += 1;
    }
  }

  let completed = prev.completed;
  if (trip.status === "completed") completed += 1;

  return {
    trips: prev.trips + 1,
    revenue: prev.revenue + tripRevenue(trip),
    margin: prev.margin + tripMargin(trip),
    earnings: prev.earnings + tripEarnings(trip),
    onTime,
    onTimeEligible,
    completed,
    kmDriven: prev.kmDriven + tripDistanceKm(trip),
    activeDays,
    lastMonth:
      monthKey && (!prev.lastMonth || monthKey > prev.lastMonth)
        ? monthKey
        : prev.lastMonth,
    topLane,
    laneCounts,
    driverCounts,
  };
}

function qualifyingAssetTrips(
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
  opts?: { ignoreLaneSlice?: boolean; ignoreOrigin?: boolean; ignoreDest?: boolean },
): TripRow[] {
  const out: TripRow[] = [];
  for (const trip of filterAssetTrips(trips)) {
    if (!tripInDateRange(trip, filters)) continue;
    if (!tripMatchesLaneFilters(trip, filters, opts)) continue;
    out.push(trip);
  }
  return out;
}

export function fleetVehiclesBase(vehicles: readonly VehicleRow[]): VehicleRow[] {
  return vehicles.filter((v) => v.type === "owned");
}

function driverTripStats(
  drivers: readonly DriverRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): Map<string, DriverStats> {
  const allowed = new Set(
    filterActiveFleetRelationshipDrivers(drivers as DriverRow[]).map((d) => d.id),
  );
  const map = new Map<string, DriverStats>();

  for (const trip of qualifyingAssetTrips(trips, filters)) {
    const driverId = trip.driver_id;
    if (!driverId || !allowed.has(driverId)) continue;

    const prev = map.get(driverId) ?? emptyEntityStats();
    map.set(driverId, accumulateTripStats(prev, trip));
  }
  return map;
}

function vehicleTripStats(
  vehicles: readonly VehicleRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): Map<string, VehicleStats> {
  const allowed = new Set(fleetVehiclesBase(vehicles).map((v) => v.id));
  const map = new Map<string, VehicleStats>();

  for (const trip of qualifyingAssetTrips(trips, filters)) {
    const vehicleId = trip.vehicle_id;
    if (!vehicleId || !allowed.has(vehicleId)) continue;
    const prev = map.get(vehicleId) ?? emptyEntityStats();
    map.set(vehicleId, accumulateTripStats(prev, trip));
  }
  return map;
}

function computePerformanceScore(stat: DriverStats): number {
  const onTimePct =
    stat.onTimeEligible > 0
      ? Math.round((stat.onTime / stat.onTimeEligible) * 100)
      : 0;
  const marginPct =
    stat.revenue > 0 ? Math.round((stat.margin / stat.revenue) * 100) : 0;
  const tripScore = Math.min(100, Math.round((stat.trips / 20) * 100));
  const onTimeScore = onTimePct;
  const marginScore = Math.min(100, Math.round((Math.max(0, marginPct) / 25) * 100));
  return Math.round(onTimeScore * 0.45 + marginScore * 0.35 + tripScore * 0.2);
}

function passesDriverFilters(
  driver: DriverRow,
  filters: AssetSalesCrossFilters,
  stat?: DriverStats,
): boolean {
  if (filters.driverSlice && driver.id !== filters.driverSlice) return false;
  if (filters.drivers.size > 0 && !filters.drivers.has(driver.id)) return false;
  if (filters.onlyWithTrips && (stat?.trips ?? 0) <= 0) return false;
  if (filters.statuses.size > 0) {
    const active = (stat?.trips ?? 0) > 0;
    const status: AssetDriverStatus = active ? "active" : "idle";
    if (!filters.statuses.has(status)) return false;
  }
  if (filters.minOnTimePct != null && stat) {
    const onTimePct =
      stat.onTimeEligible > 0
        ? Math.round((stat.onTime / stat.onTimeEligible) * 100)
        : 0;
    if (onTimePct < filters.minOnTimePct) return false;
  }
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    if (!driver.name.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function fleetDriversBase(drivers: readonly DriverRow[]): DriverRow[] {
  // Fleet-relationship membership (active_employee/independent), not tracking_only.
  // See filterActiveFleetRelationshipDrivers — this is membership only, not
  // compensation eligibility or trip-assignment context.
  return filterActiveFleetRelationshipDrivers(drivers as DriverRow[]);
}

function utilizationPctForStat(
  stat: EntityTripStats,
  filters: AssetSalesCrossFilters,
): number {
  const days = periodDayCount(filters);
  return Math.min(100, Math.round((stat.activeDays.size / days) * 100));
}

function passesVehicleFilters(
  vehicle: VehicleRow,
  filters: AssetSalesCrossFilters,
  stat?: VehicleStats,
): boolean {
  if (filters.vehicleSlice && vehicle.id !== filters.vehicleSlice) return false;
  if (filters.vehicles.size > 0 && !filters.vehicles.has(vehicle.id)) return false;
  if (filters.onlyWithTrips && (stat?.trips ?? 0) <= 0) return false;
  if (filters.statuses.size > 0) {
    const active = (stat?.trips ?? 0) > 0;
    const status: AssetFleetStatus = active ? "active" : "idle";
    if (!filters.statuses.has(status)) return false;
  }
  if (filters.minUtilizationPct != null && stat) {
    if (utilizationPctForStat(stat, filters) < filters.minUtilizationPct) return false;
  }
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    const hay = [
      vehicle.vehicle_number,
      vehicle.vehicle_type,
      vehicle.vehicle_body_type,
      vehicle.vehicle_brand,
      vehicle.vehicle_model,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function filterAssetVehicles(
  vehicles: readonly VehicleRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): VehicleRow[] {
  const base = fleetVehiclesBase(vehicles);
  const stats = vehicleTripStats(base, trips, filters);
  return base.filter((v) => passesVehicleFilters(v, filters, stats.get(v.id)));
}

export function filterAssetDrivers(
  drivers: readonly DriverRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): DriverRow[] {
  const base = fleetDriversBase(drivers);
  const stats = driverTripStats(base, trips, filters);
  return base.filter((d) => passesDriverFilters(d, filters, stats.get(d.id)));
}

function toBarItems(
  counts: Map<string, { trips: number; revenue: number }>,
  limit: number,
): SalesBarItem[] {
  const total = [...counts.values()].reduce((s, v) => s + v.trips, 0);
  return [...counts.entries()]
    .filter(([, v]) => v.trips > 0)
    .sort((a, b) => b[1].trips - a[1].trips || b[1].revenue - a[1].revenue)
    .slice(0, limit)
    .map(([label, v], idx) => ({
      key: label,
      label,
      shortLabel: label.length > 16 ? `${label.slice(0, 15)}…` : label,
      value: v.trips,
      revenue: v.revenue,
      contributionPct: total > 0 ? Math.round((v.trips / total) * 100) : 0,
      color: LANE_COLORS[idx % LANE_COLORS.length],
    }));
}

export function buildAssetLaneBarItems(
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
  limit = 6,
): SalesBarItem[] {
  const rows = qualifyingAssetTrips(trips, filters, { ignoreLaneSlice: true });
  const counts = new Map<string, { trips: number; revenue: number }>();
  for (const trip of rows) {
    const lane = getTripLane(trip);
    const prev = counts.get(lane) ?? { trips: 0, revenue: 0 };
    counts.set(lane, {
      trips: prev.trips + 1,
      revenue: prev.revenue + tripRevenue(trip),
    });
  }
  return toBarItems(counts, limit);
}

export function buildAssetOriginBarItems(
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
  limit = 5,
): SalesBarItem[] {
  const rows = qualifyingAssetTrips(trips, filters, { ignoreOrigin: true });
  const counts = new Map<string, { trips: number; revenue: number }>();
  for (const trip of rows) {
    const origin = getTripOrigin(trip);
    const prev = counts.get(origin) ?? { trips: 0, revenue: 0 };
    counts.set(origin, {
      trips: prev.trips + 1,
      revenue: prev.revenue + tripRevenue(trip),
    });
  }
  return toBarItems(counts, limit);
}

export function buildAssetDestinationBarItems(
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
  limit = 5,
): SalesBarItem[] {
  const rows = qualifyingAssetTrips(trips, filters, { ignoreDest: true });
  const counts = new Map<string, { trips: number; revenue: number }>();
  for (const trip of rows) {
    const dest = getTripDestination(trip);
    const prev = counts.get(dest) ?? { trips: 0, revenue: 0 };
    counts.set(dest, {
      trips: prev.trips + 1,
      revenue: prev.revenue + tripRevenue(trip),
    });
  }
  return toBarItems(counts, limit);
}

export function buildAssetDriverBarItems(
  drivers: readonly DriverRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
  limit = 6,
): SalesBarItem[] {
  const filtered = filterAssetDrivers(drivers, trips, filters);
  const stats = driverTripStats(filtered, trips, filters);
  const total = [...stats.values()].reduce((s, v) => s + v.trips, 0);
  return filtered
    .map((d, idx) => {
      const stat = stats.get(d.id) ?? emptyEntityStats();
      const label = d.name.trim() || "Driver";
      return {
        key: d.id,
        label,
        shortLabel: label.length > 16 ? `${label.slice(0, 15)}…` : label,
        value: stat.trips,
        revenue: stat.revenue,
        contributionPct: total > 0 ? Math.round((stat.trips / total) * 100) : 0,
        color: DRIVER_COLORS[idx % DRIVER_COLORS.length],
      };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function buildAssetPerformanceBarItems(
  drivers: readonly DriverRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
  metric: "onTime" | "margin",
  limit = 5,
): SalesBarItem[] {
  const filtered = filterAssetDrivers(drivers, trips, filters);
  const stats = driverTripStats(filtered, trips, filters);
  const items: SalesBarItem[] = [];

  filtered.forEach((d, idx) => {
    const stat = stats.get(d.id);
    if (!stat || stat.trips <= 0) return;
    const onTimePct =
      stat.onTimeEligible > 0
        ? Math.round((stat.onTime / stat.onTimeEligible) * 100)
        : 0;
    const marginPct =
      stat.revenue > 0 ? Math.round((stat.margin / stat.revenue) * 100) : 0;
    const value = metric === "onTime" ? onTimePct : Math.max(0, marginPct);
    if (value <= 0) return;
    const label = d.name.trim() || "Driver";
    items.push({
      key: d.id,
      label,
      shortLabel: label.length > 16 ? `${label.slice(0, 15)}…` : label,
      value,
      revenue: stat.revenue,
      contributionPct: value,
      color: DRIVER_COLORS[idx % DRIVER_COLORS.length],
    });
  });

  return items.sort((a, b) => b.value - a.value).slice(0, limit);
}

export function buildAssetVehicleBarItems(
  vehicles: readonly VehicleRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
  limit = 6,
): SalesBarItem[] {
  const filtered = filterAssetVehicles(vehicles, trips, filters);
  const stats = vehicleTripStats(filtered, trips, filters);
  const total = [...stats.values()].reduce((s, v) => s + v.trips, 0);
  return filtered
    .map((v, idx) => {
      const stat = stats.get(v.id) ?? emptyEntityStats();
      const label = v.vehicle_number.trim() || "Vehicle";
      return {
        key: v.id,
        label,
        shortLabel: label.length > 16 ? `${label.slice(0, 15)}…` : label,
        value: stat.trips,
        revenue: stat.revenue,
        contributionPct: total > 0 ? Math.round((stat.trips / total) * 100) : 0,
        color: VEHICLE_COLORS[idx % VEHICLE_COLORS.length],
      };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function buildAssetVehicleMetricBarItems(
  vehicles: readonly VehicleRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
  metric: "utilization" | "revPerKm" | "margin",
  limit = 5,
): SalesBarItem[] {
  const filtered = filterAssetVehicles(vehicles, trips, filters);
  const stats = vehicleTripStats(filtered, trips, filters);
  const items: SalesBarItem[] = [];

  filtered.forEach((v, idx) => {
    const stat = stats.get(v.id);
    if (!stat || stat.trips <= 0) return;
    const utilization = utilizationPctForStat(stat, filters);
    const revPerKm =
      stat.kmDriven > 0 ? Math.round(stat.revenue / stat.kmDriven) : 0;
    const marginPct =
      stat.revenue > 0 ? Math.round((stat.margin / stat.revenue) * 100) : 0;
    const value =
      metric === "utilization"
        ? utilization
        : metric === "revPerKm"
          ? revPerKm
          : Math.max(0, marginPct);
    if (value <= 0) return;
    const label = v.vehicle_number.trim() || "Vehicle";
    items.push({
      key: v.id,
      label,
      shortLabel: label.length > 16 ? `${label.slice(0, 15)}…` : label,
      value,
      revenue: stat.revenue,
      contributionPct: value,
      color: VEHICLE_COLORS[idx % VEHICLE_COLORS.length],
    });
  });

  return items.sort((a, b) => b.value - a.value).slice(0, limit);
}

export function buildAssetBodyTypeSlices(
  vehicles: readonly VehicleRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): SalesSlice[] {
  const rows = qualifyingAssetTrips(trips, { ...filters, vehicleSlice: null });
  const vehicleById = new Map(fleetVehiclesBase(vehicles).map((v) => [v.id, v]));
  const counts = new Map<string, number>();

  for (const trip of rows) {
    if (!trip.vehicle_id) continue;
    const vehicle = vehicleById.get(trip.vehicle_id);
    const label =
      (vehicle?.vehicle_body_type ?? vehicle?.vehicle_type ?? "Other").trim() ||
      "Other";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value], idx) => ({
      label: label.length > 18 ? `${label.slice(0, 17)}…` : label,
      value,
      color: VEHICLE_COLORS[idx % VEHICLE_COLORS.length],
    }));
}

export function buildAssetMonthlyTrend(
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): SalesTrendPoint[] {
  const keys = getMonthKeys(monthsForRange(filters.dateRange));
  const rows = qualifyingAssetTrips(trips, { ...filters, monthKey: null });
  return keys.map((key) => {
    let tripCount = 0;
    let revenue = 0;
    for (const trip of rows) {
      if (tripMonthKey(trip) !== key) continue;
      tripCount += 1;
      revenue += tripRevenue(trip);
    }
    return {
      monthKey: key,
      label: monthLabelShort(key),
      trips: tripCount,
      revenue,
    };
  });
}

export function buildAssetLaneSlices(
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): SalesSlice[] {
  return buildAssetLaneBarItems(trips, filters, 8).map((item) => ({
    label: item.label,
    value: item.value,
    color: item.color,
  }));
}

export function buildAssetClientSlices(
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): SalesSlice[] {
  const rows = qualifyingAssetTrips(trips, { ...filters, clientSlice: null });
  const counts = new Map<string, number>();
  for (const trip of rows) {
    const key = trip.client_id ?? trip.client_name ?? "Unknown";
    const label = (trip.client_name ?? "Unknown").trim() || "Unknown";
    counts.set(`${key}::${label}`, (counts.get(`${key}::${label}`) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([compound, value], idx) => {
      const label = compound.split("::")[1] ?? "Client";
      return {
        label: label.length > 18 ? `${label.slice(0, 17)}…` : label,
        value,
        color: LANE_COLORS[idx % LANE_COLORS.length],
      };
    });
}

export function computeAssetKpis(
  drivers: readonly DriverRow[],
  vehicles: readonly VehicleRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): AssetSalesKpis {
  const filtered = filterAssetDrivers(drivers, trips, filters);
  const stats = driverTripStats(filtered, trips, filters);
  const filteredVehicles = filterAssetVehicles(vehicles, trips, filters);
  const vStats = vehicleTripStats(filteredVehicles, trips, filters);
  const laneRows = qualifyingAssetTrips(trips, filters);
  const laneTotals = new Map<string, number>();

  let totalTrips = 0;
  let totalRevenue = 0;
  let totalMargin = 0;
  let totalEarnings = 0;
  let onTime = 0;
  let onTimeEligible = 0;
  let activeDrivers = 0;
  let activeVehicles = 0;
  let totalKm = 0;
  let utilSum = 0;
  let utilCount = 0;

  for (const driver of filtered) {
    const stat = stats.get(driver.id);
    if (!stat) continue;
    totalTrips += stat.trips;
    totalRevenue += stat.revenue;
    totalMargin += stat.margin;
    totalEarnings += stat.earnings;
    onTime += stat.onTime;
    onTimeEligible += stat.onTimeEligible;
    if (stat.trips > 0) activeDrivers += 1;
  }

  for (const vehicle of filteredVehicles) {
    const stat = vStats.get(vehicle.id);
    if (!stat) continue;
    totalKm += stat.kmDriven;
    if (stat.trips > 0) {
      activeVehicles += 1;
      utilSum += utilizationPctForStat(stat, filters);
      utilCount += 1;
    }
  }

  for (const trip of laneRows) {
    const lane = getTripLane(trip);
    laneTotals.set(lane, (laneTotals.get(lane) ?? 0) + 1);
  }

  const topLane =
    [...laneTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    totalTrips,
    totalRevenue,
    totalMargin,
    totalEarnings,
    activeDrivers,
    activeVehicles,
    fleetOnTimePct:
      onTimeEligible > 0 ? Math.round((onTime / onTimeEligible) * 100) : 0,
    avgUtilizationPct:
      utilCount > 0 ? Math.round(utilSum / utilCount) : 0,
    totalKm: Math.round(totalKm),
    topLane,
    laneCount: laneTotals.size,
  };
}

export function buildAssetDriverTableRows(
  drivers: readonly DriverRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): AssetDriverTableRow[] {
  const filtered = filterAssetDrivers(drivers, trips, filters);
  const stats = driverTripStats(filtered, trips, filters);
  const totalTrips = [...stats.values()].reduce((s, v) => s + v.trips, 0);
  const totalRevenue = [...stats.values()].reduce((s, v) => s + v.revenue, 0);
  const totalMargin = [...stats.values()].reduce((s, v) => s + v.margin, 0);
  const totalMarginAbs = [...stats.values()].reduce(
    (s, v) => s + Math.abs(v.margin),
    0,
  );

  return filtered
    .map((driver) => {
      const stat = stats.get(driver.id) ?? emptyEntityStats();
      const onTimePct =
        stat.onTimeEligible > 0
          ? Math.round((stat.onTime / stat.onTimeEligible) * 100)
          : 0;
      return {
        id: driver.id,
        name: driver.name,
        subtitle: driver.assigned_vehicle_id ? "Assigned vehicle" : "Fleet driver",
        trips: stat.trips,
        revenue: stat.revenue,
        margin: stat.margin,
        earnings: stat.earnings,
        contributionPct:
          totalTrips > 0 ? Math.round((stat.trips / totalTrips) * 100) : 0,
        revenueContributionPct:
          totalRevenue > 0
            ? Math.round((stat.revenue / totalRevenue) * 100)
            : 0,
        marginContributionPct:
          totalMargin !== 0
            ? Math.round((stat.margin / totalMargin) * 100)
            : totalMarginAbs > 0
              ? Math.round((Math.abs(stat.margin) / totalMarginAbs) * 100)
              : 0,
        avgMarginPct:
          stat.revenue > 0
            ? Math.round((stat.margin / stat.revenue) * 10) / 10
            : 0,
        onTimePct,
        performanceScore: computePerformanceScore(stat),
        topLane: stat.topLane ?? "—",
        lastTripLabel: stat.lastMonth ? monthLabelShort(stat.lastMonth) : null,
        isActive: stat.trips > 0,
        driver,
      };
    })
    .sort(
      (a, b) =>
        b.performanceScore - a.performanceScore ||
        b.trips - a.trips ||
        b.revenue - a.revenue,
    );
}

export function buildAssetVehicleTableRows(
  vehicles: readonly VehicleRow[],
  drivers: readonly DriverRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): AssetVehicleTableRow[] {
  const filtered = filterAssetVehicles(vehicles, trips, filters);
  const stats = vehicleTripStats(filtered, trips, filters);
  const driverNameById = new Map(
    fleetDriversBase(drivers).map((d) => [d.id, d.name.trim() || "Driver"]),
  );
  const scoreTrips = qualifyingAssetTrips(trips, {
    ...filters,
    vehicleSlice: null,
    vehicles: new Set(),
  }).map(tripToVehicleScoreInput);
  // "all" previously meant 12 months here vs. 18 months in monthsForRange() (used by both this
  // file and connectionSalesAnalytics.util.ts for trend month-keys) — one shared definition now.
  const windowMonths = monthsForRange(filters.dateRange);

  const totalTrips = [...stats.values()].reduce((s, v) => s + v.trips, 0);
  const totalRevenue = [...stats.values()].reduce((s, v) => s + v.revenue, 0);

  return filtered
    .map((vehicle) => {
      const stat = stats.get(vehicle.id) ?? emptyEntityStats();
      const performance = computeVehiclePerformanceScore(
        vehicle.id,
        scoreTrips,
        [],
        { windowMonths },
      );
      const badges = deriveVehicleBadges(performance);
      const primaryBadgeKey = badges[0] ?? null;
      const primaryDriverId =
        [...stat.driverCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
        null;
      const subtitle = [
        vehicle.vehicle_body_type ?? vehicle.vehicle_type,
        vehicle.capacity,
      ]
        .filter(Boolean)
        .join(" · ") || "Fleet vehicle";

      return {
        id: vehicle.id,
        name: vehicle.vehicle_number.trim() || "Vehicle",
        subtitle,
        trips: stat.trips,
        revenue: stat.revenue,
        margin: stat.margin,
        kmDriven: Math.round(stat.kmDriven),
        revenuePerKm:
          stat.kmDriven > 0 ? Math.round(stat.revenue / stat.kmDriven) : 0,
        utilizationPct: utilizationPctForStat(stat, filters),
        completionPct:
          stat.trips > 0
            ? Math.round((stat.completed / stat.trips) * 100)
            : 0,
        contributionPct:
          totalTrips > 0 ? Math.round((stat.trips / totalTrips) * 100) : 0,
        revenueContributionPct:
          totalRevenue > 0
            ? Math.round((stat.revenue / totalRevenue) * 100)
            : 0,
        avgMarginPct:
          stat.revenue > 0
            ? Math.round((stat.margin / stat.revenue) * 10) / 10
            : 0,
        performanceScore: performance?.score ?? 0,
        scoreLevel: performance?.level ?? "unknown",
        primaryBadge: primaryBadgeKey
          ? (VEHICLE_BADGE_LABELS[primaryBadgeKey] ?? primaryBadgeKey)
          : null,
        topLane: stat.topLane ?? "—",
        primaryDriver: primaryDriverId
          ? (driverNameById.get(primaryDriverId) ?? null)
          : null,
        lastTripLabel: stat.lastMonth ? monthLabelShort(stat.lastMonth) : null,
        isActive: stat.trips > 0,
        vehicle,
        scoreBreakdown: performance
          ? {
              profitability: performance.profitabilityScore,
              utilization: performance.utilizationScore,
              completion: performance.completionScore,
              costEfficiency: performance.costEfficiencyScore,
              consistency: performance.consistencyScore,
            }
          : null,
      };
    })
    .sort(
      (a, b) =>
        b.performanceScore - a.performanceScore ||
        b.utilizationPct - a.utilizationPct ||
        b.trips - a.trips ||
        b.revenue - a.revenue,
    );
}

export type AssetFleetIntelligence = {
  avgDriverScore: number;
  avgVehicleScore: number;
  topDriverName: string | null;
  topVehicleName: string | null;
  vehicleScoreDimensions: {
    profitability: number;
    utilization: number;
    completion: number;
    costEfficiency: number;
    consistency: number;
  };
};

export function computeAssetFleetIntelligence(
  driverRows: readonly AssetDriverTableRow[],
  vehicleRows: readonly AssetVehicleTableRow[],
): AssetFleetIntelligence {
  const avgDriverScore =
    driverRows.length > 0
      ? Math.round(
          driverRows.reduce((s, r) => s + r.performanceScore, 0) /
            driverRows.length,
        )
      : 0;
  const scoredVehicles = vehicleRows.filter((r) => r.performanceScore > 0);
  const avgVehicleScore =
    scoredVehicles.length > 0
      ? Math.round(
          scoredVehicles.reduce((s, r) => s + r.performanceScore, 0) /
            scoredVehicles.length,
        )
      : 0;

  const dimTotals = {
    profitability: 0,
    utilization: 0,
    completion: 0,
    costEfficiency: 0,
    consistency: 0,
  };
  let dimCount = 0;
  for (const row of vehicleRows) {
    if (!row.scoreBreakdown) continue;
    dimCount += 1;
    dimTotals.profitability += row.scoreBreakdown.profitability;
    dimTotals.utilization += row.scoreBreakdown.utilization;
    dimTotals.completion += row.scoreBreakdown.completion;
    dimTotals.costEfficiency += row.scoreBreakdown.costEfficiency;
    dimTotals.consistency += row.scoreBreakdown.consistency;
  }

  return {
    avgDriverScore,
    avgVehicleScore,
    topDriverName: driverRows[0]?.name ?? null,
    topVehicleName: vehicleRows[0]?.name ?? null,
    vehicleScoreDimensions: {
      profitability:
        dimCount > 0 ? Math.round(dimTotals.profitability / dimCount) : 0,
      utilization:
        dimCount > 0 ? Math.round(dimTotals.utilization / dimCount) : 0,
      completion: dimCount > 0 ? Math.round(dimTotals.completion / dimCount) : 0,
      costEfficiency:
        dimCount > 0 ? Math.round(dimTotals.costEfficiency / dimCount) : 0,
      consistency:
        dimCount > 0 ? Math.round(dimTotals.consistency / dimCount) : 0,
    },
  };
}

export function uniqueAssetLanes(
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): string[] {
  const rows = qualifyingAssetTrips(trips, {
    ...filters,
    lanes: new Set(),
    laneSlice: null,
    originSlice: null,
    destinationSlice: null,
    monthKey: null,
  });
  const lanes = new Set<string>();
  for (const trip of rows) lanes.add(getTripLane(trip));
  return [...lanes].sort((a, b) => a.localeCompare(b));
}

export function uniqueAssetDrivers(
  drivers: readonly DriverRow[],
  trips: readonly TripRow[],
  filters: AssetSalesCrossFilters,
): string[] {
  const stats = driverTripStats(fleetDriversBase(drivers), trips, filters);
  return fleetDriversBase(drivers)
    .filter((d) => (stats.get(d.id)?.trips ?? 0) > 0)
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

export function hasActiveAssetFilters(filters: AssetSalesCrossFilters): boolean {
  return (
    filters.lanes.size > 0 ||
    filters.drivers.size > 0 ||
    filters.vehicles.size > 0 ||
    filters.statuses.size > 0 ||
    filters.monthKey != null ||
    filters.laneSlice != null ||
    filters.originSlice != null ||
    filters.destinationSlice != null ||
    filters.driverSlice != null ||
    filters.vehicleSlice != null ||
    filters.clientSlice != null ||
    filters.minOnTimePct != null ||
    filters.minUtilizationPct != null ||
    filters.search.trim().length > 0 ||
    filters.onlyWithTrips
  );
}

export function defaultAssetSalesFilters(): AssetSalesCrossFilters {
  return {
    lanes: new Set(),
    drivers: new Set(),
    vehicles: new Set(),
    statuses: new Set(),
    monthKey: null,
    laneSlice: null,
    originSlice: null,
    destinationSlice: null,
    driverSlice: null,
    vehicleSlice: null,
    clientSlice: null,
    minOnTimePct: null,
    minUtilizationPct: null,
    search: "",
    onlyWithTrips: false,
    dateRange: "6m",
  };
}
