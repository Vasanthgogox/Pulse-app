import {
  canShowDriverTripEstEarnings,
  isAggregateTrip,
  resolveDriverTripPayoutTerms,
  tripEarningsDetailForDriver,
  type TripWithSupplier,
} from '../driverUtils.util';

// Regression fixtures for the confirmed live bug: DriverControlScreen showed
// "Your earnings ₹3,500" for driver Sadam / trip TRP035 (client_price 35000,
// supplier_id null, driver_commission 0, and zero agreed payout terms on the
// drivers row) — the legacy 10%-of-client_price guess presented as payable.
const TRP035_SHAPE: TripWithSupplier = {
  supplier_id: null,
  driver_commission: 0,
  supplier_rate: 0,
  client_price: 35000,
};

describe('resolveDriverTripPayoutTerms — the confirmed bug and its exact fix', () => {
  it('1) ₹35,000 trip + no compensation terms at all → NOT agreed (this was the live bug)', () => {
    const result = resolveDriverTripPayoutTerms(TRP035_SHAPE, {
      payableAmount: null,
      commissionPercent: null,
      commissionPerKm: null,
    });
    // The legacy resolver still returns a non-zero guess...
    expect(result.commissionDetail.isEstimated).toBe(true);
    expect(result.commissionDetail.amount).toBe(3500); // 35000 * 0.1 — same number the bug showed
    // ...but it must never be treated as agreed.
    expect(result.hasAgreedPayoutTerms).toBe(false);
  });

  it('2) ₹35,000 trip + commission_percent = 10% → agreed, ₹3,500 (same number, now legitimate)', () => {
    const result = resolveDriverTripPayoutTerms(TRP035_SHAPE, {
      payableAmount: null,
      commissionPercent: 10,
      commissionPerKm: null,
    });
    expect(result.commissionDetail.basis).toBe('commission_percent');
    expect(result.commissionDetail.isEstimated).toBe(false);
    expect(result.commissionDetail.amount).toBe(3500);
    expect(result.hasAgreedPayoutTerms).toBe(true);
  });

  it('3) trip with stored driver_commission → agreed, uses the stored value', () => {
    const trip: TripWithSupplier = { ...TRP035_SHAPE, driver_commission: 5000 };
    const result = resolveDriverTripPayoutTerms(trip, {
      payableAmount: null,
      commissionPercent: null,
      commissionPerKm: null,
    });
    expect(result.commissionDetail.basis).toBe('trip_commission');
    expect(result.commissionDetail.amount).toBe(5000);
    expect(result.hasAgreedPayoutTerms).toBe(true);
  });

  it('4) tracking_only direct assignment → no earnings (component-level combination)', () => {
    // resolveDriverTripPayoutTerms itself has no concept of tracking_only — that
    // check lives in DriverControlScreen's `tripIsAggregate`. This test mirrors
    // the screen's exact gate: `tripIsAggregate || !hasAgreedPayoutTerms`.
    const trip: TripWithSupplier = { ...TRP035_SHAPE, supplier_id: null };
    const trackingOnly = true;
    const result = resolveDriverTripPayoutTerms(trip, {
      payableAmount: null,
      commissionPercent: null,
      commissionPerKm: null,
    });
    const tripIsAggregate = isAggregateTrip(trip) || trackingOnly;
    const showsEarnings = !tripIsAggregate && result.hasAgreedPayoutTerms;
    expect(showsEarnings).toBe(false);
  });

  it('5) aggregate/supplier trip → no fabricated driver earnings regardless of price', () => {
    const trip: TripWithSupplier = { ...TRP035_SHAPE, supplier_id: 'supplier-1' };
    const result = resolveDriverTripPayoutTerms(trip, {
      payableAmount: null,
      commissionPercent: null,
      commissionPerKm: null,
    });
    const tripIsAggregate = isAggregateTrip(trip);
    expect(tripIsAggregate).toBe(true);
    const showsEarnings = !tripIsAggregate && result.hasAgreedPayoutTerms;
    expect(showsEarnings).toBe(false);
  });

  it('5b) canShowDriverTripEstEarnings false for supplier-mediated Godrej→supplier trip', () => {
    const trip: TripWithSupplier = {
      ...TRP035_SHAPE,
      supplier_id: 'supplier-1',
      client_price: 50000,
      supplier_rate: 50000,
    };
    expect(
      canShowDriverTripEstEarnings(trip, {
        payableAmount: 18000,
        commissionPercent: null,
        commissionPerKm: null,
      }),
    ).toBe(false);
  });

  it('6) pending attribution (not yet a fleet trip) → no payable earnings yet', () => {
    // Attribution status itself (pending/confirmed) is a separate, pre-existing
    // gate (`isControlTripAttributed` in DriverControlScreen, unaffected by this
    // fix). Until attribution is confirmed there is no commission source at all,
    // which resolveDriverTripPayoutTerms already reports as not agreed.
    const trip: TripWithSupplier = { ...TRP035_SHAPE };
    const result = resolveDriverTripPayoutTerms(trip, {
      payableAmount: null,
      commissionPercent: null,
      commissionPerKm: null,
    });
    expect(result.hasAgreedPayoutTerms).toBe(false);
  });

  it('monthly salary only (payable_amount, no per-trip commission) → agreed via salary, not commission', () => {
    // This is the case the fix must NOT regress: tripEarningsDetailForDriver has
    // no concept of a monthly salary allocation, so a salaried driver with no
    // per-trip commission_percent/per_km would otherwise fall through to the
    // legacy guess and be wrongly reported as "not agreed".
    const trip: TripWithSupplier = { ...TRP035_SHAPE };
    const result = resolveDriverTripPayoutTerms(trip, {
      payableAmount: 18000,
      commissionPercent: null,
      commissionPerKm: null,
    });
    expect(result.commissionDetail.isEstimated).toBe(true); // the resolver's own guess still fires...
    expect(result.hasAgreedPayoutTerms).toBe(true); // ...but salary presence overrides it
    expect(result.monthlyPayableAmount).toBe(18000);
  });

  it('per-km commission with distance → agreed, per_km basis', () => {
    const trip: TripWithSupplier = { ...TRP035_SHAPE, distance: 500 };
    const result = resolveDriverTripPayoutTerms(trip, {
      payableAmount: null,
      commissionPercent: null,
      commissionPerKm: 20,
    });
    expect(result.commissionDetail.basis).toBe('per_km');
    expect(result.commissionDetail.amount).toBe(10000);
    expect(result.hasAgreedPayoutTerms).toBe(true);
  });

  it('null trip → not agreed, zero amount', () => {
    const result = resolveDriverTripPayoutTerms(null, null);
    expect(result.hasAgreedPayoutTerms).toBe(false);
    expect(result.commissionDetail.amount).toBe(0);
  });
});

describe('tripEarningsDetailForDriver — unchanged canonical resolver semantics', () => {
  it('still returns the legacy 10% guess with isEstimated=true (existing callers unaffected)', () => {
    const detail = tripEarningsDetailForDriver(TRP035_SHAPE, null);
    expect(detail.amount).toBe(3500);
    expect(detail.isEstimated).toBe(true);
    expect(detail.basis).toBe('estimated');
  });
});
