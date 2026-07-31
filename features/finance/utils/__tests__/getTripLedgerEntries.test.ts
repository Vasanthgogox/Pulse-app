import { getTripLedgerEntries } from '../getTripLedgerEntries';
import type { LedgerRow } from '../../services/finance.service';

function row(overrides: Partial<LedgerRow> & { descriptionRaw?: string | null }): LedgerRow {
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

describe('getTripLedgerEntries', () => {
  it('returns an empty array when there are no transactions or no tripId', () => {
    expect(getTripLedgerEntries(null, 'trip-1')).toEqual([]);
    expect(getTripLedgerEntries([row({})], null)).toEqual([]);
  });

  it('matches rows by trip_id directly', () => {
    const rows = [row({ id: 'a', trip_id: 'trip-1' }), row({ id: 'b', trip_id: 'trip-2' })];
    const result = getTripLedgerEntries(rows, 'trip-1');
    expect(result.map((r) => r.id)).toEqual(['a']);
  });

  it('matches unanchored rows via QMETA trip_number in the description', () => {
    const rows = [
      row({
        id: 'unanchored',
        trip_id: null,
        descriptionRaw: 'Cash advance [[QMETA:{"trip_number":"TRP010"}]]',
      }),
    ];
    const result = getTripLedgerEntries(rows, 'trip-9', 'TRP010');
    expect(result.map((r) => r.id)).toEqual(['unanchored']);
  });

  it('does not match unanchored rows when the QMETA trip_number differs', () => {
    const rows = [
      row({
        id: 'unanchored',
        trip_id: null,
        descriptionRaw: 'Cash advance [[QMETA:{"trip_number":"TRP999"}]]',
      }),
    ];
    expect(getTripLedgerEntries(rows, 'trip-9', 'TRP010')).toEqual([]);
  });

  it('ignores unanchored rows when no tripDisplayNumber is provided', () => {
    const rows = [
      row({
        id: 'unanchored',
        trip_id: null,
        descriptionRaw: 'Cash advance [[QMETA:{"trip_number":"TRP010"}]]',
      }),
    ];
    expect(getTripLedgerEntries(rows, 'trip-9')).toEqual([]);
  });

  it('matches trip numbers ignoring whitespace and case', () => {
    const rows = [
      row({
        id: 'unanchored',
        trip_id: null,
        descriptionRaw: 'Note [[QMETA:{"trip_number":"trp 010"}]]',
      }),
    ];
    // "TRP010" and "trp 010" match once both are lowercased and space-stripped.
    expect(getTripLedgerEntries(rows, 'trip-9', 'TRP010').map((r) => r.id)).toEqual(['unanchored']);
    // A genuinely different trip number does not match.
    expect(getTripLedgerEntries(rows, 'trip-9', 'TRP011').map((r) => r.id)).toEqual([]);
  });
});
