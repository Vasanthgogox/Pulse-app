import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import { WORKSPACE_PANEL_TITLES } from "@/features/organization/components/workspace/workspacePanelTypes";
import {
  AMBER,
  GREEN,
  InfoRow,
  KycFieldRow,
  KycProgressBlock,
  modelLabel,
  kycCompletionPct,
  orgInitials,
  OrgIdCopyRow,
  SectionHeader,
  workspacePanelStyles as styles,
  type KycField,
} from "@/features/organization/components/workspace/workspacePanelUi";
import {
  getWorkspaceKyc,
  updateWorkspaceKyc,
} from "@/features/organization/services/organization.service";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import Theme from "@/constants/Theme";
import * as Clipboard from "expo-clipboard";
import { Lock } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import type { WorkspaceKyc } from "@/types/organization";

type Props = {
  onBack: () => void;
};

export function WorkspaceOrgKycPanel({ onBack }: Props) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { canEdit } = useOrgRole();

  const orgId = currentOrganization?.id ?? "";
  const orgName = currentOrganization?.name ?? "";

  const [copying, setCopying] = useState(false);
  const [kyc, setKyc] = useState<WorkspaceKyc | null>(null);
  const [kycSaving, setKycSaving] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    getWorkspaceKyc(orgId).then(({ kyc: data }) => {
      if (data) setKyc(data);
    });
  }, [orgId]);

  const handleCopyOrgId = async () => {
    if (!orgId || copying) return;
    setCopying(true);
    try {
      await Clipboard.setStringAsync(orgId);
      setTimeout(() => setCopying(false), 1400);
    } catch {
      setCopying(false);
    }
  };

  const handleSaveKycField = async (field: KycField, val: string) => {
    if (!orgId || kycSaving) return;
    setKycSaving(true);
    try {
      const patch: Partial<WorkspaceKyc> = { [field]: val || null };
      const { kyc: updated, error } = await updateWorkspaceKyc(orgId, patch);
      if (error) Alert.alert("Save failed", error.message);
      else if (updated) setKyc(updated);
    } finally {
      setKycSaving(false);
    }
  };

  const kycPct = kycCompletionPct(kyc);
  const progressColor =
    kycPct === 100 ? GREEN : kycPct > 50 ? AMBER : Theme.negative;

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES.kyc}
      subtitle={orgName || "Organisation"}
      onBack={onBack}
    >
      <View style={styles.card}>
        <SectionHeader
          label="Compliance & KYC"
          color={kycPct === 100 ? GREEN : AMBER}
        />
        <KycProgressBlock pct={kycPct} barColor={progressColor} />
        {!canEdit ? (
          <View style={styles.kycReadonlyNote}>
            <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
            <Text style={styles.kycReadonlyText}>
              Only admins and owners can edit KYC fields.
            </Text>
          </View>
        ) : null}
        <KycFieldRow
          field="gstin"
          value={kyc?.gstin}
          verificationStatus={kyc?.verification_status}
          canEdit={canEdit}
          onSave={handleSaveKycField}
        />
        <KycFieldRow
          field="business_pan"
          value={kyc?.business_pan}
          verificationStatus={kyc?.verification_status}
          canEdit={canEdit}
          onSave={handleSaveKycField}
        />
        <KycFieldRow
          field="cin"
          value={kyc?.cin}
          verificationStatus={kyc?.verification_status}
          canEdit={canEdit}
          onSave={handleSaveKycField}
        />
      </View>

      <View style={styles.card}>
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
        {user?.email ? <InfoRow label="Owner email" value={user.email} /> : null}
        <InfoRow
          label="Display name"
          value={orgName || orgInitials(orgName)}
        />
      </View>
    </WorkspaceDetailLayout>
  );
}
