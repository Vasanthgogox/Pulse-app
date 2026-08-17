/**
 * Entity-scoped ledger / trip reports — each party type gets its own columns
 * (client: P&L + receivable; supplier & driver: payable + performance).
 */
import { formatINR } from "@/lib/format";
import type { LedgerReportModalProps } from "@/features/finance/components/LedgerReportModal";

export type EntityCustomReport = NonNullable<LedgerReportModalProps["customReport"]>;

export function formatSettlementPct(paid: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.min(100, Math.round((paid / total) * 100))}%`;
}

export function buildClientReceivableReport(
  rows: Array<{
    trip: string;
    tripDate?: string;
    route: string;
    sales: string;
    received: string;
    due: string;
    txns: number;
    lastTxn: string;
  }>,
): EntityCustomReport {
  return {
    columns: [
      { key: "trip", label: "Trip" },
      { key: "route", label: "Route" },
      { key: "sales", label: "Billed", align: "right" },
      { key: "received", label: "Received", align: "right" },
      { key: "due", label: "Receivable", align: "right" },
      { key: "txns", label: "Txns", align: "right" },
      { key: "lastTxn", label: "Last Txn", align: "right" },
    ],
    rows,
  };
}

export function buildClientPnLReport(
  rows: Array<{
    trip: string;
    tripDate?: string;
    route: string;
    model: string;
    supplier: string;
    sales: string;
    cost: string;
    pnl: string;
    margin: string;
    received: string;
    due: string;
    txns: number;
    lastTxn: string;
  }>,
): EntityCustomReport {
  return {
    columns: [
      { key: "trip", label: "Trip" },
      { key: "route", label: "Route" },
      { key: "model", label: "Model" },
      { key: "supplier", label: "Supplier" },
      { key: "sales", label: "Sales", align: "right" },
      { key: "cost", label: "Cost", align: "right" },
      { key: "pnl", label: "P&L", align: "right" },
      { key: "margin", label: "Margin %", align: "right" },
      { key: "received", label: "Received", align: "right" },
      { key: "due", label: "Due", align: "right" },
      { key: "txns", label: "Txns", align: "right" },
      { key: "lastTxn", label: "Last Txn", align: "right" },
    ],
    rows,
  };
}

export function buildSupplierPayableReport(
  rows: Array<{
    trip: string;
    tripDate?: string;
    route: string;
    client: string;
    cost: string;
    paid: string;
    due: string;
    settlement: string;
    txns: number;
    lastTxn: string;
  }>,
): EntityCustomReport {
  return {
    columns: [
      { key: "trip", label: "Trip" },
      { key: "route", label: "Route" },
      { key: "client", label: "Client" },
      { key: "cost", label: "Payable", align: "right" },
      { key: "paid", label: "Paid", align: "right" },
      { key: "due", label: "Due", align: "right" },
      { key: "settlement", label: "Settled %", align: "right" },
      { key: "txns", label: "Txns", align: "right" },
      { key: "lastTxn", label: "Last Txn", align: "right" },
    ],
    rows,
  };
}

export function buildDriverPayableReport(
  rows: Array<{
    trip: string;
    tripDate?: string;
    route: string;
    client: string;
    contract: string;
    paid: string;
    due: string;
    settlement: string;
    commissionBasis: string;
    txns: number;
    lastTxn: string;
  }>,
): EntityCustomReport {
  return {
    columns: [
      { key: "trip", label: "Trip" },
      { key: "route", label: "Route" },
      { key: "client", label: "Client" },
      { key: "contract", label: "Contract", align: "right" },
      { key: "paid", label: "Paid", align: "right" },
      { key: "due", label: "Payable", align: "right" },
      { key: "settlement", label: "Settled %", align: "right" },
      { key: "commissionBasis", label: "Basis" },
      { key: "txns", label: "Txns", align: "right" },
      { key: "lastTxn", label: "Last Txn", align: "right" },
    ],
    rows,
  };
}

export function formatReportInr(value: number): string {
  return formatINR(Math.round(value));
}
