/**
 * Left profile menu drawer (reference: compact MMT-style account panel).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { ROUTES } from "@/lib/routes";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useRouter } from "expo-router";
import {
  Bell,
  ChevronRight,
  FileText,
  HelpCircle,
  LogOut,
  Settings,
  Shield,
  User,
  Users,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface ProfileMenuDrawerProps {
  visible: boolean;
  onClose: () => void;
}

type MenuRow = {
  id: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  badge?: string;
};

function MenuRowItem({ row }: { row: MenuRow }) {
  return (
    <Pressable
      onPress={row.onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={row.label}
    >
      <View style={styles.menuRowIcon}>{row.icon}</View>
      <Text style={styles.menuRowLabel} numberOfLines={1}>
        {row.label}
      </Text>
      {row.badge ? (
        <View style={styles.menuRowBadge}>
          <Text style={styles.menuRowBadgeText}>{row.badge}</Text>
        </View>
      ) : null}
      <ChevronRight size={14} color={Theme.textMuted} strokeWidth={2.2} />
    </Pressable>
  );
}

function QuickAction({
  label,
  icon,
  onPress,
  showDot,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  showDot?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.menuRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.quickIconWrap}>
        {icon}
        {showDot ? <View style={styles.quickDot} /> : null}
      </View>
      <Text style={styles.quickLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ProfileMenuDrawer({ visible, onClose }: ProfileMenuDrawerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { user, profile, signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const notificationUnread = useGlobalSyncStore((s) => s.notificationUnreadCount);
  const panelWidth = Math.min(screenWidth * 0.78, 300);
  const slideX = useRef(new Animated.Value(-panelWidth)).current;

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = (profile?.full_name ?? profile?.displayName ?? "User").trim();
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const email = (user?.email ?? profile?.email ?? "").trim();
  const orgName = (currentOrganization?.name ?? profile?.company_name ?? "").trim();
  const roleLabel = profile?.aggregated ? "Dispatcher + Fleet Owner" : "Fleet User";

  useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      if (!profile) {
        if (mounted) setAvatarUri(null);
        return;
      }
      if (profile.avatar_url?.startsWith("http")) {
        if (mounted) setAvatarUri(profile.avatar_url);
        return;
      }
      if (profile.avatar_url?.trim()) {
        const signed = await getSignedAvatarUrl(profile.avatar_url.trim());
        if (mounted) setAvatarUri(signed);
        return;
      }
      if (profile.avatar_seed?.trim()) {
        if (mounted) setAvatarUri(getUser2DAvatarUriForSeed(profile.avatar_seed.trim()));
        return;
      }
      if (mounted) setAvatarUri(getUser2DAvatarUriForSeed(DEFAULT_USER_2D_AVATAR_SEED));
    };
    void resolve();
    return () => {
      mounted = false;
    };
  }, [profile?.avatar_url, profile?.avatar_seed]);

  useEffect(() => {
    Animated.timing(slideX, {
      toValue: visible ? 0 : -panelWidth,
      duration: visible ? 240 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, panelWidth, slideX]);

  const navigate = (path: string) => {
    onClose();
    requestAnimationFrame(() => {
      router.push(path as Parameters<typeof router.push>[0]);
    });
  };

  const workspaceRows: MenuRow[] = [
    {
      id: "team",
      label: "Team members",
      icon: <Users size={15} color={Theme.textSecondary} strokeWidth={2.2} />,
      onPress: () => navigate(ROUTES.MODALS.TEAM),
    },
    {
      id: "branding",
      label: "Branding & identity",
      icon: <Settings size={15} color={Theme.textSecondary} strokeWidth={2.2} />,
      onPress: () => navigate("/branding-settings"),
    },
    {
      id: "role",
      label: "Role & access",
      icon: <Shield size={15} color={Theme.textSecondary} strokeWidth={2.2} />,
      onPress: () => navigate(ROUTES.TABS.PROFILE),
    },
  ];

  const operationsRows: MenuRow[] = [
    {
      id: "pod",
      label: "Proof of delivery",
      icon: <FileText size={15} color={Theme.textSecondary} strokeWidth={2.2} />,
      onPress: () => navigate("/pod-reconciliation"),
    },
    {
      id: "invoice",
      label: "Invoicing",
      icon: <FileText size={15} color={Theme.textSecondary} strokeWidth={2.2} />,
      onPress: () => navigate("/invoicing-execute"),
    },
  ];

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSigningOut(true);
            try {
              onClose();
              await signOut();
              router.replace(ROUTES.SIGN_IN_DIRECT);
            } finally {
              setSigningOut(false);
            }
          })();
        },
      },
    ]);
  };

  const handleSupport = () => {
    Alert.alert(
      "Support",
      "Reach your operations team from Pulse chat or email your account manager.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open chat",
          onPress: () => navigate(ROUTES.CHAT),
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        />
        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 12,
              transform: [{ translateX: slideX }],
            },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.panelScroll}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              onPress={() => navigate(ROUTES.TABS.PROFILE)}
              style={({ pressed }) => [styles.heroCard, pressed && styles.menuRowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Open full profile"
            >
              <View style={styles.heroRow}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.heroAvatar} />
                ) : (
                  <View style={styles.heroAvatarFallback}>
                    <Text style={styles.heroAvatarInitials}>
                      {firstName.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.heroText}>
                  <Text style={styles.heroGreeting} numberOfLines={1}>
                    Hi {firstName}
                  </Text>
                  <Text style={styles.heroEmail} numberOfLines={1}>
                    {email || "—"}
                  </Text>
                  {orgName ? (
                    <Text style={styles.heroOrg} numberOfLines={1}>
                      {orgName}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight size={16} color={Theme.textMuted} strokeWidth={2.2} />
              </View>
            </Pressable>

            {orgName ? (
              <Pressable
                onPress={() => navigate(ROUTES.TABS.NETWORK)}
                style={({ pressed }) => [styles.promoCard, pressed && styles.menuRowPressed]}
              >
                <View style={styles.promoInner}>
                  <Text style={styles.promoTitle} numberOfLines={1}>
                    Grow your network
                  </Text>
                  <Text style={styles.promoSub} numberOfLines={2}>
                    Connect with verified partners on Home
                  </Text>
                </View>
                <ChevronRight size={14} color={Theme.textMuted} strokeWidth={2.2} />
              </Pressable>
            ) : null}

            <View style={styles.quickRow}>
              <QuickAction
                label="My account"
                icon={<User size={16} color={Theme.primary} strokeWidth={2.2} />}
                onPress={() => navigate(ROUTES.TABS.PROFILE)}
              />
              <QuickAction
                label="Support"
                icon={<HelpCircle size={16} color={Theme.primary} strokeWidth={2.2} />}
                onPress={handleSupport}
              />
              <QuickAction
                label="Alerts"
                icon={<Bell size={16} color={Theme.primary} strokeWidth={2.2} />}
                onPress={() => navigate("/notifications")}
                showDot={notificationUnread > 0}
              />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Workspace</Text>
              {workspaceRows.map((row) => (
                <MenuRowItem key={row.id} row={row} />
              ))}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Operations</Text>
              {operationsRows.map((row) => (
                <MenuRowItem key={row.id} row={row} />
              ))}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Account</Text>
              <View style={styles.accountMeta}>
                <Text style={styles.accountMetaLabel}>Signed in as</Text>
                <Text style={styles.accountMetaValue} numberOfLines={1}>
                  {roleLabel}
                </Text>
              </View>
              <Pressable
                onPress={handleSignOut}
                disabled={signingOut}
                style={({ pressed }) => [
                  styles.signOutRow,
                  pressed && styles.menuRowPressed,
                  signingOut && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
              >
                {signingOut ? (
                  <LoadingIndicator size="small" color={Theme.negative} />
                ) : (
                  <LogOut size={15} color={Theme.negative} strokeWidth={2.2} />
                )}
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  panel: {
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 4, height: 0 },
    elevation: 12,
    maxHeight: "100%",
  },
  panelScroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 10,
    paddingBottom: 8,
  },
  heroCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fbbf2440",
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  heroAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarInitials: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  heroGreeting: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  heroEmail: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  heroOrg: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginTop: 1,
  },
  promoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  promoInner: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  promoTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  promoSub: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 11,
  },
  quickRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
    paddingVertical: 4,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  quickIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Theme.primary}12`,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  quickDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.teslaRed,
    borderWidth: 1,
    borderColor: Theme.screenBackground,
  },
  quickLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  menuRowPressed: {
    opacity: 0.88,
    backgroundColor: Theme.surfaceGray,
  },
  menuRowIcon: {
    width: 22,
    alignItems: "center",
  },
  menuRowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  menuRowBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.teslaRed,
  },
  menuRowBadgeText: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  accountMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  accountMetaLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  accountMetaValue: {
    flex: 1,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  signOutText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.negative,
  },
});
