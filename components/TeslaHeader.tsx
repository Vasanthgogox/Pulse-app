/**
 * Unified mobile header style (aligned with Q-unified-base):
 * branded left lockup + contextual title/subtitle, and right utility cluster (escrow, bell, profile).
 */
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import Layout from "@/constants/Layout";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, TouchableOpacity, View, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/contexts/WalletContext";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { DEFAULT_USER_2D_AVATAR_SEED, getUser2DAvatarUriForSeed } from "@/constants/UserAvatars";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";

export interface TeslaHeaderProps {
  title: string;
  subtitle?: string;
  /** 'dark' = rich black header (default). 'default' = light background. */
  variant?: "default" | "dark";
  showBack?: boolean;
  onBack?: () => void;
  onLoadClick?: () => void;
  onNetworkClick?: () => void;
  onNotificationClick?: () => void;
  onProfileClick?: () => void;
  /** When set, shows a ledger/report (document) icon in the header corner. */
  onReportClick?: () => void;
  /** When true, parent already applied top safe area; use only 16pt top padding. */
  skipSafeAreaTop?: boolean;
  /** When true, hide globe, bell, profile (and other right-side icons). Use e.g. on Create Trip page only. */
  hideRightIcons?: boolean;
  /** When set, shows a plus button in the header (e.g. Add transaction). Renders at right end (after bell, profile). */
  onAddClick?: () => void;
}

const iconColor = (dark: boolean) =>
  dark ? Theme.textOnDark : Theme.textPrimaryDark;

export function TeslaHeader({
  title,
  subtitle,
  variant = "dark",
  showBack,
  onBack,
  onLoadClick,
  onNetworkClick,
  onNotificationClick,
  onProfileClick,
  onReportClick,
  skipSafeAreaTop = false,
  hideRightIcons = false,
  onAddClick,
}: TeslaHeaderProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const { balance } = useWallet();
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const resolveAvatar = async () => {
      if (!profile) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }
      if (profile.avatar_url?.startsWith("http")) {
        if (mounted) setProfileAvatarUri(profile.avatar_url);
        return;
      }
      if (profile.avatar_url?.trim()) {
        const signed = await getSignedAvatarUrl(profile.avatar_url.trim());
        if (mounted) setProfileAvatarUri(signed);
        return;
      }
      if (profile.avatar_seed?.trim()) {
        if (mounted) setProfileAvatarUri(getUser2DAvatarUriForSeed(profile.avatar_seed.trim()));
        return;
      }
      if (mounted) setProfileAvatarUri(getUser2DAvatarUriForSeed(DEFAULT_USER_2D_AVATAR_SEED));
    };
    void resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [profile?.avatar_url, profile?.avatar_seed]);

  const insets = useSafeAreaInsets();
  const isDark = variant === 'dark';
  const topPadding = skipSafeAreaTop ? 16 : insets.top + 16;
  const displayName = (profile?.full_name ?? profile?.displayName ?? "User").trim();
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
  const escrowFormatted = balance > 0 ? `₹${(balance / 1000).toFixed(1)}K` : "₹45.2K";
  const handleNotificationPress = () => {
    if (onNotificationClick) {
      onNotificationClick();
      return;
    }
    router.push("/notifications");
  };

  return (
    <View style={[styles.wrapper, isDark && styles.wrapperDark, { paddingTop: topPadding }]}>
      <View style={styles.left}>
        {showBack && (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            hitSlop={12}
          >
            <FontAwesome
              name="chevron-left"
              size={20}
              color={iconColor(isDark)}
            />
          </TouchableOpacity>
        )}
        <View style={[styles.logoBadge, isDark && styles.logoBadgeDark]}>
          <FontAwesome name="terminal" size={11} color={isDark ? Theme.textOnDark : Theme.textPrimaryDark} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={[styles.brandText, isDark && styles.brandTextDark]} numberOfLines={1}>
            Qu.
          </Text>
          <Text
            style={[styles.title, isDark && styles.titleDark]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
          {subtitle != null && (
            <Text
              style={[styles.subtitle, isDark && styles.subtitleDark]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {!hideRightIcons && (
      <View style={styles.icons}>
        <TouchableOpacity
          onPress={onLoadClick}
          style={[styles.escrowWrap, isDark && styles.escrowWrapDark]}
          hitSlop={8}
          disabled={onLoadClick == null}
          activeOpacity={0.85}
        >
          <Text style={[styles.escrowLabel, isDark && styles.escrowLabelDark]}>Escrow</Text>
          <Text style={styles.escrowValue}>{escrowFormatted}</Text>
        </TouchableOpacity>
        <View style={styles.iconWithDot}>
          <TouchableOpacity
            onPress={handleNotificationPress}
            style={styles.iconWrap}
            hitSlop={8}
          >
            <FontAwesome name="bell" size={16} color={iconColor(isDark)} />
          </TouchableOpacity>
          <View style={[styles.dot, isDark && styles.dotDark]} />
        </View>
        {onProfileClick ? (
          <TouchableOpacity
            onPress={onProfileClick}
            style={[styles.avatar, isDark && styles.avatarDark, profileAvatarUri ? styles.avatarWithImage : null]}
            hitSlop={8}
          >
            {profileAvatarUri ? (
              <Image source={{ uri: profileAvatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarInitials, isDark && styles.avatarInitialsDark]}>{initials}</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={[styles.avatar, isDark && styles.avatarDark, profileAvatarUri ? styles.avatarWithImage : null]}>
            {profileAvatarUri ? (
              <Image source={{ uri: profileAvatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarInitials, isDark && styles.avatarInitialsDark]}>{initials}</Text>
            )}
          </View>
        )}
        {onAddClick != null && (
          <TouchableOpacity
            onPress={onAddClick}
            style={[styles.addBtn, isDark && styles.addBtnDark]}
            hitSlop={8}
            accessibilityLabel="Add"
            accessibilityRole="button"
          >
            <FontAwesome name="plus" size={16} color={Theme.textOnPrimary} />
          </TouchableOpacity>
        )}
        {onNetworkClick != null && (
          <TouchableOpacity
            onPress={onNetworkClick}
            style={styles.iconWrap}
            hitSlop={8}
          >
            <FontAwesome name="globe" size={14} color={iconColor(isDark)} />
          </TouchableOpacity>
        )}
        {onReportClick != null && (
          <TouchableOpacity
            onPress={onReportClick}
            style={styles.iconWrap}
            hitSlop={8}
          >
            <FontAwesome name="file-text" size={14} color={iconColor(isDark)} />
          </TouchableOpacity>
        )}
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  wrapperDark: {
    backgroundColor: Theme.darkBackground,
    borderBottomColor: Theme.separatorDark,
  },
  logoBadge: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceForm,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginRight: 8,
  },
  logoBadgeDark: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.separatorDark,
  },
  brandText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.2,
    fontStyle: "italic",
    marginBottom: 1,
  },
  brandTextDark: {
    color: Theme.textOnDark,
  },
  titleDark: { color: Theme.textOnDark },
  subtitleDark: {
    color: Theme.textSecondary,
    marginTop: 2,
    ...Typography.headerSubtitle,
  },
  dotDark: { borderColor: Theme.darkBackground },
  avatarDark: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.separatorDark,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...Typography.headerSubtitle,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontWeight: "800",
  },
  subtitle: {
    ...Typography.headerSubtitle,
    color: Theme.textMutedDemo,
    marginTop: 2,
  },
  icons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  escrowWrap: {
    flexDirection: "column",
    alignItems: "flex-end",
    justifyContent: "center",
    backgroundColor: Theme.surfaceForm,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  escrowWrapDark: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.separatorDark,
  },
  escrowLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMutedDemo,
  },
  escrowLabelDark: {
    color: Theme.textSecondary,
  },
  escrowValue: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    color: Theme.primary,
    marginTop: 1,
  },
  iconWrap: {
    padding: 4,
  },
  iconWithDot: {
    position: "relative",
  },
  dot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.teslaRed,
    borderWidth: 1.5,
    borderColor: Theme.screenBackground,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWithImage: {
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
  },
  avatarInitials: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  avatarInitialsDark: {
    color: Theme.textOnDark,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnDark: {
    backgroundColor: Theme.darkBackground,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
});
