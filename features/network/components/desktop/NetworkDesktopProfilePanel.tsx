/**
 * My Profile tab — personal identity + workspace branding (Metronic hub panel).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  FEMALE_USER_2D_AVATARS,
  MALE_USER_2D_AVATARS,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import * as authService from "@/features/auth/services/auth.service";
import { NetworkDesktopHeadquarterMap } from "@/features/network/components/desktop/NetworkDesktopHeadquarterMap";
import { NetworkDesktopLocationModal } from "@/features/network/components/desktop/NetworkDesktopLocationModal";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useOrganizationOfficeMap } from "@/features/network/hooks/useOrganizationOfficeMap";
import {
  NetworkDesktopWorkspaceProfileModal,
  type WorkspaceProfileEditSection,
} from "@/features/network/components/desktop/NetworkDesktopWorkspaceProfileModal";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { orgInitials } from "@/features/organization/components/workspace/workspacePanelUi";
import { syncBrandingFromOrg } from "@/features/invoicing/services/invoiceBranding.service";
import {
  getWorkspaceKyc,
  updateOrganizationLogo,
  updateOrganizationName,
  updateWorkspaceKyc,
} from "@/features/organization/services/organization.service";
import type { OrganizationWorkspaceLocation } from "@/features/organization/services/organizationLocations.service";
import type { OrganizationWorkspaceProfile } from "@/features/organization/services/organizationWorkspaceProfile.service";
import {
  buildHeadquarterLocationCard,
  buildRegionLabel,
  formatLocationSubtitle,
  type LocationCardModel,
} from "@/features/network/utils/organizationLocationDisplay.util";
import {
  isVerificationFrozen,
  type CurrentOrganization,
  type WorkspaceKyc,
} from "@/types/organization";
import {
  getSignedAvatarUrl,
  pickAndUploadAvatar,
  pickAndUploadOrgLogo,
} from "@/lib/avatarUpload";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import { useOrganizationLocationsQuery } from "@/lib/queries/useOrganizationLocationsQuery";
import {
  useInvalidateOrganizationWorkspaceProfile,
  useOrganizationWorkspaceProfileQuery,
} from "@/lib/queries/useOrganizationWorkspaceProfileQuery";
import { ROUTES } from "@/lib/routes";
import { VALIDATION, maxLength, validateFullName } from "@/lib/validation";
import {
  Briefcase,
  Camera,
  Globe,
  Lock,
  Mail,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";

type Props = {
  organization: CurrentOrganization | null;
};

function BrandingLinkRow({
  icon: Icon,
  value,
  compact,
  onPress,
}: {
  icon: typeof Globe;
  value: string;
  compact?: boolean;
  onPress?: () => void;
}) {
  if (!value) return null;
  const row = (
    <View style={styles.networkLinkRow}>
      <Icon size={compact ? 13 : 15} color={METRONIC.muted} strokeWidth={2} />
      <Text
        style={[styles.networkLinkText, compact && mobile.networkLinkTextCompact]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
  if (!onPress) return row;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {row}
    </Pressable>
  );
}

function emptyWorkspaceProfile(
  orgId: string,
  orgName: string,
): OrganizationWorkspaceProfile {
  return {
    id: orgId,
    name: orgName,
    address_line: null,
    locality: null,
    pincode: null,
    city: null,
    state: null,
    zone: null,
    created_at: new Date().toISOString(),
    profile_about: null,
    profile_website: null,
    profile_ceo_name: null,
    profile_sector: null,
    profile_area: null,
    founded_year: null,
    profile_facebook: null,
    profile_youtube: null,
    profile_products: [],
  };
}

export function NetworkDesktopProfilePanel({ organization }: Props) {
  const layout = useProfileHubCompactLayout();
  const compact = layout.compact;
  const router = useRouter();
  const { profile, user, refreshSession } = useAuth();
  const { refreshOrganization } = useOrganization();
  const { canEdit } = useOrgRole();
  const invalidateWorkspaceProfile = useInvalidateOrganizationWorkspaceProfile();
  const officeMapQ = useOrganizationOfficeMap(organization?.id ?? null);
  const workspaceProfileQ = useOrganizationWorkspaceProfileQuery(
    organization?.id ?? null,
  );
  const locationsQ = useOrganizationLocationsQuery(organization?.id ?? null);

  const orgId = organization?.id ?? "";
  const storedOrgName = organization?.name ?? "";

  const email = user?.email ?? profile?.email ?? "";
  const phone = profile?.phone?.trim() || "";
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
  const [kyc, setKyc] = useState<WorkspaceKyc | null>(null);
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [profileEditSection, setProfileEditSection] =
    useState<WorkspaceProfileEditSection | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] =
    useState<OrganizationWorkspaceLocation | null>(null);
  const [locationDraft, setLocationDraft] = useState<
    Partial<{
      name: string;
      location_type: OrganizationWorkspaceLocation["location_type"];
      department: string;
      address_line: string;
      city: string;
      state: string;
      is_verified: boolean;
    }>
  >();

  useEffect(() => {
    setFullName(initialFullName);
    setStatusText(initialStatus);
  }, [initialFullName, initialStatus]);

  useEffect(() => {
    if (storedOrgName) setOrgName(storedOrgName);
  }, [storedOrgName]);

  useEffect(() => {
    if (!orgId) {
      setKyc(null);
      return;
    }
    let mounted = true;
    void getWorkspaceKyc(orgId).then(({ kyc: next }) => {
      if (!mounted) return;
      setKyc(next);
      setAddressLine(next?.address_line ?? "");
      setCity(next?.city ?? "");
      setStateName(next?.state ?? "");
    });
    return () => {
      mounted = false;
    };
  }, [orgId]);

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

  const addressFrozen = isVerificationFrozen(
    kyc?.verification_status ?? "unverified",
  );

  const storedAddressLine = kyc?.address_line ?? "";
  const storedCity = kyc?.city ?? "";
  const storedState = kyc?.state ?? "";

  const addressDirty = useMemo(
    () =>
      !addressFrozen &&
      (addressLine.trim() !== storedAddressLine.trim() ||
        city.trim() !== storedCity.trim() ||
        stateName.trim() !== storedState.trim()),
    [
      addressFrozen,
      addressLine,
      city,
      stateName,
      storedAddressLine,
      storedCity,
      storedState,
    ],
  );

  const brandingDirty = orgDirty || addressDirty;

  const officeAddress = useMemo(() => {
    const parts = [addressLine, city, stateName].filter((part) => part.trim());
    if (parts.length > 0) return parts.join(", ");
    return officeMapQ.data?.addressLabel ?? "Add your registered office address";
  }, [addressLine, city, stateName, officeMapQ.data?.addressLabel]);

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
    if (!orgId || orgSaving || !brandingDirty) return;
    const trimmed = orgName.trim();
    if (orgDirty && !trimmed) {
      Alert.alert("Invalid name", "Organisation name cannot be empty.");
      return;
    }
    setOrgSaving(true);
    try {
      if (orgDirty) {
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
      }
      if (addressDirty) {
        const { error: addressErr, kyc: nextKyc } = await updateWorkspaceKyc(orgId, {
          address_line: addressLine.trim() || null,
          city: city.trim() || null,
          state: stateName.trim() || null,
        });
        if (addressErr) {
          Alert.alert("Could not save address", addressErr.message);
          return;
        }
        if (nextKyc) {
          setKyc(nextKyc);
          setAddressLine(nextKyc.address_line ?? "");
          setCity(nextKyc.city ?? "");
          setStateName(nextKyc.state ?? "");
        }
        invalidateWorkspaceProfile(orgId);
      }
      Alert.alert(
        orgDirty && addressDirty
          ? "Workspace saved"
          : addressDirty
            ? "Registered office saved"
            : "Workspace name saved",
      );
    } finally {
      setOrgSaving(false);
    }
  };

  const previewOrgName = orgName.trim() || storedOrgName || "YOUR ORG";
  const workspaceProfile =
    workspaceProfileQ.data ?? emptyWorkspaceProfile(orgId, storedOrgName);
  const websiteLabel =
    workspaceProfile.profile_website?.trim() || "Add website";
  const facebook = workspaceProfile.profile_facebook?.trim() || "";
  const youtube = workspaceProfile.profile_youtube?.trim() || "";
  const aboutText = workspaceProfile.profile_about?.trim() || "";
  const products = workspaceProfile.profile_products ?? [];
  const phoneDisplay = phone || "Add phone";
  const openContact = canEdit
    ? () => setProfileEditSection("contact")
    : undefined;

  const openAddressProof = useCallback(() => {
    router.push({
      pathname: ROUTES.WORKSPACE,
      params: { panel: "kyc", section: "documents" },
    });
  }, [router]);

  const headquarterCard = useMemo(
    () =>
      buildHeadquarterLocationCard(
        previewOrgName,
        officeMapQ.data?.rawLocation ?? null,
      ),
    [officeMapQ.data?.rawLocation, previewOrgName],
  );

  const locationCards: LocationCardModel[] = useMemo(() => {
    const saved = locationsQ.data ?? [];
    if (saved.length === 0) {
      return [
        {
          ...headquarterCard,
          verified: addressFrozen || headquarterCard.verified,
        },
      ];
    }
    return saved.map((loc) => ({
      id: loc.id,
      name: loc.name,
      locationType: loc.location_type,
      department: loc.department ?? "Operations & dispatch",
      addressLine: loc.address_line?.trim() ?? "",
      city: loc.city,
      state: loc.state,
      verified:
        loc.is_verified ||
        (loc.location_type === "registered_office" && addressFrozen),
      persisted: true,
    }));
  }, [addressFrozen, headquarterCard, locationsQ.data]);

  const openAddLocation = (
    type: OrganizationWorkspaceLocation["location_type"] = "registered_office",
  ) => {
    if (!canEdit) return;
    if (type === "registered_office" && addressFrozen) {
      openAddressProof();
      return;
    }
    const labelMap: Record<string, string> = {
      registered_office: "Registered office",
      branch_office: "Branch office",
      primary_hub: "Hub",
      regional_office: "Regional office",
      dispatch_center: "Dispatch center",
      warehouse: "Warehouse",
      other: "Location",
    };
    setEditingLocation(null);
    setLocationDraft({
      name: `${previewOrgName} ${labelMap[type] ?? "Location"}`,
      location_type: type,
      department:
        type === "registered_office" ? "Legal & compliance" : "Operations & dispatch",
      address_line: addressLine.trim() || officeMapQ.data?.addressLabel,
      city: city.trim() || officeMapQ.data?.rawLocation?.city || undefined,
      state: stateName.trim() || officeMapQ.data?.rawLocation?.state || undefined,
      is_verified: false,
    });
    setLocationModalOpen(true);
  };

  const openLocationDetail = (card: LocationCardModel) => {
    const registeredLocked =
      card.locationType === "registered_office" && addressFrozen;
    if (registeredLocked) {
      if (canEdit) openAddressProof();
      return;
    }
    if (!canEdit) return;
    if (card.persisted) {
      const row = (locationsQ.data ?? []).find((l) => l.id === card.id);
      if (!row) return;
      setEditingLocation(row);
      setLocationDraft(undefined);
      setLocationModalOpen(true);
      return;
    }
    setEditingLocation(null);
    setLocationDraft({
      name: card.name,
      location_type: card.locationType,
      department: card.department,
      address_line: card.addressLine || officeAddress,
      city: card.city ?? undefined,
      state: card.state ?? undefined,
      is_verified: card.verified,
    });
    setLocationModalOpen(true);
  };

  return (
    <View style={[styles.panel, layout.panel]}>
      <View style={[styles.sectionToolbar, layout.sectionToolbar]}>
        <View style={styles.teamPanelTitleCol}>
          <Text style={styles.profilePageTitle}>My Profile</Text>
          <Text style={styles.profilePageSub}>
            Personal identity and workspace branding
          </Text>
        </View>
      </View>

      {error ? <Text style={styles.profileErrorText}>{error}</Text> : null}

      <View style={[styles.profileSplitRow, compact && mobile.profileSplitColumn]}>
        <View style={[styles.profileColIdentity, compact && mobile.profileColFull]}>
          <View style={[styles.salesCard, styles.profileCardPad, styles.profileCard]}>
            <View style={styles.profileCardHeader}>
              <Text style={styles.profileCardTitle}>Personal identity</Text>
              <Text style={styles.profileCardSub}>
                Shown in chat and team communications
              </Text>
            </View>

            <View style={styles.profileCardBody}>
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
                      size={52}
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
                      <Camera size={12} color={METRONIC.link} strokeWidth={2.2} />
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
                    <Trash2 size={12} color={Theme.negative} strokeWidth={2.2} />
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
              <View style={{ marginBottom: 10 }}>
                <Text style={[styles.profileFieldLabel, { marginBottom: 6 }]}>
                  Male avatars
                </Text>
                <View style={styles.profilePresetGrid}>
                  {MALE_USER_2D_AVATARS.map((av) => {
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
                <Text style={[styles.profileFieldLabel, { marginTop: 10, marginBottom: 6 }]}>
                  Female avatars
                </Text>
                <View style={styles.profilePresetGrid}>
                  {FEMALE_USER_2D_AVATARS.map((av) => {
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
            </View>

            <View style={styles.profileCardFooter}>
              <Pressable
                style={[
                  styles.profileSaveBtn,
                  (!profileDirty || profileSaving) && styles.profileSaveBtnDisabled,
                ]}
                onPress={() => void handleSaveProfile()}
                disabled={!profileDirty || profileSaving}
              >
                {profileSaving ? (
                  <LoadingIndicator size="small" color={Theme.textPrimaryDark} />
                ) : (
                  <Text style={styles.profileSaveBtnText}>Save profile</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>

        <View style={[styles.profileColBranding, compact && mobile.profileColFull]}>
          <View style={[styles.salesCard, styles.profileCardPad, styles.profileCard]}>
            <View style={styles.profileCardHeader}>
              <Text style={styles.profileCardTitle}>Workspace branding</Text>
              <Text style={styles.profileCardSub}>
                Logo, name, registered office, contact, about and products shown on network and partner profiles
              </Text>
            </View>

            <View style={styles.profileCardBody}>
            <View style={[styles.profileLogoNameRow, compact && mobile.profileLogoNameStack]}>
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
                <View style={styles.profileLogoActions}>
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
                          size={12}
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
                      <Trash2 size={12} color={Theme.negative} strokeWidth={2.2} />
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
                <Text style={[styles.profileCardSub, { marginBottom: 0, flex: 1 }]}>
                  Only workspace owners and admins can change branding.
                </Text>
              )}
              </View>

              <View style={styles.profileNameField}>
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
            </View>

            <View style={styles.profileFieldGroup}>
              <Text style={styles.profileFieldLabel}>Registered office</Text>
              <View style={[styles.profileOfficeRow, compact && mobile.headquarterStack]}>
                <View style={[styles.profileOfficeMapCol, compact && mobile.mapFrameFull]}>
                  <View style={[styles.profileMapWrap, compact && mobile.mapFrameFull]}>
                    <NetworkDesktopHeadquarterMap
                      orgName={previewOrgName}
                      addressLabel={officeAddress}
                      coordinate={officeMapQ.data?.coordinate ?? null}
                      loading={officeMapQ.isLoading}
                      style={[styles.profileMapFrame, compact && mobile.mapFrameFull]}
                    />
                  </View>
                </View>
                <View style={[styles.profileOfficeContactCol, compact && mobile.profileOfficeContactFull]}>
                  <Text style={styles.profileFieldLabel}>Contact</Text>
                  <BrandingLinkRow
                    icon={Globe}
                    value={websiteLabel}
                    compact={compact}
                    onPress={openContact}
                  />
                  {facebook ? (
                    <BrandingLinkRow icon={Globe} value={facebook} compact={compact} onPress={openContact} />
                  ) : null}
                  {youtube ? (
                    <BrandingLinkRow icon={Globe} value={youtube} compact={compact} onPress={openContact} />
                  ) : null}
                  <BrandingLinkRow icon={Mail} value={email || "—"} compact={compact} />
                  <BrandingLinkRow
                    icon={Phone}
                    value={phoneDisplay}
                    compact={compact}
                    onPress={openContact}
                  />
                </View>
              </View>
              {addressFrozen ? (
                <View style={styles.profileAddressLock}>
                  <Lock size={12} color={METRONIC.muted} strokeWidth={2.2} />
                  <Text style={styles.profileAddressLockText}>
                    Address is locked after verification. Upload a new address proof — Pulse admin must approve the change.
                  </Text>
                </View>
              ) : null}
              {addressFrozen && canEdit ? (
                <Pressable
                  style={[styles.profileActionBtn, { alignSelf: "flex-start" }]}
                  onPress={() =>
                    router.push({
                      pathname: ROUTES.WORKSPACE,
                      params: { panel: "kyc", section: "documents" },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Upload address proof"
                >
                  <UploadCloud size={12} color={METRONIC.link} strokeWidth={2.2} />
                  <Text style={styles.profileActionBtnText}>Upload address proof</Text>
                </Pressable>
              ) : null}
              {!addressFrozen && canEdit ? (
                <View style={styles.profileOfficeAddressFields}>
                  <TextInput
                    style={styles.profileFieldInput}
                    value={addressLine}
                    onChangeText={setAddressLine}
                    placeholder="Street / plot"
                    placeholderTextColor={METRONIC.muted}
                  />
                  <View style={styles.profileFieldRow}>
                    <View style={styles.profileFieldHalf}>
                      <TextInput
                        style={styles.profileFieldInput}
                        value={city}
                        onChangeText={setCity}
                        placeholder="City"
                        placeholderTextColor={METRONIC.muted}
                      />
                    </View>
                    <View style={styles.profileFieldHalf}>
                      <TextInput
                        style={styles.profileFieldInput}
                        value={stateName}
                        onChangeText={setStateName}
                        placeholder="State"
                        placeholderTextColor={METRONIC.muted}
                      />
                    </View>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={[styles.profileAboutProductsRow, compact && mobile.profileAboutProductsStack]}>
            <View style={styles.profileBrandingHalf}>
              <View style={styles.profileSectionHeader}>
                <Text style={[styles.sectionHeading, compact && mobile.sectionHeadingCompact]}>
                  About
                </Text>
                {canEdit ? (
                  <Pressable
                    style={styles.cardEditBtn}
                    onPress={() => setProfileEditSection("about")}
                  >
                    <Pencil size={compact ? 11 : 12} color={METRONIC.muted} strokeWidth={2.2} />
                    <Text style={[styles.cardEditBtnText, compact && { fontSize: 10 }]}>Edit</Text>
                  </Pressable>
                ) : null}
              </View>
              {aboutText ? (
                <Text style={[styles.aboutBody, compact && mobile.aboutBodyCompact]}>
                  {aboutText}
                </Text>
              ) : (
                <Pressable
                  onPress={canEdit ? () => setProfileEditSection("about") : undefined}
                  disabled={!canEdit}
                >
                  <Text style={styles.profileEmptyHint}>
                    No about text — tap to add a description
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={styles.profileBrandingHalf}>
              <View style={styles.profileSectionHeader}>
                <Text style={[styles.sectionHeading, compact && mobile.sectionHeadingCompact]}>
                  Products
                </Text>
                {canEdit ? (
                  <Pressable
                    style={styles.cardEditBtn}
                    onPress={() => setProfileEditSection("products")}
                  >
                    <Pencil size={compact ? 11 : 12} color={METRONIC.muted} strokeWidth={2.2} />
                    <Text style={[styles.cardEditBtnText, compact && { fontSize: 10 }]}>Edit</Text>
                  </Pressable>
                ) : null}
              </View>
              {products.length > 0 ? (
                <View style={styles.tagWrap}>
                  {products.map((product) => (
                    <View key={product} style={styles.productPill}>
                      <Text style={[styles.productPillText, compact && mobile.tagPillTextCompact]}>
                        {product}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Pressable
                  onPress={canEdit ? () => setProfileEditSection("products") : undefined}
                  disabled={!canEdit}
                >
                  <Text style={styles.profileEmptyHint}>
                    No products listed — tap to add
                  </Text>
                </Pressable>
              )}
            </View>
            </View>

            <View style={styles.profileBrandingBlock}>
              <View style={styles.profileSectionHeader}>
                <Text style={[styles.sectionHeading, compact && mobile.sectionHeadingCompact]}>
                  Locations & offices
                </Text>
                {canEdit ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {addressFrozen ? null : (
                      <Pressable
                        style={[styles.offerLocationBtn, { backgroundColor: METRONIC.text }]}
                        onPress={() => openAddLocation("registered_office")}
                        accessibilityRole="button"
                        accessibilityLabel="Add registered office"
                      >
                        <Plus size={12} color={Theme.textOnPrimary} strokeWidth={2.6} />
                        <Text style={styles.offerLocationBtnText}>Reg. Office</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={styles.offerLocationBtn}
                      onPress={() => openAddLocation("branch_office")}
                      accessibilityRole="button"
                      accessibilityLabel="Add branch"
                    >
                      <Plus size={12} color={Theme.textOnPrimary} strokeWidth={2.6} />
                      <Text style={styles.offerLocationBtnText}>Branch</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {locationsQ.isLoading ? (
                <View style={styles.locationsEmpty}>
                  <ActivityIndicator color={METRONIC.muted} />
                </View>
              ) : (
                <View
                  style={[
                    styles.locationsGrid,
                    styles.profileLocationsGrid,
                    compact && mobile.locationsGridCompact,
                  ]}
                >
                  {locationCards.map((card, i) => {
                    const { line1 } = formatLocationSubtitle(
                      i + 1,
                      card.department,
                      card.city,
                      card.state,
                      card.verified,
                      card.locationType,
                    );
                    const place = buildRegionLabel(card.city, card.state);
                    const registeredLocked =
                      card.locationType === "registered_office" && addressFrozen;
                    const hint = registeredLocked
                      ? "Upload proof to change"
                      : !card.persisted
                        ? "Tap to save details"
                        : "Tap to edit";
                    return (
                      <Pressable
                        key={card.id}
                        style={({ pressed }) => [
                          styles.locationCard,
                          styles.locationCardPressable,
                          styles.profileLocationCard,
                          compact && mobile.locationCardCompact,
                          Platform.OS === "web"
                            ? ({ cursor: "pointer" } as ViewStyle)
                            : null,
                          pressed && { opacity: 0.92 },
                        ]}
                        onPress={() => openLocationDetail(card)}
                        accessibilityRole="button"
                        accessibilityLabel={
                          registeredLocked
                            ? `${card.name} is verified`
                            : `Edit ${card.name}`
                        }
                      >
                        <View style={styles.profileLocationImage}>
                          <Briefcase
                            size={18}
                            color={Theme.accentBrown}
                            strokeWidth={2}
                          />
                        </View>
                        <View style={styles.profileLocationBody}>
                          <View style={styles.profileLocationTitleRow}>
                            <Text
                              style={[styles.locationTitle, styles.profileLocationTitle]}
                              numberOfLines={1}
                            >
                              {card.name}
                            </Text>
                            {card.verified ? (
                              <View style={styles.profileLocationVerified}>
                                <Text style={styles.profileLocationVerifiedText}>
                                  Verified
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text
                            style={[styles.locationAddress, styles.profileLocationMeta]}
                            numberOfLines={1}
                          >
                            {line1}
                            {place ? ` · ${place}` : ""}
                          </Text>
                          <Text style={[styles.locationLinkHint, styles.profileLocationHint]}>
                            {hint}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
            </View>

            {canEdit ? (
              <View style={styles.profileCardFooter}>
                <Pressable
                  style={[
                    styles.profileSaveBtn,
                    (!brandingDirty || orgSaving) && styles.profileSaveBtnDisabled,
                  ]}
                  onPress={() => void handleSaveOrgName()}
                  disabled={!brandingDirty || orgSaving}
                >
                  {orgSaving ? (
                    <LoadingIndicator size="small" color={Theme.textPrimaryDark} />
                  ) : (
                    <Text style={styles.profileSaveBtnText}>Save workspace</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      {profileEditSection && orgId ? (
        <NetworkDesktopWorkspaceProfileModal
          visible
          orgId={orgId}
          section={profileEditSection}
          profile={workspaceProfile}
          email={email}
          phone={phone || null}
          onClose={() => setProfileEditSection(null)}
        />
      ) : null}
      {orgId ? (
        <NetworkDesktopLocationModal
          visible={locationModalOpen}
          orgId={orgId}
          orgName={previewOrgName}
          location={editingLocation}
          initialDraft={locationDraft}
          onClose={() => {
            setLocationModalOpen(false);
            setEditingLocation(null);
            setLocationDraft(undefined);
          }}
        />
      ) : null}
    </View>
  );
}
