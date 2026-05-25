/**
 * Full-page workspace hub — same menu as ProfileMenuDrawer, without slide-over chrome.
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
import type { WorkspacePanelId } from "@/features/organization/components/workspace/workspacePanelTypes";
import { useRouter } from "expo-router";
import {
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  LogOut,
  Settings,
  Users,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PURPLE_DARK = "#1a237e";
const PURPLE_MID = "#312e81";
const PURPLE_TINT = "rgba(26,35,126,0.08)";
const PURPLE_MUTED_ON_DARK = "rgba(255,255,255,0.62)";

function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0]![0] ?? "").toUpperCase();
  return ((words[0]![0] ?? "") + (words[words.length - 1]![0] ?? "")).toUpperCase();
}

type HubRow = {
  id: WorkspacePanelId;
  label: string;
  icon: React.ReactNode;
};

type Props = {
  activePanel: WorkspacePanelId | null;
  onSelectPanel: (panel: WorkspacePanelId) => void;
  onExit?: () => void;
};

export function WorkspaceHubMenu({ activePanel, onSelectPanel, onExit }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const notificationUnread = useGlobalSyncStore((s) => s.notificationUnreadCount);

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [orgLogoUri, setOrgLogoUri] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = (profile?.full_name ?? profile?.displayName ?? "User").trim();
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const email = (user?.email ?? profile?.email ?? "").trim();
  const orgName = (currentOrganization?.name ?? profile?.company_name ?? "").trim();

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
    return () => {
      mounted = false;
    };
  }, [currentOrganization?.logo_url]);

  const rows: HubRow[] = [
    {
      id: "settings",
      label: "Workspace settings",
      icon: <Building2 size={17} color={PURPLE_DARK} strokeWidth={2.2} />,
    },
    {
      id: "team",
      label: "Team members",
      icon: <Users size={17} color={PURPLE_DARK} strokeWidth={2.2} />,
    },
    {
      id: "kyc",
      label: "Org identity & KYC",
      icon: <Settings size={17} color={PURPLE_DARK} strokeWidth={2.2} />,
    },
  ];

  const navigate = (path: string) => {
    router.push(path as Parameters<typeof router.push>[0]);
  };

  return (
    <>
      <View style={styles.root}>
        <View style={[styles.orgHeader, { paddingTop: insets.top + 10 }]}>
          <View style={styles.orgHeaderGradientOverlay} />
          {onExit ? (
            <Pressable onPress={onExit} style={styles.exitBtn} hitSlop={8}>
              <ChevronLeft size={20} color={PURPLE_MUTED_ON_DARK} strokeWidth={2.5} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => onSelectPanel("settings")}
            style={styles.orgHeaderContent}
            accessibilityRole="button"
            accessibilityLabel="Open workspace settings"
          >
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
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.quickRow}>
            <Pressable
              style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
              onPress={() => navigate(ROUTES.MY_ACCOUNT)}
            >
              <View style={styles.quickAvatarWrap}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.quickAvatar} />
                ) : (
                  <Text style={styles.quickAvatarInitials}>
                    {firstName.slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </View>
              <Text style={styles.quickLabel}>My Account</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
              onPress={() =>
                Alert.alert(
                  "Support",
                  "Reach your operations team from Pulse chat or email your account manager.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Open chat", onPress: () => navigate(ROUTES.CHAT) },
                  ],
                )
              }
            >
              <View style={styles.quickIconWrap}>
                <HelpCircle size={20} color={PURPLE_DARK} strokeWidth={2.2} />
              </View>
              <Text style={styles.quickLabel}>Support</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
              onPress={() => navigate("/notifications")}
            >
              <View style={styles.quickIconWrap}>
                <Bell size={20} color={PURPLE_DARK} strokeWidth={2.2} />
                {notificationUnread > 0 ? <View style={styles.quickDot} /> : null}
              </View>
              <Text style={styles.quickLabel}>Alerts</Text>
            </Pressable>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Workspace</Text>
            </View>
            {rows.map((row) => {
              const selected = activePanel === row.id;
              return (
                <Pressable
                  key={row.id}
                  onPress={() => onSelectPanel(row.id)}
                  style={({ pressed }) => [
                    styles.menuRow,
                    selected && styles.menuRowSelected,
                    pressed && !selected && styles.menuRowPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.menuRowIcon, { backgroundColor: PURPLE_TINT }]}>
                    {row.icon}
                  </View>
                  <Text style={styles.menuRowLabel} numberOfLines={1}>
                    {row.label}
                  </Text>
                  <ChevronRight size={15} color={Theme.textMuted} strokeWidth={2} />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.userFooterWrap, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.userFooterDivider} />
          <Pressable
            onPress={() => navigate(ROUTES.MY_ACCOUNT)}
            style={({ pressed }) => [styles.userFooter, pressed && { opacity: 0.85 }]}
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
              <Text style={styles.userFooterName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.userFooterEmail} numberOfLines={1}>
                {email || "—"}
              </Text>
            </View>
            <Pressable
              onPress={() => setShowSignOutConfirm(true)}
              disabled={signingOut}
              style={({ pressed }) => [styles.signOutBtn, pressed && styles.signOutBtnPressed]}
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
      </View>

      <Modal
        visible={showSignOutConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignOutConfirm(false)}
      >
        <View style={styles.confirmBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowSignOutConfirm(false)}
          />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Sign out</Text>
            <Text style={styles.confirmBody}>
              Are you sure you want to sign out of {orgName || "Pulse"}?
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setShowSignOutConfirm(false)}
                style={styles.confirmCancelBtn}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  setSigningOut(true);
                  try {
                    setShowSignOutConfirm(false);
                    await signOut();
                    router.replace(
                      ROUTES.SIGN_IN_DIRECT as Parameters<typeof router.replace>[0],
                    );
                  } catch {
                    Alert.alert("Sign out failed", "Please try again.");
                  } finally {
                    setSigningOut(false);
                  }
                }}
                style={styles.confirmCtaBtn}
              >
                <Text style={styles.confirmCtaText}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.screenBackground, minWidth: 0 },
  orgHeader: {
    backgroundColor: PURPLE_DARK,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 16,
    position: "relative",
  },
  orgHeaderGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PURPLE_MID,
    opacity: 0.35,
  },
  exitBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
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
  orgLogoInitials: { fontSize: 16, fontWeight: "900", color: "#fff" },
  orgHeaderText: { flex: 1, minWidth: 0, gap: 3 },
  orgHeaderMeta: {
    fontSize: 9,
    fontWeight: "800",
    color: PURPLE_MUTED_ON_DARK,
    letterSpacing: 1.8,
  },
  orgHeaderName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.2,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 14,
  },
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 4,
  },
  quickAction: { flex: 1, alignItems: "center", gap: 7, minWidth: 0 },
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
  quickAvatar: { width: "100%", height: "100%" },
  quickAvatarInitials: { fontSize: 15, fontWeight: "800", color: PURPLE_DARK },
  sectionCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
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
  menuRowPressed: { backgroundColor: Theme.surfaceGray },
  menuRowSelected: {
    backgroundColor: "#eef1f8",
    borderLeftWidth: 3,
    borderLeftColor: PURPLE_DARK,
    paddingLeft: 11,
  },
  menuRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  menuRowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  userFooterWrap: { backgroundColor: Theme.screenBackground },
  userFooterDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  userFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
  },
  userAvatar: { width: 36, height: 36, borderRadius: 11 },
  userAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: PURPLE_TINT,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarInitials: { fontSize: 13, fontWeight: "800", color: PURPLE_DARK },
  userFooterText: { flex: 1, minWidth: 0 },
  userFooterName: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  userFooterEmail: { fontSize: 11, color: Theme.textMuted, marginTop: 1 },
  signOutBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutBtnPressed: { backgroundColor: Theme.surfaceGray },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: Theme.surface,
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  confirmTitle: { fontSize: 17, fontWeight: "800", color: Theme.textPrimaryDark },
  confirmBody: { fontSize: 14, color: Theme.textMuted, lineHeight: 20 },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
  },
  confirmCancelText: { fontSize: 14, fontWeight: "700", color: Theme.textMuted },
  confirmCtaBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Theme.teslaRed,
    alignItems: "center",
  },
  confirmCtaText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
