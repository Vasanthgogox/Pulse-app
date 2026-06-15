/**
 * Trip-level receivable / payable targets and dues — single source for hub cards,
 * trip detail settlement, and history filters (due to get / due to pay).
 */
import { computeDriverCommissionForTrip } from "@/features/finance/aggregation/aggregateDrivers";
import type { DriverOfferForAggregation } from "@/features/finance/aggregation/types";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { computePartnerIndentFreightCost } from "@/features/finance/utils/partnerIndentFreightCost.util";
import {
  resolveTripLedgerTripType,
  type TripLedgerTripType,
} from "@/features/finance/utils/tripLedgerPayoutMode.util";
import { isAssetExecutionTrip } from "@/features/trips/domain/tripExecutionModel";
import {
  adjustedCost,
  adjustedRevenue,
  type TripAdjustment,
} from "@/features/trips/services/tripAdjustments";
import type { TripRow } from "@/features/trips/services/trips.service";
import { tripNonSupplierOutflowTotal } from "@/features/trips/utils/tripManifestFreightCost";

function roundCurrency(amount: number): number {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

export type TripSettlementLedgerRollup = {
  /** Client-tagged receipts on this trip (+ legacy untagged inflows). */
  clientReceived: number;
  supplierPaid: number;
  driverPaid: number;
  receivedTotal: number;
  paidTotal: number;
};

/** Party-aware ledger rollups for settlement due math (not raw hub totals). */
export function rollupTripSettlementLedger(
  entries: LedgerRow[],
  options?: { amountPaidFallback?: number | null },
): TripSettlementLedgerRollup {
  let clientReceived = 0;
  let supplierPaid = 0;
  let driverPaid = 0;
  let receivedTotal = 0;
  let paidTotal = 0;
  let untaggedIn = 0;

  for (const row of entries) {
    const inn = Number(row.amount_in ?? 0);
    const out = Number(row.amount_out ?? 0);
    receivedTotal += inn;
    paidTotal += out;
    const ct = String(row.contact_type ?? "").trim().toLowerCase();
    if (inn > 0) {
      if (ct === "client") clientReceived += inn;
      else if (!ct) untaggedIn += inn;
    }
    if (out > 0) {
      if (ct === "supplier") supplierPaid += out;
      else if (ct === "driver") driverPaid += out;
    }
  }

  if (untaggedIn > 0) clientReceived += untaggedIn;

  const fallback = Math.max(0, Number(options?.amountPaidFallback ?? 0) || 0);
  clientReceived = Math.max(clientReceived, fallback);

  return {
    clientReceived: roundCurrency(clientReceived),
    supplierPaid: roundCurrency(supplierPaid),
    driverPaid: roundCurrency(driverPaid),
    receivedTotal: roundCurrency(receivedTotal),
    paidTotal: roundCurrency(paidTotal),
  };
}

export type TripHubCostOptions = {
  subcontractRate?: number | null;
  /** @deprecated Market trips only — do not add paid outflows to asset commission targets. */
  nonSupplierExpenseTotal?: number | null;
};

function tripHubRevenueBase(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
): number {
  const isOwner =
    currentOrganizationId != null &&
    trip.organization_id != null &&
    trip.organization_id === currentOrganizationId;
  const useSupplierRate = trip.indent_id != null && !isOwner;
  return useSupplierRate
    ? Number(trip.supplier_rate ?? 0)
    : Number(trip.client_price ?? 0);
}

/**
 * Payable/cost target before CN/DN adjustments.
 * Asset execution: driver labor (commission / salary rollup) — not supplier_rate.
 * Market: supplier_rate + non-supplier trip expenses recorded on ledger.
 */
export function tripPayableCostTarget(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
  options?: TripHubCostOptions | null,
  driverOffer?: DriverOfferForAggregation | null,
  assetProvisionCostInr?: number | null,
): number {
  const isOwner =
    currentOrganizationId != null &&
    trip.organization_id != null &&
    trip.organization_id === currentOrganizationId;
  const indentPartner = trip.indent_id != null && !isOwner;
  const nonSup = Math.max(0, Number(options?.nonSupplierExpenseTotal ?? 0));

  if (indentPartner) {
    const freight = computePartnerIndentFreightCost(options?.subcontractRate ?? null);
    return roundCurrency(
      freight > 0 ? freight + nonSup : Number(trip.supplier_rate ?? 0) + nonSup,
    );
  }

  if (isAssetExecutionTrip(trip)) {
    const provisionTotal = Number(assetProvisionCostInr ?? 0);
    if (provisionTotal > 0) return roundCurrency(provisionTotal);
    const commission = computeDriverCommissionForTrip(trip, driverOffer ?? null);
    return roundCurrency(
      commission + Math.max(0, Number(trip.supplier_rate ?? 0)),
    );
  }

  return roundCurrency(Number(trip.supplier_rate ?? 0) + nonSup);
}

export function tripHubRevenue(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
  adjustments?: TripAdjustment[] | null,
): number {
  const raw = tripHubRevenueBase(trip, currentOrganizationId);
  if (adjustments == null) return raw;
  return adjustedRevenue(raw, adjustments);
}

/** Adjusted payable target (after cost-side CN/DN). */
export function tripHubCost(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
  adjustments?: TripAdjustment[] | null,
  options?: TripHubCostOptions | null,
  driverOffer?: DriverOfferForAggregation | null,
  assetProvisionCostInr?: number | null,
): number {
  const raw = tripPayableCostTarget(
    trip,
    currentOrganizationId,
    options,
    driverOffer,
    assetProvisionCostInr,
  );
  if (adjustments == null) return raw;
  return adjustedCost(raw, adjustments);
}

export type TripSettlementDues = {
  tripType: TripLedgerTripType;
  receivableTarget: number;
  payableTarget: number;
  clientReceived: number;
  payablePaid: number;
  receivableDue: number;
  payableDue: number;
};

export function computeTripSettlementDues(input: {
  trip: TripRow;
  viewerOrgId: string | null | undefined;
  ledgerEntries: LedgerRow[];
  adjustments?: TripAdjustment[] | null;
  subcontractRate?: number | null;
  driverOffer?: DriverOfferForAggregation | null;
  assetProvisionCostInr?: number | null;
}): TripSettlementDues {
  const tripType = resolveTripLedgerTripType(input.trip);
  const rollup = rollupTripSettlementLedger(input.ledgerEntries, {
    amountPaidFallback: input.trip.amount_paid,
  });

  const receivableTarget = Math.max(
    tripHubRevenue(input.trip, input.viewerOrgId, input.adjustments),
    0,
  );
  const payableTarget = Math.max(
    tripHubCost(
      input.trip,
      input.viewerOrgId,
      input.adjustments,
      {
        subcontractRate: input.subcontractRate ?? null,
        nonSupplierExpenseTotal: tripNonSupplierOutflowTotal(
          input.ledgerEntries,
        ),
      },
      input.driverOffer ?? null,
      input.assetProvisionCostInr ?? null,
    ),
    0,
  );

  const payablePaid =
    tripType === "asset"
      ? rollup.driverPaid
      : rollup.supplierPaid > 0
        ? rollup.supplierPaid
        : rollup.paidTotal;

  return {
    tripType,
    receivableTarget,
    payableTarget,
    clientReceived: rollup.clientReceived,
    payablePaid,
    receivableDue: Math.max(receivableTarget - rollup.clientReceived, 0),
    payableDue: Math.max(payableTarget - payablePaid, 0),
  };
}
