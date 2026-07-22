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
import { OrgVerificationBadges } from "@/features/network/components/OrgVerificationBadges";
import { getOrgVerificationBannerFields } from "@/features/organization/services/organization.service";
import { resolveOrgVerificationState } from "@/features/network/utils/orgVerification.util";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Camera,
  Mail,
  MapPin,
  Sparkles,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

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
  const { width } = useWindowDimensions();
  const router = useRouter();
  const canGoBack = router.canGoBack();
  const isNarrow = width < 720;
  const officeMapQ = useOrganizationOfficeMap(orgId);
  const { logoUri, logoStoragePath, uploading, canEdit, onLogoPress } =
    useWorkspaceOrgLogo();

  const [userAvatarUri, setUserAvatarUri] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setVerificationStatus(null);
      return;
    }
    let cancelled = false;
    void getOrgVerificationBannerFields(orgId).then(({ fields }) => {
      if (cancelled) return;
      setVerificationStatus(fields?.verification_status ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const verificationState = resolveOrgVerificationState({
    verification_status: verificationStatus,
  });
  const isKycVerified = verificationState === "verified";

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

  const avatarNode = (
    <Pressable
      onPress={onLogoPress}
      disabled={uploading}
      style={({ pressed }) => [
        styles.heroAvatarPressable,
        pressed && canEdit && { opacity: 0.9 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={canEdit ? "Change workspace logo" : `${orgName} workspace logo`}
    >
      <View style={styles.heroAvatarRing}>
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={styles.heroAvatarImage} />
        ) : (
          <PartyAvatar
            name={orgName}
            entityType="client"
            organizationImageUrl={logoStoragePath}
            size={62}
            shape="circle"
          />
        )}
      </View>
      {canEdit ? (
        <View style={styles.heroCameraBadge}>
          {uploading ? (
            <LoadingIndicator size="small" color={Theme.textOnPrimary} />
          ) : (
            <Camera size={10} color={Theme.textOnPrimary} strokeWidth={2.4} />
          )}
        </View>
      ) : null}
    </Pressable>
  );

  if (isNarrow) {
    // Mobile: compact horizontal strip
    return (
      <View style={[styles.hero, heroLocal.heroNarrow]}>
        <View style={styles.heroHexOverlay} pointerEvents="none" />
        <View style={heroLocal.narrowInner}>
          {avatarNode}
          <View style={heroLocal.narrowTextCol}>
            <View style={heroLocal.narrowNameRow}>
              <Text style={heroLocal.narrowName} numberOfLines={1}>{orgName}</Text>
              {isKycVerified ? (
                <BadgeCheck size={13} color={Theme.darkGreen} strokeWidth={2.2} />
              ) : null}
            </View>
            <OrgVerificationBadges
              state={verificationState}
              compact
              style={{ justifyContent: "flex-start", marginTop: 4 }}
            />
            <View style={heroLocal.narrowMeta}>
              <View style={styles.heroMetaItem}>
                <Building2 size={11} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={heroLocal.narrowMetaText}>{modelLabel}</Text>
              </View>
              <Text style={styles.heroStatDivider}>·</Text>
              <View style={styles.heroMetaItem}>
                <MapPin size={11} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={heroLocal.narrowMetaText}>{locationLabel}</Text>
              </View>
            </View>
            <View style={heroLocal.narrowStats}>
              <Text style={heroLocal.narrowStatText}>
                <Text style={heroLocal.narrowStatVal}>{totalConnections}</Text>
                <Text style={heroLocal.narrowStatLabel}> connections</Text>
              </Text>
              <Text style={styles.heroStatDivider}>·</Text>
              <Text style={heroLocal.narrowStatText}>
                <Text style={heroLocal.narrowStatVal}>{clientCount}</Text>
                <Text style={heroLocal.narrowStatLabel}> clients</Text>
              </Text>
              <Text style={styles.heroStatDivider}>·</Text>
              <Text style={heroLocal.narrowStatText}>
                <Text style={heroLocal.narrowStatVal}>{supplierCount}</Text>
                <Text style={heroLocal.narrowStatLabel}> suppliers</Text>
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onProfilePress}
            style={({ pressed }) => [heroLocal.narrowWelcome, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.heroUserRingSm}>
              {userAvatarUri ? (
                <Image source={{ uri: userAvatarUri }} style={styles.heroUserImageSm} />
              ) : (
                <PartyAvatar name={userDisplayName} avatarUrl={profile?.avatar_url ?? null} avatarSeed={profile?.avatar_seed ?? null} size={24} shape="circle" />
              )}
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.hero}>
      <View style={styles.heroHexOverlay} pointerEvents="none" />
      <View style={styles.heroInner}>
        {canGoBack ? (
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.heroBackCorner, pressed && { opacity: 0.85 }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={16} color={METRONIC.text} strokeWidth={2.4} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={onProfilePress}
          style={({ pressed }) => [styles.heroWelcomeCorner, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
          accessibilityLabel={`Welcome ${welcomeFirstName}`}
        >
          <View style={styles.heroWelcomeTextWrap}>
            <Sparkles size={11} color={METRONIC.link} strokeWidth={2.2} />
            <Text style={styles.heroWelcomeText}>
              Welcome, <Text style={styles.heroWelcomeName}>{welcomeFirstName}</Text>
            </Text>
          </View>
          <View style={styles.heroUserRingSm}>
            {userAvatarUri ? (
              <Image source={{ uri: userAvatarUri }} style={styles.heroUserImageSm} />
            ) : (
              <PartyAvatar name={userDisplayName} avatarUrl={profile?.avatar_url ?? null} avatarSeed={profile?.avatar_seed ?? null} size={24} shape="circle" />
            )}
          </View>
        </Pressable>

        <View style={styles.heroCenter}>
          {avatarNode}

          <View style={styles.heroNameRow}>
            <Text style={styles.heroName}>{orgName}</Text>
            {isKycVerified ? (
              <BadgeCheck size={15} color={Theme.darkGreen} strokeWidth={2.2} />
            ) : null}
          </View>
          <OrgVerificationBadges
            state={verificationState}
            compact
            style={{ marginTop: 6, marginBottom: 2 }}
          />

          <View style={styles.heroMetaRow}>
            <View style={styles.heroMetaItem}>
              <Building2 size={12} color={METRONIC.subtle} strokeWidth={2} />
              <Text style={styles.heroMetaText}>{modelLabel}</Text>
            </View>
            <View style={styles.heroMetaItem}>
              <MapPin size={12} color={METRONIC.subtle} strokeWidth={2} />
              <Text style={styles.heroMetaText}>{locationLabel}</Text>
            </View>
            <View style={styles.heroMetaItem}>
              <Mail size={12} color={METRONIC.subtle} strokeWidth={2} />
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
            <Text style={styles.heroLogoHint}>Tap logo to update workspace branding</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const heroLocal = StyleSheet.create({
  heroNarrow: {
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  narrowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 1,
  },
  narrowTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  narrowNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  narrowName: {
    fontSize: 14,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  narrowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  narrowMetaText: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.subtle,
  },
  narrowStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  narrowStatText: {
    fontSize: 10,
    color: METRONIC.subtle,
  },
  narrowStatVal: {
    fontWeight: "700",
    color: METRONIC.text,
  },
  narrowStatLabel: {
    fontWeight: "500",
    color: METRONIC.muted,
  },
  narrowWelcome: {
    flexShrink: 0,
  },
});
