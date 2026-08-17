import Theme from '@/constants/Theme';
import { Layout } from '@/constants/Layout';
import type {
  OrganizationKycDocDefinition,
  OrganizationKycDocument,
  OrganizationKycDocType,
} from '@/features/organization/types/organizationKycDocuments.types';
import { getVerificationDocumentSignedUrl } from '@/features/organization/services/businessVerification.service';
import {
  latestOrgKycDocumentMatching,
  resolveAcceptTypes,
} from '@/features/organization/utils/kycVerification.util';
import {
  GREEN,
  GREEN_TINT,
} from '@/features/organization/components/workspace/workspacePanelUi';
import type { WorkspaceKyc } from '@/types/organization';
import { Check, FileText } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  definition: OrganizationKycDocDefinition;
  documents: OrganizationKycDocument[];
  kyc: WorkspaceKyc | null;
  canEdit: boolean;
  uploading: boolean;
  onOpenUpdate: (definition: OrganizationKycDocDefinition) => void;
  onRemove?: (docType: OrganizationKycDocType) => void;
  onDismiss?: () => void;
};

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KycVerificationDocumentCard({
  definition,
  documents,
  kyc,
  canEdit,
  uploading,
  onOpenUpdate,
  onRemove,
  onDismiss,
}: Props) {
  const [previewBusy, setPreviewBusy] = useState(false);
  const acceptTypes = useMemo(() => resolveAcceptTypes(definition), [definition]);
  const doc = latestOrgKycDocumentMatching(documents, acceptTypes);
  const legacyPath =
    definition.type === 'address_proof' ? kyc?.address_proof_path?.trim() : null;
  const storagePath = doc?.storage_path?.trim() || legacyPath || null;
  const hasDoc = !!storagePath;
  const sizeLabel = formatFileSize(doc?.file_size_bytes);
  const fileName = doc?.file_name?.trim() || (hasDoc ? `${definition.label}.pdf` : '');
  const draft = (kyc?.verification_status ?? 'unverified') === 'unverified';

  const handlePreview = async () => {
    if (!storagePath || previewBusy) return;
    setPreviewBusy(true);
    try {
      const url = await getVerificationDocumentSignedUrl(storagePath);
      if (url) await Linking.openURL(url);
    } finally {
      setPreviewBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.icon, hasDoc && styles.iconDone]}>
          {hasDoc ? (
            <Check size={16} color={GREEN} strokeWidth={2.6} />
          ) : (
            <FileText size={16} color={Theme.textMuted} strokeWidth={2} />
          )}
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{definition.label}</Text>
          {definition.mandatory ? (
            <Text style={styles.required}>Required</Text>
          ) : (
            <Text style={styles.optional}>Optional</Text>
          )}
          <Text style={styles.hint}>{definition.hint}</Text>
        </View>
      </View>

      {hasDoc ? (
        <>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
          {sizeLabel ? <Text style={styles.meta}>{sizeLabel}</Text> : null}
          {draft ? <Text style={styles.ready}>Ready to submit</Text> : null}
          <View style={styles.actions}>
            <Pressable
              style={styles.textBtn}
              onPress={() => void handlePreview()}
              disabled={previewBusy}
              accessibilityRole="button"
              accessibilityLabel={`Preview ${definition.label}`}
            >
              <Text style={styles.textBtnLabel}>
                {previewBusy ? 'Opening…' : 'Preview'}
              </Text>
            </Pressable>
            {canEdit ? (
              <Pressable
                style={styles.textBtn}
                onPress={() => onOpenUpdate(definition)}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel={`Change ${definition.label}`}
              >
                <Text style={styles.textBtnLabel}>Change</Text>
              </Pressable>
            ) : null}
            {canEdit && onRemove && doc ? (
              <Pressable
                style={styles.textBtn}
                onPress={() => onRemove(doc.doc_type)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${definition.label}`}
              >
                <Text style={styles.removeLabel}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : (
        <View style={styles.emptyActions}>
          {canEdit ? (
            <Pressable
              style={styles.uploadBtn}
              onPress={() => onOpenUpdate(definition)}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel={`Upload ${definition.label}`}
            >
              <Text style={styles.uploadBtnText}>
                {uploading ? 'Uploading…' : 'Upload document →'}
              </Text>
            </Pressable>
          ) : null}
          {onDismiss ? (
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${definition.label}`}
            >
              <Text style={styles.removeLabel}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    gap: 8,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  iconDone: {
    backgroundColor: GREEN_TINT,
    borderColor: 'rgba(22,163,74,0.24)',
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  required: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Theme.primary,
  },
  optional: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Theme.textMuted,
  },
  hint: { fontSize: 12, color: Theme.textMuted, lineHeight: 16 },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    paddingLeft: 42,
  },
  meta: { fontSize: 11, color: Theme.textMuted, paddingLeft: 42 },
  ready: {
    fontSize: 11,
    fontWeight: '600',
    color: GREEN,
    paddingLeft: 42,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 4,
  },
  emptyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    minHeight: Layout.minTouchTargetSize,
  },
  uploadBtn: {
    minHeight: Layout.minTouchTargetSize,
    justifyContent: 'center',
  },
  uploadBtnText: { fontSize: 13, fontWeight: '700', color: Theme.primary },
  textBtn: {
    minHeight: Layout.minTouchTargetSize,
    justifyContent: 'center',
  },
  textBtnLabel: { fontSize: 13, fontWeight: '700', color: Theme.primary },
  removeLabel: { fontSize: 12, fontWeight: '600', color: Theme.destructive },
});
