import { computeLedgerDerivedPaidSeed } from '../ledgerDerivedPaidSeed.util';

describe('computeLedgerDerivedPaidSeed — Ledger Derived Amount Rule', () => {
  it('returns amount_paid when there is no linked ledger transaction', () => {
    expect(
      computeLedgerDerivedPaidSeed({ amountPaid: 500, hasLinkedTransaction: false }),
    ).toBe(500);
  });

  it('returns 0 when a linked transaction exists, since amount_paid already reflects it', () => {
    expect(
      computeLedgerDerivedPaidSeed({ amountPaid: 500, hasLinkedTransaction: true }),
    ).toBe(0);
  });

  it('treats null/undefined amount_paid as 0', () => {
    expect(
      computeLedgerDerivedPaidSeed({ amountPaid: null, hasLinkedTransaction: false }),
    ).toBe(0);
    expect(
      computeLedgerDerivedPaidSeed({ amountPaid: undefined, hasLinkedTransaction: false }),
    ).toBe(0);
  });
});
