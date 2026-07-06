/**
 * Workspace hub — left pane of the master/detail workspace shell.
 *
 * Metronic reference density: purple header, quick actions, Pulse banner,
 * Preferences (Language / Region), Party directory links, product grid, footer.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import {
  HUB_HEADER_GRADIENT,
  HUB_ICON_WELL,
  HUB_PURPLE,
  hubStyles,
} from "@/components/profile/workspaceHubMenu.styles";
import { LinearGradient } from "expo-linear-gradient";
import Theme from "@/constants/Theme";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { WorkspaceHubProductGrid } from "@/features/organization/components/workspace/WorkspaceHubProductGrid";
import { WorkspaceLanguagePanel } from "@/features/organization/components/workspace/WorkspaceLanguagePanel";
import { WorkspaceRegionPanel } from "@/features/organization/components/workspace/WorkspaceRegionPanel";
import type {
  WorkspaceHubInlinePanelId,
  WorkspacePanelId,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import { LOCALE_OPTIONS } from "@/lib/i18n";
import {
  WORKSPACE_REGION_LABELS,
  getWorkspaceRegion,
} from "@/lib/workspaceRegion";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { withBundledActiveProducts, type ProductId } from "@/lib/productRegistry";
import { useWorkspaceProductsQuery } from "@/lib/queries/useWorkspaceProductsQuery";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import {
  Building2,
  Car,
  ChevronRight,
  FolderOpen,
  Globe,
  HelpCircle,
  LogOut,
  MapPin,
  Settings,
  Shield,
  Sparkles,
  Truck,
  User,
  X,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
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

const MENU_ICON_SIZE = 14;
const MENU_ICON_STROKE = 2.1;

const GRID_ICON_SIZE = 20;

function hubLucideIcon(
  Icon: typeof Shield,
  color: string,
) {
  return (
    <Icon size={MENU_ICON_SIZE} color={color} strokeWidth={MENU_ICON_STROKE} />
  );
}

/** Party grid glyph — same lucide format as the rest of the hub, sized for the grid slot. */
function hubGridIcon(Icon: typeof Shield, color: string) {
  return <Icon size={GRID_ICON_SIZE} color={color} strokeWidth={2.1} />;
}

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
  iconBg?: string;
  iconBorder?: string;
  panelId?: WorkspacePanelId;
  route?: string;
  valuePill?: string;
};

type Props = {
  activePanel: WorkspacePanelId | null;
  onSelectPanel: (panel: WorkspacePanelId) => void;
  onExit?: () => void;
  inlinePanel?: WorkspaceHubInlinePanelId | null;
  onCloseInlinePanel?: () => void;
};

export function WorkspaceHubMenu({
  activePanel,
  onSelectPanel,
  onExit,
  inlinePanel = null,
  onCloseInlinePanel,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut } = useAuth();
  const { locale } = useLanguage();
  const { currentOrganization } = useOrganization();
  const [workspaceRegion, setWorkspaceRegion] = useState<
    keyof typeof WORKSPACE_REGION_LABELS
  >("india");
  const { data: activations = [] } = useWorkspaceProductsQuery();

  const activeProductIds = useMemo(() => {
    const ids = new Set<ProductId>();
    for (const row of activations) {
      if (row.status === "active" || row.status === "trial") {
        ids.add(row.product_id);
      }
    }
    return withBundledActiveProducts(ids);
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

  useEffect(() => {
    let mounted = true;
    void getWorkspaceRegion().then((region) => {
      if (mounted) setWorkspaceRegion(region);
    });
    return () => {
      mounted = false;
    };
  }, [activePanel]);

  const openOrgProfileHub = () => {
    onExit?.();
    router.replace(
      ROUTES.networkOrgHub("details") as Parameters<typeof router.replace>[0],
    );
  };

  const languageLabel =
    LOCALE_OPTIONS.find((o) => o.value === locale)?.label ?? "English";
  const regionLabel = WORKSPACE_REGION_LABELS[workspaceRegion];

  const preferenceRows: HubRow[] = [
    {
      id: "language",
      label: "Language",
      icon: hubLucideIcon(Globe, "#2563eb"),
      iconBg: HUB_ICON_WELL.sky,
      iconBorder: HUB_ICON_WELL.skyBorder,
      panelId: "language",
      valuePill: languageLabel,
    },
    {
      id: "region",
      label: "Region",
      icon: hubLucideIcon(MapPin, "#d97706"),
      iconBg: HUB_ICON_WELL.amber,
      iconBorder: HUB_ICON_WELL.amberBorder,
      panelId: "region",
      valuePill: regionLabel,
    },
  ];

  const workspaceRows: HubRow[] = [
    {
      id: "ws-kyc",
      label: "Org Identity & KYC",
      icon: hubLucideIcon(Shield, "#0f766e"),
      iconBg: HUB_ICON_WELL.teal,
      iconBorder: HUB_ICON_WELL.tealBorder,
      panelId: "kyc",
    },
    {
      id: "ws-settings",
      label: "Settings",
      icon: hubLucideIcon(Settings, HUB_PURPLE),
      iconBg: HUB_ICON_WELL.slate,
      iconBorder: HUB_ICON_WELL.slateBorder,
      panelId: "settings",
    },
  ];

  const partyRows: HubRow[] = [
    {
      id: "party-customers",
      label: "Customer",
      icon: hubGridIcon(Building2, "#2563eb"),
      iconBg: HUB_ICON_WELL.sky,
      iconBorder: HUB_ICON_WELL.skyBorder,
      route: ROUTES.partyDirectory("customers"),
    },
    {
      id: "party-suppliers",
      label: "Supplier",
      icon: hubGridIcon(Truck, "#d97706"),
      iconBg: HUB_ICON_WELL.amber,
      iconBorder: HUB_ICON_WELL.amberBorder,
      route: ROUTES.partyDirectory("suppliers"),
    },
    {
      id: "party-drivers",
      label: "Driver",
      icon: hubGridIcon(User, "#059669"),
      iconBg: HUB_ICON_WELL.emerald,
      iconBorder: HUB_ICON_WELL.emeraldBorder,
      route: ROUTES.partyDirectory("drivers"),
    },
    {
      id: "party-vehicles",
      label: "Vehicle",
      icon: hubGridIcon(Car, HUB_PURPLE),
      iconBg: HUB_ICON_WELL.slate,
      iconBorder: HUB_ICON_WELL.slateBorder,
      route: ROUTES.partyDirectory("vehicles"),
    },
  ];

  const navigate = (path: string) => {
    router.replace(path as Parameters<typeof router.replace>[0]);
  };

  const renderHubSection = (
    title: string,
    sectionRows: HubRow[],
    accentColor = HUB_PURPLE,
  ) => (
    <View style={hubStyles.sectionCard}>
      <View style={hubStyles.sectionHeader}>
        <View style={[hubStyles.sectionAccent, { backgroundColor: accentColor }]} />
        <Text style={hubStyles.sectionTitle}>{title}</Text>
      </View>
      {sectionRows.map((row, idx) => {
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
              hubStyles.menuRow,
              isFirst && hubStyles.menuRowFirst,
              selected && hubStyles.menuRowSelected,
              pressed && !selected && hubStyles.menuRowPressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <View
              style={[
                hubStyles.menuRowIconWell,
                row.iconBg
                  ? {
                      backgroundColor: row.iconBg,
                      borderColor: row.iconBorder,
                    }
                  : null,
              ]}
            >
              {row.icon}
            </View>
            <Text style={hubStyles.menuRowLabel} numberOfLines={1}>
              {row.label}
            </Text>
            {row.valuePill ? (
              <View style={hubStyles.valuePill}>
                <Text style={hubStyles.valuePillText} numberOfLines={1}>
                  {row.valuePill}
                </Text>
              </View>
            ) : (
              <ChevronRight
                size={13}
                color={selected ? HUB_PURPLE : Theme.textMuted}
                strokeWidth={1.8}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );

  const renderPartyGridSection = (
    title: string,
    sectionRows: HubRow[],
    accentColor = HUB_PURPLE,
  ) => (
    <View style={hubStyles.sectionCard}>
      <View style={hubStyles.sectionHeader}>
        <View style={[hubStyles.sectionAccent, { backgroundColor: accentColor }]} />
        <Text style={hubStyles.sectionTitle}>{title}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={hubStyles.partyRowScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {sectionRows.map((row) => (
          <View key={row.id} style={hubStyles.partyRowCell}>
            <Pressable
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
                hubStyles.partyRowChip,
                pressed && hubStyles.partyRowChipPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={row.label}
            >
              <View
                style={[
                  hubStyles.partyRowIconSlot,
                  row.iconBg
                    ? {
                        backgroundColor: row.iconBg,
                        borderColor: row.iconBorder,
                      }
                    : null,
                ]}
              >
                {row.icon}
              </View>
              <Text style={hubStyles.partyGridLabel} numberOfLines={1}>
                {row.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <>
      <View style={hubStyles.root}>
        <View style={[hubStyles.headerBand, { paddingTop: insets.top + 14 }]}>
          <LinearGradient
            colors={[...HUB_HEADER_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={hubStyles.headerGradientFill}
          />
          <View style={hubStyles.headerSheen} pointerEvents="none" />
          <View style={hubStyles.headerVignette} pointerEvents="none" />
          <View style={hubStyles.headerBottomFade} pointerEvents="none" />
          <View style={hubStyles.headerBandRow}>
            <Pressable
              onPress={openOrgProfileHub}
              style={({ pressed }) => [
                hubStyles.headerLogoWrap,
                pressed && { opacity: 0.88 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="View public workspace profile"
            >
              {orgLogoUri ? (
                <Image source={{ uri: orgLogoUri }} style={hubStyles.headerLogoImage} />
              ) : (
                <View style={hubStyles.headerLogoFallback}>
                  <Text style={hubStyles.headerLogoInitials}>
                    {orgInitials(orgName || "PULSE")}
                  </Text>
                </View>
              )}
            </Pressable>
            <View style={hubStyles.headerBandText}>
              <Text style={hubStyles.headerEyebrow}>WORKSPACE</Text>
              <Text style={hubStyles.headerTitle} numberOfLines={1}>
                {(orgName || "My Organisation").toUpperCase()}
              </Text>
            </View>
            {onExit ? (
              <Pressable
                onPress={onExit}
                style={({ pressed }) => [
                  hubStyles.closeBtn,
                  pressed && hubStyles.closeBtnPressed,
                ]}
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
          style={hubStyles.scroll}
          contentContainerStyle={hubStyles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={hubStyles.quickRow}>
            <Pressable
              style={({ pressed }) => [hubStyles.quickAction, pressed && { opacity: 0.85 }]}
              onPress={openOrgProfileHub}
              accessibilityRole="button"
              accessibilityLabel="My account"
            >
              <View style={hubStyles.quickCircle}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={hubStyles.quickAvatar} />
                ) : (
                  <Text style={hubStyles.quickAvatarInitials}>
                    {firstName.slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </View>
              <Text style={hubStyles.quickLabel}>My Account</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [hubStyles.quickAction, pressed && { opacity: 0.85 }]}
              onPress={() => {
                onExit?.();
                navigate(ROUTES.DOCUMENTS_CENTER);
              }}
              accessibilityRole="button"
              accessibilityLabel="Open documents center"
            >
              <View style={[hubStyles.quickCircle, hubStyles.quickCircleBrand]}>
                <FolderOpen size={20} color={HUB_PURPLE} strokeWidth={2.2} />
              </View>
              <Text style={hubStyles.quickLabel}>Documents</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [hubStyles.quickAction, pressed && { opacity: 0.85 }]}
              onPress={() => {
                onExit?.();
                navigate(ROUTES.CHAT);
              }}
              accessibilityRole="button"
              accessibilityLabel="Support"
            >
              <View style={[hubStyles.quickCircle, hubStyles.quickCircleEmerald]}>
                <HelpCircle size={20} color={Theme.driverEmerald} strokeWidth={2.2} />
              </View>
              <Text style={hubStyles.quickLabel}>Support</Text>
            </Pressable>
          </View>

          <View style={hubStyles.insightBanner}>
            <View style={hubStyles.insightIconWrap}>
              <Sparkles size={15} color={HUB_PURPLE} strokeWidth={2.2} />
            </View>
            <View style={hubStyles.insightTextWrap}>
              <Text style={hubStyles.insightTitle}>Pulse Business OS</Text>
              <Text style={hubStyles.insightBody} numberOfLines={2}>
                Activate finance, POD, fleet & AI modules — synced to your workspace.
              </Text>
            </View>
          </View>

          {renderHubSection("Workspace", workspaceRows, "#0f766e")}
          {renderHubSection("Preferences", preferenceRows, "#2563eb")}
          {renderPartyGridSection("Party", partyRows, Theme.driverEmerald)}

          <WorkspaceHubProductGrid
            activeProductIds={activeProductIds}
            onOpenCatalogue={() => onSelectPanel("products")}
          />
        </ScrollView>

        <View style={[hubStyles.footerWrap, { paddingBottom: insets.bottom + 10 }]}>
          <View style={hubStyles.footerDivider} />
          <View style={hubStyles.footerRow}>
            <Pressable
              onPress={openOrgProfileHub}
              style={({ pressed }) => [hubStyles.footerIdentity, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Open my account"
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={hubStyles.footerAvatar} />
              ) : (
                <View style={hubStyles.footerAvatarFallback}>
                  <Text style={hubStyles.footerAvatarInitials}>
                    {firstName.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={hubStyles.footerText}>
                <Text style={hubStyles.footerName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={hubStyles.footerEmail} numberOfLines={1}>
                  {email || "—"}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setShowSignOutConfirm(true)}
              disabled={signingOut}
              style={({ pressed }) => [
                hubStyles.signOutBtn,
                pressed && hubStyles.signOutBtnPressed,
              ]}
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

        {inlinePanel === "language" && onCloseInlinePanel ? (
          <WorkspaceLanguagePanel variant="inline" onBack={onCloseInlinePanel} />
        ) : null}
        {inlinePanel === "region" && onCloseInlinePanel ? (
          <WorkspaceRegionPanel
            variant="inline"
            onBack={onCloseInlinePanel}
            onRegionChange={(region) => setWorkspaceRegion(region)}
          />
        ) : null}
      </View>

      <Modal
        visible={showSignOutConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignOutConfirm(false)}
      >
        <View style={hubStyles.confirmBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowSignOutConfirm(false)}
          />
          <View style={hubStyles.confirmCard}>
            <Text style={hubStyles.confirmTitle}>Sign out</Text>
            <Text style={hubStyles.confirmBody}>
              Are you sure you want to sign out of {orgName || "Pulse"}?
            </Text>
            <View style={hubStyles.confirmActions}>
              <Pressable
                onPress={() => setShowSignOutConfirm(false)}
                style={hubStyles.confirmCancelBtn}
              >
                <Text style={hubStyles.confirmCancelText}>Cancel</Text>
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
                style={hubStyles.confirmCtaBtn}
              >
                <Text style={hubStyles.confirmCtaText}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
