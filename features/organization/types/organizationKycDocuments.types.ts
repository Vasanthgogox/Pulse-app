export type OrganizationKycDocType =
  | 'gst_certificate'
  | 'pan_card'
  | 'cin_certificate'
  | 'address_proof'
  | 'msme_certificate'
  | 'iec_certificate'
  | 'incorporation_certificate'
  | 'other';

export type OrganizationKycDocStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export type OrganizationKycDocument = {
  id: string;
  organization_id: string;
  doc_type: OrganizationKycDocType;
  doc_label: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  is_mandatory: boolean;
  status: OrganizationKycDocStatus;
  verified_at: string | null;
  rejection_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationKycDocDefinition = {
  type: OrganizationKycDocType;
  label: string;
  hint: string;
  mandatory: boolean;
};

/** Required for submit_business_verification (document uploads). */
export const ORG_KYC_REQUIRED_DOCUMENTS: OrganizationKycDocDefinition[] = [
  {
    type: 'gst_certificate',
    label: 'GST certificate',
    hint: 'GST registration certificate (PDF or image)',
    mandatory: true,
  },
  {
    type: 'pan_card',
    label: 'PAN card',
    hint: 'Business PAN card copy',
    mandatory: true,
  },
  {
    type: 'address_proof',
    label: 'Address proof',
    hint: 'Lease, utility bill, or government document',
    mandatory: true,
  },
];

export const ORG_KYC_OPTIONAL_DOCUMENTS: OrganizationKycDocDefinition[] = [
  {
    type: 'cin_certificate',
    label: 'CIN certificate',
    hint: 'Certificate of incorporation (if CIN provided)',
    mandatory: false,
  },
  {
    type: 'msme_certificate',
    label: 'MSME / Udyam',
    hint: 'Udyam registration certificate',
    mandatory: false,
  },
];

export const ORG_KYC_DOC_LABELS: Record<OrganizationKycDocType, string> = {
  gst_certificate: 'GST certificate',
  pan_card: 'PAN card',
  cin_certificate: 'CIN certificate',
  address_proof: 'Address proof',
  msme_certificate: 'MSME / Udyam',
  iec_certificate: 'IEC',
  incorporation_certificate: 'Incorporation',
  other: 'Other',
};
