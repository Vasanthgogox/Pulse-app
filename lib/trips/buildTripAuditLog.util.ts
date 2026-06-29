import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import type { DriverActivityTimelineRow } from "@/features/trips/components/trip-detail/hooks/useTripDetail";
import type {
  TripAuditFilterTab,
  TripAuditLogCategory,
  TripAuditLogEntry,
} from "@/lib/trips/tripAuditLog.types";

function formatAuditTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const day = d.getDate();
    const month = d.toLocaleString("en-IN", { month: "short" }).toUpperCase();
    const year = d.getFullYear();
    const time = d.toLocaleString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${day} ${month} ${year} · ${time}`;
  } catch {
    return "—";
  }
}

function formatAmount(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function resolveActorLabel(
  changedBy: string | null | undefined,
  currentUserId: string | null | undefined,
  fallback = "System",
): string {
  if (!changedBy) return fallback;
  if (currentUserId && changedBy === currentUserId) return "You";
  return "Dispatcher";
}

function categoryLabel(category: TripAuditLogCategory): string {
  switch (category) {
    case "payment":
      return "Payment";
    case "assignment":
      return "Assignment";
    case "status":
      return "Status";
    case "trip":
      return "Trip";
    default:
      return "Trip";
  }
}

function statusActorFallback(context: string): string {
  if (context === "created") return "System";
  if (context === "accepted") return "Driver";
  return "Fleet";
}

export function matchesTripAuditTab(
  entry: TripAuditLogEntry,
  tab: TripAuditFilterTab,
): boolean {
  if (tab === "all") return true;
  if (tab === "payment") return entry.category === "payment";
  if (tab === "assignment") return entry.category === "assignment";
  if (tab === "trip") {
    return entry.category === "trip" || entry.category === "status";
  }
  return true;
}

export function buildTripAuditLog(params: {
  tripRef: string;
  assignmentAuditRows: TripAssignmentAuditRow[];
  assignmentDriverNames: Record<string, string>;
  assignmentVehicleLabels: Record<string, string>;
  timelineRows: DriverActivityTimelineRow[];
  transactions: LedgerRow[] | null | undefined;
  currentUserId?: string | null;
}): TripAuditLogEntry[] {
  const {
    tripRef,
    assignmentAuditRows,
    assignmentDriverNames,
    assignmentVehicleLabels,
    timelineRows,
    transactions,
    currentUserId,
  } = params;

  const entries: TripAuditLogEntry[] = [];

  for (const row of assignmentAuditRows) {
    const driver =
      row.driver_name_new?.trim() ||
      (row.driver_id_new
        ? assignmentDriverNames[row.driver_id_new]?.trim()
        : null) ||
      null;
    const vehicle =
      row.vehicle_number_new?.trim() ||
      (row.vehicle_id_new
        ? assignmentVehicleLabels[row.vehicle_id_new]?.trim()
        : null) ||
      null;
    const driverPrev =
      row.driver_id_prev != null
        ? (assignmentDriverNames[row.driver_id_prev] ??
          row.driver_name_prev ??
          null)
        : null;
    const vehiclePrev =
      row.vehicle_id_prev != null
        ? (assignmentVehicleLabels[row.vehicle_id_prev] ??
          row.vehicle_number_prev ??
          null)
        : null;

    const isReassign = row.event_type === "reassignment";
    const isDriverDeclined =
      isReassign && row.driver_id_prev != null && row.driver_id_new == null;

    const detailLines = [
      driverPrev != null && driver != null
        ? `Driver: ${driverPrev} → ${driver}`
        : driver != null
          ? `Driver: ${driver}`
          : driverPrev != null
            ? `Driver: ${driverPrev} (removed)`
            : null,
      vehiclePrev != null && vehicle != null
        ? `Vehicle: ${vehiclePrev} → ${vehicle}`
        : vehicle != null
          ? `Vehicle: ${vehicle}`
          : vehiclePrev != null
            ? `Vehicle: ${vehiclePrev} (removed)`
            : null,
    ].filter(Boolean) as string[];

    entries.push({
      id: `assign-${row.id}`,
      at: row.changed_at,
      category: "assignment",
      categoryLabel: categoryLabel("assignment"),
      title: isDriverDeclined
        ? "Driver rejected assignment"
        : isReassign
          ? "Driver reassigned"
          : "Driver assigned",
      recordedAtLabel: formatAuditTimestamp(row.changed_at),
      recordedBy: isDriverDeclined
        ? "Driver"
        : resolveActorLabel(row.changed_by, currentUserId, "Fleet"),
      detail:
        detailLines.join(" · ") ||
        `Assignment updated on trip ${tripRef}`,
      detailLines: detailLines.length > 0 ? detailLines : undefined,
    });
  }

  for (const item of timelineRows) {
    if (item.kind !== "status") continue;
    if (item.status_context === "assigned") continue;

    const label = item.status_label?.trim() || "Trip update";
    const category: TripAuditLogCategory =
      item.status_context === "created" ? "trip" : "status";

    entries.push({
      id: item.id,
      at: item.changed_at,
      category,
      categoryLabel: categoryLabel(category),
      title: label,
      recordedAtLabel: formatAuditTimestamp(item.changed_at),
      recordedBy: statusActorFallback(item.status_context),
      detail: item.detail_line?.trim() || `${label} on ${tripRef}`,
    });
  }

  for (const tx of transactions ?? []) {
    const inAmt = Number(tx.amount_in ?? 0);
    const outAmt = Number(tx.amount_out ?? 0);
    const amount = inAmt > 0 ? inAmt : outAmt;
    if (amount <= 0) continue;

    const isIn = inAmt > 0;
    const typeLabel =
      getDoubleEntryDisplayLabel(tx) ?? tx.description ?? "Payment";
    const party = (tx.party_name ?? tx.driver_name ?? "").trim() || "—";
    const at = tx.transaction_date ?? tx.created_at ?? "";
    const signedAmount = `${isIn ? "+" : "−"} ₹${formatAmount(amount)}`;

    entries.push({
      id: `payment-${tx.id}`,
      at,
      category: "payment",
      categoryLabel: categoryLabel("payment"),
      title: isIn ? "Customer payment received" : "Supplier payment recorded",
      recordedAtLabel: formatAuditTimestamp(at),
      recordedBy: resolveActorLabel(null, currentUserId, "Fleet"),
      detail: `${signedAmount} · ${typeLabel}`,
      detailLines: party !== "—" ? [`Party: ${party}`] : undefined,
      amountLabel: signedAmount,
    });
  }

  return entries.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
