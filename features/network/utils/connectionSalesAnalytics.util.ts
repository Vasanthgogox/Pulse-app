import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import { getTripOperationalDisplayCode } from "@/features/operations/display";
import type { TripRow } from "@/features/trips/services/trips.service";
import { formatCityStateLabel } from "@/lib/placeCityState.util";

export type SalesDateRange = "3m" | "6m" | "12m" | "all";
export type SalesRoleFilter = "CLIENT" | "SUPPLIER";

export type SalesCrossFilters = {
  /** Trip lanes (origin → destination). */
  lanes: Set<string>;
  roles: Set<SalesRoleFilter>;
  statuses: Set<"integrated" | "invite">;
  monthKey: string | null;
  laneSlice: string | null;
  originSlice: string | null;
  destinationSlice: string | null;
  roleSlice: SalesRoleFilter | null;
  minRating: number | null;
  search: string;
  onlyWithTrips: boolean;
  dateRange: SalesDateRange;
};

export type SalesTrendPoint = {
  monthKey: string;
  label: string;
  trips: number;
  revenue: number;
};

export type SalesSlice = {
  label: string;
  value: number;
  color: string;
  /** Optional amount shown beside % in donut legends (e.g. margin ₹). */
  valueLabel?: string;
};

export type SalesBarItem = {
  key: string;
  label: string;
  shortLabel?: string;
  value: number;
  revenue: number;
  contributionPct: number;
  color: string;
};

export type SalesTripTableRow = {
  id: string;
  tripRef: string;
  lane: string;
  clientName: string;
  supplierName: string;
  sales: number;
  cost: number;
  margin: number;
  marginPct: number;
  dateLabel: string | null;
  statusLabel: string;
  trip: TripRow;
};

export type SalesTableRow = {
  id: string;
  name: string;
  role: SalesRoleFilter;
  subtitle: string;
  trips: number;
  revenue: number;
  margin: number;
  /** Trip-count share for filtered period. */
  contributionPct: number;
  revenueContributionPct: number;
  marginContributionPct: number;
  avgMarginPct: number;
  topLane: string;
  rating: number | null;
  globalRatingAvg: number | null;
  globalTripCount: number;
  filledStars: number;
  isIntegrated: boolean;
  lastTripLabel: string | null;
  connection: ConnectedOrg;
};

export type SalesKpis = {
  totalTrips: number;
  /** Client billing (client_price) — unique trips, not double-counted. */
  totalSales: number;
  /** Supplier payout (supplier_rate) — unique trips. */
  totalCost: number;
  /** Sales − cost on filtered trips. */
  totalMargin: number;
  /** @deprecated Alias for totalSales — use totalSales in new UI. */
  totalRevenue: number;
  avgRating: number | null;
  avgStars: number;
  activePartners: number;
  integratedPct: number;
  topLane: string | null;
  laneCount: number;
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

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

const ROLE_COLORS: Record<SalesRoleFilter, string> = {
  CLIENT: "#3E97FF",
  SUPPLIER: "#50CD89",
};

export function ratingFilledCount(rating: number | null | undefined): number {
  if (rating == null || !Number.isFinite(rating)) return 0;
  return Math.max(0, Math.min(5, Math.round(rating)));
}

/** Primary city/state label from a trip location string. */
export function normalizeLaneLocation(value: string | null | undefined): string {
  const label = formatCityStateLabel(value);
  if (!label) return "Unknown";
  if (label.length > 28) return `${label.slice(0, 26)}…`;
  return label;
}

export function getTripOrigin(trip: TripRow): string {
  return normalizeLaneLocation(trip.pickup_area);
}

export function getTripDestination(trip: TripRow): string {
  return normalizeLaneLocation(trip.drop_location ?? trip.drop_area);
}

export function getTripLane(trip: TripRow): string {
  return `${getTripOrigin(trip)} → ${getTripDestination(trip)}`;
}

export function monthsForRange(range: SalesDateRange): number {
  if (range === "3m") return 3;
  if (range === "6m") return 6;
  if (range === "12m") return 12;
  return 18;
}

export function getMonthKeys(monthsBack: number, now = new Date()): string[] {
  const keys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return keys;
}

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

function tripSales(trip: TripRow): number {
  const v = Number(trip.client_price);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function tripCost(trip: TripRow): number {
  const v = Number(trip.supplier_rate);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/** Client billing on a trip (lane charts / trend). */
function tripRevenue(trip: TripRow): number {
  return tripSales(trip);
}

/** Margin in INR — DB column is generated (client_price − supplier_rate); fallback if missing. */
function tripMargin(trip: TripRow): number {
  const stored = Number(trip.margin);
  if (Number.isFinite(stored)) return stored;
  return tripSales(trip) - tripCost(trip);
}

/** Partner row amount: clients contribute sales, suppliers contribute cost. */
function partnerTripAmount(
  connection: ConnectedOrg,
  trip: TripRow,
): number {
  if (connection.role === "CLIENT") return tripSales(trip);
  if (connection.role === "SUPPLIER") return tripCost(trip);
  return 0;
}

function aggregateTripFinancials(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
): { trips: number; sales: number; cost: number; margin: number } {
  const rows = qualifyingTrips(connections, trips, filters);
  let sales = 0;
  let cost = 0;
  for (const trip of rows) {
    sales += tripSales(trip);
    cost += tripCost(trip);
  }
  return {
    trips: rows.length,
    sales,
    cost,
    margin: sales - cost,
  };
}

function tripInDateRange(trip: TripRow, filters: SalesCrossFilters): boolean {
  const monthKey = tripMonthKey(trip);
  if (!monthKey) return filters.dateRange === "all";
  const keys = getMonthKeys(monthsForRange(filters.dateRange));
  if (!keys.includes(monthKey)) return false;
  if (filters.monthKey && monthKey !== filters.monthKey) return false;
  return true;
}

export function salesConnectionsBase(
  connections: readonly ConnectedOrg[],
): ConnectedOrg[] {
  return connections.filter((c) => c.role === "CLIENT" || c.role === "SUPPLIER");
}

function connectionMatchesTrip(
  connection: ConnectedOrg,
  trip: TripRow,
): boolean {
  if (connection.role === "CLIENT") return trip.client_id === connection.id;
  if (connection.role === "SUPPLIER") return trip.supplier_id === connection.id;
  return false;
}

function tripMatchesLaneFilters(
  trip: TripRow,
  filters: SalesCrossFilters,
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
  if (
    !opts?.ignoreDest &&
    filters.destinationSlice &&
    dest !== filters.destinationSlice
  ) {
    return false;
  }
  return true;
}

function passesConnectionFilters(
  connection: ConnectedOrg,
  filters: SalesCrossFilters,
  tripStats?: { trips: number },
): boolean {
  if (
    filters.roles.size > 0 &&
    !filters.roles.has(connection.role as SalesRoleFilter)
  ) {
    return false;
  }
  if (filters.roleSlice && connection.role !== filters.roleSlice) return false;
  if (filters.statuses.size > 0) {
    const status = connection.is_integrated ? "integrated" : "invite";
    if (!filters.statuses.has(status)) return false;
  }
  if (filters.minRating != null) {
    const stars = ratingFilledCount(connection.rating ?? null);
    if (stars < filters.minRating) return false;
  }
  if (filters.onlyWithTrips && (tripStats?.trips ?? 0) <= 0) return false;
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    if (!connection.name.toLowerCase().includes(q)) return false;
  }
  return true;
}

type PartnerStats = {
  trips: number;
  revenue: number;
  margin: number;
  lastMonth: string | null;
  topLane: string | null;
  laneCounts: Map<string, number>;
};

function partnerTripStats(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
): Map<string, PartnerStats> {
  const allowed = new Set(connections.map((c) => `${c.role}:${c.id}`));
  const map = new Map<string, PartnerStats>();

  for (const trip of trips) {
    if (!tripInDateRange(trip, filters)) continue;
    if (!tripMatchesLaneFilters(trip, filters)) continue;

    for (const connection of connections) {
      if (!connectionMatchesTrip(connection, trip)) continue;
      const key = `${connection.role}:${connection.id}`;
      if (!allowed.has(key)) continue;

      const monthKey = tripMonthKey(trip);
      const lane = getTripLane(trip);
      const prev = map.get(key) ?? {
        trips: 0,
        revenue: 0,
        margin: 0,
        lastMonth: null,
        topLane: null,
        laneCounts: new Map<string, number>(),
      };
      const laneCounts = new Map(prev.laneCounts);
      laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1);
      const topLane =
        [...laneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      map.set(key, {
        trips: prev.trips + 1,
        revenue: prev.revenue + partnerTripAmount(connection, trip),
        margin:
          prev.margin +
          (connection.role === "CLIENT" ? tripMargin(trip) : 0),
        lastMonth:
          monthKey &&
          (!prev.lastMonth || monthKey > prev.lastMonth)
            ? monthKey
            : prev.lastMonth,
        topLane,
        laneCounts,
      });
    }
  }
  return map;
}

function qualifyingTrips(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
  opts?: { ignoreLaneSlice?: boolean; ignoreOrigin?: boolean; ignoreDest?: boolean },
): TripRow[] {
  const base = salesConnectionsBase(connections);
  const stats = partnerTripStats(base, trips, filters);
  const allowedPartners = new Set(
    base
      .filter((c) => {
        const key = `${c.role}:${c.id}`;
        const stat = stats.get(key) ?? {
          trips: 0,
          revenue: 0,
          margin: 0,
          lastMonth: null,
          topLane: null,
          laneCounts: new Map(),
        };
        return passesConnectionFilters(c, filters, { trips: stat.trips });
      })
      .map((c) => `${c.role}:${c.id}`),
  );

  const out: TripRow[] = [];
  for (const trip of trips) {
    if (!tripInDateRange(trip, filters)) continue;
    if (!tripMatchesLaneFilters(trip, filters, opts)) continue;
    let matched = false;
    for (const connection of base) {
      if (!allowedPartners.has(`${connection.role}:${connection.id}`)) continue;
      if (connectionMatchesTrip(connection, trip)) {
        matched = true;
        break;
      }
    }
    if (matched) out.push(trip);
  }
  return out;
}

export function filterSalesConnections(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
): ConnectedOrg[] {
  const base = salesConnectionsBase(connections);
  const stats = partnerTripStats(base, trips, filters);
  return base.filter((c) => {
    const key = `${c.role}:${c.id}`;
    const stat = stats.get(key) ?? {
      trips: 0,
      revenue: 0,
      margin: 0,
      lastMonth: null,
      topLane: null,
      laneCounts: new Map(),
    };
    return passesConnectionFilters(c, filters, { trips: stat.trips });
  });
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
      shortLabel: label.length > 8 ? `${label.slice(0, 7)}…` : label,
      value: v.trips,
      revenue: v.revenue,
      contributionPct:
        total > 0 ? Math.round((v.trips / total) * 100) : 0,
      color: LANE_COLORS[idx % LANE_COLORS.length],
    }));
}

export function buildLaneBarItems(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
  limit = 6,
): SalesBarItem[] {
  const rows = qualifyingTrips(connections, trips, filters, {
    ignoreLaneSlice: true,
  });
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

export function buildOriginBarItems(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
  limit = 5,
): SalesBarItem[] {
  const rows = qualifyingTrips(connections, trips, filters, {
    ignoreOrigin: true,
  });
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

export function buildDestinationBarItems(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
  limit = 5,
): SalesBarItem[] {
  const rows = qualifyingTrips(connections, trips, filters, {
    ignoreDest: true,
  });
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

export function buildPartnerBarItems(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
  limit = 5,
): SalesBarItem[] {
  const filtered = filterSalesConnections(connections, trips, filters);
  const stats = partnerTripStats(filtered, trips, filters);
  const total = [...stats.values()].reduce((s, v) => s + v.trips, 0);
  return filtered
    .map((c) => {
      const key = `${c.role}:${c.id}`;
      const stat = stats.get(key) ?? {
        trips: 0,
        revenue: 0,
        margin: 0,
        lastMonth: null,
        topLane: null,
        laneCounts: new Map(),
      };
      const label = c.name.trim() || "Partner";
      const shortLabel =
        label.length > 16 ? `${label.slice(0, 15)}…` : label;
      return {
        key,
        label,
        shortLabel,
        value: stat.trips,
        revenue: stat.revenue,
        contributionPct:
          total > 0 ? Math.round((stat.trips / total) * 100) : 0,
        color: c.role === "CLIENT" ? ROLE_COLORS.CLIENT : ROLE_COLORS.SUPPLIER,
      };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function buildMonthlyTripTrend(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
): SalesTrendPoint[] {
  const keys = getMonthKeys(monthsForRange(filters.dateRange));
  const rows = qualifyingTrips(connections, trips, {
    ...filters,
    monthKey: null,
  });

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

export function buildLaneSlices(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
): SalesSlice[] {
  const items = buildLaneBarItems(connections, trips, filters, 8);
  return items.map((item) => ({
    label: item.label,
    value: item.value,
    color: item.color,
  }));
}

export function buildRoleSlices(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
): SalesSlice[] {
  const rows = qualifyingTrips(connections, trips, {
    ...filters,
    roleSlice: null,
  });
  let clientSales = 0;
  let supplierCost = 0;

  for (const trip of rows) {
    clientSales += tripSales(trip);
    supplierCost += tripCost(trip);
  }

  const slices: SalesSlice[] = [];
  if (clientSales > 0) {
    slices.push({
      label: "Clients",
      value: clientSales,
      color: ROLE_COLORS.CLIENT,
    });
  }
  if (supplierCost > 0) {
    slices.push({
      label: "Suppliers",
      value: supplierCost,
      color: ROLE_COLORS.SUPPLIER,
    });
  }
  return slices;
}

export function computeSalesKpis(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
): SalesKpis {
  const filtered = filterSalesConnections(connections, trips, filters);
  const financials = aggregateTripFinancials(connections, trips, filters);
  const laneRows = qualifyingTrips(connections, trips, filters);
  const laneTotals = new Map<string, number>();

  let ratingSum = 0;
  let ratingCount = 0;
  let integrated = 0;

  for (const connection of filtered) {
    if (connection.is_integrated) integrated += 1;
    const rating = connection.rating ?? null;
    if (rating != null && Number.isFinite(rating) && rating > 0) {
      ratingSum += rating;
      ratingCount += 1;
    }
  }

  for (const trip of laneRows) {
    const lane = getTripLane(trip);
    laneTotals.set(lane, (laneTotals.get(lane) ?? 0) + 1);
  }

  const topLane =
    [...laneTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    totalTrips: financials.trips,
    totalSales: financials.sales,
    totalCost: financials.cost,
    totalMargin: financials.margin,
    totalRevenue: financials.sales,
    avgRating:
      ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
    avgStars:
      ratingCount > 0 ? ratingFilledCount(ratingSum / ratingCount) : 0,
    activePartners: filtered.length,
    integratedPct:
      filtered.length > 0
        ? Math.round((integrated / filtered.length) * 100)
        : 0,
    topLane,
    laneCount: laneTotals.size,
  };
}

export function formatTripStatusLabel(status: string | null | undefined): string {
  const raw = (status ?? "pending").replace(/_/g, " ").trim();
  if (!raw) return "Pending";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function buildSalesTripTableRows(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
  tableSearch = "",
): SalesTripTableRow[] {
  let rows = qualifyingTrips(connections, trips, filters);
  const q = tableSearch.trim().toLowerCase();
  if (q) {
    rows = rows.filter((trip) => {
      const ref = getTripOperationalDisplayCode(trip).toLowerCase();
      const lane = getTripLane(trip).toLowerCase();
      const client = (trip.client_name ?? "").toLowerCase();
      const supplier = (trip.supplier_name ?? "").toLowerCase();
      return (
        ref.includes(q) ||
        lane.includes(q) ||
        client.includes(q) ||
        supplier.includes(q)
      );
    });
  }

  return rows
    .map((trip) => {
      const sales = tripSales(trip);
      const cost = tripCost(trip);
      const margin = tripMargin(trip);
      const monthKey = tripMonthKey(trip);
      return {
        id: trip.id,
        tripRef: getTripOperationalDisplayCode(trip),
        lane: getTripLane(trip),
        clientName: trip.client_name?.trim() || "—",
        supplierName: trip.supplier_name?.trim() || "—",
        sales,
        cost,
        margin,
        marginPct:
          sales > 0 ? Math.round((margin / sales) * 10) / 10 : 0,
        dateLabel: monthKey ? monthLabelShort(monthKey) : null,
        statusLabel: formatTripStatusLabel(trip.status),
        trip,
      };
    })
    .sort((a, b) => {
      const ad = a.trip.pickup_date ?? a.trip.created_at ?? "";
      const bd = b.trip.pickup_date ?? b.trip.created_at ?? "";
      return bd.localeCompare(ad);
    });
}

export function buildSalesTableRows(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
): SalesTableRow[] {
  const filtered = filterSalesConnections(connections, trips, filters);
  const stats = partnerTripStats(filtered, trips, filters);
  const financials = aggregateTripFinancials(connections, trips, filters);
  const totalTrips = financials.trips;
  const totalClientSales = filtered
    .filter((c) => c.role === "CLIENT")
    .reduce((s, c) => s + (stats.get(`${c.role}:${c.id}`)?.revenue ?? 0), 0);
  const totalSupplierCost = filtered
    .filter((c) => c.role === "SUPPLIER")
    .reduce((s, c) => s + (stats.get(`${c.role}:${c.id}`)?.revenue ?? 0), 0);
  const totalMargin = financials.margin;

  return filtered
    .map((connection) => {
      const key = `${connection.role}:${connection.id}`;
      const stat = stats.get(key) ?? {
        trips: 0,
        revenue: 0,
        margin: 0,
        lastMonth: null,
        topLane: null,
        laneCounts: new Map(),
      };
      const isClient = connection.role === "CLIENT";
      const amountDenominator = isClient ? totalClientSales : totalSupplierCost;
      const globalRatingAvg = connection.rating ?? null;
      const filledStars = ratingFilledCount(globalRatingAvg);
      return {
        id: key,
        name: connection.name,
        role: connection.role as SalesRoleFilter,
        subtitle: isClient ? "Client · sales" : "Supplier · cost",
        trips: stat.trips,
        revenue: stat.revenue,
        margin: stat.margin,
        contributionPct:
          totalTrips > 0 ? Math.round((stat.trips / totalTrips) * 100) : 0,
        revenueContributionPct:
          amountDenominator > 0
            ? Math.round((stat.revenue / amountDenominator) * 100)
            : 0,
        marginContributionPct:
          isClient && totalMargin !== 0
            ? Math.round((stat.margin / totalMargin) * 100)
            : 0,
        avgMarginPct:
          isClient && stat.revenue > 0
            ? Math.round((stat.margin / stat.revenue) * 10) / 10
            : 0,
        topLane: stat.topLane ?? "—",
        rating: globalRatingAvg,
        globalRatingAvg,
        globalTripCount: connection.total_trips ?? 0,
        filledStars,
        isIntegrated: connection.is_integrated,
        lastTripLabel: stat.lastMonth
          ? monthLabelShort(stat.lastMonth)
          : null,
        connection,
      };
    })
    .sort((a, b) => b.trips - a.trips || b.revenue - a.revenue);
}

export function paginateRows<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): { rows: T[]; totalPages: number; from: number; to: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize;
  const to = Math.min(from + pageSize, rows.length);
  return {
    rows: rows.slice(from, to),
    totalPages,
    from: rows.length === 0 ? 0 : from + 1,
    to,
  };
}

export function uniqueLanes(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
): string[] {
  const rows = qualifyingTrips(connections, trips, {
    ...filters,
    lanes: new Set(),
    laneSlice: null,
    originSlice: null,
    destinationSlice: null,
    monthKey: null,
  });
  const lanes = new Set<string>();
  for (const trip of rows) {
    lanes.add(getTripLane(trip));
  }
  return [...lanes].sort((a, b) => a.localeCompare(b));
}

export function hasActiveCrossFilters(filters: SalesCrossFilters): boolean {
  return (
    filters.lanes.size > 0 ||
    filters.roles.size > 0 ||
    filters.statuses.size > 0 ||
    filters.monthKey != null ||
    filters.laneSlice != null ||
    filters.originSlice != null ||
    filters.destinationSlice != null ||
    filters.roleSlice != null ||
    filters.minRating != null ||
    filters.search.trim().length > 0 ||
    filters.onlyWithTrips
  );
}

export function defaultSalesFilters(): SalesCrossFilters {
  return {
    lanes: new Set(),
    roles: new Set(),
    statuses: new Set(),
    monthKey: null,
    laneSlice: null,
    originSlice: null,
    destinationSlice: null,
    roleSlice: null,
    minRating: null,
    search: "",
    onlyWithTrips: false,
    dateRange: "6m",
  };
}

/** @deprecated Use uniqueLanes — partner HQ regions replaced by trip lanes. */
export function uniqueRegions(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
): string[] {
  return uniqueLanes(connections, trips, filters);
}

/** @deprecated Use buildLaneSlices */
export function buildRegionSlices(
  connections: readonly ConnectedOrg[],
  trips: readonly TripRow[],
  filters: SalesCrossFilters,
): SalesSlice[] {
  return buildLaneSlices(connections, trips, filters);
}
