import Theme from '@/constants/Theme';
import type { OrganizationKycDocument } from '@/features/organization/types/organizationKycDocuments.types';
import type { OrganizationKycDocType } from '@/features/organization/types/organizationKycDocuments.types';
import type { AddressProofType, WorkspaceKyc } from '@/types/organization';
import {
  kycOptionalDocumentDefs,
  kycRequiredDocumentDefs,
  kycStructureRequirementsHint,
  registrationTypeLabel,
} from '@/features/organization/utils/kycVerification.util';
import { StyleSheet, Text, View } from 'react-native';

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
  const requiredDefs = kycRequiredDocumentDefs(kyc);
  const optionalDefs = kycOptionalDocumentDefs(kyc);
  const structureLabel = registrationTypeLabel(kyc?.registration_type);
  const structureHint = kycStructureRequirementsHint(
    kyc?.registration_type,
    !!kyc?.gst_not_applicable,
  );

  return (
    <>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>
          {structureLabel
            ? `Required for ${structureLabel}`
            : 'Required for your business structure'}
        </Text>
        {structureHint ? <Text style={styles.bannerBody}>{structureHint}</Text> : null}
      </View>

      {requiredDefs.map((def) => (
        <KycRequiredDocumentRow
          key={`req-${def.type}-${def.label}`}
          definition={def}
          documents={documents}
          kyc={kyc}
          canEdit={canEdit}
          frozen={frozen}
          uploading={
            !!uploadingDocType &&
            (uploadingDocType === def.type ||
              !!def.acceptTypes?.includes(uploadingDocType) ||
              !!def.uploadChoices?.includes(uploadingDocType))
          }
          onUpload={(uploadType, proofType) => onUpload(uploadType, proofType)}
          onRemove={(removeType) => onRemove(removeType)}
        />
      ))}

      {optionalDefs.length > 0 ? (
        <View style={styles.optionalHeader}>
          <Text style={styles.optionalHeaderText}>Optional for this structure</Text>
        </View>
      ) : null}

      {optionalDefs.map((def) => (
        <KycRequiredDocumentRow
          key={`opt-${def.type}`}
          definition={def}
          documents={documents}
          kyc={kyc}
          canEdit={canEdit}
          frozen={frozen}
          uploading={uploadingDocType === def.type}
          onUpload={(uploadType, proofType) => onUpload(uploadType, proofType)}
          onRemove={(removeType) => onRemove(removeType)}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 3,
    backgroundColor: Theme.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  bannerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  bannerBody: {
    fontSize: 10,
    color: Theme.textMuted,
    lineHeight: 14,
    fontWeight: '500',
  },
  optionalHeader: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  optionalHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
