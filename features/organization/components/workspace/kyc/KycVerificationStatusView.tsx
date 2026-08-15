import Theme from '@/constants/Theme';
import type {
  OrganizationKycDocDefinition,
  OrganizationKycDocument,
} from '@/features/organization/types/organizationKycDocuments.types';
import {
  kycOptionalDocumentDefs,
  kycRequiredDocumentDefs,
  latestOrgKycDocumentMatching,
  resolveAcceptTypes,
} from '@/features/organization/utils/kycVerification.util';
import type { WorkspaceKyc } from '@/types/organization';
import { CheckCircle2, Clock, Pencil, XCircle } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  kyc: WorkspaceKyc | null;
  documents: OrganizationKycDocument[];
  onOpenUpdate: (definition: OrganizationKycDocDefinition) => void;
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function KycVerificationStatusView({ kyc, documents, onOpenUpdate }: Props) {
  const status = kyc?.verification_status ?? 'pending';

  const idRows: { label: string; value: string }[] = [];
  if (!kyc?.gst_not_applicable && kyc?.gstin) idRows.push({ label: 'GSTIN', value: kyc.gstin });
  if (kyc?.business_pan) idRows.push({ label: 'Business PAN', value: kyc.business_pan });
  if (kyc?.cin) idRows.push({ label: 'CIN', value: kyc.cin });

  const docDefs: OrganizationKycDocDefinition[] = [
    ...kycRequiredDocumentDefs(kyc),
    ...kycOptionalDocumentDefs(kyc),
  ];
  const uploadedDocDefs = docDefs.filter(
    (def) => !!latestOrgKycDocumentMatching(documents, resolveAcceptTypes(def))?.storage_path,
  );

  const heading =
    status === 'verified'
      ? {
          icon: <CheckCircle2 size={32} color={Theme.success} strokeWidth={2} />,
          accent: Theme.success,
          title: 'Business verified',
          sub: kyc?.verified_at ? `Approved ${formatDate(kyc.verified_at)}` : undefined,
        }
      : status === 'rejected'
        ? {
            icon: <XCircle size={32} color={Theme.destructive} strokeWidth={2} />,
            accent: Theme.destructive,
            title: 'Action required',
            sub: kyc?.kyc_rejected_reason ?? 'Update the relevant document and resubmit.',
          }
        : {
            icon: <Clock size={32} color={Theme.warning} strokeWidth={2} />,
            accent: Theme.warning,
            title: 'Application received',
            sub: `We're reviewing your business details.${
              kyc?.submitted_at ? ` Submitted ${formatDate(kyc.submitted_at)}.` : ''
            }`,
          };

  return (
    <View style={styles.root}>
      <View style={[styles.card, { borderColor: heading.accent + '33' }]}>
        {heading.icon}
        <Text style={styles.title}>{heading.title}</Text>
        {kyc?.name ? <Text style={styles.orgName}>{kyc.name}</Text> : null}
        {heading.sub ? <Text style={styles.sub}>{heading.sub}</Text> : null}
        {status === 'rejected' && kyc?.rejection_reasons?.checklist?.length ? (
          <View style={styles.rejectionList}>
            {kyc.rejection_reasons.checklist.map((item) => (
              <Text key={item} style={styles.rejectionItem}>
                • {item.replace(/_/g, ' ')}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {idRows.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {status === 'verified' ? 'Verified information' : 'Submitted information'}
          </Text>
          {idRows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <View style={styles.rowValueGroup}>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {row.value}
                </Text>
                <CheckCircle2 size={14} color={Theme.success} strokeWidth={2.4} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {uploadedDocDefs.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Verification documents</Text>
          {uploadedDocDefs.map((def) => (
            <View key={def.type} style={styles.row}>
              <Text style={styles.rowLabel}>{def.label}</Text>
              <View style={styles.rowValueGroup}>
                <CheckCircle2 size={14} color={Theme.success} strokeWidth={2.4} />
                <Pressable
                  style={styles.editIcon}
                  onPress={() => onOpenUpdate(def)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Update ${def.label}`}
                >
                  <Pencil size={12} color={Theme.primary} strokeWidth={2.2} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  card: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: Theme.cardWhite,
  },
  title: { fontSize: 17, fontWeight: '700', color: Theme.textPrimaryDark, marginTop: 8 },
  orgName: { fontSize: 13, fontWeight: '600', color: Theme.textSecondary, marginTop: 2 },
  sub: { fontSize: 12, color: Theme.textMuted, textAlign: 'center', marginTop: 4, lineHeight: 17 },
  rejectionList: { marginTop: 8, gap: 2, alignSelf: 'stretch' },
  rejectionItem: { fontSize: 11, color: Theme.destructive, lineHeight: 15, textAlign: 'center' },
  section: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: 'hidden',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Theme.textMuted,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  rowLabel: { fontSize: 13, fontWeight: '500', color: Theme.textPrimaryDark },
  rowValueGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  rowValue: { fontSize: 12, color: Theme.textMuted, flexShrink: 1 },
  editIcon: { padding: 2 },
});
