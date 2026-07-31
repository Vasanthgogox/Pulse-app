import { aggregateDrivers, computeDriverCommissionForTrip } from '../aggregateDrivers';
import type { DriverLike, LedgerTx, TripForDriver } from '../types';

describe('computeDriverCommissionForTrip', () => {
  it('uses commissionPercent of client_price when a driver offer specifies a percentage', () => {
    const commission = computeDriverCommissionForTrip(
      { driver_id: 'd1', client_price: 1000 },
      { commissionPercent: 12, commissionPerKm: null, payableAmount: null },
    );
    expect(commission).toBe(120);
  });

  it('uses commissionPerKm * distance when the offer specifies a per-km rate and no percent', () => {
    const commission = computeDriverCommissionForTrip(
      { driver_id: 'd1', distance: '250' },
      { commissionPercent: null, commissionPerKm: 5, payableAmount: null },
    );
    expect(commission).toBe(1250);
  });

  it('falls back to trip.driver_commission when there is no offer', () => {
    expect(computeDriverCommissionForTrip({ driver_id: 'd1', driver_commission: 300 }, null)).toBe(300);
  });

  it('falls back to 10% of supplier_rate when no offer or driver_commission', () => {
    expect(computeDriverCommissionForTrip({ driver_id: 'd1', supplier_rate: 2000 }, null)).toBe(200);
  });

  it('falls back to 10% of client_price as the last resort', () => {
    expect(computeDriverCommissionForTrip({ driver_id: 'd1', client_price: 500 }, null)).toBe(50);
  });
});

describe('aggregateDrivers', () => {
  const drivers: DriverLike[] = [{ id: 'd1', name: 'Driver One' } as DriverLike];

  it('computes due from trips and paid from ledger, clamping pending at 0', () => {
    const trips: TripForDriver[] = [{ driver_id: 'd1', driver_commission: 500 } as TripForDriver];
    const transactions: LedgerTx[] = [
      { contact_type: 'driver', contact_id: 'd1', amount_out: 200 } as LedgerTx,
    ];
    const { rows } = aggregateDrivers(drivers, trips, transactions);
    expect(rows[0].due).toBe(500);
    expect(rows[0].paid).toBe(200);
    expect(rows[0].pending).toBe(300);
  });

  it('does not let generic (non-driver-tagged) cash-out rows reduce a driver’s pending due', () => {
    const trips: TripForDriver[] = [{ driver_id: 'd1', driver_commission: 500 } as TripForDriver];
    const transactions: LedgerTx[] = [
      { contact_type: 'supplier', contact_id: 'sup-1', amount_out: 500 } as LedgerTx,
    ];
    const { rows } = aggregateDrivers(drivers, trips, transactions);
    expect(rows[0].paid).toBe(0);
    expect(rows[0].pending).toBe(500);
  });

  it('marks a driver disconnected when left_at is set, with a formatted subline', () => {
    const disconnected: DriverLike[] = [
      { id: 'd1', name: 'Driver One', left_at: '2026-01-05T00:00:00.000Z' } as DriverLike,
    ];
    const { rows } = aggregateDrivers(disconnected, [], []);
    expect(rows[0].status).toBe('DISCONNECTED');
    expect(rows[0].subline).toContain('Disconnected');
  });

  it('counts trips per driver and totals in/out across all drivers', () => {
    const trips: TripForDriver[] = [
      { driver_id: 'd1', driver_commission: 100 } as TripForDriver,
      { driver_id: 'd1', driver_commission: 100 } as TripForDriver,
    ];
    const { rows, totals } = aggregateDrivers(drivers, trips, []);
    expect(rows[0].trips).toBe(2);
    expect(totals.totalIn).toBe(200);
    expect(totals.totalOut).toBe(200);
  });
});
