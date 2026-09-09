/**
 * Server-side, unbounded ledger aggregation — replaces the client-side
 * aggregateDrivers/aggregateSuppliers/aggregateCustomers path, which silently
 * truncated at getTransactionsByOrganization's 400/500-row cap. See
 * get_driver_ledger_aggregation, get_supplier_ledger_aggregation, and
 * get_customer_ledger_inputs (supabase/migrations/2027031{3,4,5,7,8,9}0000_*.sql)
 * for the equivalence-tested SQL these call. Numeric columns come back from
 * PostgREST as strings (Postgres `numeric`); every field here is coerced to
 * number before returning.
 */
import { supabase } from "@/lib/supabase";

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export interface DriverLedgerAggregationRow {
  driver_id: string;
  trips_count: number;
  due: number;
  paid: number;
  pending: number;
}

export interface SupplierLedgerAggregationRow {
  supplier_id: string;
  trips_count: number;
  due: number;
  paid: number;
  unsettled: number;
}

export interface DcoLedgerAggregationRow {
  dco_payee_id: string;
  dco_user_id: string;
  trips_count: number;
  due: number;
  paid: number;
  outstanding: number;
}

export interface CustomerLedgerTripInput {
  client_id: string;
  trip_id: string;
  sales: number;
  initial_paid: number;
}

export interface CustomerLedgerUnlinkedPayment {
  client_id: string;
  transaction_id: string;
  amount_in: number;
}

export interface CustomerLedgerOnlyParty {
  party_name: string;
  received: number;
  pending: number;
}

export interface CustomerLedgerClientTotal {
  client_id: string;
  received: number;
  pending: number;
}

export interface CustomerLedgerInputs {
  trip_inputs: CustomerLedgerTripInput[];
  unlinked_payments: CustomerLedgerUnlinkedPayment[];
  ledger_only_parties: CustomerLedgerOnlyParty[];
  client_ledger_totals: CustomerLedgerClientTotal[];
}

export async function getDriverLedgerAggregation(
  orgId: string,
): Promise<DriverLedgerAggregationRow[]> {
  const { data, error } = await supabase().rpc("get_driver_ledger_aggregation", {
    p_org_id: orgId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    driver_id: String(r.driver_id),
    trips_count: n(r.trips_count),
    due: n(r.due),
    paid: n(r.paid),
    pending: n(r.pending),
  }));
}

export async function getSupplierLedgerAggregation(
  orgId: string,
  applyAdjustments: boolean,
): Promise<SupplierLedgerAggregationRow[]> {
  const { data, error } = await supabase().rpc("get_supplier_ledger_aggregation", {
    p_org_id: orgId,
    p_apply_adjustments: applyAdjustments,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    supplier_id: String(r.supplier_id),
    trips_count: n(r.trips_count),
    due: n(r.due),
    paid: n(r.paid),
    unsettled: n(r.unsettled),
  }));
}

/**
 * DCO-6: unlike suppliers/drivers, there is no org-owned anchor table to
 * iterate — dco_payees has no organization_id (a DCO is a global,
 * person-owned identity). The RPC's own result set is already the full
 * list of DCO payees with at least one trip in this org; a payee with zero
 * trips here is correctly absent, not something the caller needs to add.
 */
export async function getDcoLedgerAggregation(
  orgId: string,
): Promise<DcoLedgerAggregationRow[]> {
  const { data, error } = await supabase().rpc("get_dco_ledger_aggregation", {
    p_org_id: orgId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    dco_payee_id: String(r.dco_payee_id),
    dco_user_id: String(r.dco_user_id),
    trips_count: n(r.trips_count),
    due: n(r.due),
    paid: n(r.paid),
    outstanding: n(r.outstanding),
  }));
}

export async function getCustomerLedgerInputs(
  orgId: string,
  applyAdjustments: boolean,
): Promise<CustomerLedgerInputs> {
  const { data, error } = await supabase().rpc("get_customer_ledger_inputs", {
    p_org_id: orgId,
    p_apply_adjustments: applyAdjustments,
  });
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as {
    trip_inputs?: Record<string, unknown>[];
    unlinked_payments?: Record<string, unknown>[];
    ledger_only_parties?: Record<string, unknown>[];
    client_ledger_totals?: Record<string, unknown>[];
  };
  return {
    trip_inputs: (raw.trip_inputs ?? []).map((t) => ({
      client_id: String(t.client_id),
      trip_id: String(t.trip_id),
      sales: n(t.sales),
      initial_paid: n(t.initial_paid),
    })),
    unlinked_payments: (raw.unlinked_payments ?? []).map((p) => ({
      client_id: String(p.client_id),
      transaction_id: String(p.transaction_id),
      amount_in: n(p.amount_in),
    })),
    ledger_only_parties: (raw.ledger_only_parties ?? []).map((p) => ({
      party_name: String(p.party_name),
      received: n(p.received),
      pending: n(p.pending),
    })),
    client_ledger_totals: (raw.client_ledger_totals ?? []).map((c) => ({
      client_id: String(c.client_id),
      received: n(c.received),
      pending: n(c.pending),
    })),
  };
}
