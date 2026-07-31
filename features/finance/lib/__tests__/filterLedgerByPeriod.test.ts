import { filterLedgerByPeriod, ledgerDayMatchesPeriod } from '../filterLedgerByPeriod';
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
    transaction_date: '',
    created_at: '',
    contact_id: null,
    contact_type: null,
    ...overrides,
  } as LedgerRow;
}

describe('ledgerDayMatchesPeriod', () => {
  it('matches a custom range window inclusively', () => {
    expect(
      ledgerDayMatchesPeriod('2026-01-15', 'CUSTOM', { customFrom: '2026-01-10', customTo: '2026-01-20' }),
    ).toBe(true);
    expect(
      ledgerDayMatchesPeriod('2026-01-25', 'CUSTOM', { customFrom: '2026-01-10', customTo: '2026-01-20' }),
    ).toBe(false);
  });

  it('always matches for RANGE period', () => {
    expect(ledgerDayMatchesPeriod('2026-01-15', 'RANGE')).toBe(true);
  });
});

describe('filterLedgerByPeriod', () => {
  it('filters rows by transaction_date first, falling back to created_at', () => {
    const rows = [
      row({ transaction_date: '2026-01-15', created_at: '2026-01-01' }),
      row({ transaction_date: '', created_at: '2026-01-15' }),
      row({ transaction_date: '2026-02-01', created_at: '2026-02-01' }),
    ];
    const result = filterLedgerByPeriod(rows, 'CUSTOM', {
      customFrom: '2026-01-10',
      customTo: '2026-01-20',
    });
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when no rows match the period', () => {
    const rows = [row({ transaction_date: '2026-05-01' })];
    const result = filterLedgerByPeriod(rows, 'CUSTOM', {
      customFrom: '2026-01-01',
      customTo: '2026-01-31',
    });
    expect(result).toEqual([]);
  });
});
