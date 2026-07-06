import type { OrganizationKycDocument } from '@/features/organization/types/organizationKycDocuments.types';
import {
  ORG_KYC_REQUIRED_DOCUMENTS,
} from '@/features/organization/types/organizationKycDocuments.types';
import { latestOrgKycDocument } from '@/features/organization/services/organizationKycDocuments.service';
import type { WorkspaceKyc } from '@/types/organization';

/** Core tax identifiers required before submit. */
export function kycTaxIdentifiersComplete(kyc: WorkspaceKyc | null): boolean {
  return !!(kyc?.gstin?.trim() && kyc?.business_pan?.trim());
}

/** Legal + document requirements for submit_business_verification. */
export function kycVerificationReady(
  kyc: WorkspaceKyc | null,
  documents: OrganizationKycDocument[] = [],
): boolean {
  if (!kyc || !kycTaxIdentifiersComplete(kyc)) return false;
  if (!kycMandatoryDocumentsComplete(documents, kyc)) return false;
  const hasAddress =
    !!(kyc.address_line?.trim() && kyc.city?.trim() && kyc.state?.trim()) ||
    !!kyc.address_pincode?.trim();
  return !!kyc.registration_type && hasAddress;
}

export function kycMandatoryDocumentsComplete(
  documents: OrganizationKycDocument[],
  kyc: WorkspaceKyc | null,
): boolean {
  for (const def of ORG_KYC_REQUIRED_DOCUMENTS) {
    const doc = latestOrgKycDocument(documents, def.type);
    if (doc?.storage_path) continue;
    if (def.type === 'address_proof' && kyc?.address_proof_path?.trim()) continue;
    return false;
  }
  return true;
}

export function kycDocumentsProgressPct(
  documents: OrganizationKycDocument[],
  kyc: WorkspaceKyc | null,
): number {
  const total = ORG_KYC_REQUIRED_DOCUMENTS.length;
  const done = ORG_KYC_REQUIRED_DOCUMENTS.filter((def) => {
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
    !!kyc.gstin?.trim(),
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
