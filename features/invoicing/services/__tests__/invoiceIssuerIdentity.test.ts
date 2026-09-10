import {
  isLegacyCustomerBrandName,
  resolveInvoiceIssuerIdentity,
  type InvoiceIssuerWorkspace,
} from '../invoiceIssuerIdentity.service';

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

function orgBWorkspace(): InvoiceIssuerWorkspace {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Other Logistics Pvt Ltd',
    address_line: 'Andheri',
    locality: null,
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400053',
    business_pan: 'AAACB1234C',
    gstin: '27AAACB1234C1Z5',
    gst_not_applicable: false,
    logo_url: null,
  };
}

describe('resolveInvoiceIssuerIdentity', () => {
  it('uses workspace business name instead of GOGOX', () => {
    const issuer = resolveInvoiceIssuerIdentity({ workspace: gogovanWorkspace() });
    expect(issuer?.businessName).toBe('GOGOVAN INDIA PVT LTD');
    expect(issuer?.businessName.toLowerCase()).not.toContain('gogox');
  });

  it('uses workspace PAN and address', () => {
    const issuer = resolveInvoiceIssuerIdentity({ workspace: gogovanWorkspace() });
    expect(issuer?.pan).toBe('DXCPA3007Q');
    expect(issuer?.addressLines).toEqual(['perungudi', 'Chennai, Tamil Nadu, 600030']);
  });

  it('does not fabricate GSTIN when gstin is null and gst_not_applicable is true', () => {
    const issuer = resolveInvoiceIssuerIdentity({
      workspace: gogovanWorkspace({ gstin: null, gst_not_applicable: true }),
    });
    expect(issuer?.gstin).toBeNull();
    expect(issuer?.gstNotApplicable).toBe(true);
  });

  it('ignores legacy GOGOX branding overlay', () => {
    const issuer = resolveInvoiceIssuerIdentity({
      workspace: gogovanWorkspace(),
      branding: { companyName: 'GOGOX', logoUrl: null },
    });
    expect(issuer?.businessName).toBe('GOGOVAN INDIA PVT LTD');
  });

  it('never lets branding companyName override legal workspace identity', () => {
    const issuer = resolveInvoiceIssuerIdentity({
      workspace: gogovanWorkspace(),
      branding: {
        companyName: 'Other Logistics Pvt Ltd',
        logoUrl: 'https://brand.example/logo.png',
      },
    });
    expect(issuer?.businessName).toBe('GOGOVAN INDIA PVT LTD');
    expect(issuer?.pan).toBe('DXCPA3007Q');
    expect(issuer?.addressLines[0]).toBe('perungudi');
    expect(issuer?.logoUrl).toBe('https://brand.example/logo.png');
  });

  it('clears GSTIN when gst_not_applicable is true', () => {
    const issuer = resolveInvoiceIssuerIdentity({
      workspace: gogovanWorkspace({
        gstin: '33DXCPA3007Q1Z1',
        gst_not_applicable: true,
      }),
    });
    expect(issuer?.gstNotApplicable).toBe(true);
    expect(issuer?.gstin).toBeNull();
  });

  it('does not invent GOGOX when workspace name is missing', () => {
    expect(
      resolveInvoiceIssuerIdentity({
        workspace: gogovanWorkspace({ name: '' }),
      }),
    ).toBeNull();
  });

  it('does not copy another workspace legal identity', () => {
    const issuerA = resolveInvoiceIssuerIdentity({ workspace: gogovanWorkspace() });
    const issuerB = resolveInvoiceIssuerIdentity({ workspace: orgBWorkspace() });
    expect(issuerA?.pan).toBe('DXCPA3007Q');
    expect(issuerB?.pan).toBe('AAACB1234C');
    expect(issuerA?.gstin).toBeNull();
    expect(issuerB?.gstin).toBe('27AAACB1234C1Z5');
    expect(issuerA?.orgId).not.toBe(issuerB?.orgId);
  });

  it('returns null when workspace identity is unavailable', () => {
    expect(resolveInvoiceIssuerIdentity({ workspace: null })).toBeNull();
    expect(
      resolveInvoiceIssuerIdentity({
        workspace: gogovanWorkspace({ id: '', name: '' }),
      }),
    ).toBeNull();
  });
});

describe('isLegacyCustomerBrandName', () => {
  it('detects GOGOX customer fallbacks', () => {
    expect(isLegacyCustomerBrandName('GOGOX')).toBe(true);
    expect(isLegacyCustomerBrandName('GoGoX Logistics')).toBe(true);
    expect(isLegacyCustomerBrandName('GOGOVAN INDIA PVT LTD')).toBe(false);
  });
});
