import { createReportRow } from '../reportRow.util';

describe('createReportRow', () => {
  it('builds a LedgerRow with defaults for optional fields', () => {
    const row = createReportRow({
      id: 'row-1',
      organizationId: 'org-1',
      partyName: 'Acme',
      description: 'Trip payment',
      amountIn: 100,
      amountOut: 0,
      transactionDate: '2026-02-01T00:00:00.000Z',
    });
    expect(row).toEqual({
      id: 'row-1',
      organization_id: 'org-1',
      trip_id: null,
      trip_number: null,
      party_name: 'Acme',
      description: 'Trip payment',
      amount_in: 100,
      amount_out: 0,
      transaction_date: '2026-02-01T00:00:00.000Z',
      created_at: '2026-02-01T00:00:00.000Z',
      contact_id: null,
      contact_type: null,
    });
  });

  it('falls back organizationId null to empty string', () => {
    const row = createReportRow({
      id: 'row-2',
      organizationId: null,
      partyName: 'Bob',
      description: '',
      amountIn: 0,
      amountOut: 50,
      transactionDate: '',
    });
    expect(row.organization_id).toBe('');
    // no explicit date given -> falls back to "now" (non-empty ISO string)
    expect(row.transaction_date.length).toBeGreaterThan(0);
  });

  it('passes through trip_id, trip_number, contactId and contactType when given', () => {
    const row = createReportRow({
      id: 'row-3',
      organizationId: 'org-1',
      partyName: 'Carrier co',
      description: 'Supplier settlement',
      amountIn: 0,
      amountOut: 250,
      transactionDate: '2026-03-01',
      tripId: 'trip-9',
      tripNumber: 'TRP009',
      contactId: 'supplier-1',
      contactType: 'supplier',
    });
    expect(row.trip_id).toBe('trip-9');
    expect(row.trip_number).toBe('TRP009');
    expect(row.contact_id).toBe('supplier-1');
    expect(row.contact_type).toBe('supplier');
  });
});
