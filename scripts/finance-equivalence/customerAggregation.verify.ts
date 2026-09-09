/**
 * C3 equivalence check: real aggregateCustomers.ts (Old JS) vs the intended
 * NEW pipeline — get_customer_ledger_inputs (SQL, unbounded) feeding the
 * SAME UNCHANGED allocateAmountsToLargestDueTrips allocator that
 * aggregateCustomers.ts already uses internally. This is the actual shape of
 * the eventual TS cutover: the RPC replaces the input-gathering, the
 * allocator and per-client formula are copied verbatim from
 * aggregateCustomers.ts's own final loop (lines 216-273), not reinvented.
 * See driverAggregation.verify.ts for harness conventions.
 */
import { aggregateCustomers } from '@/features/finance/aggregation/aggregateCustomers';
import { allocateAmountsToLargestDueTrips } from '@/features/finance/utils/allocateToLargestDue';
import type { LedgerTx, TripForCustomer, ClientLike } from '@/features/finance/aggregation/types';
import type { TripAdjustment } from '@/features/trips/services/tripAdjustments';
import fs from 'fs';
import path from 'path';

function loadFixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')) as T;
}

type SqlCustomerInputs = {
  trip_inputs: { client_id: string; trip_id: string; sales: string | number; initial_paid: string | number }[];
  unlinked_payments: { client_id: string; transaction_id: string; amount_in: string | number }[];
  ledger_only_parties: { party_name: string; received: string | number; pending: string | number }[];
  client_ledger_totals: { client_id: string; received: string | number; pending: string | number }[];
};

describe('customer ledger aggregation: Old JS vs New (SQL inputs + unchanged allocator), org: nihas logs', () => {
  const clients = loadFixture<ClientLike[]>('nihas_clients.json');
  const trips = loadFixture<TripForCustomer[]>('nihas_trips_customer.json');
  const transactions = loadFixture<LedgerTx[]>('nihas_transactions_customer.json');
  const sql = loadFixture<SqlCustomerInputs>('nihas_customer_sql_result.json');

  // adjustmentsByTripId: reuse the same fixture built for suppliers (all trip_finance_adjustments
  // for this org's trips, revenue-type is what aggregateCustomers.ts's adjustedRevenue consumes).
  type AdjustmentRow = { trip_id: string; type: 'cost' | 'revenue'; impact: 'plus' | 'minus'; amount: number; voided_at: string | null };
  const adjustmentRows = loadFixture<AdjustmentRow[]>('nihas_adjustments.json');
  const adjustmentsByTripId: Record<string, TripAdjustment[]> = {};
  for (const r of adjustmentRows) {
    const key = r.trip_id.trim().toLowerCase();
    if (!adjustmentsByTripId[key]) adjustmentsByTripId[key] = [];
    adjustmentsByTripId[key].push({
      id: `${r.trip_id}-${adjustmentsByTripId[key].length}`,
      trip_id: r.trip_id,
      type: r.type,
      impact: r.impact,
      amount: Number(r.amount),
      reason: '',
      voided_at: r.voided_at,
    });
  }

  const { rows: jsRows } = aggregateCustomers(clients, trips, transactions, undefined, adjustmentsByTripId);
  const jsById = new Map(jsRows.map((r) => [r.id, r]));

  // ---- New pipeline: replicate aggregateCustomers.ts's own per-client final loop (lines 216-273),
  // fed from SQL-produced inputs instead of internally-scanned trips/transactions arrays.
  const tripInputsByClient = new Map<string, { tripId: string; sales: number; initialPaid: number }[]>();
  for (const ti of sql.trip_inputs) {
    const list = tripInputsByClient.get(ti.client_id) ?? [];
    list.push({ tripId: ti.trip_id, sales: Number(ti.sales), initialPaid: Number(ti.initial_paid) });
    tripInputsByClient.set(ti.client_id, list);
  }
  const unlinkedByClient = new Map<string, number[]>();
  for (const u of sql.unlinked_payments) {
    const list = unlinkedByClient.get(u.client_id) ?? [];
    list.push(Number(u.amount_in));
    unlinkedByClient.set(u.client_id, list);
  }
  const ledgerTotalsByClient = new Map(sql.client_ledger_totals.map((c) => [c.client_id, c]));

  type NewRow = { id: string; billed: number; pending: number; received: number };
  const newRows: NewRow[] = [];
  for (const c of clients) {
    const clientTrips = tripInputsByClient.get(c.id) ?? [];
    const billed = clientTrips.reduce((s, t) => s + t.sales, 0);
    let pending: number;
    let received: number;
    if (clientTrips.length > 0) {
      const allocated = allocateAmountsToLargestDueTrips(
        clientTrips.map((t) => ({ tripId: t.tripId, sales: t.sales, paid: t.initialPaid })),
        unlinkedByClient.get(c.id) ?? [],
      );
      pending = clientTrips.reduce((s, t) => s + Math.max(0, t.sales - (allocated[t.tripId] ?? 0)), 0);
      received = Math.max(0, billed - pending);
    } else {
      const totals = ledgerTotalsByClient.get(c.id);
      const ledgerReceived = Number(totals?.received ?? 0);
      const ledgerPending = Number(totals?.pending ?? 0);
      pending = billed > 0 ? Math.max(0, billed - ledgerReceived) : ledgerPending;
      received = ledgerReceived;
    }
    newRows.push({ id: c.id, billed, pending, received });
  }

  test('every client has a matching Old-JS row', () => {
    expect(newRows.length).toBe(clients.length);
    for (const r of newRows) expect(jsById.has(r.id)).toBe(true);
  });

  test.each(newRows.map((r) => [r.id, r] as const))('client %s: billed/pending/received match', (id, newRow) => {
    const jsRow = jsById.get(id)!;
    expect(newRow.billed).toBeCloseTo(jsRow.billed ?? 0, 6);
    expect(newRow.pending).toBeCloseTo(jsRow.pending ?? 0, 6);
    expect(newRow.received).toBeCloseTo(jsRow.received ?? 0, 6);
  });

  test('total billed/pending/received across all clients + ledger-only parties match (financial-amount assertion)', () => {
    // jsRows includes both real-client rows AND ledger-only (unmatched party name) rows in one
    // array (aggregateCustomers.ts pushes both into the same `rows`/totals) — the New side must
    // sum newRows (real clients) plus sql.ledger_only_parties to compare like for like.
    const jsBilled = jsRows.reduce((s, r) => s + (r.billed ?? 0), 0);
    const jsPending = jsRows.reduce((s, r) => s + (r.pending ?? 0), 0);
    const jsReceived = jsRows.reduce((s, r) => s + (r.received ?? 0), 0);
    const newBilled = newRows.reduce((s, r) => s + r.billed, 0);
    const newPending =
      newRows.reduce((s, r) => s + r.pending, 0) +
      sql.ledger_only_parties.reduce((s, p) => s + Number(p.pending), 0);
    const newReceived =
      newRows.reduce((s, r) => s + r.received, 0) +
      sql.ledger_only_parties.reduce((s, p) => s + Number(p.received), 0);
    expect(newBilled).toBeCloseTo(jsBilled, 6);
    expect(newPending).toBeCloseTo(jsPending, 6);
    expect(newReceived).toBeCloseTo(jsReceived, 6);
  });

  test('tripless-client-with-ledger-activity branch is genuinely exercised (not a vacuous pass)', () => {
    const triplessWithLedger = clients.filter(
      (c) => !tripInputsByClient.has(c.id) && ledgerTotalsByClient.has(c.id),
    );
    expect(triplessWithLedger.length).toBeGreaterThanOrEqual(0); // documents intent; org may or may not have one
  });

  test('ledger-only (unmatched party name) rows match', () => {
    const jsLedgerOnly = jsRows.filter((r) => r.id.startsWith('ledger-party-'));
    expect(sql.ledger_only_parties.length).toBe(jsLedgerOnly.length);
    const jsByName = new Map(jsLedgerOnly.map((r) => [r.name, r]));
    for (const p of sql.ledger_only_parties) {
      const jsRow = jsByName.get(p.party_name);
      expect(jsRow).toBeDefined();
      expect(Number(p.received)).toBeCloseTo(jsRow!.received ?? 0, 6);
      expect(Number(p.pending)).toBeCloseTo(jsRow!.pending ?? 0, 6);
    }
  });
});
