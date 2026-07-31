import {
  computeTripOperatedDays,
  driverOfferFromDriverRow,
  selectAssetTripReimbursablePostedCost,
  selectAssetTripPostedExpenseSplit,
  selectAssetTripReimbursementSplit,
  selectAssetTripProvisionCostBreakdown,
  computeDriverTripEstEarningsInr,
  selectAssetTripAdjustedNetMargin,
  selectTripManifestMargin,
  buildAssetProvisionCostBreakdownLines,
} from '../assetTripProvisionSelectors';
import type { TripCostEvent } from '../../domain/tripCostEvent';
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

describe('computeTripOperatedDays', () => {
  it('returns at least 1 day for a same-day trip', () => {
    const trip = { pickup_date: '2026-01-01', completed_at: '2026-01-01' } as TripRow;
    expect(computeTripOperatedDays(trip)).toBe(1);
  });

  it('counts inclusive calendar days between pickup and completion', () => {
    const trip = { pickup_date: '2026-01-01', completed_at: '2026-01-03' } as TripRow;
    expect(computeTripOperatedDays(trip)).toBe(3);
  });

  it('falls back to created_at when pickup_date is missing', () => {
    const trip = { created_at: '2026-01-01', updated_at: '2026-01-02' } as TripRow;
    expect(computeTripOperatedDays(trip)).toBe(2);
  });
});

describe('driverOfferFromDriverRow', () => {
  it('returns null for a null/undefined driver row', () => {
    expect(driverOfferFromDriverRow(null)).toBeNull();
    expect(driverOfferFromDriverRow(undefined)).toBeNull();
  });

  it('maps snake_case driver fields to the camelCase offer shape', () => {
    const offer = driverOfferFromDriverRow({
      payable_amount: 5000,
      commission_percent: 10,
      commission_per_km: null,
    });
    expect(offer).toEqual({ payableAmount: 5000, commissionPercent: 10, commissionPerKm: null });
  });
});

describe('selectAssetTripReimbursablePostedCost', () => {
  it('only sums reimbursable + posted + approved events', () => {
    const events = [
      event({ reimbursable: true, postingState: 'posted', approvalState: 'approved', amount: 100 }),
      event({ reimbursable: false, postingState: 'posted', approvalState: 'approved', amount: 999 }),
    ];
    expect(selectAssetTripReimbursablePostedCost(events)).toBe(100);
  });
});

describe('selectAssetTripPostedExpenseSplit', () => {
  it('splits posted approved costs into fuel / toll / loading / other buckets', () => {
    const events = [
      event({ category: 'fuel', amount: 100 }),
      event({ category: 'fastag', amount: 20 }),
      event({ category: 'loading', amount: 30 }),
      event({ category: 'misc', amount: 10 }),
      event({ category: 'fuel', amount: 999, postingState: 'unposted' }),
    ];
    const split = selectAssetTripPostedExpenseSplit(events);
    expect(split).toEqual({ fuelInr: 100, tollInr: 20, loadingInr: 30, otherInr: 10, totalInr: 160 });
  });
});

describe('selectAssetTripReimbursementSplit', () => {
  it('splits driver-paid reimbursable cost into requested (unsettled) vs paid (settled)', () => {
    const events = [
      event({ reimbursable: true, settlementState: 'unpaid', amount: 100 }),
      event({ reimbursable: true, settlementState: 'settled', amount: 50 }),
    ];
    const split = selectAssetTripReimbursementSplit(events);
    expect(split).toEqual({ requestedInr: 100, paidInr: 50, totalDriverPaidInr: 150 });
  });
});

describe('selectAssetTripProvisionCostBreakdown / computeDriverTripEstEarningsInr', () => {
  it('pro-rates monthly salary by days operated and adds it to driver commission', () => {
    const trip = { pickup_date: '2026-01-01', completed_at: '2026-01-01', client_price: 1000, distance: 100 } as TripRow;
    const breakdown = selectAssetTripProvisionCostBreakdown({
      trip,
      events: [],
      driverOffer: { payableAmount: 3100, commissionPercent: null, commissionPerKm: null },
    });
    // Jan has 31 days: 3100 / 31 * 1 day = 100.
    expect(breakdown.salaryAllocationInr).toBe(100);
    expect(breakdown.daysInMonth).toBe(31);
  });

  it('estimates driver earnings as commission + pro-rata salary, excluding posted expenses', () => {
    const trip = { pickup_date: '2026-01-01', completed_at: '2026-01-01', client_price: 1000 } as TripRow;
    const earnings = computeDriverTripEstEarningsInr(trip, {
      payableAmount: 0,
      commissionPercent: 10,
      commissionPerKm: null,
    });
    expect(earnings).toBe(100);
  });
});

describe('margin selectors', () => {
  it('computes adjusted net margin as adjustedSale - adjustedCost (never clamped)', () => {
    expect(selectAssetTripAdjustedNetMargin({ adjustedSaleInr: 500, adjustedCostInr: 700 })).toBe(-200);
  });

  it('selectTripManifestMargin delegates to the same adjusted-net-margin formula', () => {
    const input = { adjustedSaleInr: 1000, adjustedCostInr: 600 };
    expect(selectTripManifestMargin(input)).toBe(selectAssetTripAdjustedNetMargin(input));
  });
});

describe('buildAssetProvisionCostBreakdownLines', () => {
  it('includes the driver commission line when it is non-zero', () => {
    const lines = buildAssetProvisionCostBreakdownLines({
      driverCommissionInr: 75,
      salaryAllocationInr: 0,
      postedOperationalCostInr: 0,
      reimbursablePostedInr: 0,
      postedExpenseSplit: { fuelInr: 0, tollInr: 0, loadingInr: 0, otherInr: 0, totalInr: 0 },
      reimbursementSplit: { requestedInr: 0, paidInr: 0, totalDriverPaidInr: 0 },
      daysOperated: 1,
      daysInMonth: 30,
      monthlySalaryInr: 0,
      totalBaseCostInr: 75,
    });
    expect(lines.some((l) => l.label === 'Driver commission')).toBe(true);
  });

  it('omits a zero-amount driver commission line (only "section" lines survive when amount is 0)', () => {
    const lines = buildAssetProvisionCostBreakdownLines({
      driverCommissionInr: 0,
      salaryAllocationInr: 0,
      postedOperationalCostInr: 0,
      reimbursablePostedInr: 0,
      postedExpenseSplit: { fuelInr: 0, tollInr: 0, loadingInr: 0, otherInr: 0, totalInr: 0 },
      reimbursementSplit: { requestedInr: 0, paidInr: 0, totalDriverPaidInr: 0 },
      daysOperated: 1,
      daysInMonth: 30,
      monthlySalaryInr: 0,
      totalBaseCostInr: 0,
    });
    expect(lines.some((l) => l.label === 'Driver commission')).toBe(false);
  });

  it('includes a posted-expenses section with only the non-zero category child lines', () => {
    const lines = buildAssetProvisionCostBreakdownLines({
      driverCommissionInr: 50,
      salaryAllocationInr: 0,
      postedOperationalCostInr: 100,
      reimbursablePostedInr: 0,
      postedExpenseSplit: { fuelInr: 100, tollInr: 0, loadingInr: 0, otherInr: 0, totalInr: 100 },
      reimbursementSplit: { requestedInr: 0, paidInr: 0, totalDriverPaidInr: 0 },
      daysOperated: 1,
      daysInMonth: 30,
      monthlySalaryInr: 0,
      totalBaseCostInr: 150,
    });
    expect(lines.some((l) => l.label === 'Fuel')).toBe(true);
    expect(lines.some((l) => l.label === 'Toll / FASTag')).toBe(false);
  });
});
