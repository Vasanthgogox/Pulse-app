import type { TripLedgerSmartTag } from "@/components/TripLedgerFinancialSummary";

export type LedgerLockedEntityType = "CLIENT" | "SUPPLIER" | "DRIVER";

export type TransactionFlowType = "in" | "out";

export type LedgerFlowGuardAlertContent = {
  title: string;
  entityLabel: LedgerLockedEntityType;
  attemptedFlow: TransactionFlowType;
  correctFlow: TransactionFlowType;
  headline: string;
  bullets: string[];
  tip?: string;
};

export type TripPartyIds = {
  localClientId: string | null;
  localSupplierId: string | null;
  driverId: string | null;
  /** Raw trip.client_id — may match locked party when local resolution differs. */
  tripClientId?: string | null;
  /** Raw trip.supplier_id. */
  tripSupplierId?: string | null;
};

export type MissionTripPendingChip = {
  tag: TripLedgerSmartTag;
  label: string;
  disabled?: boolean;
};

type TripFinancialSlice = {
  client_receivable: number;
  supplier_payable: number;
  driver_payable: number;
  /** Present when snapshot includes unmasked balances (see computeTripEntryFinancialSnapshot). */
  supplier_payable_raw?: number;
  driver_payable_raw?: number;
};

/** Supplier rupees to show on voyage rows / chips for the active flow + party lock. */
export function ledgerDisplaySupplierDue(
  fin: TripFinancialSlice,
  flowType: TransactionFlowType,
  tripPayType: string | undefined,
  lockedEntityType: LedgerLockedEntityType | null,
): number {
  if (flowType !== "out") return 0;
  if (lockedEntityType === "CLIENT") return 0;
  const raw = fin.supplier_payable_raw ?? fin.supplier_payable;
  if (lockedEntityType === "SUPPLIER") return Math.max(0, raw);
  return tripPayType === "market" ? Math.max(0, fin.supplier_payable) : 0;
}

/** Driver rupees to show on voyage rows / chips. */
export function ledgerDisplayDriverDue(
  fin: TripFinancialSlice,
  flowType: TransactionFlowType,
  tripPayType: string | undefined,
  lockedEntityType: LedgerLockedEntityType | null,
): number {
  if (flowType !== "out") return 0;
  if (lockedEntityType === "CLIENT") return 0;
  const raw = fin.driver_payable_raw ?? fin.driver_payable;
  if (lockedEntityType === "DRIVER") return Math.max(0, raw);
  if (lockedEntityType === "SUPPLIER") return 0;
  return tripPayType === "asset" ? Math.max(0, fin.driver_payable) : 0;
}

export function ledgerDisplayClientDue(
  fin: TripFinancialSlice,
  flowType: TransactionFlowType,
  lockedEntityType: LedgerLockedEntityType | null,
): number {
  if (flowType !== "in") return 0;
  if (lockedEntityType === "SUPPLIER" || lockedEntityType === "DRIVER") return 0;
  return Math.max(0, fin.client_receivable);
}

export function deriveLedgerLockedEntityType(
  explicit: LedgerLockedEntityType | null | undefined,
  partyContext: "customers" | "suppliers" | "dco" | "all",
  isPartyLocked: boolean,
): LedgerLockedEntityType | null {
  if (explicit) return explicit;
  if (!isPartyLocked) return null;
  if (partyContext === "customers") return "CLIENT";
  if (partyContext === "suppliers") return "SUPPLIER";
  // DCO-6: no locked-entity-type chip for DCO yet (LedgerLockedEntityType has
  // no DCO value) — falls through to null, same as "all" already does.
  return null;
}

export function isTripSmartTagSelectable(
  tag: TripLedgerSmartTag,
  flowType: TransactionFlowType,
  lockedEntityType: LedgerLockedEntityType | null,
  lockedPartyId: string | null,
  parties: TripPartyIds,
  /** Trip is already in the mission list scoped to the locked entity (integrated / linked loads). */
  inLockedTripScope = false,
): boolean {
  if (!lockedEntityType || !lockedPartyId) return true;

  switch (lockedEntityType) {
    case "CLIENT":
      if (tag !== "client" || flowType !== "in") return false;
      if (inLockedTripScope) return true;
      return (
        parties.localClientId === lockedPartyId ||
        parties.tripClientId === lockedPartyId
      );
    case "SUPPLIER":
      if (tag !== "supplier" || flowType !== "out") return false;
      if (inLockedTripScope) return true;
      return (
        parties.localSupplierId === lockedPartyId ||
        parties.tripSupplierId === lockedPartyId
      );
    case "DRIVER":
      if (tag !== "driver" || flowType !== "out") return false;
      if (inLockedTripScope) return true;
      return parties.driverId === lockedPartyId;
    default:
      return true;
  }
}

/** Build mission due chips; when party is locked, only chips for that entity (no disabled cross-party chips). */
export function buildMissionTripPendingChips(
  flowType: TransactionFlowType,
  fin: TripFinancialSlice | undefined,
  tripPayType: string | undefined,
  formatDue: (amount: number) => string,
  lockedEntityType: LedgerLockedEntityType | null,
  lockedPartyId: string | null,
  parties: TripPartyIds,
  inLockedTripScope = false,
): MissionTripPendingChip[] {
  if (!fin) return [];

  const raw: MissionTripPendingChip[] = [];

  const supAmt = ledgerDisplaySupplierDue(
    fin,
    flowType,
    tripPayType,
    lockedEntityType,
  );
  const drvAmt = ledgerDisplayDriverDue(
    fin,
    flowType,
    tripPayType,
    lockedEntityType,
  );
  const supAmtIfOut = ledgerDisplaySupplierDue(
    fin,
    "out",
    tripPayType,
    lockedEntityType,
  );
  const drvAmtIfOut = ledgerDisplayDriverDue(
    fin,
    "out",
    tripPayType,
    lockedEntityType,
  );

  if (flowType === "in" && fin.client_receivable > 0) {
    raw.push({
      tag: "client",
      label: `Client due ${formatDue(fin.client_receivable)}`,
    });
  }
  if (flowType === "out" && fin.client_receivable > 0) {
    raw.push({
      tag: "client",
      label: `Client due ${formatDue(fin.client_receivable)}`,
      disabled: true,
    });
  }
  if (flowType === "out" && supAmt > 0) {
    raw.push({
      tag: "supplier",
      label: `Supplier due ${formatDue(supAmt)}`,
    });
  }
  if (flowType === "in" && supAmtIfOut > 0) {
    raw.push({
      tag: "supplier",
      label: `Supplier due ${formatDue(supAmtIfOut)}`,
      disabled: true,
    });
  }
  if (flowType === "out" && drvAmt > 0) {
    raw.push({
      tag: "driver",
      label: `Driver due ${formatDue(drvAmt)}`,
    });
  }
  if (flowType === "in" && drvAmtIfOut > 0) {
    raw.push({
      tag: "driver",
      label: `Driver due ${formatDue(drvAmtIfOut)}`,
      disabled: true,
    });
  }

  if (!lockedEntityType || !lockedPartyId) return raw;

  return raw.filter(
    (c) =>
      !c.disabled &&
      isTripSmartTagSelectable(
        c.tag,
        flowType,
        lockedEntityType,
        lockedPartyId,
        parties,
        inLockedTripScope,
      ),
  );
}

/** Human label for zero pending due on the active ledger flow (card tag + hero). */
export function ledgerTripNoDueTagLabel(
  flowType: TransactionFlowType,
  lockedEntityType: LedgerLockedEntityType | null,
): string {
  if (flowType === "in") {
    if (lockedEntityType === "CLIENT") return "No client due";
    return "No receivable";
  }
  if (lockedEntityType === "SUPPLIER") return "No supplier due";
  if (lockedEntityType === "DRIVER") return "No driver due";
  return "No payable";
}

export function ledgerTripNoDueHeroMessage(
  flowType: TransactionFlowType,
  lockedEntityType: LedgerLockedEntityType | null,
  tripNumber: string | null | undefined,
): string {
  const trip = (tripNumber ?? "").trim() || "This trip";
  if (flowType === "in") {
    if (lockedEntityType === "CLIENT") {
      return `${trip} has no client receivable pending. Enter an amount manually to record cash in.`;
    }
    return `${trip} has no receivable pending. Enter an amount manually.`;
  }
  if (lockedEntityType === "SUPPLIER") {
    return `${trip} has no supplier payable pending. Enter an amount manually.`;
  }
  if (lockedEntityType === "DRIVER") {
    return `${trip} has no driver payable pending. Enter an amount manually.`;
  }
  return `${trip} has no payable pending on this trip. Enter an amount manually.`;
}

/** Ledger flow that matches a locked party context (client → IN, supplier/driver → OUT). */
export function ledgerLockedPartyPreferredFlow(
  lockedEntityType: LedgerLockedEntityType,
): TransactionFlowType {
  switch (lockedEntityType) {
    case "CLIENT":
      return "in";
    case "SUPPLIER":
    case "DRIVER":
      return "out";
    default:
      return "in";
  }
}

/**
 * When party is locked from entity detail, block the wrong Cash IN/OUT direction and explain alternatives.
 */
export function ledgerLockedPartyFlowGuard(
  flowType: TransactionFlowType,
  lockedEntityType: LedgerLockedEntityType | null,
  lockedPartyId: string | null | undefined,
): LedgerFlowGuardAlertContent | null {
  if (!lockedEntityType || !lockedPartyId) return null;

  if (lockedEntityType === "CLIENT" && flowType === "out") {
    return {
      title: "Use Cash IN for clients",
      entityLabel: "CLIENT",
      attemptedFlow: "out",
      correctFlow: "in",
      headline:
        "Money from a client is always Cash IN — receivables you collect from them.",
      bullets: [
        "Cash OUT does not apply to a client party.",
        "To fix billed revenue, show a refund, or add costs after they paid you, use Adjust payment on the trip Finance tab (revenue / cost).",
        "Do not record those changes as a Cash OUT ledger line.",
      ],
      tip:
        "Pick the trip in Voyage Registry, open trip detail → Finance → Adjust payment.",
    };
  }
  if (lockedEntityType === "SUPPLIER" && flowType === "in") {
    return {
      title: "Use Cash OUT for suppliers",
      entityLabel: "SUPPLIER",
      attemptedFlow: "in",
      correctFlow: "out",
      headline:
        "Suppliers are payables — log payments to them as Cash OUT.",
      bullets: [
        "Cash IN does not apply when paying a supplier.",
        "For billing or cost corrections, use Adjust payment on the trip Finance tab.",
      ],
    };
  }
  if (lockedEntityType === "DRIVER" && flowType === "in") {
    return {
      title: "Use Cash OUT for drivers",
      entityLabel: "DRIVER",
      attemptedFlow: "in",
      correctFlow: "out",
      headline: "Driver payouts are recorded as Cash OUT.",
      bullets: ["Switch to Cash OUT to record a payment to this driver."],
    };
  }
  return null;
}

export function ledgerTripDueWeightForContext(
  flowType: TransactionFlowType,
  fin: TripFinancialSlice,
  tripPayType: string | undefined,
  lockedEntityType: LedgerLockedEntityType | null,
  lockedPartyId: string | null,
  parties: TripPartyIds,
  effectivePartyId: string | null,
  inLockedTripScope = false,
): number {
  if (lockedEntityType && lockedPartyId) {
    if (lockedEntityType === "CLIENT" && flowType === "in") {
      if (
        inLockedTripScope ||
        parties.localClientId === lockedPartyId ||
        parties.tripClientId === lockedPartyId
      ) {
        return Math.max(0, fin.client_receivable);
      }
      return 0;
    }
    if (lockedEntityType === "SUPPLIER" && flowType === "out") {
      if (
        inLockedTripScope ||
        parties.localSupplierId === lockedPartyId ||
        parties.tripSupplierId === lockedPartyId
      ) {
        return Math.max(
          0,
          fin.supplier_payable_raw ?? fin.supplier_payable,
        );
      }
      return 0;
    }
    if (lockedEntityType === "DRIVER" && flowType === "out") {
      if (inLockedTripScope || parties.driverId === lockedPartyId) {
        return Math.max(0, fin.driver_payable_raw ?? fin.driver_payable);
      }
      return 0;
    }
    return 0;
  }

  if (flowType === "in") return Math.max(0, fin.client_receivable);
  if (effectivePartyId && parties.localSupplierId && effectivePartyId === parties.localSupplierId) {
    return Math.max(0, fin.supplier_payable);
  }
  if (effectivePartyId && parties.driverId && effectivePartyId === parties.driverId) {
    return Math.max(0, fin.driver_payable);
  }
  if (tripPayType === "asset") return Math.max(0, fin.driver_payable);
  return Math.max(0, fin.supplier_payable);
}
