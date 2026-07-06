import { ORG_KYC_REQUIRED_DOCUMENTS } from '@/features/organization/types/organizationKycDocuments.types';
import type { OrganizationKycDocument } from '@/features/organization/types/organizationKycDocuments.types';
import type { OrganizationKycDocType } from '@/features/organization/types/organizationKycDocuments.types';
import type { AddressProofType, WorkspaceKyc } from '@/types/organization';

import { KycRequiredDocumentRow } from './KycRequiredDocumentRow';

type Props = {
  kyc: WorkspaceKyc | null;
  documents: OrganizationKycDocument[];
  canEdit: boolean;
  frozen: boolean;
  uploadingDocType: OrganizationKycDocType | null;
  onUpload: (docType: OrganizationKycDocType, proofType?: AddressProofType) => Promise<void>;
  onRemove: (docType: OrganizationKycDocType) => Promise<void>;
};

export function KycRequiredDocumentsSection({
  kyc,
  documents,
  canEdit,
  frozen,
  uploadingDocType,
  onUpload,
  onRemove,
}: Props) {
  return (
    <>
      {ORG_KYC_REQUIRED_DOCUMENTS.map((def) => (
        <KycRequiredDocumentRow
          key={def.type}
          definition={def}
          documents={documents}
          kyc={kyc}
          canEdit={canEdit}
          frozen={frozen}
          uploading={uploadingDocType === def.type}
          onUpload={(proofType) => onUpload(def.type, proofType)}
          onRemove={() => onRemove(def.type)}
        />
      ))}
    </>
  );
}
