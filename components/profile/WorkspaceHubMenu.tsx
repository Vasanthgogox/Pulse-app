/**
 * Workspace hub — left pane of the master/detail workspace shell.
 *
 * Layout matches the canonical reference: navy band with workspace name and
 * close button, an overlapping rounded-square logo, three circular quick
 * actions (My Account / Support / Alerts), a single "Workspace Management"
 * list card, and a pinned identity footer with sign-out.
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
import { WorkspaceHubProductGrid } from "@/features/organization/components/workspace/WorkspaceHubProductGrid";
import type { WorkspacePanelId } from "@/features/organization/components/workspace/workspacePanelTypes";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import type { ProductId } from "@/lib/productRegistry";
import { useWorkspaceProductsQuery } from "@/lib/queries/useWorkspaceProductsQuery";
import { ROUTES } from "@/lib/routes";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useRouter } from "expo-router";
import { NotificationBellIcon } from "@/components/NotificationBellIcon";
import {
  Building2,
  ChevronRight,
  HelpCircle,
  LogOut,
  Settings2,
  Sparkles,
  Car,
  Truck,
  User,
  Users,
  X,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NAVY = Theme.primary;
const NAVY_MID = Theme.primaryLight;
const NAVY_TINT = "rgba(79,70,229,0.08)";
const NAVY_BORDER_SOFT = "rgba(79,70,229,0.12)";
const NAVY_ON_DARK_EYEBROW = "rgba(255,255,255,0.78)";

function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0]![0] ?? "").toUpperCase();
  return ((words[0]![0] ?? "") + (words[words.length - 1]![0] ?? "")).toUpperCase();
}

type HubRow = {
  id: string;
  label: string;
  icon: React.ReactNode;
  panelId?: WorkspacePanelId;
  route?: string;
};

type Props = {
  activePanel: WorkspacePanelId | null;
  onSelectPanel: (panel: WorkspacePanelId) => void;
  onExit?: () => void;
};

export function WorkspaceHubMenu({ activePanel, onSelectPanel, onExit }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopNetwork = Platform.OS === "web" && width >= 1180;
  const { user, profile, signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const notificationUnread = useGlobalSyncStore((s) => s.notificationUnreadCount);
  const { data: activations = [] } = useWorkspaceProductsQuery();

  const activeProductIds = useMemo(() => {
    const ids = new Set<ProductId>();
    for (const row of activations) {
      if (row.status === "active" || row.status === "trial") {
        ids.add(row.product_id);
      }
    }
    ids.add("pulse_core");
    return ids;
  }, [activations]);

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

  const openMyProfile = () => {
    onSelectPanel("account");
  };

  const rows: HubRow[] = [
    {
      id: "settings",
      label: "Workspace settings",
      icon: <Building2 size={14} color={NAVY} strokeWidth={2.2} />,
      panelId: "settings",
    },
    {
      id: "team",
      label: "Team members",
      icon: <Users size={14} color={NAVY} strokeWidth={2.2} />,
      route: ROUTES.MODALS.TEAM,
    },
    {
      id: "kyc",
      label: "Org identity & KYC",
      icon: <Settings2 size={14} color={NAVY} strokeWidth={2.2} />,
      panelId: "kyc",
    },
    {
      id: "business-pulse",
      label: "Business Pulse intelligence",
      icon: <Sparkles size={14} color={NAVY} strokeWidth={2.2} />,
      route: ROUTES.BUSINESS_PULSE,
    },
  ];

  const partyRows: HubRow[] = [
    {
      id: "party-customers",
      label: "Customer",
      icon: <Building2 size={14} color={NAVY} strokeWidth={2.2} />,
      route: ROUTES.partyDirectory("customers"),
    },
    {
      id: "party-suppliers",
      label: "Supplier",
      icon: <Truck size={14} color={NAVY} strokeWidth={2.2} />,
      route: ROUTES.partyDirectory("suppliers"),
    },
    {
      id: "party-drivers",
      label: "Driver",
      icon: <User size={14} color={NAVY} strokeWidth={2.2} />,
      route: ROUTES.partyDirectory("drivers"),
    },
    {
      id: "party-vehicles",
      label: "Vehicle",
      icon: <Car size={14} color={NAVY} strokeWidth={2.2} />,
      route: ROUTES.partyDirectory("vehicles"),
    },
  ];

  const navigate = (path: string) => {
    router.replace(path as Parameters<typeof router.replace>[0]);
  };

  return (
    <>
      <View style={styles.root}>
        <View style={[styles.navyBand, { paddingTop: insets.top + 10 }]}>
          <View style={styles.navyBandOverlay} />
          <View style={styles.navyBandRow}>
            <View style={styles.headerLogoWrap}>
              {orgLogoUri ? (
                <Image source={{ uri: orgLogoUri }} style={styles.headerLogoImage} />
              ) : (
                <View style={styles.headerLogoFallback}>
                  <Text style={styles.headerLogoInitials}>
                    {orgInitials(orgName || "PULSE")}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.navyBandText}>
              <Text style={styles.navyEyebrow}>WORKSPACE</Text>
              <Text style={styles.navyTitle} numberOfLines={1}>
                {orgName || "My Organisation"}
              </Text>
            </View>
            {onExit ? (
              <Pressable
                onPress={onExit}
                style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close workspace"
              >
                <X size={14} color="#fff" strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </View>
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
              onPress={openMyProfile}
              accessibilityRole="button"
              accessibilityLabel="My account"
            >
              <View style={styles.quickCircle}>
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
              accessibilityRole="button"
              accessibilityLabel="Support"
            >
              <View style={styles.quickCircle}>
                <HelpCircle size={18} color={NAVY} strokeWidth={2.2} />
              </View>
              <Text style={styles.quickLabel}>Support</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
              onPress={() => navigate("/notifications")}
              accessibilityRole="button"
              accessibilityLabel="Alerts"
            >
              <View style={styles.quickCircle}>
                <NotificationBellIcon
                  size={20}
                  color={Theme.textPrimaryDark}
                  showBadge={notificationUnread > 0}
                />
              </View>
              <Text style={styles.quickLabel}>Alerts</Text>
            </Pressable>
          </View>

          <View style={styles.insightBanner}>
            <View style={styles.insightIconWrap}>
              <Sparkles size={14} color={NAVY} strokeWidth={2.2} />
            </View>
            <View style={styles.insightTextWrap}>
              <Text style={styles.insightTitle}>Pulse Business OS</Text>
              <Text style={styles.insightBody} numberOfLines={2}>
                Activate finance, POD, fleet & AI modules — synced to your workspace.
              </Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Workspace Management</Text>
            </View>
            {rows.map((row, idx) => {
              const selected = !!row.panelId && activePanel === row.panelId;
              const isFirst = idx === 0;
              return (
                <Pressable
                  key={row.id}
                  onPress={() => {
                    if (row.panelId) {
                      onSelectPanel(row.panelId);
                      return;
                    }
                    if (row.route) {
                      onExit?.();
                      navigate(row.route);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.menuRow,
                    isFirst && styles.menuRowFirst,
                    selected && styles.menuRowSelected,
                    pressed && !selected && styles.menuRowPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.menuRowIcon, selected && styles.menuRowIconSelected]}>
                    {row.icon}
                  </View>
                  <Text style={styles.menuRowLabel} numberOfLines={1}>
                    {row.label}
                  </Text>
                  <ChevronRight
                    size={14}
                    color={selected ? NAVY : Theme.textMuted}
                    strokeWidth={2}
                  />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Party</Text>
            </View>
            {partyRows.map((row, idx) => {
              const isFirst = idx === 0;
              return (
                <Pressable
                  key={row.id}
                  onPress={() => {
                    if (row.route) {
                      onExit?.();
                      navigate(row.route);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.menuRow,
                    isFirst && styles.menuRowFirst,
                    pressed && styles.menuRowPressed,
                  ]}
                  accessibilityRole="button"
                >
                  <View style={styles.menuRowIcon}>{row.icon}</View>
                  <Text style={styles.menuRowLabel} numberOfLines={1}>
                    {row.label}
                  </Text>
                  <ChevronRight size={14} color={Theme.textMuted} strokeWidth={2} />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <WorkspaceHubProductGrid
          activeProductIds={activeProductIds}
          onOpenCatalogue={() => onSelectPanel("products")}
        />

        <View style={[styles.footerWrap, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.footerDivider} />
          <View style={styles.footerRow}>
            <Pressable
              onPress={openMyProfile}
              style={({ pressed }) => [styles.footerIdentity, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Open my account"
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.footerAvatar} />
              ) : (
                <View style={styles.footerAvatarFallback}>
                  <Text style={styles.footerAvatarInitials}>
                    {firstName.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.footerText}>
                <Text style={styles.footerName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.footerEmail} numberOfLines={1}>
                  {email || "—"}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setShowSignOutConfirm(true)}
              disabled={signingOut}
              style={({ pressed }) => [styles.signOutBtn, pressed && styles.signOutBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              hitSlop={8}
            >
              {signingOut ? (
                <LoadingIndicator size="small" color={Theme.textMuted} />
              ) : (
                <LogOut size={14} color={Theme.textMuted} strokeWidth={2.2} />
              )}
            </Pressable>
          </View>
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

/**
 * Hub-menu styling deliberately tracks the rest of the app's compact
 * density (network cards, detail forms). Renders inside the workspace
 * flex card (`WorkspaceFlexCardShell`) at ~420px on desktop.
 */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f7fb", minWidth: 0 },

  // ── Navy band ───────────────────────────────────────────────────────────
  navyBand: {
    backgroundColor: NAVY,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 14,
    position: "relative",
  },
  navyBandOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: NAVY_MID,
    opacity: 0.35,
  },
  navyBandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerLogoWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerLogoImage: { width: "100%", height: "100%", borderRadius: 8 },
  headerLogoFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerLogoInitials: {
    fontSize: 12,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.4,
  },
  navyBandText: { flex: 1, minWidth: 0, gap: 2 },
  navyEyebrow: {
    fontSize: 9,
    fontWeight: "800",
    color: NAVY_ON_DARK_EYEBROW,
    letterSpacing: 1.6,
  },
  navyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  closeBtnPressed: { backgroundColor: "rgba(255,255,255,0.24)" },

  // ── Scrollable hub body ────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 14,
  },

  insightBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: NAVY_BORDER_SOFT,
    backgroundColor: NAVY_TINT,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  insightIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: NAVY_BORDER_SOFT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  insightTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  insightTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  insightBody: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: Theme.textSecondary,
  },

  // Quick actions
  quickRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 8,
    width: "100%",
  },
  quickAction: { flex: 1, alignItems: "center", gap: 8, minWidth: 0 },
  quickCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  quickAvatar: { width: "100%", height: "100%" },
  quickAvatarInitials: { fontSize: 15, fontWeight: "800", color: NAVY },
  quickDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.primary,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  quickLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.05,
    textAlign: "center",
  },

  // Workspace Management list card
  sectionCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e4e7ef",
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: Theme.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  sectionAccent: { width: 2, height: 10, borderRadius: 1, backgroundColor: NAVY },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  menuRowFirst: { borderTopWidth: 0 },
  menuRowPressed: { backgroundColor: Theme.surface },
  menuRowSelected: {
    backgroundColor: "#eef1f8",
  },
  menuRowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  menuRowIconSelected: {
    backgroundColor: NAVY_TINT,
    borderColor: NAVY_BORDER_SOFT,
  },
  menuRowLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.05,
  },

  // ── Footer identity ────────────────────────────────────────────────────
  footerWrap: { backgroundColor: Theme.cardWhite },
  footerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
  },
  footerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  footerAvatar: { width: 32, height: 32, borderRadius: 11 },
  footerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: NAVY_TINT,
    alignItems: "center",
    justifyContent: "center",
  },
  footerAvatarInitials: { fontSize: 12, fontWeight: "800", color: NAVY },
  footerText: { flex: 1, minWidth: 0 },
  footerName: { fontSize: 12, fontWeight: "800", color: Theme.textPrimaryDark },
  footerEmail: { fontSize: 9, color: Theme.textMuted, marginTop: 1 },
  signOutBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  signOutBtnPressed: { backgroundColor: "rgba(232,33,39,0.08)" },

  // Sign-out confirm modal
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
    backgroundColor: Theme.primary,
    alignItems: "center",
  },
  confirmCtaText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
