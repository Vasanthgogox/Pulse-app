import Theme from '@/constants/Theme';
import type {
  OrganizationKycDocDefinition,
  OrganizationKycDocument,
  OrganizationKycDocType,
} from '@/features/organization/types/organizationKycDocuments.types';
import { ORG_KYC_DOC_LABELS } from '@/features/organization/types/organizationKycDocuments.types';
import {
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
import type { WorkspaceKyc } from '@/types/organization';
import {
  CheckCircle2,
  CircleDashed,
  Pencil,
  UploadCloud,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  definition: OrganizationKycDocDefinition;
  documents: OrganizationKycDocument[];
  kyc: WorkspaceKyc | null;
  canEdit: boolean;
  frozen: boolean;
  uploading: boolean;
  onOpenUpdate: (definition: OrganizationKycDocDefinition) => void;
  /** Optional docs only, and only when this isn't the org's last remaining document. */
  onRemove?: (docType: OrganizationKycDocType) => void;
  /** Hide an empty optional row that was added via a chip. */
  onDismiss?: () => void;
};

export function KycRequiredDocumentRow({
  definition,
  documents,
  kyc,
  canEdit,
  frozen,
  uploading,
  onOpenUpdate,
  onRemove,
  onDismiss,
}: Props) {
  const acceptTypes = useMemo(() => resolveAcceptTypes(definition), [definition]);
  const doc = latestOrgKycDocumentMatching(documents, acceptTypes);
  const legacyPath =
    definition.type === 'address_proof' ? kyc?.address_proof_path?.trim() : null;
  const storagePath = doc?.storage_path?.trim() || legacyPath || null;
  const hasDoc = !!storagePath;
  const pendingReview = doc?.status === 'pending' || (hasDoc && frozen && doc?.status !== 'verified');
  const statusColor =
    doc?.status === 'rejected'
      ? Theme.destructive
      : pendingReview
        ? AMBER
        : hasDoc
          ? GREEN
          : Theme.textMuted;
  const statusBg =
    doc?.status === 'rejected'
      ? Theme.surface
      : pendingReview
        ? Theme.surface
        : hasDoc
          ? GREEN_TINT
          : Theme.surfaceGray;

  const summary = hasDoc
    ? definition.type === 'address_proof'
      ? addressProofTypeLabel(kyc?.address_proof_type) || doc?.file_name || 'Document uploaded'
      : doc?.file_name ||
        (doc ? ORG_KYC_DOC_LABELS[doc.doc_type] : null) ||
        'Document uploaded'
    : docStatusLabel(doc, frozen, kyc?.verification_status);

  const actionLabel = hasDoc ? 'Update' : 'Upload';

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
            {definition.mandatory ? (
              <View style={styles.requiredPill}>
                <Text style={styles.requiredPillText}>Required</Text>
              </View>
            ) : (
              <View style={styles.optionalPill}>
                <Text style={styles.optionalPillText}>Optional</Text>
              </View>
            )}
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
            {pendingReview && hasDoc && (kyc?.verification_status ?? 'unverified') !== 'unverified'
              ? 'Pending review'
              : summary}
          </Text>
          {canEdit ? (
            <View style={styles.trailingActions}>
              <Pressable
                style={styles.editBtn}
                onPress={() => onOpenUpdate(definition)}
                disabled={uploading}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${actionLabel} ${definition.label}`}
              >
                {hasDoc ? (
                  <Pencil size={10} color={PURPLE} strokeWidth={2.2} />
                ) : (
                  <UploadCloud size={10} color={PURPLE} strokeWidth={2.2} />
                )}
                <Text style={styles.editBtnText}>{actionLabel}</Text>
              </Pressable>
              {hasDoc && doc && onRemove ? (
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => onRemove(doc.doc_type)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${definition.label}`}
                >
                  <Text style={styles.removeBtnText}>Remove</Text>
                </Pressable>
              ) : !hasDoc && onDismiss ? (
                <Pressable
                  style={styles.removeBtn}
                  onPress={onDismiss}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${definition.label}`}
                >
                  <Text style={styles.removeBtnText}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
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
  requiredPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  requiredPillText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: Theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
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
  trailingActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  removeBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  removeBtnText: { fontSize: 10, fontWeight: '600', color: Theme.destructive },
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
    minHeight: 28,
  },
  editBtnText: { fontSize: 10, fontWeight: '600', color: PURPLE },
});
