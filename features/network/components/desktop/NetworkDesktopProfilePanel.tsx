/**
 * My Profile tab — personal identity + workspace branding (Metronic hub panel).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  USER_2D_AVATARS,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import * as authService from "@/features/auth/services/auth.service";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import { orgInitials } from "@/features/organization/components/workspace/workspacePanelUi";
import { syncBrandingFromOrg } from "@/features/invoicing/services/invoiceBranding.service";
import {
  updateOrganizationLogo,
  updateOrganizationName,
} from "@/features/organization/services/organization.service";
import type { CurrentOrganization } from "@/types/organization";
import {
  getSignedAvatarUrl,
  pickAndUploadAvatar,
  pickAndUploadOrgLogo,
} from "@/lib/avatarUpload";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import { VALIDATION, maxLength, validateFullName } from "@/lib/validation";
import { Camera, Trash2, UploadCloud } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  organization: CurrentOrganization | null;
};

export function NetworkDesktopProfilePanel({ organization }: Props) {
  const layout = useProfileHubCompactLayout();
  const { profile, user, refreshSession } = useAuth();
  const { refreshOrganization } = useOrganization();
  const { canEdit } = useOrgRole();

  const orgId = organization?.id ?? "";
  const storedOrgName = organization?.name ?? "";

  const email = user?.email ?? profile?.email ?? "";
  const initialFullName = profile?.full_name ?? profile?.displayName ?? "";
  const initialStatus = profile?.status_text ?? "";

  const [fullName, setFullName] = useState(initialFullName);
  const [statusText, setStatusText] = useState(initialStatus);
  const [orgName, setOrgName] = useState(storedOrgName);
  const [userAvatarUri, setUserAvatarUri] = useState<string | null>(null);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [selectedPresetSeed, setSelectedPresetSeed] = useState(
    profile?.avatar_seed ?? DEFAULT_USER_2D_AVATAR_SEED,
  );
  const [showPresets, setShowPresets] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(initialFullName);
    setStatusText(initialStatus);
  }, [initialFullName, initialStatus]);

  useEffect(() => {
    if (storedOrgName) setOrgName(storedOrgName);
  }, [storedOrgName]);

  const resolveUserAvatar = useCallback(async () => {
    if (!profile) {
      setUserAvatarUri(null);
      return;
    }
    if (profile.avatar_url?.startsWith("http")) {
      setUserAvatarUri(profile.avatar_url);
      return;
    }
    if (profile.avatar_url?.trim()) {
      const signed = await getSignedAvatarUrl(profile.avatar_url.trim());
      setUserAvatarUri(signed ?? getUser2DAvatarUriForSeed(selectedPresetSeed));
      return;
    }
    setUserAvatarUri(getUser2DAvatarUriForSeed(selectedPresetSeed));
  }, [profile, selectedPresetSeed]);

  useEffect(() => {
    void resolveUserAvatar();
  }, [resolveUserAvatar]);

  useEffect(() => {
    let mounted = true;
    const raw = organization?.logo_url?.trim();
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
  }, [organization?.logo_url]);

  const profileDirty = useMemo(
    () =>
      fullName.trim() !== initialFullName.trim() ||
      statusText.trim() !== initialStatus.trim(),
    [fullName, initialFullName, statusText, initialStatus],
  );

  const orgDirty = useMemo(
    () => orgName.trim() !== storedOrgName.trim() && orgName.trim().length > 0,
    [orgName, storedOrgName],
  );

  const handleSaveProfile = async () => {
    setError(null);
    const nameErr = validateFullName(true)(fullName);
    if (nameErr) {
      setError(nameErr);
      return;
    }
    const trimmedStatus = statusText.trim();
    const statusErr = maxLength(
      VALIDATION.STATUS_TEXT_MAX_LENGTH,
      `Status must be at most ${VALIDATION.STATUS_TEXT_MAX_LENGTH} characters.`,
    )(trimmedStatus);
    if (statusErr) {
      setError(statusErr);
      return;
    }
    setProfileSaving(true);
    const { error: err } = await authService.updateProfile({
      full_name: fullName.trim(),
      status_text: trimmedStatus || null,
    });
    setProfileSaving(false);
    if (err) {
      setError(err.message);
      Alert.alert("Could not save", err.message);
      return;
    }
    await refreshSession();
    Alert.alert("Profile updated", "Your personal details are saved.");
  };

  const handleUploadPhoto = async () => {
    const uid = profile?.uid;
    if (!uid) return;
    setError(null);
    setPhotoUploading(true);
    const { path, previewUri, error: pickErr } = await pickAndUploadAvatar(uid);
    setPhotoUploading(false);
    if (pickErr) {
      setError(pickErr.message);
      Alert.alert("Upload failed", pickErr.message);
      return;
    }
    if (!path) return;
    const { error: updateErr } = await authService.updateProfile({ avatar_url: path });
    if (updateErr) {
      setError(updateErr.message);
      Alert.alert("Could not save photo", updateErr.message);
      return;
    }
    if (previewUri?.trim()) setUserAvatarUri(previewUri);
    const signed = await getSignedAvatarUrl(path);
    if (signed) setUserAvatarUri(signed);
    await refreshSession();
    Alert.alert("Profile photo updated");
  };

  const handleSelectPreset = async (seed: string) => {
    setError(null);
    const { error: updateErr } = await authService.updateProfile({
      avatar_url: null,
      avatar_seed: seed,
    } as authService.UpdateProfileOptions);
    if (updateErr) {
      setError(updateErr.message);
      Alert.alert("Could not set avatar", updateErr.message);
      return;
    }
    setSelectedPresetSeed(seed);
    setUserAvatarUri(getUser2DAvatarUriForSeed(seed));
    setShowPresets(false);
    await refreshSession();
    Alert.alert("Avatar updated");
  };

  const handleRemovePhoto = () => {
    Alert.alert(
      "Remove profile photo?",
      "Your account will use a preset avatar until you upload a new photo.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const { error: updateErr } = await authService.updateProfile({
                avatar_url: null,
                avatar_seed: selectedPresetSeed,
              } as authService.UpdateProfileOptions);
              if (updateErr) {
                Alert.alert("Remove failed", updateErr.message);
                return;
              }
              setUserAvatarUri(getUser2DAvatarUriForSeed(selectedPresetSeed));
              await refreshSession();
            })();
          },
        },
      ],
    );
  };

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
      const { error: saveErr } = await updateOrganizationLogo(orgId, result.path);
      if (saveErr) {
        Alert.alert("Save failed", saveErr.message);
        return;
      }
      if (result.previewUri) setLogoUri(result.previewUri);
      await refreshOrganization();
      await syncBrandingFromOrg(orgId, orgName, result.path);
      Alert.alert("Workspace logo updated");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    if (!orgId || !canEdit) return;
    Alert.alert(
      "Remove logo?",
      "Your workspace will fall back to initials until you upload a new logo.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setLogoUploading(true);
              try {
                const { error: saveErr } = await updateOrganizationLogo(orgId, null);
                if (saveErr) {
                  Alert.alert("Remove failed", saveErr.message);
                  return;
                }
                setLogoUri(null);
                await refreshOrganization();
                await syncBrandingFromOrg(orgId, orgName, null);
                Alert.alert("Logo removed");
              } finally {
                setLogoUploading(false);
              }
            })();
          },
        },
      ],
    );
  };

  const handleSaveOrgName = async () => {
    if (!orgId || orgSaving || !orgDirty) return;
    const trimmed = orgName.trim();
    if (!trimmed) {
      Alert.alert("Invalid name", "Organisation name cannot be empty.");
      return;
    }
    setOrgSaving(true);
    try {
      const { error: saveErr } = await updateOrganizationName(orgId, trimmed);
      if (saveErr) {
        Alert.alert("Save failed", saveErr.message);
        return;
      }
      await refreshOrganization();
      await syncBrandingFromOrg(
        orgId,
        trimmed,
        organization?.logo_url ?? null,
      );
      Alert.alert("Workspace name saved");
    } finally {
      setOrgSaving(false);
    }
  };

  const previewOrgName = orgName.trim() || storedOrgName || "YOUR ORG";

  return (
    <View style={[styles.panel, layout.panel]}>
      <View style={[styles.sectionToolbar, layout.sectionToolbar]}>
        <View style={styles.teamPanelTitleCol}>
          <Text style={[styles.sectionTitle, layout.sectionTitle]}>My Profile</Text>
          <Text style={[styles.sectionSub, layout.sectionSub]}>
            Personal identity and workspace branding
          </Text>
        </View>
      </View>

      {error ? <Text style={styles.profileErrorText}>{error}</Text> : null}

      <View style={styles.profileSplitRow}>
        <View style={styles.profileCol}>
          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.profileCardTitle}>Personal identity</Text>
            <Text style={styles.profileCardSub}>
              Shown in chat and team communications
            </Text>

            <View style={styles.profileAvatarRow}>
              <View style={styles.profileAvatarRing}>
                {userAvatarUri ? (
                  <Image
                    source={{ uri: userAvatarUri }}
                    style={styles.profileAvatarImage}
                  />
                ) : (
                  <PartyAvatar
                    name={fullName || "User"}
                    avatarUrl={profile?.avatar_url ?? null}
                    avatarSeed={profile?.avatar_seed ?? null}
                    size={66}
                    shape="circle"
                  />
                )}
              </View>
              <View style={styles.profileAvatarActions}>
                <Pressable
                  style={styles.profileActionBtn}
                  onPress={() => void handleUploadPhoto()}
                  disabled={photoUploading}
                >
                  {photoUploading ? (
                    <LoadingIndicator size="small" color={METRONIC.link} />
                  ) : (
                    <>
                      <Camera size={14} color={METRONIC.link} strokeWidth={2.2} />
                      <Text style={styles.profileActionBtnText}>Upload photo</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={styles.profileActionBtn}
                  onPress={() => setShowPresets((v) => !v)}
                >
                  <Text style={styles.profileActionBtnText}>Choose preset</Text>
                </Pressable>
                {profile?.avatar_url ? (
                  <Pressable
                    style={styles.profileActionBtn}
                    onPress={handleRemovePhoto}
                  >
                    <Trash2 size={14} color={Theme.negative} strokeWidth={2.2} />
                    <Text
                      style={[styles.profileActionBtnText, { color: Theme.negative }]}
                    >
                      Remove photo
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {showPresets ? (
              <View style={styles.profilePresetGrid}>
                {USER_2D_AVATARS.map((av) => {
                  const selected = selectedPresetSeed === av.seed;
                  return (
                    <Pressable
                      key={av.seed}
                      onPress={() => void handleSelectPreset(av.seed)}
                      style={[
                        styles.profilePresetItem,
                        selected && styles.profilePresetItemSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={av.name}
                    >
                      <Image source={av.image} style={styles.profilePresetImage} />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.profileFieldGroup}>
              <Text style={styles.profileFieldLabel}>Full name</Text>
              <TextInput
                style={styles.profileFieldInput}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your name"
                placeholderTextColor={METRONIC.muted}
                autoCorrect={false}
              />
            </View>

            <View style={styles.profileFieldGroup}>
              <Text style={styles.profileFieldLabel}>Status</Text>
              <TextInput
                style={styles.profileFieldInput}
                value={statusText}
                onChangeText={setStatusText}
                placeholder="Optional status line"
                placeholderTextColor={METRONIC.muted}
                maxLength={VALIDATION.STATUS_TEXT_MAX_LENGTH}
              />
            </View>

            <View style={styles.profileFieldGroup}>
              <Text style={styles.profileFieldLabel}>Email</Text>
              <View style={styles.profileFieldReadonly}>
                <Text style={styles.profileFieldReadonlyText}>{email || "—"}</Text>
              </View>
            </View>

            <Pressable
              style={[
                styles.profileSaveBtn,
                (!profileDirty || profileSaving) && styles.profileSaveBtnDisabled,
              ]}
              onPress={() => void handleSaveProfile()}
              disabled={!profileDirty || profileSaving}
            >
              {profileSaving ? (
                <LoadingIndicator size="small" color={Theme.textOnPrimary} />
              ) : (
                <Text style={styles.profileSaveBtnText}>Save profile</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.profileCol}>
          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.profileCardTitle}>Workspace branding</Text>
            <Text style={styles.profileCardSub}>
              Logo and name shown on network, invoices and partner profiles
            </Text>

            <View style={styles.profileLogoRow}>
              <View style={styles.profileLogoThumb}>
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.profileLogoImage} />
                ) : (
                  <Text style={styles.profileLogoInitials}>
                    {orgInitials(previewOrgName)}
                  </Text>
                )}
              </View>
              {canEdit ? (
                <View style={styles.profileAvatarActions}>
                  <Pressable
                    style={styles.profileActionBtn}
                    onPress={() => void handleUploadLogo()}
                    disabled={logoUploading}
                  >
                    {logoUploading ? (
                      <LoadingIndicator size="small" color={METRONIC.link} />
                    ) : (
                      <>
                        <UploadCloud
                          size={14}
                          color={METRONIC.link}
                          strokeWidth={2.2}
                        />
                        <Text style={styles.profileActionBtnText}>Upload logo</Text>
                      </>
                    )}
                  </Pressable>
                  {logoUri ? (
                    <Pressable
                      style={styles.profileActionBtn}
                      onPress={handleRemoveLogo}
                      disabled={logoUploading}
                    >
                      <Trash2 size={14} color={Theme.negative} strokeWidth={2.2} />
                      <Text
                        style={[
                          styles.profileActionBtnText,
                          { color: Theme.negative },
                        ]}
                      >
                        Remove logo
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.profileCardSub}>
                  Only workspace owners and admins can change branding.
                </Text>
              )}
            </View>

            <View style={styles.profileFieldGroup}>
              <Text style={styles.profileFieldLabel}>Workspace name</Text>
              <TextInput
                style={styles.profileFieldInput}
                value={orgName}
                onChangeText={setOrgName}
                placeholder="Organisation name"
                placeholderTextColor={METRONIC.muted}
                editable={canEdit}
              />
            </View>

            {canEdit ? (
              <Pressable
                style={[
                  styles.profileSaveBtn,
                  (!orgDirty || orgSaving) && styles.profileSaveBtnDisabled,
                ]}
                onPress={() => void handleSaveOrgName()}
                disabled={!orgDirty || orgSaving}
              >
                {orgSaving ? (
                  <LoadingIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.profileSaveBtnText}>Save workspace</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}
