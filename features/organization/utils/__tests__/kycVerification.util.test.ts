import {
  listKycVerificationGaps,
  kycTaxIdentifiersComplete,
  kycVerificationReady,
} from '@/features/organization/utils/kycVerification.util';
import type { OrganizationKycDocument } from '@/features/organization/types/organizationKycDocuments.types';
import type { WorkspaceKyc } from '@/types/organization';

function baseKyc(over: Partial<WorkspaceKyc> = {}): WorkspaceKyc {
  return {
    id: 'org-1',
    name: 'Test',
    gstin: null,
    gst_not_applicable: false,
    business_pan: null,
    cin: null,
    msme_number: null,
    tan_number: null,
    iec_number: null,
    verification_status: 'unverified',
    verified_at: null,
    kyc_rejected_reason: null,
    rejection_reasons: null,
    registration_type: null,
    business_type: null,
    address_line: null,
    city: null,
    state: null,
    pincode: null,
    address_pincode: null,
    address_proof_path: null,
    address_proof_type: null,
    frozen_at: null,
    submitted_at: null,
    ...over,
  } as WorkspaceKyc;
}

function doc(type: OrganizationKycDocument['doc_type'], path = 'path'): OrganizationKycDocument {
  return {
    id: type,
    organization_id: 'org-1',
    doc_type: type,
    doc_label: null,
    storage_path: path,
    file_name: 'x.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 1,
    is_mandatory: true,
    status: 'pending',
    verified_at: null,
    rejection_notes: null,
    created_at: '',
    updated_at: '',
  };
}

describe('kycVerification gaps + GST skip', () => {
  it('lists GSTIN and docs when incomplete', () => {
    const gaps = listKycVerificationGaps(baseKyc({ business_pan: 'LTUPS6014E' }), []);
    expect(gaps).toEqual(
      expect.arrayContaining([
        'Add GSTIN — or skip if not registered for GST',
        'Upload GST certificate',
        'Upload PAN card',
        'Upload Address proof',
        'Select registration type',
        'Add operating address',
      ]),
    );
    expect(kycVerificationReady(baseKyc({ business_pan: 'LTUPS6014E' }), [])).toBe(false);
  });

  it('treats gst_not_applicable as tax-complete without GSTIN or GST cert', () => {
    const kyc = baseKyc({
      gst_not_applicable: true,
      business_pan: 'LTUPS6014E',
      registration_type: 'pvt_ltd',
      address_line: '1 St',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
    });
    expect(kycTaxIdentifiersComplete(kyc)).toBe(true);
    const gaps = listKycVerificationGaps(kyc, [
      doc('pan_card'),
      doc('address_proof'),
    ]);
    expect(gaps).toEqual([]);
    expect(gaps.some((g) => /GST/i.test(g))).toBe(false);
    expect(kycVerificationReady(kyc, [doc('pan_card'), doc('address_proof')])).toBe(true);
  });

  it('returns no gaps while under review (locked)', () => {
    expect(
      listKycVerificationGaps(
        baseKyc({ verification_status: 'pending', business_pan: 'LTUPS6014E' }),
        [],
      ),
    ).toEqual([]);
  });
});
