import { ledgerTotals } from '../ledgerTotals';
import type { LedgerRow } from '../../services/finance.service';

function row(overrides: Partial<LedgerRow>): LedgerRow {
  return {
    id: 'r1',
    organization_id: 'org1',
    trip_id: null,
    trip_number: null,
    party_name: 'Party',
    description: '',
    amount_in: 0,
    amount_out: 0,
    transaction_date: '2026-01-01',
    created_at: '2026-01-01',
    contact_id: null,
    contact_type: null,
    ...overrides,
  } as LedgerRow;
}

describe('ledgerTotals', () => {
  it('sums amount_in and amount_out across rows', () => {
    const rows = [row({ amount_in: 100, amount_out: 0 }), row({ amount_in: 0, amount_out: 40 })];
    expect(ledgerTotals(rows)).toEqual({ totalIn: 100, totalOut: 40 });
  });

  it('treats missing amounts as 0', () => {
    const rows = [row({ amount_in: undefined as unknown as number, amount_out: undefined as unknown as number })];
    expect(ledgerTotals(rows)).toEqual({ totalIn: 0, totalOut: 0 });
  });

  it('returns zero totals for an empty list', () => {
    expect(ledgerTotals([])).toEqual({ totalIn: 0, totalOut: 0 });
  });
});
