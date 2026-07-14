import { LoadingIndicator } from '@/components/LoadingIndicator';
import Theme from '@/constants/Theme';
import { getVerificationDocumentSignedUrl } from '@/features/organization/services/businessVerification.service';
import type {
  OrganizationKycDocDefinition,
  OrganizationKycDocument,
  OrganizationKycDocType,
} from '@/features/organization/types/organizationKycDocuments.types';
import { ORG_KYC_DOC_LABELS } from '@/features/organization/types/organizationKycDocuments.types';
import {
  ADDRESS_PROOF_OPTIONS,
  addressProofTypeLabel,
  docStatusLabel,
  latestOrgKycDocumentMatching,
  resolveAcceptTypes,
} from '@/features/organization/utils/kycVerification.util';
import {
  AMBER,
  GREEN,
  GREEN_TINT,
  PURPLE,
} from '@/features/organization/components/workspace/workspacePanelUi';
import type { AddressProofType, WorkspaceKyc } from '@/types/organization';
import {
  CheckCircle2,
  CircleDashed,
  FileText,
  Pencil,
  Trash2,
  UploadCloud,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  definition: OrganizationKycDocDefinition;
  documents: OrganizationKycDocument[];
  kyc: WorkspaceKyc | null;
  canEdit: boolean;
  frozen: boolean;
  uploading: boolean;
  onUpload: (docType: OrganizationKycDocType, proofType?: AddressProofType) => Promise<void>;
  onRemove: (docType: OrganizationKycDocType) => Promise<void>;
};

export function KycRequiredDocumentRow({
  definition,
  documents,
  kyc,
  canEdit,
  frozen,
  uploading,
  onUpload,
  onRemove,
}: Props) {
  const acceptTypes = useMemo(() => resolveAcceptTypes(definition), [definition]);
  const uploadChoices = definition.uploadChoices?.length
    ? definition.uploadChoices
    : acceptTypes.length > 1
      ? acceptTypes
      : [definition.type];

  const [expanded, setExpanded] = useState(false);
  const [proofType, setProofType] = useState<AddressProofType | null>(
    kyc?.address_proof_type ?? null,
  );
  const [uploadDocType, setUploadDocType] = useState<OrganizationKycDocType>(
    uploadChoices[0] ?? definition.type,
  );
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const doc = latestOrgKycDocumentMatching(documents, acceptTypes);
  const legacyPath =
    definition.type === 'address_proof' ? kyc?.address_proof_path?.trim() : null;
  const storagePath = doc?.storage_path?.trim() || legacyPath || null;
  const hasDoc = !!storagePath;
  const statusColor =
    doc?.status === 'rejected'
      ? Theme.destructive
      : hasDoc
        ? GREEN
        : Theme.textMuted;
  const statusBg = hasDoc ? GREEN_TINT : Theme.surfaceGray;

  useEffect(() => {
    setProofType(kyc?.address_proof_type ?? null);
  }, [kyc?.address_proof_type]);

  useEffect(() => {
    if (doc?.doc_type && uploadChoices.includes(doc.doc_type)) {
      setUploadDocType(doc.doc_type);
    }
  }, [doc?.doc_type, uploadChoices]);

  useEffect(() => {
    if (!storagePath) {
      setSignedUrl(null);
      return;
    }
    void getVerificationDocumentSignedUrl(storagePath).then(setSignedUrl);
  }, [storagePath]);

  const summary = hasDoc
    ? definition.type === 'address_proof'
      ? addressProofTypeLabel(kyc?.address_proof_type) || doc?.file_name || 'Document uploaded'
      : doc?.file_name ||
        (doc ? ORG_KYC_DOC_LABELS[doc.doc_type] : null) ||
        'Document uploaded'
    : docStatusLabel(doc, frozen);

  const needsProofType = definition.type === 'address_proof';
  const showUploadChoices = !needsProofType && uploadChoices.length > 1;
  const canUpload = !needsProofType || !!proofType;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: statusBg }]}>
          {hasDoc ? (
            <CheckCircle2 size={12} color={statusColor} strokeWidth={2.2} />
          ) : (
            <CircleDashed size={12} color={Theme.textMuted} strokeWidth={2} />
          )}
        </View>
        <View style={styles.main}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>{definition.label}</Text>
            {!definition.mandatory ? (
              <View style={styles.optionalPill}>
                <Text style={styles.optionalPillText}>Optional</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.hint}>{definition.hint}</Text>
        </View>
        <View style={styles.trailing}>
          <Text
            style={[
              styles.value,
              !hasDoc && styles.valueEmpty,
              hasDoc && { color: statusColor },
            ]}
            numberOfLines={1}
          >
            {summary}
          </Text>
          {canEdit && !frozen ? (
            <Pressable
              style={styles.editBtn}
              onPress={() => setExpanded((v) => !v)}
              hitSlop={6}
            >
              <Pencil size={10} color={PURPLE} strokeWidth={2.2} />
              <Text style={styles.editBtnText}>
                {expanded ? 'Close' : hasDoc ? 'View' : 'Upload'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {expanded && canEdit && !frozen ? (
        <View style={styles.editor}>
          {needsProofType ? (
            <>
              <Text style={styles.fieldLabel}>Document type</Text>
              <View style={styles.chipRow}>
                {ADDRESS_PROOF_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={[styles.chip, proofType === opt.value && styles.chipOn]}
                    onPress={() => setProofType(opt.value)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        proofType === opt.value && styles.chipTextOn,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {showUploadChoices ? (
            <>
              <Text style={styles.fieldLabel}>Upload as</Text>
              <View style={styles.chipRow}>
                {uploadChoices.map((choice) => (
                  <Pressable
                    key={choice}
                    style={[styles.chip, uploadDocType === choice && styles.chipOn]}
                    onPress={() => setUploadDocType(choice)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        uploadDocType === choice && styles.chipTextOn,
                      ]}
                    >
                      {ORG_KYC_DOC_LABELS[choice]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {hasDoc ? (
            <View style={styles.docPreview}>
              <FileText size={14} color={Theme.textSecondary} />
              <Text style={styles.docPreviewText} numberOfLines={1}>
                {doc?.file_name ?? 'Document on file'}
              </Text>
              {signedUrl ? (
                <Text style={styles.docPreviewLink} numberOfLines={1}>
                  Ready for review
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.uploadBtn, (!canUpload || uploading) && styles.btnDisabled]}
              disabled={!canUpload || uploading}
              onPress={() =>
                void onUpload(
                  needsProofType ? definition.type : uploadDocType,
                  needsProofType ? (proofType ?? undefined) : undefined,
                )
              }
            >
              {uploading ? (
                <LoadingIndicator size="small" color={Theme.primary} />
              ) : (
                <>
                  <UploadCloud size={12} color={Theme.primary} strokeWidth={2.2} />
                  <Text style={styles.uploadBtnText}>{hasDoc ? 'Replace' : 'Upload'}</Text>
                </>
              )}
            </Pressable>
            {hasDoc ? (
              <Pressable
                style={styles.removeBtn}
                onPress={() => void onRemove(doc?.doc_type ?? definition.type)}
              >
                <Trash2 size={11} color={Theme.destructive} strokeWidth={2.2} />
                <Text style={styles.removeBtnText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  main: { flex: 1, minWidth: 0, gap: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: Theme.textPrimaryDark },
  hint: { fontSize: 10, color: Theme.textMuted, lineHeight: 13 },
  optionalPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
  },
  optionalPillText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    maxWidth: '46%',
  },
  value: { fontSize: 11, fontWeight: '500', color: Theme.textPrimaryDark, textAlign: 'right' },
  valueEmpty: { color: Theme.textMuted, fontWeight: '400' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  editBtnText: { fontSize: 10, fontWeight: '600', color: PURPLE },
  editor: { marginLeft: 38, gap: 8 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
  },
  chipOn: { borderColor: Theme.primary, backgroundColor: 'rgba(59,130,246,0.06)' },
  chipText: { fontSize: 10, fontWeight: '500', color: Theme.textSecondary },
  chipTextOn: { color: Theme.primary, fontWeight: '600' },
  docPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  docPreviewText: { flex: 1, fontSize: 11, fontWeight: '600', color: Theme.textPrimaryDark },
  docPreviewLink: { fontSize: 10, color: AMBER, fontWeight: '500' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    minHeight: 30,
  },
  uploadBtnText: { fontSize: 11, fontWeight: '600', color: Theme.primary },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  removeBtnText: { fontSize: 11, fontWeight: '500', color: Theme.destructive },
  btnDisabled: { opacity: 0.45 },
});
