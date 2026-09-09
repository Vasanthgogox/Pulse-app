import type { FinancialRowData } from "@/features/finance/components/FinancialRow";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import type { RegistryStatusTone } from "@/lib/alertRegistry/registryAlertPresentation.util";

export type LedgerAuditEventKind =
  | "payment_in"
  | "payment_out"
  | "trip_created"
  | "assignment"
  | "reassignment"
  | "reconciliation"
  | "balance";

export type LedgerAuditFeedEvent = {
  id: string;
  at: string;
  kind: LedgerAuditEventKind;
  actorName: string;
  actionText: string;
  highlightText?: string;
  trailingText?: string;
  detailTitle?: string;
  detailSubtitle?: string;
  timeLabel: string;
  contextLabel?: string;
  statusLabel?: string;
  statusTone?: RegistryStatusTone;
  isCurrentEntry?: boolean;
  isUnread?: boolean;
};

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) return "—";
    const diffMs = Date.now() - ts;
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days} days ago`;
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatAmount(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function tripRoute(data: FinancialRowData): string {
  const d = data.tripDetail;
  if (!d) return "";
  return [d.pickup_area, d.drop_location].filter(Boolean).join(" → ");
}

function tripLabel(data: FinancialRowData): string {
  return (
    (data.tripDetail?.trip_number ?? data.msn ?? "").trim() || "Trip"
  );
}

function paymentEventsFromRow(
  row: {
    id: string;
    date: string;
    typeLabel: string;
    in: number;
    out: number;
    party: string;
  },
  highlightId: string,
  tripRef: string,
): LedgerAuditFeedEvent[] {
  const isIn = row.in > 0;
  const amount = isIn ? row.in : row.out;
  if (amount <= 0) return [];
  const at = row.date;
  return [
    {
      id: `payment-${row.id}`,
      at,
      kind: isIn ? "payment_in" : "payment_out",
      actorName: row.party || "Ledger",
      actionText: isIn ? "received" : "paid",
      highlightText: `₹${formatAmount(amount)}`,
      trailingText: `on ${tripRef}`,
      detailTitle: tripRef,
      detailSubtitle: `${isIn ? "+" : "−"} ₹${formatAmount(amount)} · ${row.typeLabel}`,
      timeLabel: formatRelativeTime(at),
      contextLabel: "Finance",
      statusLabel: isIn ? "Payment received" : "Payment recorded",
      statusTone: isIn ? "success" : "warning",
      isCurrentEntry: row.id === highlightId,
      isUnread: row.id === highlightId,
    },
  ];
}

function assignmentEvent(
  row: TripAssignmentAuditRow,
  driverFallback?: string | null,
  vehicleFallback?: string | null,
  tripRef?: string,
): LedgerAuditFeedEvent {
  const driver =
    row.driver_name_new?.trim() ||
    driverFallback?.trim() ||
    (row.driver_id_new ? "Driver" : "—");
  const vehicle =
    row.vehicle_number_new?.trim() ||
    vehicleFallback?.trim() ||
    (row.vehicle_id_new ? "Vehicle" : "");
  const isReassign = row.event_type === "reassignment";
  return {
    id: `assign-${row.id}`,
    at: row.changed_at,
    kind: isReassign ? "reassignment" : "assignment",
    actorName: "Fleet",
    actionText: isReassign ? "reassigned" : "assigned",
    highlightText: driver,
    trailingText: vehicle ? `on ${vehicle}` : "to trip",
    detailTitle: tripRef || "Trip",
    detailSubtitle: [driver, vehicle].filter(Boolean).join(" · "),
    timeLabel: formatRelativeTime(row.changed_at),
    contextLabel: "Assignment",
    statusLabel: isReassign ? "Reassigned" : "Assigned",
      statusTone: "neutral",
  };
}

export function buildLedgerAuditFeed(params: {
  data: FinancialRowData;
  assignmentRows?: TripAssignmentAuditRow[];
}): LedgerAuditFeedEvent[] {
  const { data, assignmentRows = [] } = params;
  const events: LedgerAuditFeedEvent[] = [];
  const highlightId = data.id;
  const route = tripRoute(data);
  const tripRef = tripLabel(data);

  if (data.tripDetail?.pickup_date) {
    events.push({
      id: `trip-created-${data.tripId ?? tripRef}`,
      at: data.tripDetail.pickup_date,
      kind: "trip_created",
      actorName: data.tripDetail.client_name?.trim() || "Trip",
      actionText: "created trip",
      highlightText: tripRef,
      trailingText: route ? `· ${route}` : undefined,
      detailTitle: tripRef,
      detailSubtitle: route || undefined,
      timeLabel: formatRelativeTime(data.tripDetail.pickup_date),
      contextLabel: "Trip",
      statusLabel: "Created",
      statusTone: "neutral",
    });
  }

  for (const row of assignmentRows) {
    events.push(
      assignmentEvent(row, data.driverName, data.tripDetail?.vehicle_number, tripRef),
    );
  }

  const sameTx = data.sameTripTransactions ?? [];
  for (const tx of sameTx) {
    events.push(...paymentEventsFromRow(tx, highlightId, tripRef));
  }

  const inAmt = Number(data.in ?? 0);
  const outAmt = Number(data.out ?? 0);
  if ((inAmt > 0 || outAmt > 0) && !sameTx.some((t) => t.id === highlightId)) {
    const isIn = inAmt > 0;
    const amount = isIn ? inAmt : outAmt;
    const at = data.transaction_date ?? data.left_at ?? new Date().toISOString();
    const typeLabel = data.transactionTypeLabel ?? data.desc ?? "Payment";
    events.push({
      id: `payment-current-${data.id}`,
      at,
      kind: isIn ? "payment_in" : "payment_out",
      actorName: data.name?.trim() || "Ledger",
      actionText: isIn ? "received" : "paid",
      highlightText: `₹${formatAmount(amount)}`,
      trailingText: `on ${tripRef}`,
      detailTitle: tripRef,
      detailSubtitle: `${isIn ? "+" : "−"} ₹${formatAmount(amount)} · ${[typeLabel, data.paymentMode].filter(Boolean).join(" · ")}`,
      timeLabel: formatRelativeTime(at),
      contextLabel: "This entry",
      statusLabel: isIn ? "Payment received" : "Payment recorded",
      statusTone: isIn ? "success" : "warning",
      isCurrentEntry: true,
      isUnread: true,
    });
  }

  if (data.reconciliationLabel) {
    events.push({
      id: `recon-${data.id}`,
      at: data.transaction_date ?? new Date().toISOString(),
      kind: "reconciliation",
      actorName: "Ledger",
      actionText: "reconciliation",
      highlightText: data.reconciliationLabel,
      detailTitle: data.reconciliationActionLabel ?? data.reconciliationLabel,
      detailSubtitle: data.reconciliationHelperText ?? undefined,
      timeLabel: formatRelativeTime(data.transaction_date),
      contextLabel: "Reconcile",
      statusLabel: data.reconciliationStatus === "match_found" ? "Matched" : "Review",
      statusTone: data.reconciliationStatus === "mismatch" ? "danger" : "neutral",
    });
  }

  const summary = data.tripPaymentSummary;
  if (summary && (summary.received > 0 || summary.paid > 0)) {
    const party = data.ledgerPartyType;
    const sale = Number(data.tripDetail?.client_price ?? 0);
    const cost = Number(data.tripDetail?.supplier_rate ?? 0);
    const due =
      party === "client"
        ? sale - summary.received
        : party === "supplier"
          ? cost - summary.paid
          : 0;
    if (due !== 0 || summary.entryCount > 1) {
      events.push({
        id: `balance-${data.tripId ?? data.id}`,
        at: data.transaction_date ?? new Date().toISOString(),
        kind: "balance",
        actorName: "Trip ledger",
        actionText: due > 0 ? "shows outstanding" : "is settled for",
        highlightText: tripRef,
        detailTitle:
          party === "supplier"
            ? `Due ₹${formatAmount(Math.max(0, due))}`
            : party === "client"
              ? `Receivable ₹${formatAmount(Math.max(0, due))}`
              : `Paid ₹${formatAmount(summary.paid)}`,
        detailSubtitle: `${summary.entryCount} entries on trip`,
        timeLabel: "Current",
        contextLabel: "Balance",
        statusLabel: due > 0 ? "Outstanding" : "Settled",
        statusTone: due > 0 ? "warning" : "success",
      });
    }
  }

  return events.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
