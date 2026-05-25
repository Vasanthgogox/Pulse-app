/**
 * Left profile menu drawer — Slack-style: purple workspace header at top, personal identity pinned at bottom.
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
import type { WorkspacePanelId } from "@/features/organization/components/workspace/workspacePanelTypes";
import { ROUTES } from "@/lib/routes";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useRouter } from "expo-router";
import {
  Bell,
  Building2,
  ChevronRight,
  HelpCircle,
  LogOut,
  Settings,
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

// ─── Color tokens ────────────────────────────────────────────────────────────
const PURPLE_DARK = "#1a237e";
const PURPLE_MID = "#312e81";
const PURPLE_TINT = "rgba(26,35,126,0.08)";
const PURPLE_TEXT_ON_DARK = "#ffffff";
const PURPLE_MUTED_ON_DARK = "rgba(255,255,255,0.62)";

export interface ProfileMenuDrawerProps {
  visible: boolean;
  onClose: () => void;
}

type MenuRow = {
  id: string;
  label: string;
  icon: React.ReactNode;
  iconBg?: string;
  onPress: () => void;
  badge?: string;
};

function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0]![0] ?? "").toUpperCase();
  return ((words[0]![0] ?? "") + (words[words.length - 1]![0] ?? "")).toUpperCase();
}

function MenuRowItem({ row }: { row: MenuRow }) {
  return (
    <Pressable
      onPress={row.onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={row.label}
    >
      <View style={[styles.menuRowIcon, row.iconBg ? { backgroundColor: row.iconBg } : null]}>
        {row.icon}
      </View>
      <Text style={styles.menuRowLabel} numberOfLines={1}>
        {row.label}
      </Text>
      {row.badge ? (
        <View style={styles.menuRowBadge}>
          <Text style={styles.menuRowBadgeText}>{row.badge}</Text>
        </View>
      ) : null}
      <ChevronRight size={15} color={Theme.textMuted} strokeWidth={2} />
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
      style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.8 }]}
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

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [orgLogoUri, setOrgLogoUri] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = (profile?.full_name ?? profile?.displayName ?? "User").trim();
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const email = (user?.email ?? profile?.email ?? "").trim();
  const orgName = (currentOrganization?.name ?? profile?.company_name ?? "").trim();

  // Resolve personal avatar
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
    return () => { mounted = false; };
  }, [profile?.avatar_url, profile?.avatar_seed]);

  // Resolve org logo
  useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      const logoUrl = currentOrganization?.logo_url;
      if (!logoUrl?.trim()) {
        if (mounted) setOrgLogoUri(null);
        return;
      }
      if (logoUrl.startsWith("http")) {
        if (mounted) setOrgLogoUri(logoUrl);
        return;
      }
      const signed = await getSignedAvatarUrl(logoUrl.trim());
      if (mounted) setOrgLogoUri(signed);
    };
    void resolve();
    return () => { mounted = false; };
  }, [currentOrganization?.logo_url]);

  useEffect(() => {
    Animated.timing(slideX, {
      toValue: visible ? 0 : -panelWidth,
      duration: visible ? 240 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, panelWidth, slideX]);

  useEffect(() => {
    if (!visible && !signingOut) setShowSignOutConfirm(false);
  }, [visible, signingOut]);

  const navigate = (path: string) => {
    onClose();
    requestAnimationFrame(() => {
      router.push(path as Parameters<typeof router.push>[0]);
    });
  };

  const openWorkspace = (panel?: WorkspacePanelId) => {
    onClose();
    requestAnimationFrame(() => {
      router.push({
        pathname: ROUTES.WORKSPACE,
        params: panel ? { panel } : {},
      } as Parameters<typeof router.push>[0]);
    });
  };

  const workspaceRows: MenuRow[] = [
    {
      id: "workspace",
      label: "Workspace settings",
      icon: <Building2 size={17} color={PURPLE_DARK} strokeWidth={2.2} />,
      iconBg: PURPLE_TINT,
      onPress: () => openWorkspace("settings"),
    },
    {
      id: "team",
      label: "Team members",
      icon: <Users size={17} color={PURPLE_DARK} strokeWidth={2.2} />,
      iconBg: PURPLE_TINT,
      onPress: () => openWorkspace("team"),
    },
    {
      id: "org-settings",
      label: "Org identity & KYC",
      icon: <Settings size={17} color={PURPLE_DARK} strokeWidth={2.2} />,
      iconBg: PURPLE_TINT,
      onPress: () => openWorkspace("kyc"),
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
        { text: "Open chat", onPress: () => navigate(ROUTES.CHAT) },
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
              { width: panelWidth, transform: [{ translateX: slideX }] },
            ]}
          >
            {/* ── Workspace header (purple, pinned top) ── */}
            <Pressable
              onPress={() => openWorkspace()}
              style={[styles.orgHeader, { paddingTop: insets.top + 14 }]}
              accessibilityRole="button"
              accessibilityLabel="Open workspace settings"
            >
              {/* Gradient overlay effect via layered views */}
              <View style={styles.orgHeaderGradientOverlay} />

              <View style={styles.orgHeaderContent}>
                {orgLogoUri ? (
                  <Image source={{ uri: orgLogoUri }} style={styles.orgLogo} />
                ) : (
                  <View style={styles.orgLogoFallback}>
                    <Text style={styles.orgLogoInitials}>
                      {orgInitials(orgName || "Q")}
                    </Text>
                  </View>
                )}
                <View style={styles.orgHeaderText}>
                  <Text style={styles.orgHeaderMeta}>WORKSPACE</Text>
                  <Text style={styles.orgHeaderName} numberOfLines={1}>
                    {orgName || "My Organisation"}
                  </Text>
                </View>
                <ChevronRight size={16} color={PURPLE_MUTED_ON_DARK} strokeWidth={2} />
              </View>
            </Pressable>

            {/* ── Scrollable menu content ── */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.panelScroll}
              keyboardShouldPersistTaps="handled"
              style={styles.panelScrollView}
            >
              {/* Quick actions */}
              <View style={styles.quickRow}>
                <QuickAction
                  label="My Account"
                  icon={
                    <View style={styles.quickAvatarWrap}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.quickAvatar} />
                      ) : (
                        <Text style={styles.quickAvatarInitials}>
                          {firstName.slice(0, 2).toUpperCase()}
                        </Text>
                      )}
                    </View>
                  }
                  onPress={() => navigate(ROUTES.MY_ACCOUNT)}
                />
                <QuickAction
                  label="Support"
                  icon={<HelpCircle size={20} color={PURPLE_DARK} strokeWidth={2.2} />}
                  onPress={handleSupport}
                />
                <QuickAction
                  label="Alerts"
                  icon={<Bell size={20} color={PURPLE_DARK} strokeWidth={2.2} />}
                  onPress={() => navigate("/notifications")}
                  showDot={notificationUnread > 0}
                />
              </View>

              {/* Workspace section */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionAccent} />
                  <Text style={styles.sectionTitle}>Workspace</Text>
                </View>
                {workspaceRows.map((row) => (
                  <MenuRowItem key={row.id} row={row} />
                ))}
              </View>

            </ScrollView>

            {/* ── Personal identity footer (pinned bottom) ── */}
            <View style={[styles.userFooterWrap, { paddingBottom: insets.bottom + 6 }]}>
              <View style={styles.userFooterDivider} />
              <Pressable
                onPress={() => navigate(ROUTES.MY_ACCOUNT)}
                style={({ pressed }) => [styles.userFooter, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel="My account"
              >
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.userAvatar} />
                ) : (
                  <View style={styles.userAvatarFallback}>
                    <Text style={styles.userAvatarInitials}>
                      {firstName.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.userFooterText}>
                  <Text style={styles.userFooterName} numberOfLines={1}>{displayName}</Text>
                  <Text style={styles.userFooterEmail} numberOfLines={1}>{email || "—"}</Text>
                </View>
                <Pressable
                  onPress={() => void openSignOutConfirm()}
                  disabled={signingOut}
                  style={({ pressed }) => [
                    styles.signOutBtn,
                    pressed && styles.signOutBtnPressed,
                    signingOut && { opacity: 0.5 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                  hitSlop={8}
                >
                  {signingOut ? (
                    <LoadingIndicator size="small" color={Theme.textMuted} />
                  ) : (
                    <LogOut size={17} color={Theme.textMuted} strokeWidth={2.2} />
                  )}
                </Pressable>
              </Pressable>
            </View>
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
        <View style={styles.confirmBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSignOutConfirm} />
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconWrap}>
              <LogOut size={22} color={Theme.teslaRed} strokeWidth={2.2} />
            </View>
            <Text style={styles.confirmTitle}>Sign out</Text>
            <Text style={styles.confirmBody}>
              Are you sure you want to sign out of {orgName || "Pulse"}?
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={closeSignOutConfirm}
                style={({ pressed }) => [styles.confirmCancelBtn, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                disabled={signingOut}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmSignOut()}
                style={({ pressed }) => [
                  styles.confirmCtaBtn,
                  pressed && { opacity: 0.9 },
                  signingOut && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                disabled={signingOut}
              >
                <Text style={styles.confirmCtaText}>
                  {signingOut ? "Signing out…" : "Sign out"}
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
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    zIndex: 0,
  },
  panel: {
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 6, height: 0 },
    elevation: 14,
    flex: 1,
    flexDirection: "column",
    zIndex: 1,
  },

  // ── Workspace header ──────────────────────────────────────────────────
  orgHeader: {
    backgroundColor: PURPLE_DARK,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 18,
  },
  orgHeaderGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PURPLE_MID,
    opacity: 0.35,
  },
  orgHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  orgLogo: {
    width: 44,
    height: 44,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  orgLogoFallback: {
    width: 44,
    height: 44,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  orgLogoInitials: {
    fontSize: 16,
    fontWeight: "900",
    color: PURPLE_TEXT_ON_DARK,
    letterSpacing: 0.5,
  },
  orgHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  orgHeaderMeta: {
    fontSize: 9,
    fontWeight: "800",
    color: PURPLE_MUTED_ON_DARK,
    letterSpacing: 1.8,
  },
  orgHeaderName: {
    fontSize: 16,
    fontWeight: "800",
    color: PURPLE_TEXT_ON_DARK,
    letterSpacing: -0.2,
    lineHeight: 20,
  },

  // ── Scrollable area ────────────────────────────────────────────────────
  panelScrollView: {
    flex: 1,
  },
  panelScroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 14,
  },

  // Quick actions
  quickRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    paddingVertical: 4,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    gap: 7,
    minWidth: 0,
  },
  quickIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: PURPLE_TINT,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(26,35,126,0.12)",
  },
  quickDot: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.teslaRed,
    borderWidth: 1.5,
    borderColor: Theme.screenBackground,
  },
  quickLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    lineHeight: 14,
  },
  quickAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: PURPLE_TINT,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(26,35,126,0.12)",
  },
  quickAvatar: {
    width: "100%",
    height: "100%",
  },
  quickAvatarInitials: {
    fontSize: 15,
    fontWeight: "800",
    color: PURPLE_DARK,
  },

  // Section cards
  sectionCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: PURPLE_DARK,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    lineHeight: 14,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  menuRowPressed: {
    backgroundColor: Theme.surfaceGray,
  },
  menuRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.teslaRed,
  },
  menuRowBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },

  // ── Personal footer ────────────────────────────────────────────────────
  userFooterWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 6,
  },
  userFooterDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginBottom: 8,
  },
  userFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 2,
    borderColor: PURPLE_TINT,
  },
  userAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: PURPLE_TINT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(26,35,126,0.15)",
  },
  userAvatarInitials: {
    fontSize: 13,
    fontWeight: "800",
    color: PURPLE_DARK,
  },
  userFooterText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  userFooterName: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  userFooterEmail: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 14,
  },
  signOutBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  signOutBtnPressed: {
    backgroundColor: "rgba(232,33,39,0.08)",
    borderColor: "rgba(232,33,39,0.2)",
  },

  // ── Sign-out confirm ──────────────────────────────────────────────────
  confirmBackdrop: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.52)",
  },
  confirmCard: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 12,
    alignItems: "center",
  },
  confirmIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(232,33,39,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
    textAlign: "center",
  },
  confirmBody: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textSecondary,
    marginBottom: 18,
    textAlign: "center",
  },
  confirmActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  confirmCancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  confirmCtaBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.teslaRed,
  },
  confirmCtaText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});
