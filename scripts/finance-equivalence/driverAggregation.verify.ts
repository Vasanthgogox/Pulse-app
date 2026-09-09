/**
 * C3 equivalence check: real aggregateDrivers.ts (Old JS) vs get_driver_ledger_aggregation
 * (New SQL) over the same live-fetched org data. Not part of the normal test suite (named
 * *.verify.ts, not *.test.ts) — run explicitly via jest with an overridden testMatch. See
 * scripts/finance-equivalence/README.md for the invocation.
 *
 * Fixtures under fixtures/ are fetched from the linked project via `supabase db query`,
 * never fabricated. getDriverOffersByOrganization itself makes live Supabase calls, so its
 * pure offer-resolution logic is reproduced here verbatim (from
 * features/drivers/services/drivers.service.ts:1702-1753) operating on the fetched
 * drivers/driver_invites rows — this is caller glue, not a reimplementation of the
 * aggregation or allocator logic under test.
 *
 * Invocation: npx jest --config jest.config.js --selectProjects app \
 *   --testMatch "<rootDir>/scripts/finance-equivalence/**\/*.verify.ts"
 */
import { aggregateDrivers } from '@/features/finance/aggregation/aggregateDrivers';
import type { DriverLike, TripForDriver, LedgerTx, DriverOfferForAggregation } from '@/features/finance/aggregation/types';
import fs from 'fs';
import path from 'path';

function loadFixture<T>(name: string): T {
  const p = path.join(__dirname, 'fixtures', name);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

type DriverInviteRow = {
  to_user_id: string;
  payable_amount: number | null;
  commission_percent: number | null;
  commission_per_km: number | null;
  created_at: string;
};

/** Verbatim port of getDriverOffersByOrganization's pure resolution logic (no Supabase call). */
function buildOffersByDriverId(
  drivers: DriverLike[],
  invites: DriverInviteRow[],
): Record<string, DriverOfferForAggregation> {
  const userToDriver = new Map<string, DriverLike>();
  for (const d of drivers) {
    if ((d as { user_id?: string | null }).user_id) {
      userToDriver.set((d as { user_id: string }).user_id, d);
    }
  }
  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const offersByDriverId: Record<string, DriverOfferForAggregation> = {};
  for (const row of invites) {
    const driver = userToDriver.get(row.to_user_id);
    if (!driver) continue;
    const payable = num(row.payable_amount) ?? num((driver as { payable_amount?: unknown }).payable_amount);
    const pct = num(row.commission_percent) ?? num((driver as { commission_percent?: unknown }).commission_percent);
    const perKm = num(row.commission_per_km) ?? num((driver as { commission_per_km?: unknown }).commission_per_km);
    void payable;
    offersByDriverId[driver.id] = { commissionPercent: pct, commissionPerKm: perKm };
  }
  return offersByDriverId;
}

describe('driver ledger aggregation: Old JS vs New SQL (org: nihas logs)', () => {
  const drivers = loadFixture<DriverLike[]>('nihas_drivers.json');
  const trips = loadFixture<TripForDriver[]>('nihas_trips_driver.json');
  const transactions = loadFixture<LedgerTx[]>('nihas_transactions.json');
  const invites = loadFixture<DriverInviteRow[]>('nihas_driver_invites.json');
  const sqlRows = loadFixture<
    { driver_id: string; trips_count: number; due: string; paid: string; pending: string }[]
  >('nihas_driver_sql_result.json');

  const offersByDriverId = buildOffersByDriverId(drivers, invites);
  const { rows: jsRows } = aggregateDrivers(drivers, trips, transactions, offersByDriverId);

  const sqlByDriverId = new Map(sqlRows.map((r) => [r.driver_id, r]));

  test('every driver has a matching SQL row', () => {
    expect(sqlRows.length).toBe(jsRows.length);
  });

  test.each(jsRows.map((r) => [r.id, r] as const))('driver %s: due/paid/pending match', (id, jsRow) => {
    const sqlRow = sqlByDriverId.get(id);
    expect(sqlRow).toBeDefined();
    expect(Number(sqlRow!.due)).toBeCloseTo(jsRow.due ?? 0, 6);
    expect(Number(sqlRow!.paid)).toBeCloseTo(jsRow.paid ?? 0, 6);
    expect(Number(sqlRow!.pending)).toBeCloseTo(jsRow.pending ?? 0, 6);
    expect(Number(sqlRow!.trips_count)).toBe(jsRow.trips ?? 0);
  });

  test('total due/paid/pending across all drivers match (financial-amount assertion, not just row presence)', () => {
    const jsDue = jsRows.reduce((s, r) => s + (r.due ?? 0), 0);
    const jsPaid = jsRows.reduce((s, r) => s + (r.paid ?? 0), 0);
    const jsPending = jsRows.reduce((s, r) => s + (r.pending ?? 0), 0);
    const sqlDue = sqlRows.reduce((s, r) => s + Number(r.due), 0);
    const sqlPaid = sqlRows.reduce((s, r) => s + Number(r.paid), 0);
    const sqlPending = sqlRows.reduce((s, r) => s + Number(r.pending), 0);
    expect(sqlDue).toBeCloseTo(jsDue, 6);
    expect(sqlPaid).toBeCloseTo(jsPaid, 6);
    expect(sqlPending).toBeCloseTo(jsPending, 6);
  });
});
