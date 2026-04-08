/**
 * Tesla-style header: title, subtitle, optional back; right: Layers (Load Board), Globe, Bell, Avatar.
 * Matches Canvas reference. Theme only.
 */
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import Layout from "@/constants/Layout";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
const mutedColor = (dark: boolean) =>
  dark ? Theme.textSecondary : Theme.textMutedDemo;

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
  const insets = useSafeAreaInsets();
  const isDark = variant === 'dark';
  const topPadding = skipSafeAreaTop ? 16 : insets.top + 16;

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
        <View style={styles.titleBlock}>
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
        <View style={styles.iconWithDot}>
          <TouchableOpacity
            onPress={onNotificationClick}
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
            style={[styles.avatar, isDark && styles.avatarDark]}
            hitSlop={8}
          >
            <FontAwesome name="user" size={12} color={mutedColor(isDark)} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.avatar, isDark && styles.avatarDark]}>
            <FontAwesome name="user" size={12} color={mutedColor(isDark)} />
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
  titleDark: { color: Theme.textOnDark },
  subtitleDark: {
    color: Theme.textSecondary,
    marginTop: 1,
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
    ...Typography.headerTitle,
    color: Theme.textPrimaryDark,
  },
  subtitle: {
    ...Typography.headerSubtitle,
    color: Theme.textMutedDemo,
    marginTop: 2,
  },
  icons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
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
