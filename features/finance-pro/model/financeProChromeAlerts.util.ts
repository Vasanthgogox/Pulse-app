import type { TripFinancialFact } from "./financeProTypes";

/** Open invoiced exposure older than 30 days — collection overdue, not invoice AR. */
export const FINANCE_PRO_INVOICE_OVERDUE_DAYS = 31;

export type FinanceProChromeAlertKind = "pod_pending" | "invoice_overdue";

export type FinanceProChromeAlert = {
  id: string;
  kind: FinanceProChromeAlertKind;
  tripId: string;
  clientId: string;
  clientName: string;
  tripLabel: string;
  daysOld: number | null;
  title: string;
  subtitle: string;
  amount: number;
};

export function isFinanceProPodPendingAlert(trip: TripFinancialFact): boolean {
  return trip.completed && !trip.podReceived && !trip.invoiced;
}

export function isFinanceProInvoiceOverdueAlert(trip: TripFinancialFact): boolean {
  const days = trip.daysOld ?? 0;
  return (
    trip.invoiced &&
    trip.remainingDue > 0 &&
    days >= FINANCE_PRO_INVOICE_OVERDUE_DAYS
  );
}

export function buildFinanceProChromeAlerts(
  trips: readonly TripFinancialFact[],
): FinanceProChromeAlert[] {
  const alerts: FinanceProChromeAlert[] = [];
  const seen = new Set<string>();
  for (const trip of trips) {
    if (seen.has(trip.tripId)) continue;
    seen.add(trip.tripId);
    if (isFinanceProPodPendingAlert(trip)) {
      alerts.push({
        id: `pod:${trip.tripId}`,
        kind: "pod_pending",
        tripId: trip.tripId,
        clientId: trip.clientId,
        clientName: trip.clientName,
        tripLabel: trip.tripLabel,
        daysOld: trip.daysOld,
        title: "POD pending",
        subtitle: `${trip.tripLabel} · ${trip.clientName}`,
        amount: trip.sales,
      });
      continue;
    }
    if (isFinanceProInvoiceOverdueAlert(trip)) {
      alerts.push({
        id: `overdue:${trip.tripId}`,
        kind: "invoice_overdue",
        tripId: trip.tripId,
        clientId: trip.clientId,
        clientName: trip.clientName,
        tripLabel: trip.tripLabel,
        daysOld: trip.daysOld,
        title: "Invoice overdue",
        subtitle: `${trip.tripLabel} · ${trip.clientName} · ${trip.daysOld ?? 0}d`,
        amount: trip.remainingDue,
      });
    }
  }
  return alerts.sort((a, b) => b.amount - a.amount);
}
