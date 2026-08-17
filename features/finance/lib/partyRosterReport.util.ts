/**
 * List-level party reports — same five columns as the Finance table preview
 * (Customers, Suppliers, Drivers), with Indian rupee grouping.
 */
import type { FinancialRowData } from "../aggregation/types";
import type { EntityCustomReport } from "./entityDetailReports.util";

/** Match table cells: ₹2,84,500 (en-IN, no space after the symbol). */
export function formatRosterInr(value: number): string {
  const n = Math.round(Number(value) || 0);
  if (n < 0) return `-₹${Math.abs(n).toLocaleString("en-IN")}`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function buildCustomersRosterReport(
  rows: FinancialRowData[],
): EntityCustomReport {
  return {
    columns: [
      { key: "entity", label: "Customer Entity" },
      { key: "trips", label: "Trips", align: "center" },
      { key: "sales", label: "Sales", align: "right" },
      { key: "received", label: "Received", align: "right" },
      { key: "due", label: "Due", align: "right" },
    ],
    rows: rows.map((row) => {
      const due = row.pending ?? 0;
      const sales = row.billed ?? 0;
      const received = row.received ?? Math.max(0, sales - due);
      return {
        entity: row.name || "—",
        trips: row.trips ?? 0,
        sales: formatRosterInr(sales),
        received: formatRosterInr(received),
        due: formatRosterInr(due),
      };
    }),
  };
}

export function buildSuppliersRosterReport(
  rows: FinancialRowData[],
): EntityCustomReport {
  return {
    columns: [
      { key: "entity", label: "Supplier Entity" },
      { key: "trips", label: "Trips", align: "center" },
      { key: "payables", label: "Payables", align: "right" },
      { key: "paid", label: "Paid", align: "right" },
      { key: "due", label: "Due", align: "right" },
    ],
    rows: rows.map((row) => ({
      entity: row.name || "—",
      trips: row.trips ?? 0,
      payables: formatRosterInr(row.payables ?? 0),
      paid: formatRosterInr(row.paid ?? 0),
      due: formatRosterInr(row.due ?? 0),
    })),
  };
}

export function buildDriversRosterReport(
  rows: FinancialRowData[],
): EntityCustomReport {
  return {
    columns: [
      { key: "entity", label: "Driver Entity" },
      { key: "trips", label: "Trips", align: "center" },
      { key: "earned", label: "Earned", align: "right" },
      { key: "paid", label: "Paid", align: "right" },
      { key: "due", label: "Pending", align: "right" },
    ],
    rows: rows.map((row) => ({
      entity: row.name || "—",
      trips: row.trips ?? 0,
      earned: formatRosterInr(row.due ?? 0),
      paid: formatRosterInr(row.paid ?? 0),
      due: formatRosterInr(row.pending ?? 0),
    })),
  };
}

const GARAGE_MONEY_COLUMNS: EntityCustomReport["columns"] = [
  { key: "trips", label: "Trips", align: "center" },
  { key: "sales", label: "Sales", align: "right" },
  { key: "expense", label: "Expense", align: "right" },
  { key: "pnl", label: "P&L", align: "right" },
];

export function buildGarageTripRosterReport(
  rows: Array<{
    missionId: string;
    sales?: number;
    totalExpense?: number;
    net?: number;
  }>,
): EntityCustomReport {
  return {
    columns: [
      { key: "entity", label: "Trip" },
      ...GARAGE_MONEY_COLUMNS,
    ],
    rows: rows.map((row) => ({
      entity: row.missionId || "—",
      trips: 1,
      sales: formatRosterInr(row.sales ?? 0),
      expense: formatRosterInr(row.totalExpense ?? 0),
      pnl: formatRosterInr(row.net ?? 0),
    })),
  };
}

export function buildGarageVehicleRosterReport(
  rows: Array<{
    name: string;
    trips?: number;
    sales?: number;
    expense?: number;
    pnl?: number;
  }>,
): EntityCustomReport {
  return {
    columns: [
      { key: "entity", label: "Vehicle Entity" },
      ...GARAGE_MONEY_COLUMNS,
    ],
    rows: rows.map((row) => ({
      entity: row.name || "—",
      trips: row.trips ?? 0,
      sales: formatRosterInr(row.sales ?? 0),
      expense: formatRosterInr(row.expense ?? 0),
      pnl: formatRosterInr(row.pnl ?? 0),
    })),
  };
}
