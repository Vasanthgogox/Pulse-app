/**
 * Desktop Network hub — Metronic profile header, tabbed panels (details / sales /
 * your connections / grow network).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
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
import { NetworkDesktopAssetSalesPanel } from "@/features/network/components/desktop/NetworkDesktopAssetSalesPanel";
import { NetworkDesktopConnectionsPanel } from "@/features/network/components/desktop/NetworkDesktopConnectionsPanel";
import { NetworkDesktopInvitationsPanel } from "@/features/network/components/desktop/NetworkDesktopInvitationsPanel";
import { NetworkDesktopConnectionSalesPanel } from "@/features/network/components/desktop/NetworkDesktopConnectionSalesPanel";
import { NetworkDesktopDetailsPanel } from "@/features/network/components/desktop/NetworkDesktopDetailsPanel";
import { NetworkDesktopGoalsPanel } from "@/features/network/components/desktop/NetworkDesktopGoalsPanel";
import { NetworkDesktopGrowPanel } from "@/features/network/components/desktop/NetworkDesktopGrowPanel";
import { NetworkDesktopHubHero } from "@/features/network/components/desktop/NetworkDesktopHubHero";
import { NetworkDesktopProfilePanel } from "@/features/network/components/desktop/NetworkDesktopProfilePanel";
import { NetworkDesktopTeamPanel } from "@/features/network/components/desktop/NetworkDesktopTeamPanel";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { NetworkSupportHelpCards } from "@/features/network/components/NetworkSupportHelpCards";
import { NetworkExportMenu } from "@/features/network/components/desktop/NetworkExportMenu";
import { exportConnectionsExcel } from "@/features/network/lib/networkExport.util";
import type { InboundProtocolInviteItem } from "@/lib/globalSync/inboundProtocol.types";
import type { NetworkChatPartner } from "@/features/network/components/desktop/NetworkDesktopChatFlexPanel";
import { NetworkDesktopChatIntroPanel } from "@/features/network/components/desktop/NetworkDesktopChatIntroPanel";
import { networkDesktopChatStyles as chatStyles } from "@/features/network/components/desktop/networkDesktopChat.styles";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { ChevronLeft, MessageSquare, MoreHorizontal, UserPlus } from "lucide-react-native";
import { useRouter } from "expo-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

const NetworkDesktopChatOverlay = lazy(
  () => import("@/features/network/components/desktop/NetworkDesktopChatOverlay")
    .then(m => ({ default: m.NetworkDesktopChatOverlay })),
);
import { Image, Pressable, ScrollView, Text, View } from "react-native";

export type NetworkDesktopTab =
  | "details"
  | "team"
  | "profile"
  | "sales"
  | "goals"
  | "asset"
  | "connections"
  | "grow"
  | "chat";

const TABS: { id: NetworkDesktopTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "team", label: "Team" },
  { id: "profile", label: "My Profile" },
  { id: "sales", label: "Connection sales" },
  { id: "goals", label: "Goals" },
  { id: "asset", label: "Asset sales" },
  { id: "connections", label: "Your connections" },
  { id: "grow", label: "Grow your network" },
  { id: "chat", label: "Chat" },
];

function parseHubTab(raw: string | undefined): NetworkDesktopTab | null {
  if (
    raw === "details" ||
    raw === "team" ||
    raw === "profile" ||
    raw === "sales" ||
    raw === "goals" ||
    raw === "asset" ||
    raw === "connections" ||
    raw === "grow" ||
    raw === "chat"
  ) {
    return raw;
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
}: Props) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const canGoBack = router.canGoBack();
  const layout = useProfileHubCompactLayout();
  const compact = layout.compact;
  const layoutInsets = useLayoutInsets();
  const { logoUri } = useWorkspaceOrgLogo();
  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const [tab, setTab] = useState<NetworkDesktopTab>(
    () => parseHubTab(initialTab) ?? "details",
  );
  const [chatOpen, setChatOpen] = useState(() => parseHubTab(initialTab) === "chat");
  const [allConnections, setAllConnections] = useState<ConnectedOrg[]>([]);
  const [chatPartnerOrgId, setChatPartnerOrgId] = useState<string | null>(null);
  const orgName = organization?.name?.trim() || "Your workspace";
  const email = profile?.email?.trim() || "—";
  const modelLabel =
    organization?.operatingModel?.replace(/_/g, " ") ?? "Logistics workspace";
  const canManageTeam = profile?.role !== "driver";

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
    setTab(next);
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

    if (tab === "details") {
      return (
        <NetworkDesktopDetailsPanel
          orgId={orgId}
          organization={organization}
          email={email}
          phone={profile?.phone}
          totalConnections={totalConnections}
          clientCount={clientCount}
          supplierCount={supplierCount}
          driverCount={driverCount}
          pendingInviteCount={pendingInviteCount}
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
        <NetworkDesktopConnectionSalesPanel
          orgId={orgId}
          onOpenProfile={onOpenProfileFromConnection}
          onOpenDiscoverProfile={onOpenProfileFromDiscover}
          onGoToGrowTab={() => setTab("grow")}
          inviteDailyCapReached={
            discoverInviteCount >= discoverInviteLimit
          }
        />
      );
    }

    if (tab === "goals") {
      return <NetworkDesktopGoalsPanel orgId={orgId} />;
    }

    if (tab === "asset") {
      return <NetworkDesktopAssetSalesPanel orgId={orgId} />;
    }

    if (tab === "connections") {
      return (
        <NetworkDesktopConnectionsPanel
          orgId={orgId}
          totalConnections={totalConnections}
          connSearch={connSearch}
          onConnSearchChange={onConnSearchChange}
          connFilter={connFilter}
          onConnFilterChange={onConnFilterChange}
          onOpenProfile={onOpenProfileFromConnection}
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
      <NetworkDesktopGrowPanel
        orgId={orgId}
        search={discoverSearch}
        orgSearch={discoverOrgSearch}
        onSearchChange={onDiscoverSearchChange}
        totalConnections={totalConnections}
        clientCount={clientCount}
        supplierCount={supplierCount}
        discoverInviteCount={discoverInviteCount}
        discoverInviteLimit={discoverInviteLimit}
        onInviteCountChange={onDiscoverInviteCountChange}
        onOpenProfile={onOpenProfileFromDiscover}
        onPressMutuals={onPressMutuals}
        onOpenMutualProfile={onOpenMutualProfile}
      />
    );
  })();

  const hubStats = [
    { value: String(totalConnections), label: "CONNECTIONS" },
    { value: String(clientCount), label: "CLIENTS" },
    { value: String(supplierCount), label: "SUPPLIERS" },
    { value: String(driverCount), label: "FLEET" },
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
          <View style={mobile.chromeTopRow}>
            {canGoBack ? (
              <Pressable
                style={mobile.chromeInlineAction}
                onPress={() => router.back()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <ChevronLeft size={18} color={METRONIC.text} strokeWidth={2.4} />
              </Pressable>
            ) : null}
            <View style={mobile.chromeTitleBlock}>
              <Text style={mobile.chromeTitle} numberOfLines={2}>
                {orgName}
              </Text>
              <Text style={mobile.chromeSubtitle} numberOfLines={1}>
                {[modelLabel, email !== "—" ? email : null].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Pressable
              style={[
                mobile.chromeInlineAction,
                (chatOpen || tab === "chat") && mobile.chromeInlineActionActive,
              ]}
              onPress={() => {
                if (chatOpen || tab === "chat") {
                  setChatOpen(false);
                  if (tab === "chat") setTab("connections");
                  return;
                }
                openChatWithPartner(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={chatOpen ? "Close chat" : "Open chat"}
            >
              <MessageSquare
                size={16}
                color={chatOpen || tab === "chat" ? Theme.primary : METRONIC.text}
                strokeWidth={2}
              />
            </Pressable>
            <Pressable style={mobile.chromeInlineAction} hitSlop={8}>
              <MoreHorizontal size={16} color={METRONIC.text} strokeWidth={2} />
            </Pressable>
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
          supplierCount={supplierCount}
          onProfilePress={() => selectTab("profile")}
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
            <Pressable
              style={[
                styles.tabActionIconBtn,
                (chatOpen || tab === "chat") && chatStyles.tabActionIconBtnActive,
              ]}
              onPress={() => {
                if (chatOpen || tab === "chat") {
                  setChatOpen(false);
                  if (tab === "chat") setTab("connections");
                  return;
                }
                openChatWithPartner(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={chatOpen ? "Close chat" : "Open chat"}
            >
              <MessageSquare
                size={16}
                color={chatOpen || tab === "chat" ? Theme.primary : METRONIC.text}
              />
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
            <Pressable style={styles.tabActionIconBtn} hitSlop={8}>
              <MoreHorizontal size={16} color={METRONIC.text} />
            </Pressable>
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
        <Suspense fallback={null}>
          <NetworkDesktopChatOverlay
            visible
            orgId={orgId}
            orgName={orgName}
            onClose={() => {
              setChatOpen(false);
              if (tab === "chat") setTab("connections");
            }}
            joinRequest={pendingJoinInvite}
            integratedPartners={integratedChatPartners}
            initialPartnerOrgId={chatPartnerOrgId}
          />
        </Suspense>
      ) : null}
    </>
  );
}
