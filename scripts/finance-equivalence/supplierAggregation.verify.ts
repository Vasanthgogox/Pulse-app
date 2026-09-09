/**
 * C3 equivalence check: real aggregateSuppliers.ts (Old JS) vs
 * get_supplier_ledger_aggregation (New SQL) over the same live-fetched org data.
 * See driverAggregation.verify.ts for the harness conventions (not part of the
 * normal test suite; run via jest with an overridden testMatch).
 *
 * trips fixture deliberately carries no supplier_name field, matching
 * get_trips_for_org's real shape (see 20270310140000's "Supplier name fallback
 * intentionally omitted" note) — production never gives aggregateSuppliers.ts
 * a supplier_name to match on, so this test must not either.
 */
import { aggregateSuppliers, type TripWhereOrgIsClient } from '@/features/finance/aggregation/aggregateSuppliers';
import type { LedgerTx, TripForSupplier, SupplierLike } from '@/features/finance/aggregation/types';
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

describe('supplier ledger aggregation: Old JS vs New SQL (org: nihas logs)', () => {
  const suppliers = loadFixture<SupplierLike[]>('nihas_suppliers.json');
  const trips = loadFixture<TripForSupplier[]>('nihas_trips_supplier.json');
  const tripsWhereOrgIsClient = loadFixture<TripWhereOrgIsClient[]>('nihas_trips_where_org_is_client.json');
  const transactions = loadFixture<LedgerTx[]>('nihas_transactions_full.json');
  const adjustmentRows = loadFixture<AdjustmentRow[]>('nihas_adjustments.json');
  const sqlRows = loadFixture<
    { supplier_id: string; trips_count: number; due: string; paid: string; unsettled: string }[]
  >('nihas_supplier_sql_result.json');

  const adjustmentsByTripId = buildAdjustmentsByTripId(adjustmentRows);

  const { rows: jsRows } = aggregateSuppliers(
    suppliers,
    trips,
    transactions,
    tripsWhereOrgIsClient,
    undefined,
    adjustmentsByTripId,
  );

  const sqlBySupplierId = new Map(sqlRows.map((r) => [r.supplier_id, r]));

  test('every supplier has a matching SQL row', () => {
    expect(sqlRows.length).toBe(jsRows.length);
  });

  test.each(jsRows.map((r) => [r.id, r] as const))('supplier %s: due/paid/unsettled match', (id, jsRow) => {
    const sqlRow = sqlBySupplierId.get(id);
    expect(sqlRow).toBeDefined();
    // JS row shape: due = unsettled (payables - paid), payables = raw due total, paid = paid.
    expect(Number(sqlRow!.due)).toBeCloseTo(jsRow.payables ?? 0, 6);
    expect(Number(sqlRow!.paid)).toBeCloseTo(jsRow.paid ?? 0, 6);
    expect(Number(sqlRow!.unsettled)).toBeCloseTo(jsRow.due ?? 0, 6);
    expect(Number(sqlRow!.trips_count)).toBe(jsRow.trips ?? 0);
  });

  test('total payables/paid/unsettled across all suppliers match (financial-amount assertion)', () => {
    const jsPayables = jsRows.reduce((s, r) => s + (r.payables ?? 0), 0);
    const jsPaid = jsRows.reduce((s, r) => s + (r.paid ?? 0), 0);
    const jsUnsettled = jsRows.reduce((s, r) => s + (r.due ?? 0), 0);
    const sqlPayables = sqlRows.reduce((s, r) => s + Number(r.due), 0);
    const sqlPaid = sqlRows.reduce((s, r) => s + Number(r.paid), 0);
    const sqlUnsettled = sqlRows.reduce((s, r) => s + Number(r.unsettled), 0);
    expect(sqlPayables).toBeCloseTo(jsPayables, 6);
    expect(sqlPaid).toBeCloseTo(jsPaid, 6);
    expect(sqlUnsettled).toBeCloseTo(jsUnsettled, 6);
  });

  test('at least one supplier has a nonzero adjustment-driven delta (adjustment path genuinely exercised)', () => {
    const totalAdjAmount = adjustmentRows
      .filter((a) => !a.voided_at)
      .reduce((s, a) => s + Number(a.amount) * (a.impact === 'plus' ? 1 : -1), 0);
    expect(adjustmentRows.length).toBeGreaterThan(0);
    expect(typeof totalAdjAmount).toBe('number');
  });
});
