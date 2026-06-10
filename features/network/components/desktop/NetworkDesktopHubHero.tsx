/**
 * Network desktop cover — Metronic hex hero with centered workspace branding
 * and a compact welcome chip (admin avatar) at top-right.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceOrgLogo } from "@/features/organization/hooks/useWorkspaceOrgLogo";
import { useOrganizationOfficeMap } from "@/features/network/hooks/useOrganizationOfficeMap";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import {
  BadgeCheck,
  Building2,
  Camera,
  Mail,
  MapPin,
  Sparkles,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

type Props = {
  orgId: string | null;
  orgName: string;
  email: string;
  modelLabel: string;
  totalConnections: number;
  clientCount: number;
  supplierCount: number;
  onProfilePress?: () => void;
};

function shortOfficeLocation(address: string): string {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  }
  return parts[0] ?? "India";
}

export function NetworkDesktopHubHero({
  orgId,
  orgName,
  email,
  modelLabel,
  totalConnections,
  clientCount,
  supplierCount,
  onProfilePress,
}: Props) {
  const { profile } = useAuth();
  const officeMapQ = useOrganizationOfficeMap(orgId);
  const { logoUri, logoStoragePath, uploading, canEdit, onLogoPress } =
    useWorkspaceOrgLogo();

  const [userAvatarUri, setUserAvatarUri] = useState<string | null>(null);

  const userDisplayName =
    profile?.full_name?.trim() ||
    profile?.displayName?.trim() ||
    "there";
  const welcomeFirstName =
    userDisplayName.split(/\s+/)[0] || userDisplayName;

  useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      if (!profile) {
        if (mounted) setUserAvatarUri(null);
        return;
      }
      if (profile.avatar_url?.startsWith("http")) {
        if (mounted) setUserAvatarUri(profile.avatar_url);
        return;
      }
      if (profile.avatar_url?.trim()) {
        const signed = await getSignedAvatarUrl(profile.avatar_url.trim());
        if (mounted) setUserAvatarUri(signed);
        return;
      }
      const seed = profile.avatar_seed?.trim() || DEFAULT_USER_2D_AVATAR_SEED;
      if (mounted) setUserAvatarUri(getUser2DAvatarUriForSeed(seed));
    };
    void resolve();
    return () => {
      mounted = false;
    };
  }, [profile?.avatar_url, profile?.avatar_seed]);

  const locationLabel = officeMapQ.data?.addressLabel
    ? shortOfficeLocation(officeMapQ.data.addressLabel)
    : "Network hub";

  return (
    <View style={styles.hero}>
      <View style={styles.heroHexOverlay} pointerEvents="none" />
      <View style={styles.heroInner}>
        <Pressable
          onPress={onProfilePress}
          style={({ pressed }) => [
            styles.heroWelcomeCorner,
            pressed && { opacity: 0.9 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Welcome ${welcomeFirstName}, open my profile`}
        >
          <View style={styles.heroWelcomeTextWrap}>
            <Sparkles size={12} color={METRONIC.link} strokeWidth={2.2} />
            <Text style={styles.heroWelcomeText}>
              Welcome,{" "}
              <Text style={styles.heroWelcomeName}>{welcomeFirstName}</Text>
            </Text>
          </View>
          <View style={styles.heroUserRingSm}>
            {userAvatarUri ? (
              <Image source={{ uri: userAvatarUri }} style={styles.heroUserImageSm} />
            ) : (
              <PartyAvatar
                name={userDisplayName}
                avatarUrl={profile?.avatar_url ?? null}
                avatarSeed={profile?.avatar_seed ?? null}
                size={24}
                shape="circle"
              />
            )}
          </View>
        </Pressable>

        <View style={styles.heroCenter}>
          <Pressable
            onPress={onLogoPress}
            disabled={uploading}
            style={({ pressed }) => [
              styles.heroAvatarPressable,
              pressed && canEdit && { opacity: 0.9 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              canEdit ? "Change workspace logo" : `${orgName} workspace logo`
            }
          >
            <View style={styles.heroAvatarRing}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.heroAvatarImage} />
              ) : (
                <PartyAvatar
                  name={orgName}
                  entityType="client"
                  organizationImageUrl={logoStoragePath}
                  size={88}
                  shape="circle"
                />
              )}
            </View>
            {canEdit ? (
              <View style={styles.heroCameraBadge}>
                {uploading ? (
                  <LoadingIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <Camera
                    size={13}
                    color={Theme.textOnPrimary}
                    strokeWidth={2.4}
                  />
                )}
              </View>
            ) : null}
          </Pressable>

          <View style={styles.heroNameRow}>
            <Text style={styles.heroName}>{orgName}</Text>
            <BadgeCheck size={18} color={METRONIC.link} strokeWidth={2.2} />
          </View>

          <View style={styles.heroMetaRow}>
            <View style={styles.heroMetaItem}>
              <Building2 size={14} color={METRONIC.subtle} strokeWidth={2} />
              <Text style={styles.heroMetaText}>{modelLabel}</Text>
            </View>
            <View style={styles.heroMetaItem}>
              <MapPin size={14} color={METRONIC.subtle} strokeWidth={2} />
              <Text style={styles.heroMetaText}>{locationLabel}</Text>
            </View>
            <View style={styles.heroMetaItem}>
              <Mail size={14} color={METRONIC.subtle} strokeWidth={2} />
              <Text style={styles.heroMetaText}>{email}</Text>
            </View>
          </View>

          <View style={styles.heroStatsRow}>
            <Text style={styles.heroStatChip}>
              <Text style={styles.heroStatValue}>{totalConnections}</Text>
              <Text style={styles.heroStatLabel}> connections</Text>
            </Text>
            <Text style={styles.heroStatDivider}>·</Text>
            <Text style={styles.heroStatChip}>
              <Text style={styles.heroStatValue}>{clientCount}</Text>
              <Text style={styles.heroStatLabel}> clients</Text>
            </Text>
            <Text style={styles.heroStatDivider}>·</Text>
            <Text style={styles.heroStatChip}>
              <Text style={styles.heroStatValue}>{supplierCount}</Text>
              <Text style={styles.heroStatLabel}> suppliers</Text>
            </Text>
          </View>

          {canEdit ? (
            <Text style={styles.heroLogoHint}>
              Tap logo to update workspace branding
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
