/**
 * Home / Network top bar — profile, invitations, notifications (compact).
 */
import {
  AnimatedBellHeaderIcon,
  AnimatedInboxHeaderIcon,
} from "@/components/HomeHeaderAnimatedIcons";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { ROUTES } from "@/lib/routes";
import { ChevronLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ICON_SIZE = 26;

export interface HomePageHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  onProfilePress?: () => void;
  onInvitationsPress?: () => void;
  onNotificationsPress?: () => void;
  /** Compliance & Documents Center — defaults to routing `/documents-center`. */
  onDocumentsPress?: () => void;
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
  onDocumentsPress,
  invitationBadgeCount = 0,
  skipSafeAreaTop = false,
  style,
}: HomePageHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const { currentOrganization } = useOrganization();
  const notificationUnread = useGlobalSyncStore((s) => s.notificationUnreadCount);
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
        if (mounted)
          setProfileAvatarUri(getUser2DAvatarUriForSeed(profile.avatar_seed.trim()));
        return;
      }
      if (mounted)
        setProfileAvatarUri(getUser2DAvatarUriForSeed(DEFAULT_USER_2D_AVATAR_SEED));
    };
    void resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [profile?.avatar_url, profile?.avatar_seed]);

  const profileDisplayName = (
    profile?.full_name ??
    profile?.displayName ??
    user?.email?.split("@")[0] ??
    "User"
  ).trim();

  const welcomeName = useMemo(() => {
    const first = profileDisplayName.split(/\s+/).filter(Boolean)[0];
    const raw = first || profileDisplayName;
    if (!raw) return "there";
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }, [profileDisplayName]);

  const initials = useMemo(
    () =>
      profileDisplayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "US",
    [profileDisplayName],
  );

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
    router.push(ROUTES.WORKSPACE as Parameters<typeof router.push>[0]);
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

  const handleDocuments = () => {
    if (onDocumentsPress) {
      onDocumentsPress();
      return;
    }
    router.push(ROUTES.DOCUMENTS_CENTER as Parameters<typeof router.push>[0]);
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
            {profileAvatarUri ? (
              <Image source={{ uri: profileAvatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
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
            onPress={handleDocuments}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open documents center"
            hitSlop={6}
          >
            <FontAwesome
              name="folder-open"
              size={ICON_SIZE - 6}
              color={Theme.textPrimaryDark}
            />
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
    gap: 10,
    minHeight: 44,
  },
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: 14,
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
    fontSize: 13,
    color: Theme.textPrimaryDark,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 2,
    lineHeight: 14,
    letterSpacing: 0.1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  iconBtn: {
    width: 42,
    height: 42,
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
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: Theme.teslaRed,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Theme.screenBackground,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
});
