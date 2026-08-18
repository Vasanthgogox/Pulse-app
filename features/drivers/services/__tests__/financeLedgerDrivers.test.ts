import {
  isActiveFleetRelationshipDriver,
  isFinanceLedgerDriver,
} from '../drivers.service';

describe('isFinanceLedgerDriver', () => {
  it('includes current fleet members', () => {
    expect(
      isFinanceLedgerDriver({ relationship_status: 'active_employee' }),
    ).toBe(true);
    expect(
      isFinanceLedgerDriver({ relationship_status: 'independent' }),
    ).toBe(true);
  });

  it('includes former members so asset trips can still be settled', () => {
    expect(
      isFinanceLedgerDriver({
        relationship_status: 'disconnected',
        left_at: '2026-08-01T00:00:00Z',
      }),
    ).toBe(true);
    expect(
      isFinanceLedgerDriver({
        relationship_status: null,
        left_at: '2026-08-01T00:00:00Z',
      }),
    ).toBe(true);
    expect(isFinanceLedgerDriver({ status: 'inactive' })).toBe(true);
  });

  it('excludes tracking-only trip stubs even if they were assigned on a trip', () => {
    expect(
      isFinanceLedgerDriver({
        tracking_only: true,
        relationship_status: null,
      }),
    ).toBe(false);
    expect(
      isActiveFleetRelationshipDriver({ relationship_status: null }),
    ).toBe(false);
  });

  it('does not treat an arbitrary trip driver_id as a ledger party', () => {
    expect(
      isFinanceLedgerDriver({
        relationship_status: null,
        tracking_only: false,
        left_at: null,
        status: 'offline',
      }),
    ).toBe(false);
  });
});
