/** Shared types for shared-ledger reconciliation rows (Compare & Verify). */

/** Partner has not synced this figure yet — use instead of vague “WAIT”. */
export const SHARED_LEDGER_PARTNER_PENDING_LABEL = "Awaiting partner";

/** Longer hub-column copy when partner has not shared payment/settlement for this row. */
export const SHARED_LEDGER_AWAITING_PARTNER_UPDATE = "Awaiting update from partner";

export type ReconStatus = "VERIFIED" | "PENDING" | "MISMATCH" | "UNRECOGNIZED";

export interface InternalTrip {
  tripId: string;
  missionId: string;
  date: string;
  sales: number;
  paid: number;
  /** Amount we paid out (amount_out) for this trip; used for supplier Net Trip Due. */
  paidOut: number;
  due: number;
}

export interface ReconciledRow {
  tripId: string;
  missionId: string;
  status: ReconStatus;
  issue: string | null;
  internal: InternalTrip | null;
  external: { sales: number; paid: number } | null;
  intSales: number;
  intPaid: number;
  /** Amount we paid out (for supplier); used for entity-aware Net Trip Due. */
  intPaidOut: number;
  extSales: number;
  extPaid: number;
}

/** Ledger / payment line tagged as add-on charge, deduction, or adjustment for shared-ledger UI. */
export type SharedTxnLineKind = "deduction" | "charge" | "adjustment";

/**
 * Infer charge/deduction/adjustment from category or description (cash_entries style).
 */
export function inferSharedTxnLineKind(
  primaryCategory: string | null | undefined,
  description: string | null | undefined,
): SharedTxnLineKind | null {
  const cat = (primaryCategory ?? "").trim().toUpperCase();
  const desc = (description ?? "").trim().toLowerCase();
  const catFirst = cat.split("|")[0]?.trim() ?? "";

  if (
    catFirst.includes("DEDUCTION") ||
    desc.includes("deduction") ||
    desc.includes("pass debit")
  ) {
    return "deduction";
  }
  if (
    catFirst.includes("ADJUST") ||
    desc.includes("adjustment") ||
    desc.includes("adjusting entry")
  ) {
    return "adjustment";
  }
  if (
    catFirst.includes("CHARGE") ||
    desc.includes("loading charge") ||
    desc.includes("unloading charge") ||
    desc.includes("additional charge") ||
    desc.includes("fuel escalation") ||
    desc.includes("detention") ||
    desc.includes("late delivery") ||
    desc.includes("damages")
  ) {
    return "charge";
  }
  return null;
}
