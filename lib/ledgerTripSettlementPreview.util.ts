import type { TripEntryFinancialSnapshot } from "@/features/finance/utils/computeTripEntryFinancials.util";
import type { LedgerLockedEntityType } from "@/lib/ledgerPartySmartTagPolicy";

export type LedgerTripSettlementPreview = {
  /** Billed / target amount for this flow on the trip. */
  targetInr: number;
  /** Already posted in ledger for this trip + party lane. */
  recordedInr: number;
  /** Remaining balance (0 when fully settled). */
  dueInr: number;
  flowNoun: string;
  recordedVerb: string;
  dueVerb: string;
  isFullySettled: boolean;
  isPartiallySettled: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Ledger lines for the active cash-in / cash-out lane on a linked trip. */
export function resolveLedgerTripSettlementPreview(
  snap: TripEntryFinancialSnapshot | null | undefined,
  flowType: "in" | "out",
  lockedEntityType: LedgerLockedEntityType | null,
): LedgerTripSettlementPreview | null {
  if (!snap) return null;

  const { lines, financials, trip_type } = snap;

  if (flowType === "in") {
    const targetInr = lines.client_sale;
    const recordedInr = lines.client_received;
    const dueInr = lines.client_due;
    return {
      targetInr,
      recordedInr,
      dueInr,
      flowNoun: "receivable",
      recordedVerb: "Received in ledger",
      dueVerb: "Still due",
      isFullySettled: dueInr <= 0 && recordedInr > 0,
      isPartiallySettled: dueInr > 0 && recordedInr > 0,
    };
  }

  const useDriverLane =
    lockedEntityType === "DRIVER" ||
    (lockedEntityType !== "SUPPLIER" && trip_type === "asset" && financials.driver_payable_raw > 0);

  if (useDriverLane) {
    const targetInr = lines.driver_to_pay;
    const recordedInr = lines.driver_paid;
    const dueInr = financials.driver_payable_raw ?? lines.driver_due;
    return {
      targetInr,
      recordedInr,
      dueInr,
      flowNoun: "driver payable",
      recordedVerb: "Paid in ledger",
      dueVerb: "Still due to driver",
      isFullySettled: dueInr <= 0 && recordedInr > 0,
      isPartiallySettled: dueInr > 0 && recordedInr > 0,
    };
  }

  const targetInr = lines.supplier_cost;
  const recordedInr = lines.supplier_paid;
  const dueInr = financials.supplier_payable_raw ?? lines.supplier_due;
  return {
    targetInr,
    recordedInr,
    dueInr,
    flowNoun: "supplier payable",
    recordedVerb: "Paid in ledger",
    dueVerb: "Still due to supplier",
    isFullySettled: dueInr <= 0 && recordedInr > 0,
    isPartiallySettled: dueInr > 0 && recordedInr > 0,
  };
}

export function formatLedgerTripSettlementPreviewLine(
  preview: LedgerTripSettlementPreview,
): string {
  const parts: string[] = [];
  if (preview.recordedInr > 0) {
    parts.push(`${preview.recordedVerb}: ₹${preview.recordedInr.toLocaleString("en-IN")}`);
  }
  if (preview.dueInr > 0) {
    parts.push(`${preview.dueVerb}: ₹${preview.dueInr.toLocaleString("en-IN")}`);
  } else if (preview.isFullySettled) {
    parts.push("Nothing due on this trip");
  }
  return parts.join(" · ");
}

/** True when the entered amount likely duplicates an already-settled ledger post. */
export function ledgerEntryLooksLikeDuplicate(
  preview: LedgerTripSettlementPreview | null | undefined,
  enteredInr: number,
): boolean {
  if (!preview || enteredInr <= 0) return false;
  if (preview.isFullySettled) {
    if (enteredInr <= 0) return false;
    return Math.abs(enteredInr - preview.recordedInr) < 0.01;
  }
  if (preview.dueInr > 0) {
    return enteredInr > round2(preview.dueInr + 0.01);
  }
  return false;
}
