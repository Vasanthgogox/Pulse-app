/**
 * Left profile menu drawer (reference: compact MMT-style account panel).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ROUTES } from "@/lib/routes";
import { useAvatar } from "@/lib/useAvatar";
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
      <ChevronRight size={16} color={Theme.textMuted} strokeWidth={2.2} />
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
  const panelWidth = Math.min(screenWidth * 0.84, 340);
  const slideX = useRef(new Animated.Value(-panelWidth)).current;

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = (profile?.full_name ?? profile?.displayName ?? "User").trim();
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const email = (user?.email ?? profile?.email ?? "").trim();
  const orgName = (currentOrganization?.name ?? profile?.company_name ?? "").trim();
  const roleLabel = profile?.aggregated ? "Dispatcher + Fleet Owner" : "Fleet User";

  const { imageUri: avatarUri, initials: avatarInitials } = useAvatar({
    type: 'user',
    name: displayName,
    avatarUrl: profile?.avatar_url ?? null,
  });

  useEffect(() => {
    Animated.timing(slideX, {
      toValue: visible ? 0 : -panelWidth,
      duration: visible ? 240 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, panelWidth, slideX]);

  useEffect(() => {
    if (!visible && !signingOut) {
      setShowSignOutConfirm(false);
    }
  }, [visible, signingOut]);

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
      icon: <Users size={18} color={Theme.textSecondary} strokeWidth={2.2} />,
      onPress: () => navigate(ROUTES.MODALS.TEAM),
    },
    {
      id: "branding",
      label: "Branding & identity",
      icon: <Settings size={18} color={Theme.textSecondary} strokeWidth={2.2} />,
      onPress: () => navigate("/branding-settings"),
    },
    {
      id: "role",
      label: "Role & access",
      icon: <Shield size={18} color={Theme.textSecondary} strokeWidth={2.2} />,
      onPress: () => navigate(ROUTES.TABS.PROFILE),
    },
  ];

  const operationsRows: MenuRow[] = [
    {
      id: "pod",
      label: "Proof of delivery",
      icon: <FileText size={18} color={Theme.textSecondary} strokeWidth={2.2} />,
      onPress: () => navigate("/pod-reconciliation"),
    },
    {
      id: "invoice",
      label: "Invoicing",
      icon: <FileText size={18} color={Theme.textSecondary} strokeWidth={2.2} />,
      onPress: () => navigate("/invoicing-execute"),
    },
  ];

  const openSignOutConfirm = () => {
    if (signingOut) return;
    setShowSignOutConfirm(true);
  };

  const closeSignOutConfirm = () => {
    if (signingOut) return;
    setShowSignOutConfirm(false);
  };

  const confirmSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      setShowSignOutConfirm(false);
      onClose();
      await signOut();
      router.replace(ROUTES.SIGN_IN_DIRECT as Parameters<typeof router.replace>[0]);
    } catch {
      Alert.alert("Sign out failed", "Please try again.");
    } finally {
      setSigningOut(false);
    }
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
    <>
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
                zIndex: 2,
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
                    <Text style={styles.heroAvatarInitials}>{avatarInitials}</Text>
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
                <ChevronRight size={18} color={Theme.textMuted} strokeWidth={2.2} />
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
                <ChevronRight size={16} color={Theme.textMuted} strokeWidth={2.2} />
              </Pressable>
            ) : null}

            <View style={styles.quickRow}>
              <QuickAction
                label="My account"
                icon={<User size={18} color={Theme.primary} strokeWidth={2.2} />}
                onPress={() => navigate(ROUTES.TABS.PROFILE)}
              />
              <QuickAction
                label="Support"
                icon={<HelpCircle size={18} color={Theme.primary} strokeWidth={2.2} />}
                onPress={handleSupport}
              />
              <QuickAction
                label="Alerts"
                icon={<Bell size={18} color={Theme.primary} strokeWidth={2.2} />}
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
                onPress={() => void openSignOutConfirm()}
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
                  <LogOut size={18} color={Theme.negative} strokeWidth={2.2} />
                )}
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>
          </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={showSignOutConfirm}
        transparent
        animationType="fade"
        onRequestClose={closeSignOutConfirm}
        statusBarTranslucent
      >
        <View style={styles.signOutConfirmBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSignOutConfirm} />
          <View style={styles.signOutConfirmCard}>
            <Text style={styles.signOutConfirmTitle}>Sign out</Text>
            <Text style={styles.signOutConfirmBody}>
              Are you sure you want to sign out?
            </Text>
            <View style={styles.signOutConfirmActions}>
              <Pressable
                onPress={closeSignOutConfirm}
                style={({ pressed }) => [
                  styles.signOutConfirmCancelBtn,
                  pressed && styles.signOutConfirmCancelBtnPressed,
                ]}
                accessibilityRole="button"
                disabled={signingOut}
              >
                <Text style={styles.signOutConfirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmSignOut()}
                style={({ pressed }) => [
                  styles.signOutConfirmCtaBtn,
                  pressed && styles.signOutConfirmCtaBtnPressed,
                  signingOut && styles.signOutConfirmCtaBtnDisabled,
                ]}
                accessibilityRole="button"
                disabled={signingOut}
              >
                <Text style={styles.signOutConfirmCtaText}>
                  {signingOut ? "Signing out..." : "Sign out"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
    zIndex: 0,
  },
  panel: {
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 4, height: 0 },
    elevation: 12,
    maxHeight: "100%",
    zIndex: 1,
  },
  panelScroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 12,
    paddingBottom: 10,
  },
  heroCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.warningMuted,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
  },
  heroAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  heroAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarInitials: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: "center",
  },
  heroGreeting: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  heroEmail: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 16,
  },
  heroOrg: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  promoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 52,
  },
  promoInner: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: "center",
  },
  promoTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
  promoSub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 15,
  },
  quickRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 6,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  quickIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    lineHeight: 14,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    lineHeight: 14,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  menuRowPressed: {
    opacity: 0.88,
    backgroundColor: Theme.surfaceGray,
  },
  menuRowIcon: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  menuRowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  menuRowBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.teslaRed,
  },
  menuRowBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  accountMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  accountMetaLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 16,
  },
  accountMetaValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    lineHeight: 16,
  },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.negative,
    lineHeight: 18,
  },
  signOutConfirmBackdrop: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    justifyContent: "center",
    backgroundColor: Theme.overlayBackdrop,
  },
  signOutConfirmCard: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
  },
  signOutConfirmTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  signOutConfirmBody: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textSecondary,
    marginBottom: 14,
  },
  signOutConfirmActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  signOutConfirmCancelBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 16,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.backgroundInput,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  signOutConfirmCancelBtnPressed: {
    backgroundColor: Theme.surfaceGray,
  },
  signOutConfirmCancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  signOutConfirmCtaBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 18,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.teslaRed,
  },
  signOutConfirmCtaBtnPressed: {
    opacity: 0.9,
  },
  signOutConfirmCtaBtnDisabled: {
    opacity: 0.7,
  },
  signOutConfirmCtaText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnDark,
  },
});
