/**
 * Desktop Network hub — Metronic profile header, tabbed panels (profile / sales /
 * network / chat). Details tab was removed; `tab=details` aliases to My Profile.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceOrgLogo } from "@/features/organization/hooks/useWorkspaceOrgLogo";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import type { CurrentOrganization } from "@/types/organization";
import type {
  ConnectedOrg,
  ConnectionFilterTab,
} from "@/features/network/components/ConnectionsView";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { NetworkDesktopInvitationsPanel } from "@/features/network/components/desktop/NetworkDesktopInvitationsPanel";
import { NetworkDesktopSalesPanel } from "@/features/network/components/desktop/NetworkDesktopSalesPanel";
import { NetworkDesktopChatOverlay } from "@/features/network/components/desktop/NetworkDesktopChatOverlay";
import { NetworkDesktopGoalsPanel } from "@/features/network/components/desktop/NetworkDesktopGoalsPanel";
import { NetworkDesktopPerformancePanel } from "@/features/network/components/desktop/NetworkDesktopPerformancePanel";
import { NetworkDesktopHubHero } from "@/features/network/components/desktop/NetworkDesktopHubHero";
import { NetworkDesktopNetworkPanel } from "@/features/network/components/desktop/NetworkDesktopNetworkPanel";
import { NetworkDesktopProfilePanel } from "@/features/network/components/desktop/NetworkDesktopProfilePanel";
import { NetworkDesktopTeamPanel } from "@/features/network/components/desktop/NetworkDesktopTeamPanel";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { NetworkSupportHelpCards } from "@/features/network/components/NetworkSupportHelpCards";
import { NetworkExportMenu } from "@/features/network/components/desktop/NetworkExportMenu";
import { exportConnectionsExcel } from "@/features/network/lib/networkExport.util";
import type { InboundProtocolInviteItem } from "@/lib/globalSync/inboundProtocol.types";
import type { NetworkChatPartner } from "@/features/network/components/desktop/NetworkDesktopChatFlexPanel";
import { NetworkDesktopChatIntroPanel } from "@/features/network/components/desktop/NetworkDesktopChatIntroPanel";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { useOrgMembersData } from "@/lib/queries/useOrgMembersQuery";
import { platformRoleFromMember } from "@/features/organization/utils/teamInviteRoles.util";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useCapabilities } from "@/lib/useCapabilities";
import { canAccessDrivers, canAccessSuppliers } from "@/lib/capabilities";
import { UserPlus, X } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

export type NetworkDesktopTab =
  /** @deprecated Removed — aliases to `profile`. */
  | "details"
  | "team"
  | "profile"
  | "sales"
  | "goals"
  /** @deprecated Prefer `sales` — opens Sales with Asset view. */
  | "asset"
  | "network"
  /** @deprecated Prefer `network` — kept for deep links / bookmarks. */
  | "connections"
  /** @deprecated Prefer `network` — kept for deep links / bookmarks. */
  | "grow"
  /** Reserved for the future unified Performance page (Goals + Sales merge). Not yet wired to a tab or a render branch. */
  | "performance"
  | "chat";

const TABS: { id: NetworkDesktopTab; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "profile", label: "My Profile" },
  { id: "sales", label: "Sales" },
  { id: "goals", label: "Goals" },
  { id: "performance", label: "Performance" },
  { id: "network", label: "Network" },
  { id: "chat", label: "Chat" },
];

function normalizeHubTab(raw: NetworkDesktopTab): NetworkDesktopTab {
  if (raw === "connections" || raw === "grow") return "network";
  if (raw === "asset") return "sales";
  if (raw === "details") return "profile";
  return raw;
}

function parseHubTab(raw: string | undefined): NetworkDesktopTab | null {
  if (
    raw === "details" ||
    raw === "team" ||
    raw === "profile" ||
    raw === "sales" ||
    raw === "goals" ||
    raw === "asset" ||
    raw === "network" ||
    raw === "connections" ||
    raw === "grow" ||
    raw === "performance" ||
    raw === "chat"
  ) {
    return normalizeHubTab(raw);
  }
  return null;
}

type Props = {
  organization: CurrentOrganization | null;
  orgId: string | null;
  totalConnections: number;
  clientCount: number;
  supplierCount: number;
  driverCount: number;
  pendingInviteCount: number;
  connSearch: string;
  onConnSearchChange: (v: string) => void;
  connFilter: ConnectionFilterTab;
  onConnFilterChange: (v: ConnectionFilterTab) => void;
  discoverSearch: string;
  onDiscoverSearchChange: (v: string) => void;
  discoverOrgSearch: string;
  integratedPartnerOrgIds: Set<string>;
  discoverInviteCount: number;
  discoverInviteLimit: number;
  onDiscoverInviteCountChange: (count: number, limit: number) => void;
  onOpenProfileFromConnection: (item: ConnectedOrg) => void;
  onOpenProfileFromDiscover: (org: {
    id: string;
    name: string;
    avatar_seed?: string | null;
  }) => void;
  onPressMutuals: (org: { id: string; name: string }) => void;
  onOpenMutualProfile: (org: MutualConnectionRow) => void;
  invitationsOpen: boolean;
  onInvitationsOpenChange: (open: boolean) => void;
  inviteTab: "received" | "sent";
  onInviteTabChange: (tab: "received" | "sent") => void;
  receivedInviteItems: InboundProtocolInviteItem[];
  sentInviteItems: InboundProtocolInviteItem[];
  inviteBusyId: string | null;
  onInviteApprove: (item: InboundProtocolInviteItem) => void;
  onInviteReject: (item: InboundProtocolInviteItem) => void;
  onInviteCancel: (item: InboundProtocolInviteItem) => void;
  onOpenInviteDetail?: (item: InboundProtocolInviteItem) => void;
  initialTab?: NetworkDesktopTab;
  /** Extra scroll padding for mobile tab bar / safe area. */
  bottomScrollInset?: number;
  /** Full-page popup: hide Welcome / close chrome; parent owns dismiss. */
  hideHeaderChrome?: boolean;
  /** When set, mobile chrome close uses this instead of router.back(). */
  onClose?: () => void;
};

export function NetworkDesktopHub({
  organization,
  orgId,
  totalConnections,
  clientCount,
  supplierCount,
  driverCount,
  pendingInviteCount,
  connSearch,
  onConnSearchChange,
  connFilter,
  onConnFilterChange,
  discoverSearch,
  onDiscoverSearchChange,
  discoverOrgSearch,
  integratedPartnerOrgIds,
  discoverInviteCount,
  discoverInviteLimit,
  onDiscoverInviteCountChange,
  onOpenProfileFromConnection,
  onOpenProfileFromDiscover,
  onPressMutuals,
  onOpenMutualProfile,
  invitationsOpen,
  onInvitationsOpenChange,
  inviteTab,
  onInviteTabChange,
  receivedInviteItems,
  sentInviteItems,
  inviteBusyId,
  onInviteApprove,
  onInviteReject,
  onInviteCancel,
  onOpenInviteDetail,
  initialTab,
  bottomScrollInset = 0,
  hideHeaderChrome = false,
  onClose,
}: Props) {
  const { user, profile } = useAuth();
  const capabilities = useCapabilities();
  /** Asset-only: no suppliers. Aggregate-only: no own fleet (drivers). */
  const canUseSuppliers = canAccessSuppliers(capabilities);
  const canUseFleet = canAccessDrivers(capabilities);
  // Zero out counts for surfaces this model can't use so every downstream
  // sub-panel (details / hero / grow) stays consistent with the gated hub
  // tiles — an asset org must never see a supplier count, nor aggregate a fleet
  // count. Underlying rows are untouched; they reappear on re-upgrade.
  const gatedSupplierCount = canUseSuppliers ? supplierCount : 0;
  const gatedDriverCount = canUseFleet ? driverCount : 0;
  const router = useRouter();
  const closePage = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/network" as Parameters<typeof router.replace>[0]);
  };
  const layout = useProfileHubCompactLayout();
  const compact = layout.compact;
  const showMobileCloseChrome = compact && (!hideHeaderChrome || Boolean(onClose));
  const layoutInsets = useLayoutInsets();
  const { logoUri } = useWorkspaceOrgLogo();
  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const [tab, setTab] = useState<NetworkDesktopTab>(
    () => parseHubTab(initialTab) ?? "profile",
  );
  const [chatOpen, setChatOpen] = useState(() => parseHubTab(initialTab) === "chat");
  const [allConnections, setAllConnections] = useState<ConnectedOrg[]>([]);
  const [chatPartnerOrgId, setChatPartnerOrgId] = useState<string | null>(null);
  const orgName = organization?.name?.trim() || "Your workspace";
  const email = profile?.email?.trim() || "—";
  const modelLabel =
    organization?.operatingModel?.replace(/_/g, " ") ?? "Logistics workspace";
  const orgMembersQ = useOrgMembersData(orgId);
  // Team management is gated on the current user's ORG membership role (owner/admin),
  // not their platform role. profile.role is only "user" | "driver" and would let any
  // non-driver (e.g. an operator) manage the team.
  const canManageTeam = useMemo(() => {
    const me = (orgMembersQ.data?.members ?? []).find(
      (m) => m.user_id === user?.uid,
    );
    if (!me) return false;
    return me.role === "owner" || platformRoleFromMember(me) === "admin";
  }, [orgMembersQ.data, user?.uid]);

  useEffect(() => {
    const parsed = parseHubTab(initialTab);
    if (parsed) setTab(parsed);
  }, [initialTab]);

  const integratedChatPartners = useMemo((): NetworkChatPartner[] => {
    const map = new Map<string, NetworkChatPartner>();
    for (const item of allConnections) {
      if (!item.is_integrated || !item.linked_organization_id) continue;
      map.set(item.linked_organization_id, {
        orgId: item.linked_organization_id,
        name: item.name,
        logoUrl: item.avatar_url ?? null,
        avatarSeed: item.avatar_seed ?? null,
        role: item.role,
      });
    }
    for (const client of clientsQ.data ?? []) {
      const linkedOrgId = client.linked_organization_id?.trim();
      const integrated = client.is_integrated ?? Boolean(linkedOrgId);
      if (!integrated || !linkedOrgId || map.has(linkedOrgId)) continue;
      map.set(linkedOrgId, {
        orgId: linkedOrgId,
        name: client.name?.trim() || "Client",
        logoUrl: client.avatar_url ?? null,
        avatarSeed: client.avatar_seed ?? null,
        role: "CLIENT",
      });
    }
    for (const supplier of suppliersQ.data ?? []) {
      const linkedOrgId = supplier.linked_organization_id?.trim();
      const integrated =
        supplier.is_integrated ??
        (supplier.supplier_type === "integrated" || Boolean(linkedOrgId));
      if (!integrated || !linkedOrgId || map.has(linkedOrgId)) continue;
      map.set(linkedOrgId, {
        orgId: linkedOrgId,
        name: supplier.company_name?.trim() || supplier.name?.trim() || "Supplier",
        logoUrl: supplier.avatar_url ?? null,
        avatarSeed: supplier.avatar_seed ?? null,
        role: "SUPPLIER",
      });
    }
    for (const partnerOrgId of integratedPartnerOrgIds) {
      if (map.has(partnerOrgId)) continue;
      map.set(partnerOrgId, {
        orgId: partnerOrgId,
        name: "Integrated partner",
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allConnections, clientsQ.data, integratedPartnerOrgIds, suppliersQ.data]);

  const openChatWithPartner = (partnerOrgId: string | null) => {
    onInvitationsOpenChange(false);
    setChatPartnerOrgId(partnerOrgId);
    setTab("chat");
    setChatOpen(true);
  };

  const selectTab = (next: NetworkDesktopTab) => {
    onInvitationsOpenChange(false);
    if (next === "chat") {
      setChatPartnerOrgId(null);
      setTab("chat");
      setChatOpen(true);
      return;
    }
    setChatOpen(false);
    setTab(normalizeHubTab(next));
  };

  const pendingJoinInvite = useMemo(() => {
    const item = receivedInviteItems[0];
    if (!item) return null;
    return {
      id: item.id,
      name: item.name?.trim() || "Connection request",
      meta: item.subtitle?.trim() || `${item.type} · Pending`,
      avatarUrl: item.avatarUri ?? item.logoUrl ?? null,
      avatarSeed: item.senderAvatarSeed ?? item.orgAvatarSeed ?? null,
      onAccept: () => onInviteApprove(item),
      onDecline: () => onInviteReject(item),
    };
  }, [onInviteApprove, onInviteReject, receivedInviteItems]);

  const panel = (() => {
    if (!orgId) {
      return (
        <View style={styles.emptyWrap}>
          <LoadingIndicator color={Theme.primary} />
        </View>
      );
    }

    if (invitationsOpen) {
      return (
        <NetworkDesktopInvitationsPanel
          tab={inviteTab}
          onTabChange={onInviteTabChange}
          onClose={() => onInvitationsOpenChange(false)}
          pendingCount={pendingInviteCount}
          receivedItems={receivedInviteItems}
          sentItems={sentInviteItems}
          busyId={inviteBusyId}
          onApprove={onInviteApprove}
          onReject={onInviteReject}
          onCancel={onInviteCancel}
          onOpenInviteDetail={onOpenInviteDetail}
        />
      );
    }

    if (tab === "team") {
      return (
        <NetworkDesktopTeamPanel
          orgId={orgId}
          orgName={orgName}
          currentUserId={user?.uid ?? null}
          canManage={canManageTeam}
        />
      );
    }

    if (tab === "profile") {
      return <NetworkDesktopProfilePanel organization={organization} />;
    }

    if (tab === "sales") {
      return (
        <NetworkDesktopSalesPanel
          orgId={orgId}
          initialScope={initialTab === "asset" ? "asset" : "aggregate"}
          onOpenProfile={onOpenProfileFromConnection}
          onOpenDiscoverProfile={onOpenProfileFromDiscover}
          onGoToGrowTab={() => setTab("network")}
          inviteDailyCapReached={
            discoverInviteCount >= discoverInviteLimit
          }
        />
      );
    }

    if (tab === "goals") {
      return <NetworkDesktopGoalsPanel orgId={orgId} />;
    }

    if (tab === "performance") {
      return <NetworkDesktopPerformancePanel orgId={orgId} />;
    }

    if (tab === "network") {
      return (
        <NetworkDesktopNetworkPanel
          orgId={orgId}
          totalConnections={totalConnections}
          clientCount={clientCount}
          supplierCount={gatedSupplierCount}
          connSearch={connSearch}
          onConnSearchChange={onConnSearchChange}
          connFilter={connFilter}
          onConnFilterChange={onConnFilterChange}
          discoverSearch={discoverSearch}
          discoverOrgSearch={discoverOrgSearch}
          onDiscoverSearchChange={onDiscoverSearchChange}
          discoverInviteCount={discoverInviteCount}
          discoverInviteLimit={discoverInviteLimit}
          onDiscoverInviteCountChange={onDiscoverInviteCountChange}
          onOpenProfileFromConnection={onOpenProfileFromConnection}
          onOpenProfileFromDiscover={onOpenProfileFromDiscover}
          onPressMutuals={onPressMutuals}
          onOpenMutualProfile={onOpenMutualProfile}
          onConnectionsComputed={setAllConnections}
          onChatIntegrated={(item) => {
            if (item.linked_organization_id) {
              openChatWithPartner(item.linked_organization_id);
            }
          }}
        />
      );
    }

    if (tab === "chat") {
      return (
        <NetworkDesktopChatIntroPanel
          partners={integratedChatPartners}
          selectedOrgId={chatPartnerOrgId}
          onSelectPartner={(orgId) => setChatPartnerOrgId(orgId)}
        />
      );
    }

    return (
      <NetworkDesktopNetworkPanel
        orgId={orgId}
        totalConnections={totalConnections}
        clientCount={clientCount}
        supplierCount={gatedSupplierCount}
        connSearch={connSearch}
        onConnSearchChange={onConnSearchChange}
        connFilter={connFilter}
        onConnFilterChange={onConnFilterChange}
        discoverSearch={discoverSearch}
        discoverOrgSearch={discoverOrgSearch}
        onDiscoverSearchChange={onDiscoverSearchChange}
        discoverInviteCount={discoverInviteCount}
        discoverInviteLimit={discoverInviteLimit}
        onDiscoverInviteCountChange={onDiscoverInviteCountChange}
        onOpenProfileFromConnection={onOpenProfileFromConnection}
        onOpenProfileFromDiscover={onOpenProfileFromDiscover}
        onPressMutuals={onPressMutuals}
        onOpenMutualProfile={onOpenMutualProfile}
        onConnectionsComputed={setAllConnections}
        onChatIntegrated={(item) => {
          if (item.linked_organization_id) {
            openChatWithPartner(item.linked_organization_id);
          }
        }}
      />
    );
  })();

  const hubStats = [
    { value: String(totalConnections), label: "CONNECTIONS" },
    { value: String(clientCount), label: "CLIENTS" },
    ...(canUseSuppliers
      ? [{ value: String(gatedSupplierCount), label: "SUPPLIERS" }]
      : []),
    ...(canUseFleet ? [{ value: String(gatedDriverCount), label: "FLEET" }] : []),
  ];

  const statCellCompactStyle = layout.statCellGridCorner;

  const hubScroll = (
    <ScrollView
      style={[styles.root, layout.hubRoot]}
      contentContainerStyle={[
        styles.scrollContent,
        layout.scrollContent,
        {
          paddingBottom:
            (compact ? layoutInsets.scrollBottomPadding(12) : 24) + bottomScrollInset,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {compact ? (
        <View style={mobile.pageChrome}>
          {showMobileCloseChrome ? (
          <View style={mobile.chromeTopRow}>
            <Pressable
              style={[
                mobile.chromeInlineAction,
                {
                  width: Layout.minTouchTargetSize,
                  height: Layout.minTouchTargetSize,
                  borderRadius: Layout.minTouchTargetSize / 2,
                },
              ]}
              onPress={closePage}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close company profile"
            >
              <X size={18} color={METRONIC.text} strokeWidth={2.4} />
            </Pressable>
            <View style={mobile.chromeTitleBlock}>
              <Text style={mobile.chromeTitle} numberOfLines={2}>
                {orgName}
              </Text>
              <Text style={mobile.chromeSubtitle} numberOfLines={1}>
                {[modelLabel, email !== "—" ? email : null].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Pressable
              onPress={() => selectTab("profile")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="My profile"
            >
              {logoUri ? (
                <Image
                  source={{ uri: logoUri }}
                  style={{ width: 40, height: 40, borderRadius: 20 }}
                />
              ) : (
                <PartyAvatar name={orgName} entityType="client" size={40} shape="circle" />
              )}
            </Pressable>
          </View>
          ) : null}
          <View style={mobile.chromeMetaRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={mobile.chromePillsScrollInline}
              contentContainerStyle={mobile.chromePillsContentInline}
            >
              <View style={mobile.chromePill}>
                <Text style={mobile.chromePillText}>WORKSPACE</Text>
              </View>
              <View style={mobile.chromePill}>
                <Text style={mobile.chromePillText}>{modelLabel.toUpperCase()}</Text>
              </View>
              <View style={mobile.chromePill}>
                <Text style={mobile.chromePillText}>
                  {totalConnections} CONNECTION{totalConnections === 1 ? "" : "S"}
                </Text>
              </View>
            </ScrollView>
            <Pressable
              style={[
                mobile.chromeInviteBtn,
                invitationsOpen && mobile.chromeInviteBtnActive,
              ]}
              onPress={() => onInvitationsOpenChange(!invitationsOpen)}
              accessibilityRole="button"
              accessibilityLabel="Connection invites"
            >
              <UserPlus size={14} color={Theme.textOnPrimary} strokeWidth={2.2} />
              <Text style={mobile.chromeInviteBtnText}>
                {pendingInviteCount > 0 ? `Invites (${pendingInviteCount})` : "Invites"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <NetworkDesktopHubHero
          orgId={orgId}
          orgName={orgName}
          email={email}
          modelLabel={modelLabel}
          totalConnections={totalConnections}
          clientCount={clientCount}
          supplierCount={gatedSupplierCount}
          onProfilePress={() => selectTab("profile")}
          hideHeaderChrome={hideHeaderChrome}
        />
      )}

      <View style={[styles.tabBar, layout.tabBar]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={compact ? mobile.tabScrollCompact : styles.tabScroll}
          contentContainerStyle={
            compact ? mobile.tabScrollContentCompact : styles.tabScrollContent
          }
        >
          {TABS.map((t) => {
            const active = !invitationsOpen && tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => selectTab(t.id)}
                style={[
                  styles.tabBtn,
                  layout.tabBtn,
                  active && styles.tabBtnActive,
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.tabText,
                    layout.tabText,
                    active && styles.tabTextActive,
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {compact ? null : (
          <View style={styles.tabActions}>
            <Pressable
              style={[
                styles.tabActionBtn,
                styles.tabActionBtnPrimary,
                invitationsOpen && styles.tabActionBtnInvitesOn,
              ]}
              onPress={() => onInvitationsOpenChange(!invitationsOpen)}
              accessibilityRole="button"
              accessibilityLabel="Connection invites"
            >
              <UserPlus
                size={14}
                color={invitationsOpen ? Theme.textOnPrimary : Theme.textOnPrimary}
              />
              <Text
                style={[
                  styles.tabActionBtnText,
                  styles.tabActionBtnTextOn,
                  invitationsOpen && styles.tabActionBtnTextInvitesOn,
                ]}
              >
                {pendingInviteCount > 0 ? `Invites (${pendingInviteCount})` : "Invites"}
              </Text>
            </Pressable>
            <NetworkExportMenu
              actions={[
                {
                  label: "Export Connections (Excel)",
                  sublabel: "All clients, suppliers & drivers",
                  kind: "excel",
                  onExport: () =>
                    exportConnectionsExcel(
                      allConnections,
                      organization?.name ?? "Workspace",
                    ),
                },
              ]}
              triggerStyle={styles.tabActionIconBtn}
            />
          </View>
        )}
      </View>

      {compact ? (
        <View style={layout.metricsWrap}>
          <View style={[styles.statsBar, layout.statsBar, layout.statsBarGrid]}>
            {hubStats.map((stat, idx) => (
              <View
                key={stat.label}
                style={[
                  styles.statCell,
                  layout.statCellGrid,
                  statCellCompactStyle(idx),
                ]}
              >
                <Text style={[styles.statValue, layout.statValue]}>{stat.value}</Text>
                <Text style={[styles.statLabel, layout.statLabel]}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {panel}
      {!compact ? <NetworkSupportHelpCards /> : null}
    </ScrollView>
  );

  return (
    <>
      {hubScroll}
      {chatOpen && orgId ? (
        <NetworkDesktopChatOverlay
          visible
          orgId={orgId}
          orgName={orgName}
          onClose={() => {
            setChatOpen(false);
            if (tab === "chat") setTab("network");
          }}
          joinRequest={pendingJoinInvite}
          integratedPartners={integratedChatPartners}
          initialPartnerOrgId={chatPartnerOrgId}
        />
      ) : null}
    </>
  );
}
