/**
 * Workspace Settings — hub-aligned detail pane (matches WorkspaceHubMenu density).
 *
 *   Card 1: Workspace logo + Upload New / Remove
 *   KYC insight banner (when incomplete)
 *   Card 2: General Details (workspace name, operating model)
 *   Card 3: Invoice Branding preview
 *   Sticky footer: Cancel + Save Changes
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  getWorkspaceKyc,
  updateOrganizationLogo,
  updateOrganizationName,
} from "@/features/organization/services/organization.service";
import { syncBrandingFromOrg } from "@/features/invoicing/services/invoiceBranding.service";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import { useWorkspaceFeedback } from "@/features/organization/components/workspace/WorkspaceFeedbackProvider";
import { WORKSPACE_PANEL_TITLES } from "@/features/organization/components/workspace/workspacePanelTypes";
import {
  AMBER,
  modelLabel,
  orgInitials,
  PURPLE,
  PURPLE_BORDER,
  PURPLE_TINT,
  SectionHeader,
  workspacePanelStyles as styles,
} from "@/features/organization/components/workspace/workspacePanelUi";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import {
  getSignedAvatarUrl,
  pickAndUploadOrgLogo,
} from "@/lib/avatarUpload";
import {
  AlertTriangle,
  Camera,
  Lock,
  Trash2,
  UploadCloud,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { WorkspaceKyc } from "@/types/organization";

type Props = {
  onBack: () => void;
};

export function WorkspaceSettingsPanel({ onBack }: Props) {
  const { currentOrganization, refreshOrganization } = useOrganization();
  const { canEdit } = useOrgRole();
  const { notice, confirm } = useWorkspaceFeedback();

  const orgId = currentOrganization?.id ?? "";
  const storedName = currentOrganization?.name ?? "";

  const [orgName, setOrgName] = useState(storedName);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [kyc, setKyc] = useState<WorkspaceKyc | null>(null);
  const nameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (storedName) setOrgName(storedName);
  }, [storedName]);

  useEffect(() => {
    if (!orgId) return;
    getWorkspaceKyc(orgId).then(({ kyc: data }) => {
      if (data) setKyc(data);
    });
  }, [orgId]);

  useEffect(() => {
    let mounted = true;
    const raw = currentOrganization?.logo_url?.trim();
    if (!raw) {
      setLogoUri(null);
      return;
    }
    if (raw.startsWith("http")) {
      setLogoUri(raw);
      return;
    }
    getSignedAvatarUrl(raw).then((signed) => {
      if (mounted) setLogoUri(signed ?? null);
    });
    return () => {
      mounted = false;
    };
  }, [currentOrganization?.logo_url]);

  const handleUploadLogo = async () => {
    if (!orgId || logoUploading || !canEdit) return;
    setLogoUploading(true);
    try {
      const result = await pickAndUploadOrgLogo(orgId);
      if (result.error) {
        notice({
          kind: "error",
          title: "Upload failed",
          message: result.error.message,
        });
        return;
      }
      if (!result.path) return;
      const { error } = await updateOrganizationLogo(orgId, result.path);
      if (error) {
        notice({ kind: "error", title: "Save failed", message: error.message });
        return;
      }
      if (result.previewUri) setLogoUri(result.previewUri);
      await refreshOrganization();
      await syncBrandingFromOrg(orgId, orgName, result.path);
      notice({ kind: "success", title: "Workspace logo updated" });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!orgId || logoUploading || !canEdit) return;
    const ok = await confirm({
      title: "Remove logo?",
      message:
        "Your workspace will fall back to its initials until you upload a new logo.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setLogoUploading(true);
    try {
      const { error } = await updateOrganizationLogo(orgId, null);
      if (error) {
        notice({
          kind: "error",
          title: "Remove failed",
          message: error.message,
        });
        return;
      }
      setLogoUri(null);
      await refreshOrganization();
      await syncBrandingFromOrg(orgId, orgName, null);
      notice({ kind: "success", title: "Logo removed" });
    } finally {
      setLogoUploading(false);
    }
  };

  const isDirty = orgName.trim() !== storedName.trim() && orgName.trim().length > 0;

  const handleSaveName = async () => {
    if (!orgId || nameSaving || !isDirty) return;
    const trimmed = orgName.trim();
    if (!trimmed) {
      notice({
        kind: "error",
        title: "Invalid name",
        message: "Organisation name cannot be empty.",
      });
      return;
    }
    setNameSaving(true);
    try {
      const { error } = await updateOrganizationName(orgId, trimmed);
      if (error) {
        notice({ kind: "error", title: "Save failed", message: error.message });
        return;
      }
      await refreshOrganization();
      await syncBrandingFromOrg(
        orgId,
        trimmed,
        currentOrganization?.logo_url ?? null,
      );
      notice({ kind: "success", title: "Workspace settings saved" });
    } finally {
      setNameSaving(false);
    }
  };

  const previewName = orgName.trim() || storedName || "YOUR ORG";
  const kycMissing = kyc
    ? (["gstin", "business_pan", "cin"] as const).filter((f) => !kyc[f]).length
    : 3;

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES.settings}
      subtitle="Manage organisational details"
      onBack={onBack}
      footerSlot={
        canEdit ? (
          <View style={local.footerActions}>
            <Pressable
              onPress={() => {
                setOrgName(storedName);
                onBack();
              }}
              style={({ pressed }) => [
                local.cancelBtn,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Discard changes"
            >
              <Text style={local.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSaveName()}
              disabled={!isDirty || nameSaving}
              style={({ pressed }) => [
                local.saveBtn,
                (!isDirty || nameSaving) && local.saveBtnDisabled,
                pressed && isDirty && !nameSaving && { opacity: 0.9 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save workspace settings"
            >
              {nameSaving ? (
                <LoadingIndicator size="small" color="#fff" />
              ) : (
                <Text style={local.saveText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
        ) : undefined
      }
    >
      <View style={styles.panelStack}>
        <View style={[styles.detailCard, local.logoCard]}>
          <View style={local.logoRow}>
            <View style={local.uploadThumbWrap}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={local.uploadThumb} />
              ) : (
                <View style={local.uploadThumbFallback}>
                  <Text style={local.uploadThumbInitials}>
                    {orgInitials(previewName)}
                  </Text>
                </View>
              )}
              <View style={local.uploadThumbBadge}>
                <Camera size={10} color={Theme.textOnDark} strokeWidth={2.4} />
              </View>
            </View>
            <View style={local.uploadInfo}>
              <Text style={local.uploadTitle}>Workspace Logo</Text>
              <Text style={local.uploadSub}>
                PNG or JPG up to 5 MB. Recommended size 256 × 256 px.
              </Text>
              {canEdit ? (
                <View style={local.uploadActions}>
                  <Pressable
                    onPress={() => void handleUploadLogo()}
                    disabled={logoUploading}
                    style={({ pressed }) => [
                      local.uploadBtn,
                      logoUploading && { opacity: 0.6 },
                      pressed && !logoUploading && { opacity: 0.9 },
                    ]}
                  >
                    {logoUploading ? (
                      <LoadingIndicator size="small" color={PURPLE} />
                    ) : (
                      <>
                        <UploadCloud size={11} color={PURPLE} strokeWidth={2.2} />
                        <Text style={local.uploadBtnText}>Upload New</Text>
                      </>
                    )}
                  </Pressable>
                  {logoUri ? (
                    <Pressable
                      onPress={() => void handleRemoveLogo()}
                      disabled={logoUploading}
                      style={({ pressed }) => [
                        local.removeBtn,
                        logoUploading && { opacity: 0.5 },
                        pressed && !logoUploading && { opacity: 0.85 },
                      ]}
                    >
                      <Trash2 size={11} color={Theme.textMuted} strokeWidth={2.2} />
                      <Text style={local.removeBtnText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={[styles.kycReadonlyNote, local.readonlyNote]}>
                  <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
                  <Text style={styles.kycReadonlyText}>
                    Only admins and owners can change the workspace logo.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {canEdit && kycMissing > 0 ? (
          <View style={styles.kycBanner}>
            <AlertTriangle size={13} color={AMBER} strokeWidth={2.2} />
            <View style={local.bannerText}>
              <Text style={styles.kycBannerTitle}>
                {kycMissing === 3
                  ? "KYC not started"
                  : `${kycMissing} compliance field${kycMissing > 1 ? "s" : ""} missing`}
              </Text>
              <Text style={styles.kycBannerSub}>
                Complete org identity &amp; KYC to unlock billing
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.detailCard}>
          <SectionHeader label="General Details" />

          <View style={[styles.panelFieldGroup, styles.panelFieldGroupFirst]}>
            <Text style={styles.panelFieldLabel}>Workspace Name</Text>
            <TextInput
              ref={nameInputRef}
              style={[
                styles.panelFieldInput,
                !canEdit && styles.panelFieldInputReadonly,
              ]}
              value={orgName}
              onChangeText={canEdit ? setOrgName : undefined}
              placeholder="e.g. GoGoX Logistics"
              placeholderTextColor={Theme.textMuted}
              maxLength={64}
              editable={canEdit}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (isDirty) void handleSaveName();
              }}
            />
          </View>

          <View style={styles.panelFieldGroup}>
            <Text style={styles.panelFieldLabel}>Operating Model</Text>
            <View style={[styles.panelFieldInput, styles.panelFieldInputReadonly]}>
              <Text style={styles.panelFieldStatic}>
                {modelLabel(currentOrganization?.operatingModel)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.detailCard}>
          <SectionHeader label="Invoice Branding" />
          <View style={styles.previewPaper}>
            <Text style={styles.previewWatermark}>{previewName}</Text>
            <View style={styles.previewLogoRow}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.previewLogo} />
              ) : (
                <View style={styles.previewLogoFallback}>
                  <Text style={styles.previewLogoInitials}>
                    {orgInitials(previewName)}
                  </Text>
                </View>
              )}
              <View>
                <Text style={styles.previewCompanyName}>
                  {previewName.toUpperCase()}
                </Text>
                <Text style={styles.previewDocType}>Commercial Invoice</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </WorkspaceDetailLayout>
  );
}

const local = StyleSheet.create({
  logoCard: { padding: 14 },
  logoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  uploadThumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    flexShrink: 0,
  },
  uploadThumb: { width: "100%", height: "100%" },
  uploadThumbFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PURPLE_TINT,
  },
  uploadThumbInitials: { fontSize: 16, fontWeight: "800", color: PURPLE },
  uploadThumbBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  uploadInfo: { flex: 1, minWidth: 0, gap: 3 },
  uploadTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.05,
  },
  uploadSub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  uploadActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: PURPLE_TINT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PURPLE_BORDER,
  },
  uploadBtnText: {
    fontSize: 10,
    fontWeight: "600",
    color: PURPLE,
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  removeBtnText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  bannerText: { flex: 1, minWidth: 0, gap: 2 },
  readonlyNote: {
    marginHorizontal: 0,
    marginTop: 8,
    marginBottom: 0,
    alignSelf: "stretch",
  },

  footerActions: {
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  saveBtn: {
    flex: 1.4,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    backgroundColor: "#c8cdd8",
  },
  saveText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnDark,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});
