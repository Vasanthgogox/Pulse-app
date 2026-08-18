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

  it('falls back to trip.driver_commission (already-agreed, stamped amount) when there is no offer', () => {
    expect(computeDriverCommissionForTrip({ driver_id: 'd1', driver_commission: 300 }, null)).toBe(300);
  });

  it('never guesses 10% of supplier_rate — no agreed terms and nothing stamped means 0, not an estimate', () => {
    expect(computeDriverCommissionForTrip({ driver_id: 'd1', supplier_rate: 2000 }, null)).toBe(0);
  });

  it('never guesses 10% of client_price — no agreed terms and nothing stamped means 0, not an estimate', () => {
    expect(computeDriverCommissionForTrip({ driver_id: 'd1', client_price: 500 }, null)).toBe(0);
  });

  it('returns 0 for a driver-cum-owner (no org relationship, no offer, no stamped commission) even with a real trip price', () => {
    expect(
      computeDriverCommissionForTrip(
        { driver_id: 'fo-1', client_price: 50000, supplier_rate: 0 },
        { commissionPercent: null, commissionPerKm: null, payableAmount: null },
      ),
    ).toBe(0);
  });

  it('still returns the real agreed percent-based commission even when trip.driver_commission is not yet stamped', () => {
    expect(
      computeDriverCommissionForTrip(
        { driver_id: 'd1', client_price: 1000, driver_commission: 0 },
        { commissionPercent: 15, commissionPerKm: null, payableAmount: null },
      ),
    ).toBe(150);
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

  it('keeps stamped asset-trip commission settleable after the driver leaves', () => {
    const former: DriverLike[] = [
      {
        id: 'd1',
        name: 'Sadam',
        left_at: '2026-08-17T00:00:00.000Z',
        relationship_status: 'disconnected',
      } as DriverLike,
    ];
    const trips: TripForDriver[] = [
      { driver_id: 'd1', driver_commission: 3500, client_price: 35000 } as TripForDriver,
    ];
    const unpaid = aggregateDrivers(former, trips, []);
    expect(unpaid.rows[0].due).toBe(3500);
    expect(unpaid.rows[0].pending).toBe(3500);
    expect(unpaid.rows[0].status).toBe('DISCONNECTED');

    const afterPay = aggregateDrivers(former, trips, [
      { contact_type: 'driver', contact_id: 'd1', amount_out: 3500 } as LedgerTx,
    ]);
    expect(afterPay.rows[0].paid).toBe(3500);
    expect(afterPay.rows[0].pending).toBe(0);
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
