/**
 * Unified mobile header style (aligned with Q-unified-base):
 * branded left lockup + contextual title/subtitle, and right utility cluster (bell, profile).
 */
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import Layout from "@/constants/Layout";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, TouchableOpacity, View, Image, type TextStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useAvatar, DEFAULT_USER_2D_AVATAR_SEED } from "@/lib/useAvatar";
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
  hideLogoBadge = false,
  hideNotificationBell = false,
  titleTextStyle,
  subtitleTextStyle,
}: TeslaHeaderProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const isDark = variant === 'dark';
  const topPadding = skipSafeAreaTop ? 16 : insets.top + 16;
  const displayName = (profile?.full_name ?? profile?.displayName ?? "User").trim();

  const { imageUri: profileAvatarUri, initials } = useAvatar({
    type: 'user',
    name: displayName,
    avatarUrl: profile?.avatar_url ?? null,
    avatarSeed: profile?.avatar_seed?.trim() || DEFAULT_USER_2D_AVATAR_SEED,
  });
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
          <Text style={[styles.brandText, isDark && styles.brandTextDark]} numberOfLines={1}>
            Qu.
          </Text>
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
