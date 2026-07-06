import Theme from '@/constants/Theme';
import type { OrganizationKycDocument } from '@/features/organization/types/organizationKycDocuments.types';
import { kycVerificationProgressPct } from '@/features/organization/utils/kycVerification.util';
import type { KycVerificationStatus, WorkspaceKyc } from '@/types/organization';

import {
  CheckCircle,
  Clock,
  Lock,
  ShieldCheck,
  XCircle,
} from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  kyc: WorkspaceKyc | null;
  documents?: OrganizationKycDocument[];
};

export function InlineVerificationStatusBanner({ kyc, documents = [] }: Props) {
  const status: KycVerificationStatus = kyc?.verification_status ?? 'unverified';
  const pct = kycVerificationProgressPct(kyc, documents);

  const config = {
    unverified: {
      icon: <ShieldCheck size={16} color={Theme.primary} />,
      accent: Theme.primary,
      label: 'Business verification',
      sub: `${pct}% complete — add tax IDs, required documents, and business details below.`,
    },
    pending: {
      icon: <Clock size={16} color="#D97706" />,
      accent: '#D97706',
      label: 'Under review',
      sub: 'Submitted for verification. Fields are locked until review completes.',
    },
    verified: {
      icon: <CheckCircle size={16} color={Theme.success} />,
      accent: Theme.success,
      label: 'Verified business',
      sub: kyc?.verified_at
        ? `Approved ${new Date(kyc.verified_at).toLocaleDateString('en-IN')}.`
        : 'Your business profile is verified.',
    },
    rejected: {
      icon: <XCircle size={16} color={Theme.destructive} />,
      accent: Theme.destructive,
      label: 'Action required',
      sub: kyc?.kyc_rejected_reason ?? 'Verification was rejected. Update documents and resubmit.',
    },
  }[status];

  return (
    <View style={[styles.card, { borderLeftColor: config.accent }]}>
      <View style={styles.icon}>{config.icon}</View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.label}>{config.label}</Text>
          {status === 'pending' || status === 'verified' ? (
            <View style={styles.lockPill}>
              <Lock size={9} color={Theme.textMuted} strokeWidth={2} />
              <Text style={styles.lockText}>Locked</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sub}>{config.sub}</Text>
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
      {status === 'unverified' || status === 'rejected' ? (
        <Text style={[styles.pct, { color: config.accent }]}>{pct}%</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    borderLeftWidth: 2,
  },
  icon: { width: 28, alignItems: 'center', paddingTop: 1, flexShrink: 0 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 12, fontWeight: '600', color: Theme.textPrimaryDark },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  lockText: { fontSize: 9, fontWeight: '600', color: Theme.textMuted },
  sub: { fontSize: 10, color: Theme.textMuted, lineHeight: 14 },
  rejectionList: { marginTop: 4, gap: 2 },
  rejectionItem: { fontSize: 10, color: Theme.destructive, lineHeight: 14 },
  pct: { fontSize: 11, fontWeight: '700', flexShrink: 0, paddingTop: 1 },
});
