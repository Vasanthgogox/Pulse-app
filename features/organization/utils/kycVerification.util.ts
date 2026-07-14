import type { OrganizationKycDocument } from '@/features/organization/types/organizationKycDocuments.types';
import {
  ORG_KYC_REQUIRED_DOCUMENTS,
} from '@/features/organization/types/organizationKycDocuments.types';
import { latestOrgKycDocument } from '@/features/organization/services/organizationKycDocuments.service';
import type { WorkspaceKyc } from '@/types/organization';
import { isVerificationFrozen } from '@/types/organization';

/** Core tax identifiers required before submit. GSTIN skipped when gst_not_applicable. */
export function kycTaxIdentifiersComplete(kyc: WorkspaceKyc | null): boolean {
  if (!kyc?.business_pan?.trim()) return false;
  if (kyc.gst_not_applicable) return true;
  return !!kyc.gstin?.trim();
}

export function kycRequiredDocumentDefs(kyc: WorkspaceKyc | null) {
  if (kyc?.gst_not_applicable) {
    return ORG_KYC_REQUIRED_DOCUMENTS.filter((d) => d.type !== 'gst_certificate');
  }
  return ORG_KYC_REQUIRED_DOCUMENTS;
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
  for (const def of kycRequiredDocumentDefs(kyc)) {
    const doc = latestOrgKycDocument(documents, def.type);
    if (doc?.storage_path) continue;
    if (def.type === 'address_proof' && kyc?.address_proof_path?.trim()) continue;
    return false;
  }
  return true;
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

  if (!kyc.gst_not_applicable && !kyc.gstin?.trim()) {
    gaps.push('Add GSTIN — or skip if not registered for GST');
  }
  if (!kyc.business_pan?.trim()) {
    gaps.push('Add Business PAN');
  }

  for (const def of kycRequiredDocumentDefs(kyc)) {
    const doc = latestOrgKycDocument(documents, def.type);
    if (doc?.storage_path) continue;
    if (def.type === 'address_proof' && kyc.address_proof_path?.trim()) continue;
    gaps.push(`Upload ${def.label}`);
  }

  if (!kyc.registration_type) {
    gaps.push('Select registration type');
  }

  const hasAddress =
    !!(kyc.address_line?.trim() && kyc.city?.trim() && kyc.state?.trim()) ||
    !!kyc.address_pincode?.trim();
  if (!hasAddress) {
    gaps.push('Add operating address');
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
  const done = defs.filter((def) => {
    const doc = latestOrgKycDocument(documents, def.type);
    if (doc?.storage_path) return true;
    if (def.type === 'address_proof' && kyc?.address_proof_path?.trim()) return true;
    return false;
  }).length;
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
  const checks = [
    kyc.gst_not_applicable || !!kyc.gstin?.trim(),
    !!kyc.business_pan?.trim(),
    !!kyc.cin?.trim(),
    !!kyc.registration_type,
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

/** Partner profile section progress (excludes document uploads). */
export function kycBusinessDetailsProgressPct(
  kyc: WorkspaceKyc | null,
  website?: string | null,
): number {
  const checks = [
    !!kyc?.registration_type,
    !!(kyc?.address_line?.trim() && kyc?.city?.trim() && kyc?.state?.trim()),
    !!website?.trim(),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
