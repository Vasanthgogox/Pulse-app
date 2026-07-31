import {
  formatLedgerReceiptDate,
  ledgerReceiptTitle,
  buildLedgerReceiptDetails,
  ledgerReceiptFromRow,
  ledgerReceiptFromFinancialRowData,
} from '../ledgerTransactionReceipt.util';
import type { LedgerRow } from '../../services/finance.service';

function row(overrides: Partial<LedgerRow> & Record<string, unknown> = {}): LedgerRow {
  return {
    id: 'r1',
    organization_id: 'org1',
    trip_id: null,
    trip_number: null,
    party_name: 'Acme',
    description: '',
    amount_in: 0,
    amount_out: 0,
    transaction_date: '2026-03-15',
    created_at: '2026-03-15',
    contact_id: null,
    contact_type: null,
    ...overrides,
  } as LedgerRow;
}

describe('formatLedgerReceiptDate', () => {
  it('formats an ISO date string as "DD Mon YYYY"', () => {
    expect(formatLedgerReceiptDate('2026-03-15')).toBe('15 Mar 2026');
  });

  it('returns an em dash for missing or invalid input', () => {
    expect(formatLedgerReceiptDate(null)).toBe('—');
    expect(formatLedgerReceiptDate(undefined)).toBe('—');
    expect(formatLedgerReceiptDate('not-a-date')).toBe('—');
  });
});

describe('ledgerReceiptTitle', () => {
  it('prefers the double-entry display label when available', () => {
    expect(ledgerReceiptTitle(row({ amount_in: 100, contact_type: 'client' }))).toBe('Customer payment');
  });

  it('falls back to the raw description when no double-entry label applies', () => {
    expect(ledgerReceiptTitle(row({ description: 'Custom note' }))).toBe('Custom note');
  });

  it('falls back to a generic cash-in label when no contact/description/keyword applies', () => {
    expect(ledgerReceiptTitle(row({ amount_in: 50 }))).toBe('Cash in');
  });

  it('falls back to the double-entry "Other (cash out)" label for an unclassified cash-out', () => {
    // getDoubleEntryFromLedgerRow classifies any unmatched cash-out as transactionType
    // 'other_out', which has a friendly label — so this never reaches the raw "Cash out" branch.
    expect(ledgerReceiptTitle(row({ amount_out: 50 }))).toBe('Other (cash out)');
  });
});

describe('buildLedgerReceiptDetails', () => {
  it('includes date, party, payment mode, and reference rows', () => {
    const details = buildLedgerReceiptDetails(
      row({ party_name: 'Acme Corp', payment_mode: 'UPI', payment_reference: 'UTR123' }),
    );
    expect(details).toEqual(
      expect.arrayContaining([
        { label: 'Party', value: 'Acme Corp' },
        { label: 'Payment mode', value: 'UPI' },
        { label: 'Reference', value: 'UTR123' },
      ]),
    );
  });

  it('adds a Note row only when description is present', () => {
    const withNote = buildLedgerReceiptDetails(row({ description: 'Partial settlement' }));
    expect(withNote.some((d) => d.label === 'Note')).toBe(true);

    const withoutNote = buildLedgerReceiptDetails(row({ description: '' }));
    expect(withoutNote.some((d) => d.label === 'Note')).toBe(false);
  });
});

describe('ledgerReceiptFromRow', () => {
  it('labels a pending synthetic salary request as "Payment pending" regardless of direction', () => {
    const receipt = ledgerReceiptFromRow(row({ amount_out: 500, is_pending_request: true } as any));
    expect(receipt.statusLabel).toBe('Payment pending');
    expect(receipt.isIn).toBe(false);
    expect(receipt.amount).toBe(500);
  });

  it('labels a normal cash-in row as "Payment received"', () => {
    const receipt = ledgerReceiptFromRow(row({ amount_in: 200 }));
    expect(receipt.statusLabel).toBe('Payment received');
    expect(receipt.isIn).toBe(true);
  });

  it('labels a normal cash-out row as "Payment sent"', () => {
    const receipt = ledgerReceiptFromRow(row({ amount_out: 200 }));
    expect(receipt.statusLabel).toBe('Payment sent');
    expect(receipt.isIn).toBe(false);
  });
});

describe('ledgerReceiptFromFinancialRowData', () => {
  it('builds a receipt from FinancialRowData, joining category and desc as a note', () => {
    const receipt = ledgerReceiptFromFinancialRowData({
      in: 0,
      out: 300,
      name: 'Driver Bob',
      transaction_date: '2026-04-01',
      paymentMode: 'CASH',
      paymentReference: '',
      category: 'FUEL',
      desc: 'Highway toll',
      transactionTypeLabel: 'Driver payment',
      tripId: 'trip-1',
    } as any);
    expect(receipt.statusLabel).toBe('Payment sent');
    expect(receipt.title).toBe('Driver payment');
    expect(receipt.details.some((d) => d.label === 'Note' && d.value === 'FUEL · Highway toll')).toBe(true);
  });

  it('omits the note when category/desc combine to "GENERAL"', () => {
    const receipt = ledgerReceiptFromFinancialRowData({
      in: 100,
      out: 0,
      name: 'Client A',
      transaction_date: '2026-04-01',
      category: 'GENERAL',
      desc: '',
    } as any);
    expect(receipt.details.some((d) => d.label === 'Note')).toBe(false);
  });
});
