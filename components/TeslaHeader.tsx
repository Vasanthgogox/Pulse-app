/**
 * Unified mobile header style (aligned with pulse-unified-base):
 * branded left lockup + contextual title/subtitle, and right utility cluster (bell, profile).
 */
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import Layout from "@/constants/Layout";
import { PulseBrandMark } from "@/components/brand/PulseBrandMark";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, TouchableOpacity, View, Image, type TextStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
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
  /** Trip / command chat — e.g. open org trip thread from trip details. Renders before the notification bell. */
  onChatClick?: () => void;
  /** Compliance & Documents Center — opens the central document-intelligence hub. Renders just before the notification bell, after `onChatClick`. */
  onDocumentsClick?: () => void;
  /** Hide the small square icon badge before the brand/title block. */
  hideLogoBadge?: boolean;
  /** Hide bell + unread dot (e.g. when already on the notifications screen). */
  hideNotificationBell?: boolean;
  /** Optional per-screen override for title text style. */
  titleTextStyle?: TextStyle;
  /** Optional per-screen override for subtitle text style. */
  subtitleTextStyle?: TextStyle;
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
  onChatClick,
  onDocumentsClick,
  hideLogoBadge = false,
  hideNotificationBell = false,
  titleTextStyle,
  subtitleTextStyle,
}: TeslaHeaderProps) {
  const router = useRouter();
  const { profile } = useAuth();
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
        {!hideLogoBadge && (
          <View style={[styles.logoBadge, isDark && styles.logoBadgeDark]}>
            <FontAwesome name="terminal" size={11} color={isDark ? Theme.textOnDark : Theme.textPrimaryDark} />
          </View>
        )}
        <View style={styles.titleBlock}>
          <PulseBrandMark
            size="xs"
            variant={isDark ? 'onDark' : 'ink'}
            numberOfLines={1}
          />
          <Text
            style={[styles.title, isDark && styles.titleDark, titleTextStyle]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
          {subtitle != null && (
            <Text
              style={[styles.subtitle, isDark && styles.subtitleDark, subtitleTextStyle]}
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
        {onChatClick != null && (
          <TouchableOpacity
            onPress={onChatClick}
            style={styles.iconWrap}
            hitSlop={8}
            accessibilityLabel="Open trip chat"
            accessibilityRole="button"
          >
            <FontAwesome name="comments" size={16} color={iconColor(isDark)} />
          </TouchableOpacity>
        )}
        {onDocumentsClick != null && (
          <TouchableOpacity
            onPress={onDocumentsClick}
            style={styles.iconWrap}
            hitSlop={8}
            accessibilityLabel="Open documents center"
            accessibilityRole="button"
          >
            <FontAwesome name="folder-open" size={16} color={iconColor(isDark)} />
          </TouchableOpacity>
        )}
        {!hideNotificationBell && (
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
        )}
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceForm,
    marginRight: 8,
  },
  logoBadgeDark: {
    backgroundColor: Theme.darkBackground,
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
    backgroundColor: Theme.teslaRed,
  },
  avatar: {
    width: 28,
    height: 28,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWithImage: {
    backgroundColor: "transparent",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
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
    backgroundColor: Theme.buttonPrimary,
    borderRadius: Theme.buttonPrimaryRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnDark: {
    backgroundColor: Theme.darkBackground,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
});
