import Theme from '@/constants/Theme';
import { Layout } from '@/constants/Layout';
import type { OrgHubSection } from '@/features/organization/components/workspace/workspacePanelTypes';
import {
  GREEN,
  SectionHeader,
  modelLabel,
  orgInitials,
  workspacePanelStyles as panelStyles,
} from '@/features/organization/components/workspace/workspacePanelUi';
import {
  formatKycHubRemainingCopy,
  kycRequiredDocumentCounts,
  kycTaxIdentityCounts,
  registrationTypeLabel,
  effectiveKycRegistrationType,
} from '@/features/organization/utils/kycVerification.util';
import type { OrganizationKycDocument } from '@/features/organization/types/organizationKycDocuments.types';
import type { CurrentOrganization, WorkspaceKyc } from '@/types/organization';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatOrgHubDate,
  maskGstin,
  orgHubStatusCopy,
} from './organizationHub.util';

type Trailing = 'chevron' | 'check' | 'clock' | 'alert';

type Props = {
  orgName: string;
  organization: CurrentOrganization | null;
  kyc: WorkspaceKyc | null;
  documents: OrganizationKycDocument[];
  canEdit: boolean;
  showMembers: boolean;
  showPreferences: boolean;
  onOpenSection: (section: OrgHubSection) => void;
  onStartVerify: () => void;
  onOpenMembers: () => void;
  onOpenPreferences: () => void;
};

function HubRow({
  label,
  trailing,
  onPress,
}: {
  label: string;
  trailing: Trailing;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      {trailing === 'check' ? (
        <Check size={16} color={GREEN} strokeWidth={2.6} />
      ) : trailing === 'clock' ? (
        <Clock size={15} color={Theme.warning} strokeWidth={2.2} />
      ) : trailing === 'alert' ? (
        <AlertCircle size={15} color={Theme.destructive} strokeWidth={2.2} />
      ) : (
        <ChevronRight size={16} color={Theme.textMuted} strokeWidth={2} />
      )}
    </Pressable>
  );
}

export function OrganizationHomePanel({
  orgName,
  organization,
  kyc,
  documents,
  canEdit,
  showMembers,
  showPreferences,
  onOpenSection,
  onStartVerify,
  onOpenMembers,
  onOpenPreferences,
}: Props) {
  const status = kyc?.verification_status ?? 'unverified';
  const copy = orgHubStatusCopy(status);
  const typeLabel = registrationTypeLabel(effectiveKycRegistrationType(kyc));
  const gstinLine = maskGstin(kyc?.gstin);
  const verifiedOn = formatOrgHubDate(kyc?.verified_at);
  const submittedOn = formatOrgHubDate(kyc?.submitted_at);
  const docs = kycRequiredDocumentCounts(documents, kyc);
  const tax = kycTaxIdentityCounts(kyc);

  const verificationTrailing: Trailing =
    status === 'verified'
      ? 'check'
      : status === 'pending'
        ? 'clock'
        : status === 'rejected'
          ? 'alert'
          : 'chevron';

  const documentsTrailing: Trailing =
    status === 'verified' || (status === 'pending' && docs.remaining === 0)
      ? 'check'
      : status === 'rejected'
        ? 'alert'
        : 'chevron';

  return (
    <View style={panelStyles.panelStack}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{orgInitials(orgName)}</Text>
        </View>
        <Text style={styles.orgName}>{orgName || 'Organisation'}</Text>
        <View style={styles.statusRow}>
          {status === 'verified' ? (
            <ShieldCheck size={14} color={GREEN} strokeWidth={2.4} />
          ) : status === 'pending' ? (
            <Clock size={14} color={Theme.warning} strokeWidth={2.2} />
          ) : status === 'rejected' ? (
            <AlertCircle size={14} color={Theme.destructive} strokeWidth={2.2} />
          ) : (
            <View style={styles.hollowDot} />
          )}
          <Text
            style={[
              styles.statusKicker,
              status === 'verified' && { color: GREEN },
              status === 'pending' && { color: Theme.warning },
              status === 'rejected' && { color: Theme.destructive },
            ]}
          >
            {copy.kicker}
          </Text>
        </View>
        {status === 'verified' ? (
          <>
            {gstinLine ? <Text style={styles.meta}>{gstinLine}</Text> : null}
            {typeLabel ? <Text style={styles.meta}>{typeLabel}</Text> : null}
            <Text style={styles.body}>
              {verifiedOn ? `Verified ${verifiedOn}.` : copy.kicker}
            </Text>
            <Pressable
              onPress={() => onOpenSection('verification')}
              style={({ pressed }) => [styles.linkCta, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel="View verification"
            >
              <Text style={styles.linkCtaText}>View verification</Text>
            </Pressable>
          </>
        ) : null}
        {status === 'unverified' ? (
          <>
            <Text style={styles.body}>{copy.body}</Text>
            {canEdit ? (
              <Pressable
                onPress={onStartVerify}
                style={({ pressed }) => [styles.cta, pressed && { opacity: 0.88 }]}
                accessibilityRole="button"
                accessibilityLabel="Continue verification"
              >
                <Text style={styles.ctaText}>Continue verification</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
        {status === 'pending' ? (
          <>
            <Text style={styles.body}>
              {submittedOn
                ? `Submitted ${submittedOn}.`
                : "We're reviewing your business information and documents."}
            </Text>
            <Pressable
              onPress={() => onOpenSection('verification')}
              style={({ pressed }) => [styles.linkCta, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel="View submission"
            >
              <Text style={styles.linkCtaText}>View submission</Text>
            </Pressable>
          </>
        ) : null}
        {status === 'rejected' ? (
          <>
            <Text style={styles.body}>{copy.body}</Text>
            {canEdit ? (
              <Pressable
                onPress={onStartVerify}
                style={({ pressed }) => [styles.cta, pressed && { opacity: 0.88 }]}
                accessibilityRole="button"
                accessibilityLabel="Fix verification"
              >
                <Text style={styles.ctaText}>Fix verification</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={panelStyles.detailCard}>
        <SectionHeader label="Business" />
        <HubRow
          label="Business details"
          trailing="chevron"
          onPress={() => onOpenSection('details')}
        />
        <HubRow
          label="Verification"
          trailing={verificationTrailing}
          onPress={() => onOpenSection('verification')}
        />
        <HubRow
          label="Documents"
          trailing={documentsTrailing}
          onPress={() => onOpenSection('documents')}
        />
        {status === 'unverified' ? (
          <Text style={styles.hint}>
            {formatKycHubRemainingCopy(tax.remaining, docs.remaining)}
          </Text>
        ) : null}
      </View>

      {showMembers || showPreferences ? (
        <View style={panelStyles.detailCard}>
          <SectionHeader label="Workspace" />
          {showMembers ? (
            <Pressable
              onPress={onOpenMembers}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Users size={14} color={Theme.textMuted} strokeWidth={2} />
              <Text style={[styles.rowLabel, styles.rowLabelFlex]}>Members & access</Text>
              <ChevronRight size={16} color={Theme.textMuted} strokeWidth={2} />
            </Pressable>
          ) : null}
          {showPreferences ? (
            <Pressable
              onPress={onOpenPreferences}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Settings2 size={14} color={Theme.textMuted} strokeWidth={2} />
              <Text style={[styles.rowLabel, styles.rowLabelFlex]}>
                Business preferences
              </Text>
              <ChevronRight size={16} color={Theme.textMuted} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {organization?.operatingModel ? (
        <Text style={styles.footerMeta}>
          {`${modelLabel(organization.operatingModel)} · ${orgName || 'Organisation'}`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.brandBlueInk,
    letterSpacing: -0.3,
  },
  orgName: {
    fontSize: 22,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  hollowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Theme.textMuted,
  },
  statusKicker: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
  meta: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textSecondary,
    marginTop: 2,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textMuted,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 280,
  },
  cta: {
    marginTop: 14,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: Theme.buttonDark,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.buttonDarkText,
  },
  linkCta: {
    marginTop: 10,
    minHeight: Layout.minTouchTargetSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkCtaText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: Layout.minTouchTargetSize,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  rowPressed: { backgroundColor: Theme.surfaceGray },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  rowLabelFlex: { flex: 1, minWidth: 0 },
  hint: {
    fontSize: 11,
    color: Theme.textMuted,
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 4,
  },
  footerMeta: {
    fontSize: 11,
    color: Theme.textMuted,
    textAlign: 'center',
    paddingTop: 4,
  },
});
