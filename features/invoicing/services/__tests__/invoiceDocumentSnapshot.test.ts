import type { InvoiceIssuerWorkspace } from '../invoiceIssuerIdentity.service';
import {
  buildInvoiceClientSnapshot,
  buildInvoiceIssuerSnapshot,
  buildInvoiceLineSnapshot,
  buildInvoiceTaxSnapshot,
  emptyInvoiceDocumentSnapshots,
  omitNonInvoiceLineFields,
} from '../invoiceDocumentSnapshot.service';

function gogovanWorkspace(overrides: Partial<InvoiceIssuerWorkspace> = {}): InvoiceIssuerWorkspace {
  return {
    id: '5b471ecb-fbfb-470e-95cf-525d789c761a',
    name: 'GOGOVAN INDIA PVT LTD',
    address_line: 'perungudi',
    locality: null,
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600030',
    business_pan: 'DXCPA3007Q',
    gstin: null,
    gst_not_applicable: true,
    logo_url: null,
    ...overrides,
  };
}

describe('invoice document snapshot contracts', () => {
  it('issuer snapshot accepts real Workspace identity', () => {
    const snapshot = buildInvoiceIssuerSnapshot(gogovanWorkspace());
    expect(snapshot).toEqual({
      legal_name: 'GOGOVAN INDIA PVT LTD',
      address_line: 'perungudi',
      locality: null,
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600030',
      business_pan: 'DXCPA3007Q',
      gstin: null,
      gst_not_applicable: true,
      logo_url: null,
      org_id: '5b471ecb-fbfb-470e-95cf-525d789c761a',
    });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('preserves nullable GSTIN and gst_not_applicable', () => {
    const withGstin = buildInvoiceIssuerSnapshot(
      gogovanWorkspace({ gstin: '33DXCPA3007Q1Z1', gst_not_applicable: false }),
    );
    expect(withGstin.gstin).toBe('33DXCPA3007Q1Z1');
    expect(withGstin.gst_not_applicable).toBe(false);

    const withoutGstin = buildInvoiceIssuerSnapshot(gogovanWorkspace());
    expect(withoutGstin.gstin).toBeNull();
    expect(withoutGstin.gst_not_applicable).toBe(true);
  });

  it('does not use branding company name as issuer legal identity', () => {
    const snapshot = buildInvoiceIssuerSnapshot(gogovanWorkspace());
    expect(snapshot.legal_name).toBe('GOGOVAN INDIA PVT LTD');
    expect(snapshot.legal_name.toLowerCase()).not.toContain('gogox');
  });

  it('client snapshot supports client_id null and nullable identifiers', () => {
    const snapshot = buildInvoiceClientSnapshot({
      client_id: null,
      legal_name: 'Acme Logistics Pvt Ltd',
      gstin: null,
      pan: null,
      billing_address: null,
      state: null,
      email: null,
    });
    expect(snapshot.client_id).toBeNull();
    expect(snapshot.legal_name).toBe('Acme Logistics Pvt Ltd');
    expect(snapshot.gstin).toBeNull();
    expect(snapshot.pan).toBeNull();
  });

  it('line snapshot contains only invoice-relevant fields', () => {
    const line = buildInvoiceLineSnapshot({
      trip_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      trip_ref: 'TRP001',
      description: 'Chennai → Bengaluru freight',
      qty: 1,
      unit: 'trip',
      rate: 89000,
      taxable_value: 89000,
      line_type: 'freight',
      hsn_sac: null,
      tax_rate: null,
    });
    expect(Object.keys(line).sort()).toEqual([
      'description',
      'hsn_sac',
      'line_type',
      'qty',
      'rate',
      'tax_rate',
      'taxable_value',
      'trip_id',
      'trip_ref',
      'unit',
    ]);
    expect(line.hsn_sac).toBeNull();
  });

  it('line snapshot does not contain tracking or debug fields', () => {
    const stripped = omitNonInvoiceLineFields({
      trip_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      trip_ref: 'TRP001',
      description: 'Chennai → Bengaluru freight',
      qty: 1,
      unit: 'trip',
      rate: 89000,
      taxable_value: 89000,
      line_type: 'freight',
      notes: '[UPDATE][reached] Unloading in progress',
      details: 'Driver name (tracking): Vincent',
      tracking: { lat: 13.08 },
      updates: ['[UPDATE][transit]'],
      debug: true,
    });
    expect(stripped).not.toHaveProperty('notes');
    expect(stripped).not.toHaveProperty('details');
    expect(stripped).not.toHaveProperty('tracking');
    expect(stripped).not.toHaveProperty('updates');
    expect(stripped).not.toHaveProperty('debug');
    const line = buildInvoiceLineSnapshot({
      trip_id: stripped.trip_id ?? null,
      trip_ref: stripped.trip_ref ?? null,
      description: stripped.description ?? '',
      qty: stripped.qty ?? 0,
      unit: stripped.unit ?? '',
      rate: stripped.rate ?? 0,
      taxable_value: stripped.taxable_value ?? 0,
      line_type: 'freight',
      hsn_sac: stripped.hsn_sac ?? null,
      tax_rate: stripped.tax_rate ?? null,
    });
    expect(JSON.stringify(line)).not.toMatch(/UPDATE/);
    expect(JSON.stringify(line)).not.toMatch(/tracking/i);
  });

  it('tax snapshot is structurally valid without inventing SAC or rates', () => {
    const snapshot = buildInvoiceTaxSnapshot();
    expect(snapshot).toEqual({
      supply_type: null,
      place_of_supply: null,
      hsn_sac: null,
      determination: null,
    });
    expect(JSON.stringify(snapshot)).not.toContain('996511');
  });

  it('payment_terms is nullable and historical rows remain compatible', () => {
    const historical = emptyInvoiceDocumentSnapshots();
    expect(historical.issuer_snapshot).toBeNull();
    expect(historical.client_snapshot).toBeNull();
    expect(historical.line_items).toBeNull();
    expect(historical.tax_snapshot).toBeNull();
    expect(historical.payment_terms).toBeNull();
  });
});
