/**
 * Garrage P&L aggregation: period filter, trip-level and vehicle-level P&L,
 * expense breakdown (supplier + ledger line items). Used by GarrageTab and EntityDetailOverlay.
 */
import type { LedgerRow } from "@/features/finance";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  formatFromToDateLabel,
  toIsoDateLocal,
} from "@/lib/dateRangePresets";
import { formatIndianVehicleNumber, normalizeVehicleNumberForMatch } from "@/lib/format";
import type { VehicleRow } from "../services/vehicles.service";

export interface VehicleLedgerExpenseRow {
  id: string;
  vehicle_id: string | null;
  trip_id: string | null;
  source_type: string | null;
  amount: number | null;
  created_at: string | null;
}

interface VehicleResolutionContext {
  vehicleIds: Set<string>;
  vehicleIdByNormalizedNumber: Map<string, string>;
}

function buildVehicleResolutionContext(
  vehicles: VehicleRow[],
): VehicleResolutionContext {
  const vehicleIds = new Set<string>();
  const vehicleIdByNormalizedNumber = new Map<string, string>();

  for (const vehicle of vehicles) {
    vehicleIds.add(vehicle.id);
    const normalizedNumber = normalizeVehicleNumberForMatch(vehicle.vehicle_number);
    if (normalizedNumber) {
      vehicleIdByNormalizedNumber.set(normalizedNumber, vehicle.id);
    }
  }

  return { vehicleIds, vehicleIdByNormalizedNumber };
}

function resolveVehicleIdForTripWithContext(
  trip: TripRow,
  context: VehicleResolutionContext,
): string | null {
  if (trip.vehicle_id) {
    return context.vehicleIds.has(trip.vehicle_id) ? trip.vehicle_id : null;
  }
  const displayNum = (trip.vehicle_display_number ?? "").trim();
  if (!displayNum) return null;
  const norm = normalizeVehicleNumberForMatch(displayNum);
  if (!norm) return null;
  return context.vehicleIdByNormalizedNumber.get(norm) ?? null;
}

/** Resolve vehicle id for a trip: vehicle_id if set; else match vehicle_display_number to org vehicles. */
export function resolveVehicleIdForTrip(
  trip: TripRow,
  vehicles: VehicleRow[],
): string | null {
  return resolveVehicleIdForTripWithContext(
    trip,
    buildVehicleResolutionContext(vehicles),
  );
}

/** Trip date for period filter: pickup_date or created_at fallback */
export function getTripDate(trip: TripRow): string {
  const d = trip.pickup_date ?? trip.created_at ?? "";
  return d.slice(0, 10);
}

/** Period format: 'YYYY-MM' for month, 'ytd-YYYY' for year-to-date */
export type GarragePeriodValue = string;

/** Trip in period? */
export function tripInPeriod(
  trip: TripRow,
  period: GarragePeriodValue,
): boolean {
  const dateStr = getTripDate(trip);
  if (!dateStr) return false;
  if (period.startsWith("ytd-")) {
    const year = parseInt(period.slice(4), 10);
    const tripYear = parseInt(dateStr.slice(0, 4), 10);
    return tripYear === year;
  }
  const tripMonth = dateStr.slice(0, 7);
  return tripMonth === period;
}

/** Ledger row date in Garage period (transaction_date, else created_at). */
export function ledgerTransactionInPeriod(
  tx: LedgerRow,
  period: GarragePeriodValue,
): boolean {
  const dateStr = (tx.transaction_date ?? tx.created_at ?? "").slice(0, 10);
  if (!dateStr) return false;
  if (period.startsWith("ytd-")) {
    const year = parseInt(period.slice(4), 10);
    return parseInt(dateStr.slice(0, 4), 10) === year;
  }
  return dateStr.slice(0, 7) === period;
}

export function vehicleLedgerExpenseInPeriod(
  row: VehicleLedgerExpenseRow,
  period: GarragePeriodValue,
): boolean {
  const dateStr = (row.created_at ?? "").slice(0, 10);
  if (!dateStr) return false;
  if (period.startsWith("ytd-")) {
    const year = parseInt(period.slice(4), 10);
    return parseInt(dateStr.slice(0, 4), 10) === year;
  }
  return dateStr.slice(0, 7) === period;
}

/** Format period for display: '2026-03' → 'MAR 2026', 'ytd-2026' → 'YTD 2026' */
const MONTH_LABELS: Record<string, string> = {
  "01": "JAN",
  "02": "FEB",
  "03": "MAR",
  "04": "APR",
  "05": "MAY",
  "06": "JUN",
  "07": "JUL",
  "08": "AUG",
  "09": "SEP",
  "10": "OCT",
  "11": "NOV",
  "12": "DEC",
};
export function formatPeriodLabel(period: GarragePeriodValue): string {
  if (period.startsWith("ytd-")) {
    return `YTD ${period.slice(4)}`;
  }
  const [y, m] = period.split("-");
  return `${MONTH_LABELS[m] ?? m} ${y}`;
}

/** Inclusive calendar range for garage reports. */
export function getGaragePeriodBounds(
  period: GarragePeriodValue,
  now: Date = new Date(),
): { from: string; to: string } | null {
  if (period.startsWith("ytd-")) {
    const y = Number(period.slice(4));
    if (!Number.isFinite(y)) return null;
    const from = `${y}-01-01`;
    const to =
      y === now.getFullYear() ? toIsoDateLocal(now) : `${y}-12-31`;
    return { from, to };
  }
  const [y, m] = period.split("-");
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m)) return null;
  const start = new Date(Number(y), Number(m) - 1, 1);
  const end = new Date(Number(y), Number(m), 0);
  return { from: toIsoDateLocal(start), to: toIsoDateLocal(end) };
}

/** Inclusive calendar range for garage reports, e.g. `From 1 Aug 2026  To 31 Aug 2026`. */
export function formatPeriodRangeLabel(
  period: GarragePeriodValue,
  now: Date = new Date(),
): string {
  const bounds = getGaragePeriodBounds(period, now);
  if (!bounds) return formatPeriodLabel(period);
  return formatFromToDateLabel(bounds.from, bounds.to);
}

/** Build list of period options: YTD, this month, last month, then any month present in trips */
export function getAvailablePeriodOptions(
  trips: TripRow[],
  currentDate: Date = new Date(),
): { value: GarragePeriodValue; label: string }[] {
  const thisYear = currentDate.getFullYear();
  const thisMonth = currentDate.getMonth() + 1;
  const monthStr = (n: number) => n.toString().padStart(2, "0");
  const prevMonth = thisMonth === 1 ? 12 : thisMonth - 1;
  const prevYear = thisMonth === 1 ? thisYear - 1 : thisYear;
  const prevMonth2 =
    thisMonth <= 2 ? (thisMonth === 1 ? 11 : 12) : thisMonth - 2;
  const prevYear2 = thisMonth <= 2 ? thisYear - 1 : thisYear;

  const options: { value: GarragePeriodValue; label: string }[] = [
    { value: "ytd-" + thisYear, label: `YTD ${thisYear}` },
    {
      value: `${thisYear}-${monthStr(thisMonth)}`,
      label: formatPeriodLabel(`${thisYear}-${monthStr(thisMonth)}`),
    },
    {
      value: `${prevYear}-${monthStr(prevMonth)}`,
      label: formatPeriodLabel(`${prevYear}-${monthStr(prevMonth)}`),
    },
    {
      value: `${prevYear2}-${monthStr(prevMonth2)}`,
      label: formatPeriodLabel(`${prevYear2}-${monthStr(prevMonth2)}`),
    },
  ];
  const seen = new Set(options.map((o) => o.value));
  trips.forEach((t) => {
    const d = getTripDate(t);
    if (!d) return;
    const y = d.slice(0, 4);
    const m = d.slice(5, 7);
    const monthVal = `${y}-${m}`;
    if (!seen.has(monthVal)) {
      seen.add(monthVal);
      options.push({ value: monthVal, label: formatPeriodLabel(monthVal) });
    }
  });
  return options;
}

/** Trips in period that resolve to a registered fleet vehicle (by id or display number). */
export function countVehicleMatchedTripsInPeriod(
  trips: TripRow[],
  vehicles: VehicleRow[],
  period: GarragePeriodValue,
): number {
  const resolutionContext = buildVehicleResolutionContext(vehicles);
  let count = 0;
  for (const trip of trips) {
    if (!tripInPeriod(trip, period)) continue;
    if (resolveVehicleIdForTripWithContext(trip, resolutionContext) != null) count++;
  }
  return count;
}

/**
 * Pick the first period (YTD → this month → recent months) that has fleet-matched trips.
 * Falls back to YTD when no trips match any registered vehicle.
 */
export function pickDefaultGaragePeriod(
  trips: TripRow[],
  vehicles: VehicleRow[],
  currentDate: Date = new Date(),
): GarragePeriodValue {
  const options = getAvailablePeriodOptions(trips, currentDate);
  for (const opt of options) {
    if (countVehicleMatchedTripsInPeriod(trips, vehicles, opt.value) > 0) {
      return opt.value;
    }
  }
  return `ytd-${currentDate.getFullYear()}`;
}

/** Single ledger line for expense breakdown */
export interface ExpenseLineItem {
  id: string;
  description: string;
  amount: number;
}

/** Trip-level P&L with expense breakdown */
export interface TripPnLRow {
  id: string;
  trip: TripRow;
  missionId: string;
  clientName: string;
  origin: string;
  dest: string;
  sales: number;
  /** Supplier rate (base freight) */
  supplierExpense: number;
  /** Ledger cash-out line items for this trip */
  ledgerLines: ExpenseLineItem[];
  totalExpense: number;
  net: number;
  margin: number;
}

export function buildTripPnL(
  trip: TripRow,
  transactions: LedgerRow[],
  getMissionId: (t: TripRow) => string,
  /** When true (e.g. vehicle detail), exclude driver commission/payments from expense. */
  excludeDriverFromExpense?: boolean,
): TripPnLRow {
  const sales = Number(trip.client_price ?? 0);
  const supplierExpense = Number(trip.supplier_rate ?? 0);
  const list = transactions ?? [];
  const ledgerLines: ExpenseLineItem[] = [];
  for (let i = 0; i < list.length; i++) {
    const tx = list[i];
    if (tx.trip_id !== trip.id || Number(tx.amount_out ?? 0) <= 0) continue;
    if (trip.supplier_id && isSupplierPaymentForTrip(tx, trip)) continue;
    if (excludeDriverFromExpense && (tx.contact_type === "driver" || isDriverPaymentByDescription(tx)))
      continue;
    ledgerLines.push({
      id: tx.id,
      description:
        tx.description && tx.description !== "ENTRY"
          ? tx.description
          : "Expense",
      amount: Number(tx.amount_out ?? 0),
    });
  }
  const ledgerTotal = ledgerLines.reduce((s, l) => s + l.amount, 0);
  const totalExpense = supplierExpense + ledgerTotal;
  const net = sales - totalExpense;
  let margin = 0;
  if (sales > 0) margin = (net / sales) * 100;
  else if (totalExpense > 0) margin = -100;

  return {
    id: trip.id,
    trip,
    missionId: getMissionId(trip),
    clientName: trip.client_name ?? "—",
    origin: trip.pickup_area ?? "—",
    dest: trip.drop_location ?? "—",
    sales,
    supplierExpense,
    ledgerLines,
    totalExpense,
    net,
    margin,
  };
}

/** Build trip-level P&L list for a period (for Garrage TRIPS tab). */
export function buildTripPnLListForPeriod(
  trips: TripRow[],
  vehicles: VehicleRow[],
  transactions: LedgerRow[] | null,
  period: GarragePeriodValue,
  getMissionId: (t: TripRow) => string,
): TripPnLRow[] {
  const resolutionContext = buildVehicleResolutionContext(vehicles);
  const transactionsByTripId = new Map<string, LedgerRow[]>();
  for (const tx of transactions ?? []) {
    if (!tx.trip_id) continue;
    const list = transactionsByTripId.get(tx.trip_id);
    if (list) {
      list.push(tx);
    } else {
      transactionsByTripId.set(tx.trip_id, [tx]);
    }
  }

  const filtered = trips.filter((t) => {
    return (
      tripInPeriod(t, period) &&
      resolveVehicleIdForTripWithContext(t, resolutionContext) != null
    );
  });
  return filtered
    .map((t) => buildTripPnL(t, transactionsByTripId.get(t.id) ?? [], getMissionId))
    .sort((a, b) => (b.net ?? 0) - (a.net ?? 0));
}

/** Vehicle (or UNASSIGNED) P&L row for list */
export interface VehiclePnLRow {
  id: string;
  name: string;
  type: string;
  isUnassigned: boolean;
  trips: number;
  sales: number;
  expense: number;
  operationalExpense: number;
  ownershipExpense: number;
  maintenanceExpense: number;
  allocatedCost: number;
  unallocatedCost: number;
  outstandingPayables: number;
  allocationEfficiency: number;
  pnl: number;
  margin: number;
}

/** Descriptions that indicate driver payment (commission, salary, etc.) — exclude from vehicle expense. */
const DRIVER_PAYMENT_DESCRIPTIONS = [
  "DRIVER SALARY",
  "TRIP-BASED COMMISSION",
  "DRIVER COMMISSION",
  "TRIP COMMISSION",
  "MONTHLY SALARY",
  "SETTLEMENT",
  "ADVANCE",
  "REIMBURSEMENT",
  "BONUS",
  "DEDUCTION",
  "ADJUSTMENT",
  "COMMISSION", // Trip commission when stored as generic "Commission"
];

function isDriverPaymentByDescription(tx: LedgerRow): boolean {
  const desc = (tx.description ?? "").trim().toUpperCase();
  if (!desc) return false;
  return DRIVER_PAYMENT_DESCRIPTIONS.some((d) => desc === d);
}

const MAINTENANCE_SOURCES = new Set(["maintenance", "repair", "service"]);
const OWNERSHIP_SOURCES = new Set([
  "emi",
  "insurance",
  "permit",
  "fitness",
  "tax",
  "depreciation",
  "manual_adjustment",
  "gps",
  "tire",
  "oil",
]);

function normalizeSourceType(sourceType: string | null | undefined): string {
  return String(sourceType ?? "").trim().toLowerCase();
}

function isOwnershipSource(sourceType: string, tripId?: string | null): boolean {
  if (!sourceType) return false;
  if (sourceType === "manual_adjustment" && String(tripId ?? "").trim()) {
    return false;
  }
  return OWNERSHIP_SOURCES.has(sourceType);
}

function isMaintenanceSource(sourceType: string): boolean {
  if (!sourceType) return false;
  return MAINTENANCE_SOURCES.has(sourceType);
}

export function buildVehiclePnLList(
  vehicles: VehicleRow[],
  trips: TripRow[],
  transactions: LedgerRow[] | null,
  vehicleLedgerEntries: VehicleLedgerExpenseRow[] | null,
  vehicleOutstandingPayablesByVehicleId: Record<string, number> | null,
  period: GarragePeriodValue,
  getMissionId: (t: TripRow) => string,
  /** When set, trips where organization_id !== orgId are supplier trips — use supplier_rate for sales (our revenue). */
  organizationId?: string | null,
): VehiclePnLRow[] {
  const resolutionContext = buildVehicleResolutionContext(vehicles);
  const filteredTrips: Array<{ trip: TripRow; resolvedVehicleId: string }> = [];
  for (const trip of trips) {
    if (!tripInPeriod(trip, period)) continue;
    const resolvedVehicleId = resolveVehicleIdForTripWithContext(
      trip,
      resolutionContext,
    );
    if (!resolvedVehicleId) continue;
    filteredTrips.push({ trip, resolvedVehicleId });
  }
  const outByTripId: Record<string, number> = {};
  const operationalByTripId: Record<string, number> = {};
  const maintenanceByTripId: Record<string, number> = {};
  filteredTrips.forEach(({ trip: t }) => {
    const isSupplierTrip =
      organizationId != null &&
      String(t.organization_id ?? "").trim() !== String(organizationId).trim();
    // Own trips: supplier_rate is our cost (we pay the carrier). Supplier trips: we ARE the carrier, no supplier cost.
    const baseCost = isSupplierTrip ? 0 : Number(t.supplier_rate ?? 0);
    outByTripId[t.id] = baseCost;
    operationalByTripId[t.id] = baseCost;
    maintenanceByTripId[t.id] = 0;
  });
  (transactions ?? []).forEach((tx) => {
    if (tx.trip_id && outByTripId[tx.trip_id] != null) {
      // Exclude driver payments (commission, salary, etc.) from vehicle expense.
      if (tx.contact_type === "driver" || isDriverPaymentByDescription(tx))
        return;
      const amount = Number(tx.amount_out ?? 0);
      outByTripId[tx.trip_id] += amount;
      operationalByTripId[tx.trip_id] += amount;
    }
  });
  const allocatedOwnershipByVehicleId = new Map<string, number>();
  (vehicleLedgerEntries ?? []).forEach((entry) => {
    if (!vehicleLedgerExpenseInPeriod(entry, period)) return;
    const amount = Number(entry.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const tripId = String(entry.trip_id ?? "").trim();
    const sourceType = normalizeSourceType(entry.source_type);
    const isOwnership = isOwnershipSource(sourceType, tripId);
    const isMaintenance = isMaintenanceSource(sourceType);
    if (tripId && outByTripId[tripId] != null) {
      if (!isOwnership) {
        outByTripId[tripId] += amount;
        operationalByTripId[tripId] += amount;
        if (isMaintenance) maintenanceByTripId[tripId] += amount;
      } else {
        const vehicleId = String(entry.vehicle_id ?? "").trim();
        if (vehicleId) {
          allocatedOwnershipByVehicleId.set(
            vehicleId,
            (allocatedOwnershipByVehicleId.get(vehicleId) ?? 0) + amount,
          );
        }
      }
    }
  });

  const vMap = new Map<string, VehiclePnLRow>();
  vehicles.forEach((v) => {
    vMap.set(v.id, {
      id: v.id,
      name: formatIndianVehicleNumber(v.vehicle_number),
      type: [v.vehicle_type, v.capacity].filter(Boolean).join(" ") || "—",
      isUnassigned: false,
      trips: 0,
      sales: 0,
      expense: 0,
      operationalExpense: 0,
      ownershipExpense: 0,
      maintenanceExpense: 0,
      allocatedCost: 0,
      unallocatedCost: 0,
      outstandingPayables: 0,
      allocationEfficiency: 0,
      pnl: 0,
      margin: 0,
    });
  });

  filteredTrips.forEach(({ trip: t, resolvedVehicleId }) => {
    const row = vMap.get(resolvedVehicleId);
    if (!row) return;
    // Own trips: sales = client_price. Supplier trips (we're carrier): sales = supplier_rate.
    const isSupplierTrip =
      organizationId != null &&
      String(t.organization_id ?? "").trim() !== String(organizationId).trim();
    const sales = isSupplierTrip
      ? Number(t.supplier_rate ?? 0)
      : Number(t.client_price ?? 0);
    const expense = outByTripId[t.id] ?? 0;
    const net = sales - expense;
    row.trips += 1;
    row.sales += sales;
    row.expense += expense;
    row.operationalExpense += operationalByTripId[t.id] ?? expense;
    row.maintenanceExpense += maintenanceByTripId[t.id] ?? 0;
    row.pnl += net;
  });

  /** Trip-linked cash-out already rolled into outByTripId / row.expense above — do not double-count. */
  const standaloneExpenseByVehicleId = new Map<string, number>();
  for (const tx of transactions ?? []) {
    const out = Number(tx.amount_out ?? 0);
    if (out <= 0) continue;
    if (tx.contact_type === "driver" || isDriverPaymentByDescription(tx)) continue;
    if (!ledgerTransactionInPeriod(tx, period)) continue;
    const tripId = tx.trip_id?.trim();
    const countedViaTrip = Boolean(tripId && outByTripId[tripId] != null);
    if (countedViaTrip) continue;
    const vNum = (tx.vehicle_number ?? "").trim();
    if (!vNum) continue;
    const norm = normalizeVehicleNumberForMatch(vNum);
    if (!norm) continue;
    const vid = resolutionContext.vehicleIdByNormalizedNumber.get(norm);
    if (!vid) continue;
    standaloneExpenseByVehicleId.set(
      vid,
      (standaloneExpenseByVehicleId.get(vid) ?? 0) + out,
    );
  }

  const ownershipExpenseByVehicleId = new Map<string, number>();
  const ownershipMaintenanceByVehicleId = new Map<string, number>();
  for (const entry of vehicleLedgerEntries ?? []) {
    if (!vehicleLedgerExpenseInPeriod(entry, period)) continue;
    const amount = Number(entry.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const vehicleId = String(entry.vehicle_id ?? "").trim();
    if (!vehicleId || !vMap.has(vehicleId)) continue;
    const tripId = String(entry.trip_id ?? "").trim();
    const sourceType = normalizeSourceType(entry.source_type);
    const isOwnership = isOwnershipSource(sourceType, tripId);
    const isMaintenance = isMaintenanceSource(sourceType);
    if (tripId && outByTripId[tripId] != null) continue;
    if (isOwnership || isMaintenance) {
      ownershipExpenseByVehicleId.set(
        vehicleId,
        (ownershipExpenseByVehicleId.get(vehicleId) ?? 0) + amount,
      );
      if (isMaintenance) {
        ownershipMaintenanceByVehicleId.set(
          vehicleId,
          (ownershipMaintenanceByVehicleId.get(vehicleId) ?? 0) + amount,
        );
      }
      continue;
    }
    ownershipExpenseByVehicleId.set(
      vehicleId,
      (ownershipExpenseByVehicleId.get(vehicleId) ?? 0) + amount,
    );
  }

  const list = Array.from(vMap.values());
  for (const r of list) {
    const extra = standaloneExpenseByVehicleId.get(r.id) ?? 0;
    const ownership = ownershipExpenseByVehicleId.get(r.id) ?? 0;
    const maintenanceOwnership = ownershipMaintenanceByVehicleId.get(r.id) ?? 0;
    const allocated = allocatedOwnershipByVehicleId.get(r.id) ?? 0;
    const outstandingPayables = Math.max(
      0,
      Number(vehicleOutstandingPayablesByVehicleId?.[r.id] ?? 0) || 0,
    );
    const totalExtra = extra + ownership;
    if (totalExtra > 0) {
      r.expense += totalExtra;
      r.pnl -= extra;
      r.pnl -= ownership;
    }
    r.operationalExpense += extra;
    r.ownershipExpense += ownership;
    r.maintenanceExpense += maintenanceOwnership;
    r.allocatedCost = allocated;
    r.unallocatedCost = Math.max(0, ownership - allocated);
    r.outstandingPayables = outstandingPayables;
    r.allocationEfficiency = ownership > 0 ? Math.min(100, (allocated / ownership) * 100) : 0;
    if (outstandingPayables > 0) {
      r.pnl -= outstandingPayables;
    }
  }
  list.forEach((r) => {
    r.margin = r.sales > 0 ? (r.pnl / r.sales) * 100 : r.expense > 0 ? -100 : 0;
  });
  return list.sort((a, b) => b.pnl - a.pnl);
}

/** Expense breakdown for a single trip (for Trip P&L detail sheet). Aggregate: supplier cost = trip.supplier_rate only; ledger supplier payment excluded to avoid double-count. */
export function getExpenseBreakdownForTrip(
  trip: TripRow,
  transactions: LedgerRow[] | null,
): { supplier: number; ledgerLines: ExpenseLineItem[]; total: number } {
  const supplier = Number(trip.supplier_rate ?? 0);
  const list = transactions ?? [];
  const ledgerLines: ExpenseLineItem[] = [];
  for (let i = 0; i < list.length; i++) {
    const tx = list[i];
    if (tx.trip_id !== trip.id || Number(tx.amount_out ?? 0) <= 0) continue;
    if (trip.supplier_id && isSupplierPaymentForTrip(tx, trip)) continue;
    ledgerLines.push({
      id: tx.id,
      description:
        tx.description && tx.description !== "ENTRY"
          ? tx.description
          : "Expense",
      amount: Number(tx.amount_out ?? 0),
    });
  }
  const total = supplier + ledgerLines.reduce((s, l) => s + l.amount, 0);
  return { supplier, ledgerLines, total };
}

/** Grouped expense for Trip P&L detail UI: Supplier, Fuel, Toll, Driver, and other line items. */
export interface TripExpenseGrouped {
  supplier: number;
  fuel: number;
  toll: number;
  driver: number;
  other: Array<{ label: string; amount: number }>;
  total: number;
}

const CAT_FUEL = ["FUEL", "DIESEL", "PETROL"];
const CAT_TOLL = ["TOLL", "TOLLS", "FASTAG"];
const CAT_DRIVER = [
  "DRIVER SALARY",
  "TRIP-BASED COMMISSION",
  "DRIVER COMMISSION",
  "COMMISSION",
];

function normalizeDesc(d: string | null | undefined): string {
  return (d ?? "").trim().toUpperCase();
}

/** True when this ledger OUT is a supplier payment that is already reflected in trip.supplier_rate (aggregate flow). */
function isSupplierPaymentForTrip(tx: LedgerRow, trip: TripRow): boolean {
  if (tx.contact_type !== "supplier" || tx.contact_id == null) return false;
  const tripSupplierId = trip.supplier_id ?? "";
  const contactId = String(tx.contact_id).trim();
  return tripSupplierId !== "" && contactId === String(tripSupplierId).trim();
}

export function getExpenseGroupedForTrip(
  trip: TripRow,
  transactions: LedgerRow[] | null,
  /** When true (e.g. vehicle detail), exclude driver commission from expense. */
  excludeDriverFromExpense?: boolean,
): TripExpenseGrouped {
  // Asset trip (no partner): total expense = ledger cash out only; no supplier component.
  const supplier =
    trip.supplier_id != null ? Number(trip.supplier_rate ?? 0) : 0;
  const list = transactions ?? [];
  const txList: LedgerRow[] = [];
  for (let i = 0; i < list.length; i++) {
    const tx = list[i];
    if (tx.trip_id !== trip.id || Number(tx.amount_out ?? 0) <= 0) continue;
    if (trip.supplier_id && isSupplierPaymentForTrip(tx, trip)) continue;
    if (excludeDriverFromExpense && (tx.contact_type === "driver" || isDriverPaymentByDescription(tx)))
      continue;
    txList.push(tx);
  }
  let fuel = 0;
  let toll = 0;
  let driver = 0;
  const other: Array<{ label: string; amount: number }> = [];
  for (const tx of txList) {
    const desc = normalizeDesc(tx.description);
    const amount = Number(tx.amount_out ?? 0);
    if (CAT_FUEL.some((c) => desc === c)) {
      fuel += amount;
    } else if (CAT_TOLL.some((c) => desc === c)) {
      toll += amount;
    } else if (CAT_DRIVER.some((c) => desc === c)) {
      driver += amount;
    } else {
      other.push({
        label:
          tx.description && tx.description !== "ENTRY"
            ? tx.description
            : "Other",
        amount,
      });
    }
  }
  const total =
    supplier + fuel + toll + driver + other.reduce((s, o) => s + o.amount, 0);
  return { supplier, fuel, toll, driver, other, total };
}

/** Flat list of expense lines for Trip P&L table: label + amount, in display order. */
export function getExpenseLinesForTripPnL(
  trip: TripRow,
  transactions: LedgerRow[] | null,
  /** When true (e.g. vehicle detail), exclude driver commission from lines. */
  excludeDriverFromExpense?: boolean,
): Array<{ label: string; amount: number }> {
  const g = getExpenseGroupedForTrip(trip, transactions, excludeDriverFromExpense);
  const lines: Array<{ label: string; amount: number }> = [];
  if (trip.supplier_id != null)
    lines.push({ label: "Supplier Rate (Base Freight)", amount: g.supplier });
  if (g.fuel > 0) lines.push({ label: "Fuel", amount: g.fuel });
  if (g.toll > 0) lines.push({ label: "Tolls / Fastag", amount: g.toll });
  if (!excludeDriverFromExpense && g.driver > 0)
    lines.push({ label: "Trip-based commission", amount: g.driver });
  g.other.forEach((o) => lines.push({ label: o.label, amount: o.amount }));
  return lines;
}
