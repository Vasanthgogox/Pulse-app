import {
  computeInvoiceTax,
  parseGstinStateCode,
  round2,
  type InvoiceTaxEngineInput,
} from '../invoiceTax.service';

const ORG_A = '5b471ecb-fbfb-470e-95cf-525d789c761a';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function baseInput(overrides: Partial<InvoiceTaxEngineInput> = {}): InvoiceTaxEngineInput {
  return {
    issuer: {
      org_id: ORG_A,
      gstin: '33DXCPA3007Q1Z1',
      gst_not_applicable: false,
      state: 'Tamil Nadu',
    },
    clients: [
      {
        client_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        gstin: '33AAAAA0000A1Z5',
        state: 'Tamil Nadu',
        organization_id: ORG_A,
      },
    ],
    includeGst: true,
    gstRate: 18,
    tripAmounts: [10000],
    includeFuel: false,
    fuelRate: 0,
    additionalCharges: [],
    invoiceOrgId: ORG_A,
    tripOrgIds: [ORG_A],
    hsn_sac: null,
    ...overrides,
  };
}

describe('computeInvoiceTax', () => {
  it('GST not applicable zeros all tax and ignores includeGst/rate', () => {
    const a = computeInvoiceTax(
      baseInput({
        issuer: {
          org_id: ORG_A,
          gstin: null,
          gst_not_applicable: true,
          state: 'Tamil Nadu',
        },
        includeGst: true,
        gstRate: 18,
      }),
    );
    expect(a.status).toBe('ok');
    expect(a.supply_type).toBe('not_applicable');
    expect(a.cgst_amount).toBe(0);
    expect(a.sgst_amount).toBe(0);
    expect(a.igst_amount).toBe(0);
    expect(a.gst_rate).toBe(0);
    expect(a.snapshot.determination).toBe('gst_not_applicable');
  });

  it('same-state GSTIN codes produce CGST+SGST and zero IGST', () => {
    const r = computeInvoiceTax(baseInput());
    expect(r.status).toBe('ok');
    expect(r.supply_type).toBe('intra');
    expect(r.snapshot.determination).toBe('gstin_state_codes');
    expect(r.cgst_amount).toBe(900);
    expect(r.sgst_amount).toBe(900);
    expect(r.igst_amount).toBe(0);
    expect(r.cgst_amount > 0 && r.igst_amount > 0).toBe(false);
  });

  it('inter-state GSTIN codes produce IGST only', () => {
    const r = computeInvoiceTax(
      baseInput({
        clients: [
          {
            client_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            gstin: '27AAAAA0000A1Z5',
            state: 'Maharashtra',
            organization_id: ORG_A,
          },
        ],
      }),
    );
    expect(r.status).toBe('ok');
    expect(r.supply_type).toBe('inter');
    expect(r.igst_amount).toBe(1800);
    expect(r.cgst_amount).toBe(0);
    expect(r.sgst_amount).toBe(0);
  });

  it('missing client GSTIN with equal declared states is intra', () => {
    const r = computeInvoiceTax(
      baseInput({
        issuer: {
          org_id: ORG_A,
          gstin: null,
          gst_not_applicable: false,
          state: 'Tamil Nadu',
        },
        clients: [
          {
            client_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            gstin: null,
            state: 'Tamil Nadu',
            organization_id: ORG_A,
          },
        ],
      }),
    );
    expect(r.status).toBe('ok');
    expect(r.supply_type).toBe('intra');
    expect(r.snapshot.determination).toBe('declared_state_strings');
  });

  it('does not treat TN and Tamil Nadu as the same state string', () => {
    const r = computeInvoiceTax(
      baseInput({
        issuer: {
          org_id: ORG_A,
          gstin: null,
          gst_not_applicable: false,
          state: 'TN',
        },
        clients: [
          {
            client_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            gstin: null,
            state: 'Tamil Nadu',
            organization_id: ORG_A,
          },
        ],
      }),
    );
    expect(r.status).toBe('ok');
    expect(r.supply_type).toBe('inter');
  });

  it('missing state blocks GST-on', () => {
    const r = computeInvoiceTax(
      baseInput({
        issuer: {
          org_id: ORG_A,
          gstin: null,
          gst_not_applicable: false,
          state: null,
        },
        clients: [
          {
            client_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            gstin: null,
            state: null,
            organization_id: ORG_A,
          },
        ],
      }),
    );
    expect(r.status).toBe('blocked');
    expect(r.block_reason).toBe('insufficient_tax_state');
    expect(r.cgst_amount + r.sgst_amount + r.igst_amount).toBe(0);
  });

  it('zero GST rate with includeGst true is application gst_off, not a legal zero-rated class', () => {
    const r = computeInvoiceTax(baseInput({ includeGst: true, gstRate: 0 }));
    expect(r.status).toBe('ok');
    expect(r.supply_type).toBe('gst_off');
    expect(r.snapshot.determination).toBe('gst_off');
    expect(r.igst_amount + r.cgst_amount + r.sgst_amount).toBe(0);
  });

  it('includeGst false is gst_off with status ok', () => {
    const r = computeInvoiceTax(baseInput({ includeGst: false, gstRate: 18 }));
    expect(r.status).toBe('ok');
    expect(r.supply_type).toBe('gst_off');
  });

  it('uses the explicit GST rate and does not invent a default', () => {
    const r = computeInvoiceTax(baseInput({ gstRate: 18, tripAmounts: [100] }));
    expect(r.gst_rate).toBe(18);
    expect(r.cgst_amount + r.sgst_amount).toBe(18);
  });

  it('rejects non-finite gstRate', () => {
    expect(() => computeInvoiceTax(baseInput({ gstRate: Number.POSITIVE_INFINITY }))).toThrow(
      /gstRate/,
    );
    expect(() => computeInvoiceTax(baseInput({ gstRate: Number.NaN }))).toThrow(/gstRate/);
    expect(() => computeInvoiceTax(baseInput({ gstRate: -1 }))).toThrow(/gstRate/);
  });

  it('rounds tax components independently (CGST vs SGST may differ by 0.01)', () => {
    const r = computeInvoiceTax(baseInput({ tripAmounts: [1.11], gstRate: 18 }));
    expect(r.taxable_base).toBe(1.11);
    expect(r.cgst_amount).toBe(round2((1.11 * 9) / 100));
    expect(r.sgst_amount).toBe(round2((1.11 * 9) / 100));
    expect(Math.abs(r.cgst_amount - r.sgst_amount)).toBeLessThanOrEqual(0.01);
  });

  it('includes fuel and extras in taxable base', () => {
    const r = computeInvoiceTax(
      baseInput({
        tripAmounts: [1000],
        includeFuel: true,
        fuelRate: 10,
        additionalCharges: [{ amount: 50 }],
        includeGst: false,
        gstRate: 0,
      }),
    );
    expect(r.taxable_base).toBe(1150);
  });

  it('multiple trips same client is ok', () => {
    const r = computeInvoiceTax(baseInput({ tripAmounts: [1000, 2000] }));
    expect(r.status).toBe('ok');
    expect(r.taxable_base).toBe(3000);
  });

  it('multiple clients block GST-on', () => {
    const r = computeInvoiceTax(
      baseInput({
        clients: [
          {
            client_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            gstin: '33AAAAA0000A1Z5',
            state: 'Tamil Nadu',
            organization_id: ORG_A,
          },
          {
            client_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            gstin: '33BBBBB0000B1Z5',
            state: 'Tamil Nadu',
            organization_id: ORG_A,
          },
        ],
      }),
    );
    expect(r.status).toBe('blocked');
    expect(r.block_reason).toBe('multiple_clients');
  });

  it('cross-org client blocks GST-on', () => {
    const r = computeInvoiceTax(
      baseInput({
        clients: [
          {
            client_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            gstin: '33AAAAA0000A1Z5',
            state: 'Tamil Nadu',
            organization_id: ORG_B,
          },
        ],
      }),
    );
    expect(r.status).toBe('blocked');
    expect(r.block_reason).toBe('cross_org_client');
  });

  it('cross-org trips block GST-on', () => {
    const r = computeInvoiceTax(baseInput({ tripOrgIds: [ORG_A, ORG_B] }));
    expect(r.status).toBe('blocked');
    expect(r.block_reason).toBe('cross_org_trips');
  });

  it('is deterministic for the same inputs (preview/issue consistency)', () => {
    const input = baseInput();
    expect(computeInvoiceTax(input)).toEqual(computeInvoiceTax(input));
  });

  it('does not set a default SAC', () => {
    const r = computeInvoiceTax(baseInput());
    expect(r.snapshot.hsn_sac).toBeNull();
    expect(JSON.stringify(r)).not.toContain('996511');
  });
});

describe('parseGstinStateCode', () => {
  it('reads the first two digits of a 15-character GSTIN', () => {
    expect(parseGstinStateCode('33DXCPA3007Q1Z1')).toBe('33');
    expect(parseGstinStateCode('27AAAAA0000A1Z5')).toBe('27');
    expect(parseGstinStateCode('bad')).toBeNull();
  });
});
