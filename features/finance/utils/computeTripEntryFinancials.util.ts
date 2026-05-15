/**
 * Trip-first ledger entry: pending client / supplier / driver amounts from trip rates
 * and org ledger rows for this trip_id. Aligns with trip detail + ledger-sync due logic.
 *
 * v1 payout model: `trip_type` **market** → supplier payable only (no driver CTAs).
 * **asset** → driver payable (+ vehicle elsewhere); supplier payable hidden.
 */
import type { DriverOffer } from "@/features/drivers/services/drivers.service";
import { computeDriverCommissionForTrip } from "@/features/finance/aggregation/aggregateDrivers";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { computePartnerIndentFreightCost } from "@/features/finance/utils/partnerIndentFreightCost.util";
import {
    resolveTripLedgerTripType,
    type TripLedgerTripType,
} from "@/features/finance/utils/tripLedgerPayoutMode.util";

export interface TripEntryFinancialInput {
  id: string;
  organization_id?: string | null;
  indent_id?: string | null;
  client_id?: string | null;
  supplier_id?: string | null;
  driver_id?: string | null;
  client_price?: number | null;
  supplier_rate?: number | null;
  driver_commission?: number | null;
  distance?: string | number | null;
  /** When viewer org is integrated supplier on another org's trip (revenue = supplier_rate). */
  is_cross_org_supplier?: boolean | null;
  /** Non-owner indent: cost basis for supplier payable. */
  subcontract_rate?: number | null;
  /** DB column; when null, inferred from supplier_id. */
  trip_payout_mode?: string | null;
  vehicle_id?: string | null;
}

/** Display lines for trip ledger preview (rates + ledger allocations on this trip). */
export interface TripPartyFinancialLines {
  client_sale: number;
  client_received: number;
  /** Pending client balance (same as `financials.client_receivable`). */
  client_due: number;
  supplier_cost: number;
  supplier_paid: number;
  /** Pending supplier balance (same as `financials.supplier_payable`). */
  supplier_due: number;
  /** Commission / settlement target before driver payouts. */
  driver_to_pay: number;
  driver_paid: number;
  /** Remaining driver balance (same as `financials.driver_payable`). */
  driver_due: number;
}

export interface TripEntryFinancialSnapshot {
  trip_id: string;
  trip_type: TripLedgerTripType;
  client_id: string | null;
  supplier_id: string | null;
  driver_id: string | null;
  financials: {
    client_receivable: number;
    /** Lane-masked: supplier payable only when trip is market. */
    supplier_payable: number;
    /** Lane-masked: driver payable only when trip is asset. */
    driver_payable: number;
    /** Cost − supplier payments, before market/asset UI mask (supplier party / chips). */
    supplier_payable_raw: number;
    /** Commission target − driver payments, before lane mask (driver party / chips). */
    driver_payable_raw: number;
  };
  lines: TripPartyFinancialLines;
}

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeTripEntryFinancialSnapshot(
  trip: TripEntryFinancialInput,
  allLedgerEntries: LedgerRow[] | null | undefined,
  viewerOrgId: string | null | undefined,
  driverOffer: DriverOffer | null | undefined,
): TripEntryFinancialSnapshot | null {
  if (!trip?.id) return null;

  const entries: LedgerRow[] = [];
  const list = allLedgerEntries ?? [];
  for (let i = 0; i < list.length; i++) {
    const tx = list[i];
    if (tx.trip_id === trip.id) entries.push(tx);
  }

  const clientPrice = Number(trip.client_price ?? 0) || 0;
  const supplierRate = Number(trip.supplier_rate ?? 0) || 0;
  const oid = trip.organization_id ?? null;
  const isOwner = !!(viewerOrgId && oid && oid === viewerOrgId);
  const hasIndent = trip.indent_id != null;

  let sales: number;
  let cost: number;

  if (trip.is_cross_org_supplier === true) {
    sales = supplierRate;
    cost = 0;
  } else if (hasIndent && !isOwner) {
    sales = supplierRate;
    cost = computePartnerIndentFreightCost(trip.subcontract_rate);
  } else {
    sales = clientPrice;
    cost = supplierRate;
  }

  const received = entries.reduce((s, tx) => s + Number(tx.amount_in ?? 0), 0);
  const client_receivable = roundCurrency(Math.max(0, sales - received));

  const paidSupplierOnly = entries.reduce((s, tx) => {
    const out = Number(tx.amount_out ?? 0);
    if (out <= 0) return s;
    if (String(tx.contact_type ?? "").toLowerCase() === "supplier")
      return s + out;
    return s;
  }, 0);
  const supplier_payable_raw = roundCurrency(
    Math.max(0, cost - paidSupplierOnly),
  );

  let driver_payable_raw = 0;
  let driver_to_pay_raw = 0;
  let driver_paid_raw = 0;
  if ((trip.driver_id ?? "").trim()) {
    driver_to_pay_raw = computeDriverCommissionForTrip(
      {
        driver_id: trip.driver_id,
        driver_commission: trip.driver_commission,
        supplier_rate: trip.supplier_rate,
        client_price: trip.client_price,
        distance: trip.distance,
      },
      driverOffer ?? null,
    );
    driver_paid_raw = entries.reduce((s, tx) => {
      const out = Number(tx.amount_out ?? 0);
      if (out <= 0) return s;
      if (String(tx.contact_type ?? "").toLowerCase() === "driver")
        return s + out;
      return s;
    }, 0);
    driver_payable_raw = roundCurrency(
      Math.max(0, driver_to_pay_raw - driver_paid_raw),
    );
  }

  const trip_type = resolveTripLedgerTripType({
    supplier_id: trip.supplier_id ?? null,
    trip_payout_mode: trip.trip_payout_mode ?? null,
    driver_id: trip.driver_id ?? null,
    vehicle_id: trip.vehicle_id ?? null,
  });

  const supplier_payable = trip_type === "market" ? supplier_payable_raw : 0;
  const driver_payable = trip_type === "asset" ? driver_payable_raw : 0;

  const lines: TripPartyFinancialLines = {
    client_sale: roundCurrency(sales),
    client_received: roundCurrency(received),
    client_due: client_receivable,
    supplier_cost: trip_type === "market" ? roundCurrency(cost) : 0,
    supplier_paid: trip_type === "market" ? roundCurrency(paidSupplierOnly) : 0,
    supplier_due: supplier_payable,
    driver_to_pay: trip_type === "asset" ? roundCurrency(driver_to_pay_raw) : 0,
    driver_paid: trip_type === "asset" ? roundCurrency(driver_paid_raw) : 0,
    driver_due: driver_payable,
  };

  return {
    trip_id: trip.id,
    trip_type,
    client_id: trip.client_id ?? null,
    supplier_id: trip.supplier_id ?? null,
    driver_id: trip.driver_id ?? null,
    financials: {
      client_receivable,
      supplier_payable,
      driver_payable,
      supplier_payable_raw,
      driver_payable_raw,
    },
    lines,
  };
}
