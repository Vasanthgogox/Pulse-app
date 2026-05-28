import type { PulseDataset, PulseFilterState } from "../types";
import { applyPulseFilters } from "./pulseSelectors";

export type AgingBucketId = "0_30" | "31_60" | "61_90" | "90_plus";

export type FinanceAgingKind = "receivable" | "payable";

export type AgingLineItem = {
  id: string;
  tripId: string;
  tripRef: string;
  party: string;
  category: string;
  amount: number;
  daysOutstanding: number;
  bucket: AgingBucketId;
  anchorDate: string;
};

export type AgingBucketSummary = {
  id: AgingBucketId;
  label: string;
  amount: number;
  count: number;
  sharePct: number;
};

export type PulseAgingReport = {
  kind: FinanceAgingKind;
  buckets: AgingBucketSummary[];
  lines: AgingLineItem[];
  totalOutstanding: number;
};

const BUCKET_META: Array<{ id: AgingBucketId; label: string }> = [
  { id: "0_30", label: "0–30 days" },
  { id: "31_60", label: "31–60 days" },
  { id: "61_90", label: "61–90 days" },
  { id: "90_plus", label: "90+ days" },
];

const MS_PER_DAY = 86400000;

const RECEIVABLE_CATEGORIES = new Set(["Client receivable"]);
const PAYABLE_CATEGORIES = new Set([
  "Supplier payable",
  "Fuel reimbursement",
  "Toll reimbursement",
]);

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function daysOutstanding(anchorIso: string | null, now: Date): number {
  if (!anchorIso) return 0;
  const anchor = new Date(anchorIso).getTime();
  if (!Number.isFinite(anchor)) return 0;
  return Math.max(0, Math.round((now.getTime() - anchor) / MS_PER_DAY));
}

function bucketForDays(days: number): AgingBucketId {
  if (days <= 30) return "0_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "90_plus";
}

function toSettlementState(row: {
  posting_state?: string | null;
  reimbursement_state?: string | null;
  payment_owner?: string | null;
}): "healthy" | "attention" | "critical" {
  const paymentOwner = String(row.payment_owner ?? "").toLowerCase();
  const posting = String(row.posting_state ?? "").toLowerCase();
  const reimbursement = String(row.reimbursement_state ?? "").toLowerCase();
  if (paymentOwner !== "driver") return "healthy";
  if (posting !== "posted") return "attention";
  if (reimbursement === "reimbursed") return "healthy";
  if (!reimbursement) return "critical";
  return "attention";
}

function buildAgingReport(lines: AgingLineItem[], kind: FinanceAgingKind): PulseAgingReport {
  const sorted = [...lines].sort(
    (a, b) => b.amount - a.amount || b.daysOutstanding - a.daysOutstanding,
  );
  const totalOutstanding = sorted.reduce((sum, line) => sum + line.amount, 0);
  const buckets = BUCKET_META.map((meta) => {
    const inBucket = sorted.filter((line) => line.bucket === meta.id);
    const amount = inBucket.reduce((sum, line) => sum + line.amount, 0);
    return {
      id: meta.id,
      label: meta.label,
      amount: Number(amount.toFixed(2)),
      count: inBucket.length,
      sharePct:
        totalOutstanding > 0 ? Number(((amount / totalOutstanding) * 100).toFixed(1)) : 0,
    };
  });

  return {
    kind,
    buckets,
    lines: sorted,
    totalOutstanding: Number(totalOutstanding.toFixed(2)),
  };
}

function collectAgingLines(
  dataset: PulseDataset,
  filters: PulseFilterState,
  labels: {
    clientNames: Map<string, string>;
    supplierNames: Map<string, string>;
    driverNames: Map<string, string>;
    vehicleLabels: Map<string, string>;
  },
  now: Date,
): AgingLineItem[] {
  const scoped = applyPulseFilters(dataset, filters);
  const tripById = new Map(scoped.trips.map((trip) => [trip.id, trip]));
  const lines: AgingLineItem[] = [];

  const pushLine = (input: Omit<AgingLineItem, "daysOutstanding" | "bucket"> & { anchorDate: string }) => {
    const days = daysOutstanding(input.anchorDate, now);
    lines.push({
      ...input,
      daysOutstanding: days,
      bucket: bucketForDays(days),
    });
  };

  for (const row of scoped.fuelRows) {
    if (toSettlementState(row) === "healthy") continue;
    const amount = Math.max(0, toNumber(row.amount_inr));
    if (amount <= 0) continue;
    const trip = tripById.get(row.trip_id);
    const tripRef = String(trip?.trip_operational_code ?? trip?.trip_number ?? row.trip_id);
    const anchorDate =
      isoDay(trip?.pickup_date) ?? isoDay(trip?.created_at) ?? isoDay(new Date().toISOString()) ?? "1970-01-01";
    const driverName = trip?.driver_id ? labels.driverNames.get(String(trip.driver_id)) : null;
    pushLine({
      id: `fuel-${row.id}`,
      tripId: row.trip_id,
      tripRef,
      party: driverName ?? "Driver settlement",
      category: "Fuel reimbursement",
      amount,
      anchorDate,
    });
  }

  for (const row of scoped.tollRows) {
    if (toSettlementState(row) === "healthy") continue;
    const amount = Math.max(0, toNumber(row.amount_inr));
    if (amount <= 0) continue;
    const trip = tripById.get(row.trip_id);
    const tripRef = String(trip?.trip_operational_code ?? trip?.trip_number ?? row.trip_id);
    const anchorDate =
      isoDay(trip?.pickup_date) ?? isoDay(trip?.created_at) ?? isoDay(new Date().toISOString()) ?? "1970-01-01";
    const driverName = trip?.driver_id ? labels.driverNames.get(String(trip.driver_id)) : null;
    pushLine({
      id: `toll-${row.id}`,
      tripId: row.trip_id,
      tripRef,
      party: driverName ?? "Driver settlement",
      category: "Toll reimbursement",
      amount,
      anchorDate,
    });
  }

  for (const trip of scoped.trips) {
    const supplierDue = Math.max(0, toNumber(trip.supplier_rate));
    if (supplierDue <= 0 || !trip.supplier_id) continue;
    const anchorDate = isoDay(trip.pickup_date) ?? isoDay(trip.created_at);
    if (!anchorDate) continue;
    pushLine({
      id: `supplier-${trip.id}`,
      tripId: trip.id,
      tripRef: String(trip.trip_operational_code ?? trip.trip_number ?? trip.id),
      party: labels.supplierNames.get(String(trip.supplier_id)) ?? "Supplier",
      category: "Supplier payable",
      amount: supplierDue,
      anchorDate,
    });
  }

  for (const trip of scoped.trips) {
    const clientDue = Math.max(0, toNumber(trip.client_price));
    if (clientDue <= 0 || !trip.client_id) continue;
    const anchorDate = isoDay(trip.pickup_date) ?? isoDay(trip.created_at);
    if (!anchorDate) continue;
    const days = daysOutstanding(anchorDate, now);
    if (days <= 7) continue;
    pushLine({
      id: `receivable-${trip.id}`,
      tripId: trip.id,
      tripRef: String(trip.trip_operational_code ?? trip.trip_number ?? trip.id),
      party: labels.clientNames.get(String(trip.client_id)) ?? "Client",
      category: "Client receivable",
      amount: clientDue,
      anchorDate,
    });
  }

  return lines;
}

export function selectReceivableAging(
  dataset: PulseDataset,
  filters: PulseFilterState,
  labels: {
    clientNames: Map<string, string>;
    supplierNames: Map<string, string>;
    driverNames: Map<string, string>;
    vehicleLabels: Map<string, string>;
  },
  now: Date = new Date(),
): PulseAgingReport {
  const lines = collectAgingLines(dataset, filters, labels, now).filter((line) =>
    RECEIVABLE_CATEGORIES.has(line.category),
  );
  return buildAgingReport(lines, "receivable");
}

export function selectPayableAging(
  dataset: PulseDataset,
  filters: PulseFilterState,
  labels: {
    clientNames: Map<string, string>;
    supplierNames: Map<string, string>;
    driverNames: Map<string, string>;
    vehicleLabels: Map<string, string>;
  },
  now: Date = new Date(),
): PulseAgingReport {
  const lines = collectAgingLines(dataset, filters, labels, now).filter((line) =>
    PAYABLE_CATEGORIES.has(line.category),
  );
  return buildAgingReport(lines, "payable");
}

/** @deprecated Use selectReceivableAging + selectPayableAging */
export function selectPayableSettlementAging(
  dataset: PulseDataset,
  filters: PulseFilterState,
  labels: {
    clientNames: Map<string, string>;
    supplierNames: Map<string, string>;
    driverNames: Map<string, string>;
    vehicleLabels: Map<string, string>;
  },
  now: Date = new Date(),
): PulseAgingReport {
  const lines = collectAgingLines(dataset, filters, labels, now);
  return buildAgingReport(lines, "payable");
}
