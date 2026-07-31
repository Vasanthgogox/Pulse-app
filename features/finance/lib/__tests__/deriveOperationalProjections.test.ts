import { deriveOperationalCashflow } from '../../projections/deriveOperationalCashflow';
import { deriveOperationalLedgerProjection } from '../../projections/deriveOperationalLedgerProjection';
import { deriveOperationalPayables } from '../../projections/deriveOperationalPayables';
import { derivePendingReimbursements } from '../../projections/derivePendingReimbursements';
import type { TripFuelEntry, TripTollEntry } from '@/features/trips/operations/types';

function fuel(overrides: Partial<TripFuelEntry>): TripFuelEntry {
  return { id: 'f1', trip_id: 'trip-1', amount_inr: 0, ...overrides } as TripFuelEntry;
}
function toll(overrides: Partial<TripTollEntry>): TripTollEntry {
  return { id: 't1', trip_id: 'trip-1', amount_inr: 0, ...overrides } as TripTollEntry;
}

describe('deriveOperationalCashflow', () => {
  it('buckets amounts by payment_owner (driver / organization / supplier / pending)', () => {
    const result = deriveOperationalCashflow({
      fuelEntries: [
        fuel({ amount_inr: 100, payment_owner: 'driver' }),
        fuel({ amount_inr: 50, payment_owner: 'fleet_card' }),
      ],
      tollEntries: [
        toll({ amount_inr: 30, payment_owner: 'supplier' }),
        toll({ amount_inr: 20, payment_owner: undefined }),
      ],
    });
    expect(result).toEqual({
      totalDriverPaidInr: 100,
      totalOrganizationPaidInr: 50,
      totalSupplierPaidInr: 30,
      pendingSettlementInr: 20,
    });
  });
});

describe('deriveOperationalLedgerProjection', () => {
  it('counts approved-to-post, posted, failed, and approval-pending rows', () => {
    const result = deriveOperationalLedgerProjection({
      fuelEntries: [
        fuel({ amount_inr: 100, approval_state: 'approved', posting_state: 'posted' }),
        fuel({ amount_inr: 50, approval_state: 'approved', posting_state: 'failed' }),
        fuel({ amount_inr: 25, approval_state: 'approved', posting_state: 'pending' }),
      ],
      tollEntries: [toll({ amount_inr: 10, approval_state: 'reported' })],
    });
    expect(result).toEqual({
      approvedToPostCount: 1,
      postedCount: 1,
      failedPostingCount: 1,
      approvalPendingCount: 1,
      totalApprovedExpenseInr: 175,
    });
  });
});

describe('deriveOperationalPayables', () => {
  it('attributes driver payables only when reimbursement is in a pending/approved state', () => {
    const result = deriveOperationalPayables({
      fuelEntries: [
        fuel({ amount_inr: 100, payment_owner: 'driver', reimbursement_state: 'reported' }),
        fuel({ amount_inr: 40, payment_owner: 'driver', reimbursement_state: 'reimbursed' }),
      ],
      tollEntries: [toll({ amount_inr: 60, payment_owner: 'supplier' })],
    });
    expect(result.driverReimbursementPayableInr).toBe(100);
    expect(result.supplierOperationalPayableInr).toBe(60);
  });

  it('buckets unrecognized owners as unclassified', () => {
    const result = deriveOperationalPayables({
      fuelEntries: [fuel({ amount_inr: 15, payment_owner: 'unknown_owner' })],
      tollEntries: [],
    });
    expect(result.unclassifiedOperationalPayableInr).toBe(15);
  });
});

describe('derivePendingReimbursements', () => {
  it('only considers driver-paid rows, splitting pending / reimbursed / rejected', () => {
    const result = derivePendingReimbursements({
      fuelEntries: [
        fuel({ amount_inr: 100, payment_owner: 'driver', reimbursement_state: 'reported' }),
        fuel({ amount_inr: 40, payment_owner: 'driver', reimbursement_state: 'reimbursed' }),
        fuel({ amount_inr: 20, payment_owner: 'driver', reimbursement_state: 'rejected' }),
      ],
      tollEntries: [toll({ amount_inr: 999, payment_owner: 'organization' })],
    });
    expect(result).toEqual({
      pendingCount: 1,
      pendingAmountInr: 100,
      reimbursedCount: 1,
      rejectedCount: 1,
    });
  });
});
