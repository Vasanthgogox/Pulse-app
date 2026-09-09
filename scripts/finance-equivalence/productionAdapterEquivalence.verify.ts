/**
 * Final application-boundary safety net for the C2.5 TS cutover: compares the
 * OLD production functions (aggregateDrivers/aggregateSuppliers/aggregateCustomers,
 * left untouched) against the NEW production adapters actually wired into
 * DriversTab.tsx/SuppliersTab.tsx/CustomersTab.tsx/FinanceScreen.tsx
 * (aggregateDriversFromRpc/aggregateSuppliersFromRpc/aggregateCustomersFromRpc)
 * on the exact same real fixture data used in C3. This is a step beyond
 * driverAggregation.verify.ts / supplierAggregation.verify.ts /
 * customerAggregation.verify.ts: those proved the SQL is correct; this proves
 * the adapter (decoration + wiring) that actually ships is correct too.
 *
 * Invocation: npx jest --config jest.config.js --selectProjects app \
 *   --testMatch "<rootDir>/scripts/finance-equivalence/**\/*.verify.ts"
 */
import { aggregateDrivers } from '@/features/finance/aggregation/aggregateDrivers';
import { aggregateDriversFromRpc } from '@/features/finance/aggregation/aggregateDriversFromRpc';
import { aggregateSuppliers, type TripWhereOrgIsClient } from '@/features/finance/aggregation/aggregateSuppliers';
import { aggregateSuppliersFromRpc } from '@/features/finance/aggregation/aggregateSuppliersFromRpc';
import { aggregateCustomers } from '@/features/finance/aggregation/aggregateCustomers';
import { aggregateCustomersFromRpc } from '@/features/finance/aggregation/aggregateCustomersFromRpc';
import type {
  LedgerTx,
  TripForDriver,
  TripForSupplier,
  TripForCustomer,
  DriverLike,
  SupplierLike,
  ClientLike,
  DriverOfferForAggregation,
} from '@/features/finance/aggregation/types';
import type { TripAdjustment } from '@/features/trips/services/tripAdjustments';
import fs from 'fs';
import path from 'path';

function loadFixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')) as T;
}

type AdjustmentRow = { trip_id: string; type: 'cost' | 'revenue'; impact: 'plus' | 'minus'; amount: number; voided_at: string | null };
function buildAdjustmentsByTripId(rows: AdjustmentRow[]): Record<string, TripAdjustment[]> {
  const map: Record<string, TripAdjustment[]> = {};
  for (const r of rows) {
    const key = r.trip_id.trim().toLowerCase();
    if (!map[key]) map[key] = [];
    map[key].push({
      id: `${r.trip_id}-${map[key].length}`,
      trip_id: r.trip_id,
      type: r.type,
      impact: r.impact,
      amount: Number(r.amount),
      reason: '',
      voided_at: r.voided_at,
    });
  }
  return map;
}

describe('production adapter equivalence: OLD aggregateX vs NEW aggregateXFromRpc (org: nihas logs)', () => {
  test('drivers: identical FinancialRowData rows', () => {
    const drivers = loadFixture<DriverLike[]>('nihas_drivers.json');
    const trips = loadFixture<TripForDriver[]>('nihas_trips_driver.json');
    const transactions = loadFixture<LedgerTx[]>('nihas_transactions.json');
    const invites = loadFixture<
      { to_user_id: string; payable_amount: number | null; commission_percent: number | null; commission_per_km: number | null }[]
    >('nihas_driver_invites.json');
    const sqlRows = loadFixture<
      { driver_id: string; trips_count: number; due: string; paid: string; pending: string }[]
    >('nihas_driver_sql_result.json');

    const userToDriver = new Map(drivers.map((d) => [(d as { user_id?: string }).user_id, d]));
    const offersByDriverId: Record<string, DriverOfferForAggregation> = {};
    for (const row of invites) {
      const driver = userToDriver.get(row.to_user_id);
      if (!driver) continue;
      offersByDriverId[driver.id] = {
        commissionPercent: row.commission_percent,
        commissionPerKm: row.commission_per_km,
      };
    }

    const oldResult = aggregateDrivers(drivers, trips, transactions, offersByDriverId);
    const newResult = aggregateDriversFromRpc(
      drivers,
      sqlRows.map((r) => ({
        driver_id: r.driver_id,
        trips_count: Number(r.trips_count),
        due: Number(r.due),
        paid: Number(r.paid),
        pending: Number(r.pending),
      })),
    );

    expect(newResult.rows.length).toBe(oldResult.rows.length);
    const oldById = new Map(oldResult.rows.map((r) => [r.id, r]));
    for (const newRow of newResult.rows) {
      const oldRow = oldById.get(newRow.id)!;
      expect(oldRow).toBeDefined();
      expect(newRow.due).toBeCloseTo(oldRow.due ?? 0, 6);
      expect(newRow.paid).toBeCloseTo(oldRow.paid ?? 0, 6);
      expect(newRow.pending).toBeCloseTo(oldRow.pending ?? 0, 6);
      expect(newRow.trips).toBe(oldRow.trips);
      expect(newRow.name).toBe(oldRow.name);
      expect(newRow.status).toBe(oldRow.status);
      expect(newRow.is_integrated).toBe(oldRow.is_integrated);
    }
  });

  test('suppliers: identical FinancialRowData rows', () => {
    const suppliers = loadFixture<SupplierLike[]>('nihas_suppliers.json');
    const trips = loadFixture<TripForSupplier[]>('nihas_trips_supplier.json');
    const tripsWhereOrgIsClient = loadFixture<TripWhereOrgIsClient[]>('nihas_trips_where_org_is_client.json');
    const transactions = loadFixture<LedgerTx[]>('nihas_transactions_full.json');
    const adjustmentRows = loadFixture<AdjustmentRow[]>('nihas_adjustments.json');
    const sqlRows = loadFixture<
      { supplier_id: string; trips_count: number; due: string; paid: string; unsettled: string }[]
    >('nihas_supplier_sql_result.json');

    const adjustmentsByTripId = buildAdjustmentsByTripId(adjustmentRows);
    const oldResult = aggregateSuppliers(
      suppliers,
      trips,
      transactions,
      tripsWhereOrgIsClient,
      undefined,
      adjustmentsByTripId,
    );
    const newResult = aggregateSuppliersFromRpc(
      suppliers,
      sqlRows.map((r) => ({
        supplier_id: r.supplier_id,
        trips_count: Number(r.trips_count),
        due: Number(r.due),
        paid: Number(r.paid),
        unsettled: Number(r.unsettled),
      })),
    );

    expect(newResult.rows.length).toBe(oldResult.rows.length);
    const oldById = new Map(oldResult.rows.map((r) => [r.id, r]));
    for (const newRow of newResult.rows) {
      const oldRow = oldById.get(newRow.id)!;
      expect(oldRow).toBeDefined();
      expect(newRow.due).toBeCloseTo(oldRow.due ?? 0, 6);
      expect(newRow.payables).toBeCloseTo(oldRow.payables ?? 0, 6);
      expect(newRow.paid).toBeCloseTo(oldRow.paid ?? 0, 6);
      expect(newRow.trips).toBe(oldRow.trips);
      expect(newRow.name).toBe(oldRow.name);
      expect(newRow.subline).toBe(oldRow.subline);
      expect(newRow.is_integrated).toBe(oldRow.is_integrated);
    }
  });

  test('customers: identical FinancialRowData rows', () => {
    const clients = loadFixture<ClientLike[]>('nihas_clients.json');
    const trips = loadFixture<TripForCustomer[]>('nihas_trips_customer.json');
    const transactions = loadFixture<LedgerTx[]>('nihas_transactions_customer.json');
    const adjustmentRows = loadFixture<AdjustmentRow[]>('nihas_adjustments.json');
    const sql = loadFixture<{
      trip_inputs: { client_id: string; trip_id: string; sales: string | number; initial_paid: string | number }[];
      unlinked_payments: { client_id: string; transaction_id: string; amount_in: string | number }[];
      ledger_only_parties: { party_name: string; received: string | number; pending: string | number }[];
      client_ledger_totals: { client_id: string; received: string | number; pending: string | number }[];
    }>('nihas_customer_sql_result.json');

    const adjustmentsByTripId = buildAdjustmentsByTripId(adjustmentRows);
    const oldResult = aggregateCustomers(clients, trips, transactions, undefined, adjustmentsByTripId);
    const newResult = aggregateCustomersFromRpc(clients, {
      trip_inputs: sql.trip_inputs.map((t) => ({
        client_id: t.client_id,
        trip_id: t.trip_id,
        sales: Number(t.sales),
        initial_paid: Number(t.initial_paid),
      })),
      unlinked_payments: sql.unlinked_payments.map((u) => ({
        client_id: u.client_id,
        transaction_id: u.transaction_id,
        amount_in: Number(u.amount_in),
      })),
      ledger_only_parties: sql.ledger_only_parties.map((p) => ({
        party_name: p.party_name,
        received: Number(p.received),
        pending: Number(p.pending),
      })),
      client_ledger_totals: sql.client_ledger_totals.map((c) => ({
        client_id: c.client_id,
        received: Number(c.received),
        pending: Number(c.pending),
      })),
    });

    expect(newResult.rows.length).toBe(oldResult.rows.length);
    const oldById = new Map(oldResult.rows.map((r) => [r.id, r]));
    for (const newRow of newResult.rows) {
      const oldRow = oldById.get(newRow.id)!;
      expect(oldRow).toBeDefined();
      expect(newRow.billed ?? 0).toBeCloseTo(oldRow.billed ?? 0, 6);
      expect(newRow.pending ?? 0).toBeCloseTo(oldRow.pending ?? 0, 6);
      expect(newRow.received ?? 0).toBeCloseTo(oldRow.received ?? 0, 6);
      expect(newRow.name).toBe(oldRow.name);
      expect(newRow.subline).toBe(oldRow.subline);
    }

    const oldTotalIn = oldResult.rows.reduce((s, r) => s + (r.received ?? 0), 0);
    const newTotalIn = newResult.rows.reduce((s, r) => s + (r.received ?? 0), 0);
    expect(newTotalIn).toBeCloseTo(oldTotalIn, 6);
  });
});
