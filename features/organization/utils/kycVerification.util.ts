import type {
  OrganizationKycDocDefinition,
  OrganizationKycDocument,
  OrganizationKycDocType,
} from '@/features/organization/types/organizationKycDocuments.types';
import {
  ACTIVITY_PROOF_DOC_TYPES,
  INCORPORATION_DOC_TYPES,
  ORG_KYC_DOC_LABELS,
  ORG_KYC_OPTIONAL_DOCUMENTS,
} from '@/features/organization/types/organizationKycDocuments.types';
import type { RegistrationType, WorkspaceKyc } from '@/types/organization';
import { isVerificationFrozen } from '@/types/organization';

/**
 * Signup `organizations.business_type` → KYC `registration_type`.
 * OPC / OTHER have no matrix equivalent and stay unset.
 */
export const BUSINESS_TYPE_TO_REGISTRATION: Record<string, RegistrationType> = {
  SOLE_PROPRIETOR: 'proprietorship',
  PARTNERSHIP: 'partnership',
  PVT_LTD: 'pvt_ltd',
  LLP: 'llp',
  // PUBLIC_LTD not collected at signup today; map if ever added:
  PUBLIC_LTD: 'public_ltd',
};

export function registrationTypeFromBusinessType(
  businessType: string | null | undefined,
): RegistrationType | null {
  if (!businessType?.trim()) return null;
  return BUSINESS_TYPE_TO_REGISTRATION[businessType.trim()] ?? null;
}

/** Prefer explicit KYC registration_type; else map signup business_type. */
export function effectiveKycRegistrationType(
  kyc: Pick<WorkspaceKyc, 'registration_type' | 'business_type'> | null | undefined,
): RegistrationType | null {
  if (!kyc) return null;
  return kyc.registration_type ?? registrationTypeFromBusinessType(kyc.business_type);
}

function isWorkspaceKyc(
  value: RegistrationType | WorkspaceKyc | null | undefined,
): value is WorkspaceKyc {
  return typeof value === 'object' && value !== null && 'id' in value;
}

export function resolveAcceptTypes(
  def: OrganizationKycDocDefinition,
): OrganizationKycDocType[] {
  return def.acceptTypes?.length ? def.acceptTypes : [def.type];
}

/** Latest uploaded doc that matches any of the given types. */
export function latestOrgKycDocumentMatching(
  documents: OrganizationKycDocument[],
  types: OrganizationKycDocType[],
): OrganizationKycDocument | undefined {
  const set = new Set(types);
  return documents
    .filter((d) => set.has(d.doc_type) && d.storage_path)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
}

export function kycDocSlotSatisfied(
  def: OrganizationKycDocDefinition,
  documents: OrganizationKycDocument[],
  kyc: WorkspaceKyc | null,
): boolean {
  const match = latestOrgKycDocumentMatching(documents, resolveAcceptTypes(def));
  if (match?.storage_path) return true;
  if (def.type === 'address_proof' && kyc?.address_proof_path?.trim()) return true;
  return false;
}

function def(
  type: OrganizationKycDocType,
  partial: Partial<OrganizationKycDocDefinition> & Pick<OrganizationKycDocDefinition, 'label' | 'hint'>,
): OrganizationKycDocDefinition {
  return {
    type,
    mandatory: true,
    ...partial,
  };
}

/**
 * Structure-driven required document matrix.
 *
 * Overloads:
 * - `kycRequiredDocumentDefs(kyc)` — existing callers
 * - `kycRequiredDocumentDefs(registrationType, gstNotApplicable, uploadedDocs?)`
 *
 * `uploadedDocs` is reserved for future dynamic slots; proprietorship activity
 * proof is expressed declaratively (acceptTypes includes gst_certificate).
 */
export function kycRequiredDocumentDefs(
  registrationTypeOrKyc: RegistrationType | WorkspaceKyc | null | undefined,
  gstNotApplicable?: boolean,
  _uploadedDocs?: OrganizationKycDocument[],
): OrganizationKycDocDefinition[] {
  let registrationType: RegistrationType | null | undefined;
  let skipGst: boolean;

  if (isWorkspaceKyc(registrationTypeOrKyc)) {
    registrationType = effectiveKycRegistrationType(registrationTypeOrKyc);
    skipGst = !!registrationTypeOrKyc.gst_not_applicable;
  } else {
    registrationType = registrationTypeOrKyc ?? null;
    skipGst = !!gstNotApplicable;
  }

  const required: OrganizationKycDocDefinition[] = [
    def('pan_card', {
      label: 'PAN card',
      hint: 'Business PAN card copy',
    }),
    def('address_proof', {
      label: 'Address proof',
      hint: 'Lease, utility bill, or government document',
    }),
  ];

  if (!skipGst) {
    required.unshift(
      def('gst_certificate', {
        label: 'GST certificate',
        hint: 'GST registration certificate (PDF or image)',
      }),
    );
  }

  switch (registrationType) {
    case 'proprietorship':
      if (skipGst) {
        required.push(
          def('msme_certificate', {
            label: 'Activity proof (Udyam or IEC)',
            hint:
              'When GST is not registered, upload Udyam or IEC (RBI-style second evidence). A GST certificate also counts if already uploaded.',
            acceptTypes: [...ACTIVITY_PROOF_DOC_TYPES],
            uploadChoices: ['msme_certificate', 'iec_certificate'],
          }),
        );
      }
      break;
    case 'partnership':
      required.push(
        def('partnership_deed', {
          label: 'Partnership deed',
          hint: 'Registered or notarised partnership deed',
        }),
      );
      break;
    case 'pvt_ltd':
    case 'public_ltd':
      required.push(
        def('incorporation_certificate', {
          label: 'Incorporation / CIN certificate',
          hint: 'Certificate of incorporation (CIN certificate also accepted)',
          acceptTypes: [...INCORPORATION_DOC_TYPES],
          uploadChoices: ['incorporation_certificate', 'cin_certificate'],
        }),
      );
      break;
    case 'llp':
      required.push(
        def('incorporation_certificate', {
          label: 'Incorporation certificate',
          hint: 'LLP certificate of incorporation (CIN certificate also accepted)',
          acceptTypes: [...INCORPORATION_DOC_TYPES],
          uploadChoices: ['incorporation_certificate', 'cin_certificate'],
        }),
        def('llp_agreement', {
          label: 'LLP agreement',
          hint: 'LLP agreement / partnership agreement for the LLP',
        }),
      );
      break;
    default:
      break;
  }

  return required;
}

/** Optional rows hidden when the same type already appears in required slots. */
export function kycOptionalDocumentDefs(
  kyc: WorkspaceKyc | null,
): OrganizationKycDocDefinition[] {
  const required = kycRequiredDocumentDefs(kyc);
  const covered = new Set<OrganizationKycDocType>();
  for (const r of required) {
    for (const t of resolveAcceptTypes(r)) covered.add(t);
  }

  const extras: OrganizationKycDocDefinition[] = [];

  const resolvedForOptional = effectiveKycRegistrationType(kyc);
  if (
    resolvedForOptional === 'proprietorship' ||
    resolvedForOptional === 'partnership' ||
    !resolvedForOptional
  ) {
    // Companies/LLP already require incorporation; sole traders may still attach optionally.
    if (!covered.has('cin_certificate') && !covered.has('incorporation_certificate')) {
      extras.push(ORG_KYC_OPTIONAL_DOCUMENTS[0]!);
    }
  }

  if (!covered.has('msme_certificate')) {
    extras.push({
      type: 'msme_certificate',
      label: 'MSME / Udyam',
      hint: 'Udyam registration certificate',
      mandatory: false,
    });
  }
  if (!covered.has('iec_certificate')) {
    extras.push({
      type: 'iec_certificate',
      label: 'IEC',
      hint: 'Import Export Code certificate',
      mandatory: false,
    });
  }

  return extras;
}

export function registrationTypeRequiresCin(
  registrationType: RegistrationType | null | undefined,
): boolean {
  return registrationType === 'pvt_ltd' || registrationType === 'public_ltd';
}

/** Core tax identifiers required before submit. GSTIN skipped when gst_not_applicable. */
export function kycTaxIdentifiersComplete(kyc: WorkspaceKyc | null): boolean {
  if (!kyc?.business_pan?.trim()) return false;
  if (kyc.gst_not_applicable) return true;
  return !!kyc.gstin?.trim();
}

/** Legal + document requirements for submit_business_verification. */
export function kycVerificationReady(
  kyc: WorkspaceKyc | null,
  documents: OrganizationKycDocument[] = [],
): boolean {
  return listKycVerificationGaps(kyc, documents).length === 0;
}

export function kycMandatoryDocumentsComplete(
  documents: OrganizationKycDocument[],
  kyc: WorkspaceKyc | null,
): boolean {
  return kycRequiredDocumentDefs(kyc).every((d) =>
    kycDocSlotSatisfied(d, documents, kyc),
  );
}

export type MissingKycRequirements = {
  fields: string[];
  docs: OrganizationKycDocType[];
};

/**
 * Structured missing fields/docs by registration structure (same matrix as submit RPC).
 */
export function listMissingKycRequirements(
  kyc: WorkspaceKyc | null,
  documents: OrganizationKycDocument[] = [],
): MissingKycRequirements {
  if (!kyc) {
    return { fields: ['organisation profile'], docs: [] };
  }

  const fields: string[] = [];
  const docs: OrganizationKycDocType[] = [];

  const resolvedType = effectiveKycRegistrationType(kyc);
  if (!resolvedType) fields.push('registration_type');
  if (!kyc.business_pan?.trim()) fields.push('business_pan');
  if (!kyc.gst_not_applicable && !kyc.gstin?.trim()) fields.push('gstin');
  if (registrationTypeRequiresCin(resolvedType) && !kyc.cin?.trim()) {
    fields.push('cin');
  }

  const hasAddress =
    !!(kyc.address_line?.trim() && kyc.city?.trim() && kyc.state?.trim()) ||
    !!kyc.address_pincode?.trim();
  if (!hasAddress) fields.push('operating_address');

  for (const d of kycRequiredDocumentDefs(kyc, undefined, documents)) {
    if (!kycDocSlotSatisfied(d, documents, kyc)) {
      docs.push(d.type);
    }
  }

  return { fields, docs };
}

/**
 * Human-readable checklist of what still blocks Submit for verification.
 * Empty when ready (or when profile is locked under review / verified).
 */
export function listKycVerificationGaps(
  kyc: WorkspaceKyc | null,
  documents: OrganizationKycDocument[] = [],
): string[] {
  if (!kyc) return ['Load organisation profile'];
  const status = kyc.verification_status ?? 'unverified';
  if (isVerificationFrozen(status)) return [];
  if (status !== 'unverified' && status !== 'rejected') return [];

  const gaps: string[] = [];
  const missing = listMissingKycRequirements(kyc, documents);

  for (const field of missing.fields) {
    switch (field) {
      case 'gstin':
        gaps.push('Add GSTIN — or skip if not registered for GST');
        break;
      case 'business_pan':
        gaps.push('Add Business PAN');
        break;
      case 'registration_type':
        gaps.push('Select registration type');
        break;
      case 'cin':
        gaps.push('Add CIN');
        break;
      case 'operating_address':
        gaps.push('Add operating address');
        break;
      default:
        gaps.push(`Add ${field}`);
    }
  }

  for (const docType of missing.docs) {
    const slot = kycRequiredDocumentDefs(kyc).find(
      (d) => d.type === docType || resolveAcceptTypes(d).includes(docType),
    );
    gaps.push(`Upload ${slot?.label ?? ORG_KYC_DOC_LABELS[docType] ?? docType}`);
  }

  return gaps;
}

export function kycDocumentsProgressPct(
  documents: OrganizationKycDocument[],
  kyc: WorkspaceKyc | null,
): number {
  const defs = kycRequiredDocumentDefs(kyc);
  const total = defs.length;
  if (total === 0) return 100;
  const done = defs.filter((d) => kycDocSlotSatisfied(d, documents, kyc)).length;
  return Math.round((done / total) * 100);
}

export function docStatusLabel(
  doc: OrganizationKycDocument | undefined,
  frozen: boolean,
): string {
  if (!doc?.storage_path) return 'Not uploaded';
  if (doc.status === 'verified') return 'Verified';
  if (doc.status === 'rejected') return 'Rejected';
  if (frozen) return 'Under review';
  return 'Uploaded';
}

/** Overall verification progress for inline UI (0–100). */
export function kycVerificationProgressPct(
  kyc: WorkspaceKyc | null,
  documents: OrganizationKycDocument[] = [],
): number {
  if (!kyc) return 0;
  const resolvedType = effectiveKycRegistrationType(kyc);
  const checks = [
    kyc.gst_not_applicable || !!kyc.gstin?.trim(),
    !!kyc.business_pan?.trim(),
    !registrationTypeRequiresCin(resolvedType) || !!kyc.cin?.trim(),
    !!resolvedType,
    !!(kyc.address_line?.trim() && kyc.city?.trim() && kyc.state?.trim()),
    !!kyc.address_pincode?.trim(),
    kycMandatoryDocumentsComplete(documents, kyc),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export const REGISTRATION_TYPE_OPTIONS = [
  { value: 'proprietorship' as const, label: 'Proprietorship' },
  { value: 'llp' as const, label: 'LLP' },
  { value: 'pvt_ltd' as const, label: 'Private Limited' },
  { value: 'public_ltd' as const, label: 'Public Limited' },
  { value: 'partnership' as const, label: 'Partnership' },
];

export const ADDRESS_PROOF_OPTIONS = [
  { value: 'lease' as const, label: 'Lease agreement' },
  { value: 'utility_bill' as const, label: 'Utility bill' },
  { value: 'other' as const, label: 'Govt. document' },
];

export function addressProofTypeLabel(value: string | null | undefined): string {
  return ADDRESS_PROOF_OPTIONS.find((o) => o.value === value)?.label ?? '';
}

export function registrationTypeLabel(value: string | null | undefined): string {
  return REGISTRATION_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? '';
}

/**
 * Short “for your structure these are required” copy for KYC UI banners / submit footer.
 */
export function kycStructureRequirementsHint(
  registrationType: RegistrationType | null | undefined,
  gstNotApplicable = false,
): string | null {
  const label = registrationTypeLabel(registrationType);
  if (!label || !registrationType) {
    return 'Select a registration type to see which documents are required for your structure.';
  }

  const base = 'PAN card, address proof, and GSTIN + GST certificate (or mark GST as not applicable)';

  switch (registrationType) {
    case 'proprietorship':
      return gstNotApplicable
        ? `For ${label}: ${base} — and because GST is skipped, also one activity proof (Udyam or IEC).`
        : `For ${label}: ${base}.`;
    case 'partnership':
      return `For ${label}: ${base}, plus partnership deed. CIN is not required.`;
    case 'pvt_ltd':
    case 'public_ltd':
      return `For ${label}: ${base}, plus CIN and incorporation / CIN certificate.`;
    case 'llp':
      return `For ${label}: ${base}, plus incorporation certificate and LLP agreement. CIN is optional.`;
    default:
      return `For ${label}: ${base}.`;
  }
}

/** Partner profile section progress (excludes document uploads). */
export function kycBusinessDetailsProgressPct(
  kyc: WorkspaceKyc | null,
  website?: string | null,
): number {
  const checks = [
    !!effectiveKycRegistrationType(kyc),
    !!(kyc?.address_line?.trim() && kyc?.city?.trim() && kyc?.state?.trim()),
    !!website?.trim(),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/** Whether a doc_type is mandatory for the current org matrix. */
export function isKycDocMandatoryForOrg(
  docType: OrganizationKycDocType,
  kyc: WorkspaceKyc | null,
): boolean {
  return kycRequiredDocumentDefs(kyc).some((d) =>
    resolveAcceptTypes(d).includes(docType),
  );
}
