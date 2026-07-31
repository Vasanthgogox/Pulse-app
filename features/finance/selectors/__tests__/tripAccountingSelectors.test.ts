import {
  selectAssetTripOperationalCost,
  selectAssetTripFuelCost,
  selectAssetTripTollCost,
  selectAssetTripMaintenanceCost,
  selectAssetTripActualMargin,
  selectAssetTripOutstandingPayables,
  selectAssetTripPostedExpenses,
  selectAssetTripMarginImpact,
  selectAssetTripCostPerKm,
  selectAggregateTripSupplierCost,
  selectAggregateTripCommercialAdjustments,
  selectAggregateTripBrokerageMargin,
  selectAggregateTripNetMargin,
} from '../tripAccountingSelectors';
import type { TripCostEvent } from '../../domain/tripCostEvent';
import type { TripCommercialAdjustment } from '../../domain/tripCommercialAdjustment';
import type { TripRow } from '@/features/trips/services/trips.service';

function event(overrides: Partial<TripCostEvent>): TripCostEvent {
  return {
    id: 'e1',
    tripId: 'trip-1',
    operationalCode: 'TRP001',
    category: 'fuel',
    amount: 100,
    currency: 'INR',
    incurredBy: 'driver',
    payer: 'driver',
    reimbursable: true,
    approvalState: 'approved',
    postingState: 'posted',
    settlementState: 'unpaid',
    pnlImpact: true,
    source: 'driver_upload',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

function adjustment(overrides: Partial<TripCommercialAdjustment>): TripCommercialAdjustment {
  return {
    id: 'adj-1',
    tripId: 'trip-1',
    type: 'rate_revision',
    amount: 100,
    direction: 'increase_cost',
    postingState: 'posted',
    createdAt: '2026-01-01',
    ...overrides,
  };
}

describe('asset trip cost selectors', () => {
  it('only counts posted + approved events toward operational cost', () => {
    const events = [
      event({ amount: 100, postingState: 'posted', approvalState: 'approved' }),
      event({ amount: 999, postingState: 'unposted', approvalState: 'approved' }),
      event({ amount: 999, postingState: 'posted', approvalState: 'pending' }),
    ];
    expect(selectAssetTripOperationalCost(events)).toBe(100);
  });

  it('splits operational cost by category (fuel / toll / maintenance)', () => {
    const events = [
      event({ category: 'fuel', amount: 100 }),
      event({ category: 'toll', amount: 50 }),
      event({ category: 'maintenance', amount: 20 }),
      event({ category: 'misc', amount: 999, postingState: 'unposted' }),
    ];
    expect(selectAssetTripFuelCost(events)).toBe(100);
    expect(selectAssetTripTollCost(events)).toBe(50);
    expect(selectAssetTripMaintenanceCost(events)).toBe(20);
  });

  it('computes actual margin as revenue minus operational cost', () => {
    const trip = { client_price: 1000 } as TripRow;
    const events = [event({ amount: 300 })];
    expect(selectAssetTripActualMargin({ trip, events })).toBe(700);
  });

  it('computes outstanding payables only for reimbursable, approved, unsettled events', () => {
    const events = [
      event({ reimbursable: true, approvalState: 'approved', settlementState: 'unpaid', amount: 100 }),
      event({ reimbursable: true, approvalState: 'approved', settlementState: 'settled', amount: 999 }),
      event({ reimbursable: false, approvalState: 'approved', settlementState: 'unpaid', amount: 999 }),
    ];
    expect(selectAssetTripOutstandingPayables(events)).toBe(100);
  });

  it('sums all posted expenses regardless of approval state', () => {
    const events = [
      event({ postingState: 'posted', amount: 100 }),
      event({ postingState: 'posted', amount: 50 }),
      event({ postingState: 'unposted', amount: 999 }),
    ];
    expect(selectAssetTripPostedExpenses(events)).toBe(150);
  });

  it('returns 0 margin impact when revenue is 0 (avoids divide-by-zero)', () => {
    const trip = { client_price: 0 } as TripRow;
    expect(selectAssetTripMarginImpact({ trip, events: [event({})] })).toBe(0);
  });

  it('computes margin impact as % of revenue consumed by cost', () => {
    const trip = { client_price: 1000 } as TripRow;
    const events = [event({ amount: 200 })];
    expect(selectAssetTripMarginImpact({ trip, events })).toBe(20);
  });

  it('returns null cost-per-km when distance is 0', () => {
    const trip = { distance: 0 } as unknown as TripRow;
    expect(selectAssetTripCostPerKm({ trip, events: [event({})] })).toBeNull();
  });

  it('computes cost-per-km when distance is positive', () => {
    const trip = { distance: 100 } as unknown as TripRow;
    const events = [event({ amount: 500 })];
    expect(selectAssetTripCostPerKm({ trip, events })).toBe(5);
  });
});

describe('aggregate (market) trip selectors', () => {
  it('applies increase_cost / reduce_cost adjustments to the base supplier rate', () => {
    const trip = { supplier_rate: 1000 } as TripRow;
    const adjustments = [
      adjustment({ direction: 'increase_cost', amount: 100 }),
      adjustment({ direction: 'reduce_cost', amount: 50 }),
    ];
    expect(selectAggregateTripSupplierCost({ trip, adjustments })).toBe(1050);
  });

  it('applies increase_margin / reduce_margin / cost-direction adjustments to net commercial adjustment total', () => {
    const adjustments = [
      adjustment({ direction: 'increase_margin', amount: 100 }),
      adjustment({ direction: 'reduce_margin', amount: 30 }),
      adjustment({ direction: 'reduce_cost', amount: 20 }),
      adjustment({ direction: 'increase_cost', amount: 10 }),
    ];
    // +100 -30 +20 -10 = 80
    expect(selectAggregateTripCommercialAdjustments(adjustments)).toBe(80);
  });

  it('computes brokerage margin as revenue minus adjusted supplier cost', () => {
    const trip = { client_price: 1000, supplier_rate: 700 } as TripRow;
    expect(selectAggregateTripBrokerageMargin({ trip, adjustments: [] })).toBe(300);
  });

  it('computes net margin as brokerage margin plus commercial adjustments', () => {
    const trip = { client_price: 1000, supplier_rate: 700 } as TripRow;
    const adjustments = [adjustment({ direction: 'increase_margin', amount: 50 })];
    expect(selectAggregateTripNetMargin({ trip, adjustments })).toBe(350);
  });
});
