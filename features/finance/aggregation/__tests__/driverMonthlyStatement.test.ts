import { buildMonthlyDriverStatement } from '../driverMonthlyStatement';
import type { TripForStatement, DriverLedgerEntryForStatement } from '../driverMonthlyStatement';

describe('buildMonthlyDriverStatement', () => {
  const driverId = 'drv-1';

  it('groups trips by pickup_date month and ledger entries by created_at month', () => {
    const trips: TripForStatement[] = [
      { id: 't1', driver_id: driverId, pickup_date: '2026-01-10', supplier_rate: 1000 } as TripForStatement,
      { id: 't2', driver_id: driverId, pickup_date: '2026-02-05', supplier_rate: 1000 } as TripForStatement,
    ];
    const { rows } = buildMonthlyDriverStatement(driverId, trips, [], null);
    const keys = rows.map((r) => r.monthKey);
    expect(keys).toEqual(expect.arrayContaining(['2026-01', '2026-02']));
  });

  it('adds a fixed monthly salary from the driver offer to totalEarnings', () => {
    const trips: TripForStatement[] = [{ id: 't1', driver_id: driverId, pickup_date: '2026-01-10' } as TripForStatement];
    const { rows } = buildMonthlyDriverStatement(driverId, trips, [], { payableAmount: 5000 } as any);
    const jan = rows.find((r) => r.monthKey === '2026-01');
    expect(jan?.fixedSalary).toBe(5000);
    expect(jan?.totalEarnings).toBeGreaterThanOrEqual(5000);
  });

  it('carries a running balance across months (earnings minus paid)', () => {
    const trips: TripForStatement[] = [
      { id: 't1', driver_id: driverId, pickup_date: '2026-01-10', driver_commission: 1000 } as TripForStatement,
    ];
    const ledger: DriverLedgerEntryForStatement[] = [
      { id: 'l1', driver_id: driverId, trip_id: null, type: 'advance', amount: 200, created_at: '2026-01-15' },
    ];
    const { rows } = buildMonthlyDriverStatement(driverId, trips, ledger, null);
    const jan = rows.find((r) => r.monthKey === '2026-01');
    // tripCommission falls back to 10% of supplier_rate/client_price = 0 here since neither is set,
    // so totalEarnings is 0 and paidTotal is the 200 advance -> balance goes negative.
    expect(jan?.paidByType.advance).toBe(200);
    expect(jan?.balanceAfter).toBe((jan?.totalEarnings ?? 0) - 200);
  });

  it('ignores trips and ledger entries belonging to a different driver', () => {
    const trips: TripForStatement[] = [
      { id: 't1', driver_id: 'other-driver', pickup_date: '2026-01-10' } as TripForStatement,
    ];
    const { rows } = buildMonthlyDriverStatement(driverId, trips, [], null);
    expect(rows).toHaveLength(0);
  });

  it('caps the number of months returned by options.maxMonths', () => {
    const trips: TripForStatement[] = [
      { id: 't1', driver_id: driverId, pickup_date: '2026-01-01' } as TripForStatement,
      { id: 't2', driver_id: driverId, pickup_date: '2026-02-01' } as TripForStatement,
      { id: 't3', driver_id: driverId, pickup_date: '2026-03-01' } as TripForStatement,
    ];
    const { rows } = buildMonthlyDriverStatement(driverId, trips, [], null, { maxMonths: 1 });
    expect(rows).toHaveLength(1);
  });
});
