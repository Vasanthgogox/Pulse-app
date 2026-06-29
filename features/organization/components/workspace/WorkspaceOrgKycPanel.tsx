/**
 * Org identity & KYC — detail pane aligned with WorkspaceHubMenu density.
 *
 * Typography, row height, and card chrome mirror the hub home section cards
 * (11px row labels, 9px section eyebrows, 34px icon tiles, 18px card gap).
 */
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import { useWorkspaceFeedback } from "@/features/organization/components/workspace/WorkspaceFeedbackProvider";
import { WORKSPACE_PANEL_TITLES } from "@/features/organization/components/workspace/workspacePanelTypes";
import {
  AMBER,
  GREEN,
  InfoRow,
  KycFieldsList,
  KycProgressBlock,
  ProfileFieldRow,
  modelLabel,
  kycCompletionPct,
  profileCompletionPct,
  orgInitials,
  OrgIdCopyRow,
  SectionHeader,
  workspacePanelStyles as styles,
  type KycField,
  type OrgProfileSnapshot,
} from "@/features/organization/components/workspace/workspacePanelUi";
import {
  getWorkspaceKyc,
  updateWorkspaceKyc,
  getOrgProfileFields,
  type OrgProfileFields,
} from "@/features/organization/services/organization.service";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import { ROUTES } from "@/lib/routes";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { CheckCircle, Clock, Lock, ShieldCheck, XCircle } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { WorkspaceKyc } from "@/types/organization";

type Props = {
  onBack: () => void;
};

export function WorkspaceOrgKycPanel({ onBack }: Props) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { canEdit } = useOrgRole();
  const { notice } = useWorkspaceFeedback();
  const router = useRouter();

  const orgId = currentOrganization?.id ?? "";
  const orgName = currentOrganization?.name ?? "";

  const [copying, setCopying] = useState(false);
  const [kyc, setKyc] = useState<WorkspaceKyc | null>(null);
  const [kycSaving, setKycSaving] = useState(false);
  const [orgProfile, setOrgProfile] = useState<OrgProfileFields | null>(null);

  useEffect(() => {
    if (!orgId) return;
    getWorkspaceKyc(orgId).then(({ kyc: data }) => {
      if (data) setKyc(data);
    });
    getOrgProfileFields(orgId).then(({ profile }) => {
      if (profile) setOrgProfile(profile);
    });
  }, [orgId]);

  const handleCopyOrgId = async () => {
    if (!orgId || copying) return;
    setCopying(true);
    try {
      await Clipboard.setStringAsync(orgId);
      notice({
        kind: "success",
        title: "Workspace ID copied",
        duration: 2000,
      });
      setTimeout(() => setCopying(false), 1400);
    } catch {
      setCopying(false);
      notice({
        kind: "error",
        title: "Couldn't copy",
        message: "Clipboard access was denied.",
      });
    }
  };

  const handleSaveKycField = async (field: KycField, val: string) => {
    if (!orgId || kycSaving) return;
    setKycSaving(true);
    try {
      const patch: Partial<WorkspaceKyc> = { [field]: val || null };
      const { kyc: updated, error } = await updateWorkspaceKyc(orgId, patch);
      if (error) {
        notice({ kind: "error", title: "Save failed", message: error.message });
        return;
      }
      if (updated) {
        setKyc(updated);
        notice({
          kind: "success",
          title: val ? "Field saved" : "Field cleared",
          duration: 2400,
        });
      }
    } finally {
      setKycSaving(false);
    }
  };

  const kycPct = kycCompletionPct(kyc);
  const progressColor =
    kycPct === 100 ? GREEN : kycPct > 50 ? AMBER : Theme.negative;
  const kycAccent = kycPct === 100 ? GREEN : AMBER;

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES.kyc}
      subtitle={orgName || "Organisation"}
      onBack={onBack}
    >
      <View style={styles.panelStack}>
        {/* Business verification CTA — Sprint 1 */}
        {canEdit ? (
          <VerificationCallToAction
            status={kyc?.verification_status ?? 'unverified'}
            onPress={() => router.push(ROUTES.BUSINESS_VERIFY)}
          />
        ) : null}

        <View style={styles.detailCard}>
          <SectionHeader label="Identity & Compliance" color={kycAccent} />
          <KycProgressBlock pct={kycPct} barColor={progressColor} />
          {!canEdit ? (
            <View style={styles.kycReadonlyNote}>
              <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
              <Text style={styles.kycReadonlyText}>
                Only admins and owners can edit KYC fields.
              </Text>
            </View>
          ) : null}
          <KycFieldsList kyc={kyc} canEdit={canEdit} onSave={handleSaveKycField} />
        </View>

        <View style={styles.detailCard}>
          {(() => {
            const snap: OrgProfileSnapshot = {
              address_line: orgProfile?.address_line,
              city: orgProfile?.city,
              state: orgProfile?.state,
              profile_website: orgProfile?.profile_website,
            };
            const pct = profileCompletionPct(snap);
            const barColor = pct === 100 ? GREEN : pct > 0 ? AMBER : '#ef4444';
            const accent = pct === 100 ? GREEN : AMBER;
            const addressValue = [orgProfile?.address_line, orgProfile?.city, orgProfile?.state]
              .filter(Boolean)
              .join(', ');
            return (
              <>
                <SectionHeader label="Partner Profile" color={accent} />
                <KycProgressBlock pct={pct} barColor={barColor} />
                <ProfileFieldRow
                  label="Address"
                  value={addressValue}
                  filled={!!addressValue}
                />
                <ProfileFieldRow
                  label="Website"
                  value={orgProfile?.profile_website ?? ''}
                  filled={!!orgProfile?.profile_website}
                />
              </>
            );
          })()}
        </View>

        <View style={styles.detailCard}>
          <SectionHeader label="Org Identity" />
          <OrgIdCopyRow
            orgId={orgId}
            copying={copying}
            onCopy={() => void handleCopyOrgId()}
          />
          <InfoRow
            label="Operating model"
            value={modelLabel(currentOrganization?.operatingModel)}
          />
          {user?.email ? (
            <InfoRow label="Owner email" value={user.email} />
          ) : null}
          <InfoRow
            label="Display name"
            value={orgName || orgInitials(orgName)}
          />
        </View>
      </View>
    </WorkspaceDetailLayout>
  );
}

// ─── Verification CTA card ────────────────────────────────────────────────────

type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

function VerificationCallToAction({
  status,
  onPress,
}: {
  status:  VerificationStatus;
  onPress: () => void;
}) {
  const config: Record<VerificationStatus, { label: string; sub: string; icon: React.ReactNode; accent: string; cta: string }> = {
    unverified: {
      label:  'Verify Your Business',
      sub:    'Unlock marketplace bidding and referral payouts.',
      icon:   <ShieldCheck size={20} color={Theme.primary} />,
      accent: Theme.primary,
      cta:    'Start Verification →',
    },
    pending: {
      label:  'Verification Pending',
      sub:    'Your profile is under review. Fields are locked.',
      icon:   <Clock size={20} color="#F59E0B" />,
      accent: '#F59E0B',
      cta:    'View Submission →',
    },
    verified: {
      label:  'Business Verified',
      sub:    'Your profile has been approved.',
      icon:   <CheckCircle size={20} color={Theme.success} />,
      accent: Theme.success,
      cta:    'View Details →',
    },
    rejected: {
      label:  'Action Required',
      sub:    'Verification was rejected. Please correct and resubmit.',
      icon:   <XCircle size={20} color={Theme.destructive} />,
      accent: Theme.destructive,
      cta:    'Resubmit →',
    },
  };

  const c = config[status];

  return (
    <Pressable style={[verifyStyles.card, { borderLeftColor: c.accent }]} onPress={onPress}>
      <View style={verifyStyles.iconSlot}>{c.icon}</View>
      <View style={verifyStyles.textBlock}>
        <Text style={verifyStyles.label}>{c.label}</Text>
        <Text style={verifyStyles.sub}>{c.sub}</Text>
      </View>
      <Text style={[verifyStyles.cta, { color: c.accent }]}>{c.cta}</Text>
    </Pressable>
  );
}

const verifyStyles = StyleSheet.create({
  card: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    padding:         14,
    marginBottom:    12,
    backgroundColor: Theme.surface,
    borderRadius:    10,
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     Theme.surfaceBorder,
    borderLeftWidth: 3,
  },
  iconSlot:  { width: 32, alignItems: 'center' },
  textBlock: { flex: 1 },
  label:     { fontSize: 13, fontWeight: '600', color: Theme.primaryText, marginBottom: 2 },
  sub:       { fontSize: 12, color: Theme.textSecondary, lineHeight: 16 },
  cta:       { fontSize: 12, fontWeight: '600' },
});
