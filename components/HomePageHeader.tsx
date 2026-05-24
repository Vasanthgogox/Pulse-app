/**
 * Home / Network top bar — profile, invitations, notifications (compact).
 */
import {
  AnimatedBellHeaderIcon,
  AnimatedInboxHeaderIcon,
} from "@/components/HomeHeaderAnimatedIcons";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useProfileMenuDrawerOptional } from "@/contexts/ProfileMenuDrawerContext";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useAvatar, DEFAULT_USER_2D_AVATAR_SEED } from "@/lib/useAvatar";
import { ChevronLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { AvatarImageOrInitials } from "@/components/AvatarImageOrInitials";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ICON_SIZE = 22;

export interface HomePageHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  onProfilePress?: () => void;
  onInvitationsPress?: () => void;
  onNotificationsPress?: () => void;
  invitationBadgeCount?: number;
  skipSafeAreaTop?: boolean;
  style?: StyleProp<ViewStyle>;
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

export function HomePageHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  onProfilePress,
  onInvitationsPress,
  onNotificationsPress,
  invitationBadgeCount = 0,
  skipSafeAreaTop = false,
  style,
}: HomePageHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const { currentOrganization } = useOrganization();
  const profileDrawer = useProfileMenuDrawerOptional();
  const notificationUnread = useGlobalSyncStore((s) => s.notificationUnreadCount);

  const profileDisplayName = (
    profile?.full_name ??
    profile?.displayName ??
    user?.email?.split("@")[0] ??
    "User"
  ).trim();

  const { imageUri: profileAvatarUri, initials, initialsColor } = useAvatar({
    type: 'user',
    name: profileDisplayName,
    avatarUrl: profile?.avatar_url ?? null,
    avatarSeed: profile?.avatar_seed?.trim() || DEFAULT_USER_2D_AVATAR_SEED,
  });

  const welcomeName = useMemo(() => {
    const first = profileDisplayName.split(/\s+/).filter(Boolean)[0];
    const raw = first || profileDisplayName;
    if (!raw) return "there";
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }, [profileDisplayName]);

  const headerTitle = (
    title?.trim() ||
    currentOrganization?.name?.trim() ||
    profile?.company_name?.trim() ||
    "Network"
  ).toUpperCase();

  const headerSubtitle =
    subtitle !== undefined ? subtitle.trim() : `Welcome ${welcomeName}`;
  const topPad = skipSafeAreaTop ? 4 : insets.top + 4;
  const hasInviteBadge = invitationBadgeCount > 0;
  const hasNotifBadge = notificationUnread > 0;

  const handleProfile = () => {
    if (onProfilePress) {
      onProfilePress();
      return;
    }
    if (profileDrawer) {
      profileDrawer.open();
      return;
    }
    router.push("/(tabs)/profile");
  };

  const handleInvitations = () => {
    if (onInvitationsPress) onInvitationsPress();
  };

  const handleNotifications = () => {
    if (onNotificationsPress) {
      onNotificationsPress();
      return;
    }
    router.push("/notifications");
  };

  return (
    <View style={[styles.wrap, { paddingTop: topPad }, style]}>
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <ChevronLeft size={20} color={Theme.textPrimaryDark} strokeWidth={2.4} />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleProfile}
            style={({ pressed }) => [styles.avatarBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            hitSlop={6}
          >
            <AvatarImageOrInitials
              uri={profileAvatarUri}
              initials={initials}
              initialsColor={initialsColor}
              containerStyle={styles.avatarBtn}
              imageStyle={styles.avatarImage}
              textStyle={styles.avatarInitials}
            />
          </Pressable>
        )}

        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {headerTitle}
          </Text>
          {headerSubtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={handleInvitations}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Manage invitations"
            hitSlop={6}
          >
            <AnimatedInboxHeaderIcon size={ICON_SIZE} active={hasInviteBadge} />
            <Badge count={invitationBadgeCount} />
          </Pressable>
          <Pressable
            onPress={handleNotifications}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            hitSlop={6}
          >
            <AnimatedBellHeaderIcon size={ICON_SIZE} active={hasNotifBadge} />
            <Badge count={notificationUnread} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 6,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
    backgroundColor: Theme.surfaceGray,
    flexShrink: 0,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  avatarInitials: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  title: {
    ...Typography.headerTitle,
    color: Theme.textPrimaryDark,
    lineHeight: 14,
  },
  subtitle: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
    lineHeight: 12,
    letterSpacing: 0.15,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.94 }],
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    borderRadius: 7,
    backgroundColor: Theme.teslaRed,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Theme.screenBackground,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
});
