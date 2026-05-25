import { isAggregateTrip, tripEarningsForDriver } from "@/features/drivers/utils/driverUtils.util";
import { getDriverTripDisplayNumber } from "@/features/driver/utils/driverTripSequence.util";
import type { DriverLedgerRow } from "@/services/driversService";
import type { TripRow } from "@/services/tripsService";

export type DriverTripPaymentStatus =
  | "salary"
  | "settled"
  | "fleet_marked"
  | "pending"
  | "action_required"
  | "incomplete";

export type DriverTripSettlementTone = "success" | "info" | "warning" | "fleet" | "muted";

export type DriverTripSettlementView = {
  status: DriverTripPaymentStatus;
  statusLabel: string;
  statusTone: DriverTripSettlementTone;
  /** Amount to verify / record / display as active payment */
  amount: number;
  /** Trip commission / expected driver earning */
  expectedAmount: number;
  /** Fleet-marked amount before driver verifies (if any) */
  fleetMarkedAmount: number | null;
  /** Verified settlement amount (if settled) */
  receivedAmount: number | null;
  /** Remaining unpaid vs expected (before settlement) */
  outstandingAmount: number;
  /** Expected minus accepted payment when fleet pays or settled less than expected */
  writeOffAmount: number;
  hasPaymentShortfall: boolean;
  partialPaymentAccepted: boolean;
  isSalary: boolean;
  fleetName: string;
  displayId: string;
  from: string;
  to: string;
  settlementLedger: DriverLedgerRow | null;
  fleetPendingLedger: DriverLedgerRow | null;
  paymentMode: string | null;
  utr: string | null;
  capturedAtRaw: string | null;
  transactionId: string | null;
  canRequestPayment: boolean;
  canMarkAsPaid: boolean;
  canVerifyFleetPayment: boolean;
  canShareReceipt: boolean;
};

export function computeTripPaymentDifference(input: {
  expectedAmount: number;
  receivedAmount: number;
  fleetMarkedAmount: number | null;
  isSettled: boolean;
  hasFleetPending: boolean;
}) {
  const expected = Math.max(0, Math.round(input.expectedAmount));
  const received = Math.max(0, Math.round(input.receivedAmount));
  const fleetMarked =
    input.fleetMarkedAmount != null ? Math.max(0, Math.round(input.fleetMarkedAmount)) : null;

  const activePaymentAmount = input.isSettled
    ? received
    : input.hasFleetPending && fleetMarked != null
      ? fleetMarked
      : 0;

  const hasPaymentShortfall =
    expected > 0 && activePaymentAmount > 0 && activePaymentAmount < expected;

  const writeOffAmount = hasPaymentShortfall ? expected - activePaymentAmount : 0;

  const outstandingAmount = input.isSettled
    ? 0
    : input.hasFleetPending && fleetMarked != null
      ? Math.max(0, expected - fleetMarked)
      : expected;

  const partialPaymentAccepted = input.isSettled && received > 0 && received < expected;

  return {
    activePaymentAmount,
    hasPaymentShortfall,
    writeOffAmount,
    outstandingAmount,
    partialPaymentAccepted,
  };
}

export function buildMarkPaidConfirmMessage(input: {
  tripDisplay: string;
  expectedAmount: number;
  paymentAmount: number;
  writeOffAmount: number;
  hasPaymentShortfall: boolean;
  utr?: string | null;
  mode?: string | null;
  isFleetVerify: boolean;
}): string {
  const paymentStr = `₹${Math.round(input.paymentAmount).toLocaleString("en-IN")}`;
  const expectedStr = `₹${Math.round(input.expectedAmount).toLocaleString("en-IN")}`;
  const writeOffStr = `₹${Math.round(input.writeOffAmount).toLocaleString("en-IN")}`;

  if (input.isFleetVerify) {
    const mode = formatDriverPaymentModeLabel(input.mode ?? null);
    const utr = input.utr ?? "—";
    if (input.hasPaymentShortfall && input.writeOffAmount > 0) {
      return `Fleet marked ${paymentStr} for ${input.tripDisplay} (trip earning ${expectedStr}, Mode: ${mode}, UTR: ${utr}). ${writeOffStr} will be written off. Accept and mark as settled?`;
    }
    return `Verify fleet marked payment for ${input.tripDisplay}: ${paymentStr} (Mode: ${mode}, UTR: ${utr}). This will update your cash balance.`;
  }

  if (input.hasPaymentShortfall && input.writeOffAmount > 0) {
    return `Record ${paymentStr} for ${input.tripDisplay} (trip earning ${expectedStr}). ${writeOffStr} will be written off. This will update your cash balance.`;
  }

  return `Record ${paymentStr} for ${input.tripDisplay} as received? This will update your cash balance.`;
}

export function extractDriverPaymentUtr(raw?: string | null): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/\bUTR\b\s*[:=]?\s*([0-9A-Za-z-]{8,24})\b/i);
  return m?.[1] ?? null;
}

export function deriveDriverPaymentMode(raw?: string | null): string | null {
  const s = (raw ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("upi")) return "UPI";
  if (s.includes("bank") || s.includes("neft") || s.includes("rtgs") || s.includes("imps")) {
    return "BANK TRANSFER";
  }
  if (s.includes("cash")) return "CASH";
  return null;
}

export function formatDriverPaymentModeLabel(mode: string | null | undefined): string {
  const raw = (mode ?? "").trim();
  if (!raw || raw === "—") return "—";
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function hasFleetPaidPendingToken(raw?: string | null): boolean {
  const s = (raw ?? "").trim();
  if (!s) return false;
  return /Sync\s*:\s*FLEET_PAID_PENDING/i.test(s);
}

export function isLegacyFleetPendingEvidence(raw?: string | null): boolean {
  const s = (raw ?? "").trim();
  if (!s) return false;
  return /(\bUTR\b|\bMode\s*:|\bTrip\s*Commission\b|\bTrip\s*Payment\b|\bSettlement\b)/i.test(s);
}

export type DriverLedgerTripIndex = {
  receivedByTripId: Record<string, number>;
  latestCreditLedgerByTripId: Record<string, DriverLedgerRow>;
  latestFleetPaidPendingLedgerByTripId: Record<string, DriverLedgerRow>;
};

export function indexDriverLedgerForTrips(entries: DriverLedgerRow[]): DriverLedgerTripIndex {
  const receivedByTripId: Record<string, number> = {};
  const latestCreditLedgerByTripId: Record<string, DriverLedgerRow> = {};
  const latestFleetPaidPendingLedgerByTripId: Record<string, DriverLedgerRow> = {};

  const receivedEntries = entries
    .filter((entry) => entry.type === "settlement" && (Number(entry.amount) || 0) > 0)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  for (const entry of receivedEntries) {
    const tid = entry.trip_id?.trim() || "";
    if (!tid) continue;
    receivedByTripId[tid] = (receivedByTripId[tid] ?? 0) + (Number(entry.amount) || 0);
    if (!latestCreditLedgerByTripId[tid]) latestCreditLedgerByTripId[tid] = entry;
  }

  for (const entry of entries) {
    const tid = entry.trip_id?.trim() || null;
    if (!tid) continue;
    if ((receivedByTripId[tid] ?? 0) > 0) continue;
    if (entry.type === "settlement") continue;
    const amt = Number(entry.amount) || 0;
    if (amt <= 0) continue;
    const desc = entry.description;
    if (!hasFleetPaidPendingToken(desc) && !isLegacyFleetPendingEvidence(desc)) continue;
    const prev = latestFleetPaidPendingLedgerByTripId[tid];
    const prevT = prev?.created_at ? new Date(prev.created_at).getTime() : 0;
    const nextT = entry.created_at ? new Date(entry.created_at).getTime() : 0;
    if (!prev || nextT > prevT) latestFleetPaidPendingLedgerByTripId[tid] = entry;
  }

  return { receivedByTripId, latestCreditLedgerByTripId, latestFleetPaidPendingLedgerByTripId };
}

function paidSubLabel(desc: string | null | undefined): string {
  const hasReceiptMeta = !!desc && /(\bUTR\b|\bMode\s*:)/i.test(String(desc));
  const paymentMode = deriveDriverPaymentMode(desc);
  if (hasReceiptMeta) return "Paid synced";
  if (paymentMode === "UPI") return "Paid via UPI";
  if (paymentMode === "BANK TRANSFER") return "Paid to bank";
  if (paymentMode === "CASH") return "Paid in cash";
  return "Paid to bank";
}

function fleetPendingSubLabel(desc: string | null | undefined): string {
  const mode = deriveDriverPaymentMode(desc);
  if (mode === "UPI") return "Fleet marked paid (UPI)";
  if (mode === "BANK TRANSFER") return "Fleet marked paid (Bank)";
  if (mode === "CASH") return "Fleet marked paid (Cash)";
  return "Fleet marked paid";
}

export function buildDriverTripSettlementView(input: {
  trip: TripRow;
  ledgerEntries: DriverLedgerRow[];
  fleetOrgName: string;
  driverTripNumberById: Record<string, string>;
  tripCompleted: boolean;
}): DriverTripSettlementView {
  const { trip, ledgerEntries, fleetOrgName, driverTripNumberById, tripCompleted } = input;
  const displayId = getDriverTripDisplayNumber(trip, driverTripNumberById);
  const from = trip.pickup_area?.trim() || "Unknown origin";
  const to = trip.drop_location?.trim() || "Unknown destination";
  const isSalary = isAggregateTrip(trip);
  const expectedAmount = Math.round(tripEarningsForDriver(trip));

  if (isSalary) {
    return {
      status: "salary",
      statusLabel: "Salary trip",
      statusTone: "info",
      amount: 0,
      expectedAmount,
      fleetMarkedAmount: null,
      receivedAmount: null,
      outstandingAmount: 0,
      writeOffAmount: 0,
      hasPaymentShortfall: false,
      partialPaymentAccepted: false,
      isSalary: true,
      fleetName: fleetOrgName,
      displayId,
      from,
      to,
      settlementLedger: null,
      fleetPendingLedger: null,
      paymentMode: null,
      utr: null,
      capturedAtRaw: null,
      transactionId: null,
      canRequestPayment: false,
      canMarkAsPaid: false,
      canVerifyFleetPayment: false,
      canShareReceipt: false,
    };
  }

  if (!tripCompleted) {
    return {
      status: "incomplete",
      statusLabel: "Trip not completed",
      statusTone: "muted",
      amount: expectedAmount,
      expectedAmount,
      fleetMarkedAmount: null,
      receivedAmount: null,
      outstandingAmount: expectedAmount,
      writeOffAmount: 0,
      hasPaymentShortfall: false,
      partialPaymentAccepted: false,
      isSalary: false,
      fleetName: fleetOrgName,
      displayId,
      from,
      to,
      settlementLedger: null,
      fleetPendingLedger: null,
      paymentMode: null,
      utr: null,
      capturedAtRaw: null,
      transactionId: null,
      canRequestPayment: false,
      canMarkAsPaid: false,
      canVerifyFleetPayment: false,
      canShareReceipt: false,
    };
  }

  const { receivedByTripId, latestCreditLedgerByTripId, latestFleetPaidPendingLedgerByTripId } =
    indexDriverLedgerForTrips(ledgerEntries);

  const receivedAmt = receivedByTripId[trip.id] ?? 0;
  const isSettled = receivedAmt > 0;
  const fleetPendingLedger = latestFleetPaidPendingLedgerByTripId[trip.id] ?? null;
  const hasFleetPending = !!fleetPendingLedger && !isSettled;
  const fleetMarkedAmount = hasFleetPending
    ? Math.round(Number(fleetPendingLedger?.amount) || 0)
    : null;
  const isActionRequired = !isSettled && !hasFleetPending && expectedAmount === 0;
  const settlementLedger = latestCreditLedgerByTripId[trip.id] ?? null;
  const activeLedger = isSettled ? settlementLedger : fleetPendingLedger;
  const activeDesc = activeLedger?.description ?? null;

  const paymentDiff = computeTripPaymentDifference({
    expectedAmount,
    receivedAmount: receivedAmt,
    fleetMarkedAmount,
    isSettled,
    hasFleetPending,
  });

  let status: DriverTripPaymentStatus = "pending";
  let statusLabel = "Pending from fleet";
  let statusTone: DriverTripSettlementTone = "info";

  if (isSettled) {
    status = "settled";
    statusLabel = paymentDiff.partialPaymentAccepted
      ? `${paidSubLabel(settlementLedger?.description)} · Partial`
      : paidSubLabel(settlementLedger?.description);
    statusTone = "success";
  } else if (hasFleetPending) {
    status = "fleet_marked";
    statusLabel = paymentDiff.hasPaymentShortfall
      ? `${fleetPendingSubLabel(fleetPendingLedger?.description)} · Shortfall`
      : fleetPendingSubLabel(fleetPendingLedger?.description);
    statusTone = "fleet";
  } else if (isActionRequired) {
    status = "action_required";
    statusLabel = "Ready to claim";
    statusTone = "warning";
  }

  const amount = isSettled
    ? paymentDiff.activePaymentAmount
    : hasFleetPending
      ? paymentDiff.activePaymentAmount || expectedAmount
      : expectedAmount;

  return {
    status,
    statusLabel,
    statusTone,
    amount,
    expectedAmount,
    fleetMarkedAmount,
    receivedAmount: isSettled ? receivedAmt : null,
    outstandingAmount: paymentDiff.outstandingAmount,
    writeOffAmount: paymentDiff.writeOffAmount,
    hasPaymentShortfall: paymentDiff.hasPaymentShortfall,
    partialPaymentAccepted: paymentDiff.partialPaymentAccepted,
    isSalary: false,
    fleetName: fleetOrgName,
    displayId,
    from,
    to,
    settlementLedger,
    fleetPendingLedger: hasFleetPending ? fleetPendingLedger : null,
    paymentMode: deriveDriverPaymentMode(activeDesc),
    utr: extractDriverPaymentUtr(activeDesc),
    capturedAtRaw:
      activeLedger?.created_at ??
      trip.completed_at ??
      trip.updated_at ??
      trip.created_at ??
      null,
    transactionId: activeLedger?.id ?? trip.id,
    canRequestPayment: status === "pending" || status === "action_required",
    canMarkAsPaid: status === "pending" || status === "action_required",
    canVerifyFleetPayment: status === "fleet_marked",
    canShareReceipt: status === "settled",
  };
}
