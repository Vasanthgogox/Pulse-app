import {
  interpretLedgerRowStructured,
  buildLedgerSyncDescriptionLine,
} from '../ledgerEntryModel';

describe('interpretLedgerRowStructured', () => {
  it('classifies a client cash-in row as receivable', () => {
    const view = interpretLedgerRowStructured({
      contact_id: 'client-1',
      contact_type: 'client',
      amount_in: 500,
      amount_out: 0,
      description: 'Trip Payment | Mode: UPI | UTR: ABC123',
    });
    expect(view.entity_type).toBe('client');
    expect(view.transaction_type).toBe('receivable');
    expect(view.category).toBe('Trip Payment');
    expect(view.payment_mode).toBe('UPI');
    expect(view.reference_number).toBe('ABC123');
  });

  it('classifies a supplier cash-out row as payable', () => {
    const view = interpretLedgerRowStructured({
      contact_id: 'sup-1',
      contact_type: 'supplier',
      amount_in: 0,
      amount_out: 300,
    });
    expect(view.entity_type).toBe('supplier');
    expect(view.transaction_type).toBe('payable');
  });

  it('classifies an unassigned cash-out row with a vehicle number as vehicle/expense', () => {
    const view = interpretLedgerRowStructured({
      amount_in: 0,
      amount_out: 100,
      vehicle_number: 'MH12AB1234',
    });
    expect(view.entity_type).toBe('vehicle');
    expect(view.transaction_type).toBe('expense');
  });

  it('classifies an unassigned cash-out row with no vehicle as expense with null entity', () => {
    const view = interpretLedgerRowStructured({ amount_in: 0, amount_out: 40 });
    expect(view.entity_type).toBeNull();
    expect(view.transaction_type).toBe('expense');
  });

  it('returns null transaction_type when there is no cash movement', () => {
    const view = interpretLedgerRowStructured({ amount_in: 0, amount_out: 0 });
    expect(view.transaction_type).toBeNull();
  });

  it('trims contact_id to null when blank', () => {
    const view = interpretLedgerRowStructured({ contact_id: '  ', amount_in: 10 });
    expect(view.entity_id).toBeNull();
  });
});

describe('buildLedgerSyncDescriptionLine', () => {
  it('joins category, mode, UTR, and notes with " | "', () => {
    const line = buildLedgerSyncDescriptionLine({
      categoryOrKind: 'Trip Payment',
      paymentModeLabel: 'UPI',
      paymentModeId: 'UPI',
      paymentReference: 'ABC123',
      notes: 'Partial',
    });
    expect(line).toBe('Trip Payment | Mode: UPI | UTR: ABC123 | Notes: Partial');
  });

  it('omits the UTR segment when payment mode is CASH, even with a reference', () => {
    const line = buildLedgerSyncDescriptionLine({
      categoryOrKind: 'Settlement',
      paymentModeLabel: 'Cash',
      paymentModeId: 'CASH',
      paymentReference: 'should-be-ignored',
    });
    expect(line).toBe('Settlement | Mode: Cash');
  });

  it('falls back to "ENTRY" when categoryOrKind is blank', () => {
    const line = buildLedgerSyncDescriptionLine({ categoryOrKind: '  ' });
    expect(line).toBe('ENTRY');
  });
});
