import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripExecutionModel } from "@/features/trips/domain/tripExecutionModel";
import type { PulseFilterState } from "@/features/business-pulse/types";
import type { DrilldownRowPartyIds } from "@/features/business-pulse/lib/pulsePartyAvatars.util";
import { vehicleDisplayLabel } from "@/features/business-pulse/lib/vehicleDisplay.util";
import { daysOutstanding } from "@/features/business-pulse/selectors/pulseAgingSelectors";
import type { FinanceAgingKind } from "@/features/business-pulse/selectors/pulseAgingSelectors";

export type DrilldownLens =
  | "overview"
  | "sales"
  | "supply"
  | "fleet"
  | "drivers"
  | "finance_receivable"
  | "finance_payable"
  | "compliance"
  | "operations";

export type DrilldownColumnKey =
  | "trip"
  | "date"
  | "route"
  | "branch"
  | "client"
  | "supplier"
  | "vehicle"
  | "driver"
  | "tripMode"
  | "execution"
  | "settlement"
  | "category"
  | "daysOutstanding"
  | "revenue"
  | "cost"
  | "margin"
  | "marginPct";

export type DrilldownColumnDef = {
  key: DrilldownColumnKey;
  label: string;
  align?: "left" | "right";
  width: number;
  /** Desktop table stretch weight (full-bleed layout). */
  flex?: number;
  pdfWidth: string;
  isMoney?: boolean;
  isPct?: boolean;
};

export type DrilldownCellValue = string | number;

export type DrilldownDataRow = Record<DrilldownColumnKey, DrilldownCellValue>;

export type PulseDrilldownView = {
  lens: DrilldownLens;
  lensLabel: string;
  filterCaption: string;
  columns: DrilldownColumnDef[];
  rows: DrilldownDataRow[];
  rowPartyIds: DrilldownRowPartyIds[];
};

type DomainTab =
  | "overview"
  | "sales"
  | "supply"
  | "fleet"
  | "drivers"
  | "finance"
  | "compliance"
  | "operations";

type NameLabels = {
  clientNames: Map<string, string>;
  supplierNames: Map<string, string>;
  driverNames: Map<string, string>;
  vehicleLabels: Map<string, string>;
};

const LENS_LABELS: Record<DrilldownLens, string> = {
  overview: "Executive overview",
  sales: "Sales & billing",
  supply: "Supply & payables",
  fleet: "Fleet economics",
  drivers: "Driver performance",
  finance_receivable: "Accounts receivable",
  finance_payable: "Accounts payable",
  compliance: "Compliance context",
  operations: "Operations detail",
};

const COLUMN: Record<DrilldownColumnKey, Omit<DrilldownColumnDef, "key">> = {
  trip: { label: "Trip", width: 88, flex: 1.15, pdfWidth: "9%" },
  date: { label: "Date", width: 72, flex: 0.95, pdfWidth: "8%" },
  route: { label: "Route", width: 140, flex: 1.85, pdfWidth: "16%" },
  branch: { label: "Branch", width: 80, flex: 1, pdfWidth: "9%" },
  client: { label: "Client", width: 100, flex: 1.45, pdfWidth: "12%" },
  supplier: { label: "Supplier", width: 100, flex: 1.45, pdfWidth: "12%" },
  vehicle: { label: "Vehicle", width: 96, flex: 1.2, pdfWidth: "10%" },
  driver: { label: "Driver", width: 88, flex: 1.2, pdfWidth: "10%" },
  tripMode: { label: "Payout", width: 64, flex: 0.85, pdfWidth: "7%" },
  execution: { label: "Model", width: 72, flex: 0.9, pdfWidth: "7%" },
  settlement: { label: "Settlement", width: 88, flex: 1.05, pdfWidth: "9%" },
  category: { label: "Category", width: 110, flex: 1.25, pdfWidth: "12%" },
  daysOutstanding: { label: "Days", align: "right", width: 48, flex: 0.65, pdfWidth: "6%" },
  revenue: { label: "Revenue", align: "right", width: 76, flex: 1.05, pdfWidth: "8%", isMoney: true },
  cost: { label: "Cost", align: "right", width: 76, flex: 1.05, pdfWidth: "8%", isMoney: true },
  margin: { label: "P&L", align: "right", width: 76, flex: 1.05, pdfWidth: "8%", isMoney: true },
  marginPct: { label: "Margin %", align: "right", width: 64, flex: 0.85, pdfWidth: "7%", isPct: true },
};

function col(...keys: DrilldownColumnKey[]): DrilldownColumnDef[] {
  return keys.map((key) => ({ key, ...COLUMN[key] }));
}

const LENS_COLUMNS: Record<DrilldownLens, DrilldownColumnKey[]> = {
  overview: ["trip", "date", "branch", "client", "supplier", "revenue", "margin", "settlement"],
  sales: ["trip", "date", "route", "client", "revenue", "cost", "margin", "marginPct", "execution"],
  supply: ["trip", "date", "route", "supplier", "client", "cost", "revenue", "margin", "settlement"],
  fleet: ["trip", "date", "vehicle", "route", "branch", "revenue", "cost", "margin", "execution"],
  drivers: ["trip", "date", "driver", "vehicle", "client", "tripMode", "settlement", "revenue", "margin"],
  finance_receivable: [
    "trip",
    "date",
    "client",
    "route",
    "revenue",
    "daysOutstanding",
    "settlement",
  ],
  finance_payable: [
    "trip",
    "date",
    "category",
    "supplier",
    "driver",
    "cost",
    "daysOutstanding",
    "settlement",
  ],
  compliance: ["trip", "date", "vehicle", "driver", "client", "branch", "settlement"],
  operations: ["trip", "date", "route", "branch", "tripMode", "execution", "client", "supplier", "vehicle"],
};

function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function resolveDrilldownLens(
  activeDomain: DomainTab,
  filters: PulseFilterState,
  financeLedger: FinanceAgingKind = "receivable",
): DrilldownLens {
  if (activeDomain === "finance") {
    return financeLedger === "payable" ? "finance_payable" : "finance_receivable";
  }

  if (filters.settlementStates.length > 0) return "finance_payable";

  const hasClient = filters.clientIds.length > 0;
  const hasSupplier = filters.supplierIds.length > 0;
  const hasDriver = filters.driverIds.length > 0;
  const hasVehicle = filters.vehicleIds.length > 0;

  if (hasDriver && !hasClient && !hasSupplier) return "drivers";
  if (hasSupplier && !hasClient && !hasDriver) return "supply";
  if (hasClient && !hasSupplier && !hasDriver) return "sales";
  if (hasVehicle && !hasClient && !hasSupplier && !hasDriver) return "fleet";

  if (hasClient) return "sales";
  if (hasSupplier) return "supply";
  if (hasDriver) return "drivers";
  if (hasVehicle) return "fleet";

  if (filters.routes.length > 0) return "operations";
  if (filters.complianceStates.length > 0) return "compliance";
  if (filters.vehicleTypes.length > 0) return "fleet";
  if (filters.executionModels.length === 1) {
    return filters.executionModels[0] === "asset" ? "fleet" : "supply";
  }

  if (activeDomain === "overview") return "overview";
  return activeDomain;
}

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function formatMarginPct(revenue: number, margin: number): string {
  if (revenue <= 0) return "—";
  return `${((margin / revenue) * 100).toFixed(1)}%`;
}

function tripAnchorDay(trip: TripRow): string | null {
  return isoDay(trip.pickup_date) ?? isoDay(trip.created_at);
}

function isReceivableTrip(trip: TripRow, now: Date): boolean {
  const clientDue = Math.max(0, toNumber(trip.client_price));
  if (clientDue <= 0 || !trip.client_id) return false;
  const anchor = tripAnchorDay(trip);
  if (!anchor) return false;
  return daysOutstanding(anchor, now) > 7;
}

function tripPayableCategory(
  trip: TripRow,
  settlementLabel: string,
): string {
  const supplierDue = Math.max(0, toNumber(trip.supplier_rate));
  const hasSupplier = supplierDue > 0 && Boolean(trip.supplier_id);
  const hasSettlement = settlementLabel !== "Settled";
  if (hasSupplier && hasSettlement) return "Supplier + settlement";
  if (hasSupplier) return "Supplier payable";
  if (hasSettlement) return "Driver settlement";
  return "—";
}

function isPayableTrip(
  trip: TripRow,
  settlementLabel: string,
  tripPayableAmountByTripId?: Map<string, number>,
): boolean {
  const mapped = tripPayableAmountByTripId?.get(trip.id) ?? 0;
  if (mapped > 0) return true;
  const supplierDue = Math.max(0, toNumber(trip.supplier_rate));
  if (supplierDue > 0 && trip.supplier_id) return true;
  return settlementLabel !== "Settled";
}

export function buildPulseFilterCaption(
  filters: PulseFilterState,
  nameLabels: NameLabels,
  extras?: {
    compareCaption?: string;
    dateRangeLabel?: string;
    financeLedger?: FinanceAgingKind;
  },
): string {
  const parts: string[] = [];

  if (extras?.financeLedger) {
    parts.push(extras.financeLedger === "receivable" ? "Ledger: Receivable" : "Ledger: Payable");
  }
  if (extras?.dateRangeLabel) parts.push(`Period: ${extras.dateRangeLabel}`);
  if (extras?.compareCaption) parts.push(extras.compareCaption);

  const nameList = (ids: string[], map: Map<string, string>, label: string) => {
    if (ids.length === 0) return;
    const names = ids.map((id) => map.get(id) ?? id).slice(0, 3);
    const suffix = ids.length > 3 ? ` +${ids.length - 3} more` : "";
    parts.push(`${label}: ${names.join(", ")}${suffix}`);
  };

  nameList(filters.clientIds, nameLabels.clientNames, "Client");
  nameList(filters.supplierIds, nameLabels.supplierNames, "Supplier");
  nameList(filters.driverIds, nameLabels.driverNames, "Driver");
  nameList(filters.vehicleIds, nameLabels.vehicleLabels, "Vehicle");

  if (filters.routes.length > 0) {
    parts.push(`Route: ${filters.routes.slice(0, 2).join(", ")}${filters.routes.length > 2 ? "…" : ""}`);
  }
  if (filters.executionModels.length > 0) {
    parts.push(
      `Model: ${filters.executionModels.map((m) => (m === "asset" ? "Asset" : "Aggregate")).join(", ")}`,
    );
  }
  if (filters.settlementStates.length > 0) {
    parts.push(`Settlement: ${filters.settlementStates.join(", ")}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "All trips in selected period";
}

export function buildPulseDrilldownView(input: {
  trips: TripRow[];
  filters: PulseFilterState;
  activeDomain: DomainTab;
  financeLedger?: FinanceAgingKind;
  nameLabels: NameLabels;
  tripSettlementByTripId: Map<string, string>;
  tripPayableAmountByTripId?: Map<string, number>;
  dateRangeLabel?: string;
  compareCaption?: string;
  now?: Date;
}): PulseDrilldownView {
  const now = input.now ?? new Date();
  const financeLedger = input.financeLedger ?? "receivable";
  const lens = resolveDrilldownLens(input.activeDomain, input.filters, financeLedger);
  let columnKeys = LENS_COLUMNS[lens];
  let columns = col(...columnKeys);

  if (lens === "finance_receivable") {
    columns = columns.map((c) => (c.key === "revenue" ? { ...c, label: "Receivable" } : c));
  }
  if (lens === "finance_payable") {
    columns = columns.map((c) => (c.key === "cost" ? { ...c, label: "Payable" } : c));
  }

  const { clientNames, supplierNames, driverNames, vehicleLabels } = input.nameLabels;

  const filteredTrips = input.trips.filter((trip) => {
    const settlement = input.tripSettlementByTripId.get(trip.id) ?? "Settled";
    if (lens === "finance_receivable") return isReceivableTrip(trip, now);
    if (lens === "finance_payable") {
      return isPayableTrip(trip, settlement, input.tripPayableAmountByTripId);
    }
    return true;
  });

  const rows: DrilldownDataRow[] = [];
  const rowPartyIds: DrilldownRowPartyIds[] = [];

  for (const trip of filteredTrips) {
    const revenue = Number(trip.client_price ?? 0);
    const cost = Number(trip.supplier_rate ?? 0);
    const margin = revenue - cost;
    const dateIso = String(trip.pickup_date ?? trip.created_at ?? "").slice(0, 10);
    const branch = String(trip.pickup_area ?? "").split(",")[0]?.trim() || "—";
    const route = `${trip.pickup_area ?? "—"} → ${trip.drop_location ?? "—"}`;
    const execution =
      getTripExecutionModel(trip) === "asset" ? "Asset" : "Aggregate";
    const settlement = input.tripSettlementByTripId.get(trip.id) ?? "Settled";
    const anchor = tripAnchorDay(trip);
    const days = anchor ? daysOutstanding(anchor, now) : 0;
    const payableAmount =
      input.tripPayableAmountByTripId?.get(trip.id) ??
      (Math.max(0, toNumber(trip.supplier_rate)) > 0 && trip.supplier_id
        ? Math.max(0, toNumber(trip.supplier_rate))
        : 0);

    rows.push({
      trip: String(trip.trip_operational_code ?? trip.trip_number ?? trip.id),
      date: dateIso || "—",
      route,
      branch,
      client: clientNames.get(String(trip.client_id ?? "")) ?? "—",
      supplier: supplierNames.get(String(trip.supplier_id ?? "")) ?? "—",
      vehicle: vehicleDisplayLabel(vehicleLabels, trip.vehicle_id),
      driver: driverNames.get(String(trip.driver_id ?? "")) ?? "—",
      tripMode: String(trip.trip_payout_mode ?? "—"),
      execution,
      settlement,
      category: tripPayableCategory(trip, settlement),
      daysOutstanding: days,
      revenue: lens === "finance_payable" ? payableAmount : revenue,
      cost: lens === "finance_payable" ? payableAmount : cost,
      margin,
      marginPct: formatMarginPct(revenue, margin),
    });
    rowPartyIds.push({
      clientId: trip.client_id,
      supplierId: trip.supplier_id,
      driverId: trip.driver_id,
      vehicleId: trip.vehicle_id,
    });
  }

  const filterCaption = buildPulseFilterCaption(input.filters, input.nameLabels, {
    compareCaption: input.compareCaption,
    dateRangeLabel: input.dateRangeLabel,
    financeLedger:
      lens === "finance_receivable" || lens === "finance_payable" ? financeLedger : undefined,
  });

  return {
    lens,
    lensLabel: LENS_LABELS[lens],
    filterCaption,
    columns,
    rows,
    rowPartyIds,
  };
}

/** Format cell for PDF/Excel export */
export function formatDrilldownCell(
  row: DrilldownDataRow,
  column: DrilldownColumnDef,
): string {
  const raw = row[column.key];
  if (column.isMoney && typeof raw === "number") return inr(raw);
  if (column.key === "daysOutstanding" && typeof raw === "number") return String(raw);
  if (column.isPct) return String(raw);
  return String(raw ?? "—");
}

export function drilldownViewSummaryCards(
  view: PulseDrilldownView,
): Array<{ label: string; value: string }> {
  if (view.lens === "finance_receivable") {
    const receivable = view.rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
    return [
      { label: "Open items", value: String(view.rows.length) },
      { label: "Receivable", value: inr(receivable) },
      {
        label: "Avg days",
        value:
          view.rows.length > 0
            ? String(
                Math.round(
                  view.rows.reduce((s, r) => s + Number(r.daysOutstanding ?? 0), 0) / view.rows.length,
                ),
              )
            : "0",
      },
    ];
  }

  if (view.lens === "finance_payable") {
    const payable = view.rows.reduce((s, r) => s + Number(r.cost ?? 0), 0);
    return [
      { label: "Open items", value: String(view.rows.length) },
      { label: "Payable", value: inr(payable) },
      {
        label: "Avg days",
        value:
          view.rows.length > 0
            ? String(
                Math.round(
                  view.rows.reduce((s, r) => s + Number(r.daysOutstanding ?? 0), 0) / view.rows.length,
                ),
              )
            : "0",
      },
    ];
  }

  const revenue = view.rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const margin = view.rows.reduce((s, r) => s + Number(r.margin ?? 0), 0);
  const cost = view.rows.reduce((s, r) => s + Number(r.cost ?? 0), 0);
  return [
    { label: "Trips", value: String(view.rows.length) },
    { label: "Revenue", value: inr(revenue) },
    { label: "Cost", value: inr(cost) },
    { label: "P&L", value: inr(margin) },
  ];
}
