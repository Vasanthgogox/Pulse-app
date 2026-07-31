import { resolveTripLedgerTripType } from '../tripLedgerPayoutMode.util';

describe('resolveTripLedgerTripType', () => {
  it('prefers persisted trip_payout_mode when it is a valid value', () => {
    expect(
      resolveTripLedgerTripType({ trip_payout_mode: 'asset', supplier_id: 'sup-1', driver_id: null, vehicle_id: null }),
    ).toBe('asset');
    expect(
      resolveTripLedgerTripType({ trip_payout_mode: 'MARKET', supplier_id: null, driver_id: 'd1', vehicle_id: null }),
    ).toBe('market');
  });

  it('infers market when a supplier is linked and no valid persisted mode', () => {
    expect(
      resolveTripLedgerTripType({ trip_payout_mode: null, supplier_id: 'sup-1', driver_id: null, vehicle_id: null }),
    ).toBe('market');
  });

  it('infers asset when there is no supplier link', () => {
    expect(
      resolveTripLedgerTripType({ trip_payout_mode: null, supplier_id: '', driver_id: 'd1', vehicle_id: 'v1' }),
    ).toBe('asset');
  });

  it('treats an unrecognized persisted mode as absent and falls back to supplier inference', () => {
    expect(
      resolveTripLedgerTripType({ trip_payout_mode: 'bogus', supplier_id: 'sup-1', driver_id: null, vehicle_id: null }),
    ).toBe('market');
  });

  it('defaults to asset when trip is null/undefined', () => {
    expect(resolveTripLedgerTripType(null)).toBe('asset');
    expect(resolveTripLedgerTripType(undefined)).toBe('asset');
  });
});
