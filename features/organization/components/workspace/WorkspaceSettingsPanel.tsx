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
import { WORKSPACE_PANEL_TITLES } from "@/features/organization/components/workspace/workspacePanelTypes";
import {
  AMBER,
  modelLabel,
  orgInitials,
  PURPLE,
  PURPLE_MID,
  SectionHeader,
  workspacePanelStyles as styles,
} from "@/features/organization/components/workspace/workspacePanelUi";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import {
  getSignedAvatarUrl,
  pickAndUploadOrgLogo,
} from "@/lib/avatarUpload";
import { LinearGradient } from "expo-linear-gradient";
import { AlertTriangle, Check, ImagePlus, Lock, Pencil } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
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

  const orgId = currentOrganization?.id ?? "";
  const storedName = currentOrganization?.name ?? "";

  const [orgName, setOrgName] = useState(storedName);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
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
        Alert.alert("Upload failed", result.error.message);
        return;
      }
      if (!result.path) return;
      const { error } = await updateOrganizationLogo(orgId, result.path);
      if (error) {
        Alert.alert("Save failed", error.message);
        return;
      }
      if (result.previewUri) setLogoUri(result.previewUri);
      await refreshOrganization();
      await syncBrandingFromOrg(orgId, orgName, result.path);
    } finally {
      setLogoUploading(false);
    }
  };

  const isDirty = orgName.trim() !== storedName.trim() && orgName.trim().length > 0;

  const handleSaveName = async () => {
    if (!orgId || nameSaving || !isDirty) return;
    const trimmed = orgName.trim();
    if (!trimmed) {
      Alert.alert("Invalid name", "Organisation name cannot be empty.");
      return;
    }
    setNameSaving(true);
    try {
      const { error } = await updateOrganizationName(orgId, trimmed);
      if (error) {
        Alert.alert("Save failed", error.message);
        return;
      }
      await refreshOrganization();
      await syncBrandingFromOrg(
        orgId,
        trimmed,
        currentOrganization?.logo_url ?? null,
      );
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2200);
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
      subtitle={previewName}
      onBack={onBack}
      rightSlot={
        isDirty && canEdit ? (
          <Pressable
            style={local.saveChip}
            onPress={() => void handleSaveName()}
            disabled={nameSaving}
            hitSlop={8}
          >
            {nameSaving ? (
              <LoadingIndicator size="small" color={PURPLE} />
            ) : nameSaved ? (
              <Check size={15} color={PURPLE} strokeWidth={3} />
            ) : (
              <Text style={local.saveChipText}>Save</Text>
            )}
          </Pressable>
        ) : (
          <View style={local.saveChipPlaceholder} />
        )
      }
    >
          <View style={local.brandCard}>
            <Pressable
              style={({ pressed }) => [
                local.brandRow,
                pressed && canEdit && { opacity: 0.85 },
              ]}
              onPress={canEdit ? () => void handleUploadLogo() : undefined}
              disabled={!canEdit}
            >
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={local.brandLogo} />
              ) : (
                <View style={local.brandLogoFallback}>
                  <Text style={local.brandLogoInitials}>
                    {orgInitials(previewName)}
                  </Text>
                </View>
              )}
              <View style={local.brandText}>
                <Text style={local.brandName} numberOfLines={1}>
                  {previewName}
                </Text>
                <Text style={local.brandMeta}>
                  {modelLabel(currentOrganization?.operatingModel)}
                </Text>
              </View>
              {canEdit ? (
                <View style={local.brandEditChip}>
                  <ImagePlus size={14} color={PURPLE} strokeWidth={2.2} />
                </View>
              ) : (
                <Lock size={14} color={Theme.textMuted} strokeWidth={2} />
              )}
            </Pressable>
          </View>

          {canEdit && kycMissing > 0 ? (
            <View style={styles.kycBanner}>
              <AlertTriangle size={15} color={AMBER} strokeWidth={2.2} />
              <View style={{ flex: 1 }}>
                <Text style={styles.kycBannerTitle}>
                  {kycMissing === 3
                    ? "KYC not started"
                    : `${kycMissing} compliance field${kycMissing > 1 ? "s" : ""} missing`}
                </Text>
                <Text style={styles.kycBannerSub}>
                  Complete org identity & KYC to unlock billing
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <SectionHeader label="Organisation Name" />
            <View style={styles.nameInputWrap}>
              <TextInput
                ref={nameInputRef}
                style={[styles.nameInput, !canEdit && styles.nameInputReadonly]}
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
              {canEdit ? (
                <Pencil size={14} color={Theme.textMuted} strokeWidth={2} />
              ) : (
                <Lock size={14} color={Theme.textMuted} strokeWidth={2} />
              )}
            </View>
            {isDirty && canEdit ? (
              <Pressable
                style={({ pressed }) => [
                  styles.nameSaveBtn,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => void handleSaveName()}
                disabled={nameSaving}
              >
                <LinearGradient
                  colors={[PURPLE, PURPLE_MID]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.nameSaveGradient}
                >
                  {nameSaving ? (
                    <LoadingIndicator size="small" color="#fff" />
                  ) : nameSaved ? (
                    <>
                      <Check size={14} color="#fff" strokeWidth={2.8} />
                      <Text style={styles.nameSaveTxt}>Saved</Text>
                    </>
                  ) : (
                    <Text style={styles.nameSaveTxt}>Save Name</Text>
                  )}
                </LinearGradient>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.card}>
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
            {canEdit ? (
              <Pressable
                style={({ pressed }) => [
                  styles.logoUploadRow,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => void handleUploadLogo()}
                disabled={logoUploading}
              >
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.logoThumb} />
                ) : (
                  <View style={styles.logoThumbFallback}>
                    <Text style={styles.logoThumbInitials}>
                      {orgInitials(previewName)}
                    </Text>
                  </View>
                )}
                <View style={styles.logoUploadInfo}>
                  <Text style={styles.logoUploadTitle}>
                    {logoUri ? "Change logo" : "Upload logo"}
                  </Text>
                  <Text style={styles.logoUploadSub}>
                    Square PNG or JPEG recommended
                  </Text>
                </View>
                {logoUploading ? (
                  <LoadingIndicator size="small" color={Theme.textMuted} />
                ) : (
                  <View style={styles.logoUploadChip}>
                    <ImagePlus size={14} color={PURPLE} strokeWidth={2.2} />
                  </View>
                )}
              </Pressable>
            ) : null}
          </View>
    </WorkspaceDetailLayout>
  );
}

const local = StyleSheet.create({
  brandCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  brandLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
  },
  brandLogoFallback: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(26,35,126,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandLogoInitials: { fontSize: 16, fontWeight: "900", color: PURPLE },
  brandText: { flex: 1, minWidth: 0, gap: 2 },
  brandName: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  brandMeta: { fontSize: 11, color: Theme.textMuted },
  brandEditChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(26,35,126,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  saveChip: {
    minWidth: 52,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    backgroundColor: "rgba(26,35,126,0.08)",
    borderWidth: 1,
    borderColor: "rgba(26,35,126,0.18)",
  },
  saveChipText: { fontSize: 12, fontWeight: "700", color: PURPLE },
  saveChipPlaceholder: { width: 52 },
});
