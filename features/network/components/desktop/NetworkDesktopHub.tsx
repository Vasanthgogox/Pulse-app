/**
 * Desktop Network hub — Metronic profile header, tabbed panels (details / sales /
 * your connections / grow network).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
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
import { NetworkDesktopConnectionSalesPanel } from "@/features/network/components/desktop/NetworkDesktopConnectionSalesPanel";
import { NetworkDesktopDetailsPanel } from "@/features/network/components/desktop/NetworkDesktopDetailsPanel";
import { NetworkDesktopGoalsPanel } from "@/features/network/components/desktop/NetworkDesktopGoalsPanel";
import { NetworkDesktopGrowPanel } from "@/features/network/components/desktop/NetworkDesktopGrowPanel";
import { NetworkDesktopHubHero } from "@/features/network/components/desktop/NetworkDesktopHubHero";
import { NetworkDesktopInvitationsPanel } from "@/features/network/components/desktop/NetworkDesktopInvitationsPanel";
import { NetworkDesktopTeamPanel } from "@/features/network/components/desktop/NetworkDesktopTeamPanel";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { NetworkExportMenu } from "@/features/network/components/desktop/NetworkExportMenu";
import { exportConnectionsExcel } from "@/features/network/lib/networkExport.util";
import type { InboundProtocolInviteItem } from "@/lib/globalSync/inboundProtocol.types";
import { MessageSquare, MoreHorizontal, UserPlus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ROUTES } from "@/lib/routes";

export type NetworkDesktopTab =
  | "details"
  | "team"
  | "sales"
  | "goals"
  | "asset"
  | "connections"
  | "grow";

const TABS: { id: NetworkDesktopTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "team", label: "Team" },
  { id: "sales", label: "Connection sales" },
  { id: "goals", label: "Goals" },
  { id: "asset", label: "Asset sales" },
  { id: "connections", label: "Your connections" },
  { id: "grow", label: "Grow your network" },
];

function parseHubTab(raw: string | undefined): NetworkDesktopTab | null {
  if (
    raw === "details" ||
    raw === "team" ||
    raw === "sales" ||
    raw === "goals" ||
    raw === "asset" ||
    raw === "connections" ||
    raw === "grow"
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
}: Props) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<NetworkDesktopTab>(
    () => parseHubTab(initialTab) ?? "details",
  );
  const [allConnections, setAllConnections] = useState<ConnectedOrg[]>([]);
  const orgName = organization?.name?.trim() || "Your workspace";
  const email = profile?.email?.trim() || "—";
  const modelLabel =
    organization?.operatingModel?.replace(/_/g, " ") ?? "Logistics workspace";
  const canManageTeam = profile?.role !== "driver";

  useEffect(() => {
    const parsed = parseHubTab(initialTab);
    if (parsed) setTab(parsed);
  }, [initialTab]);

  const handleInviteTeamMember = () => {
    router.push(ROUTES.MODALS.INVITE_MEMBER as never);
  };

  const selectTab = (next: NetworkDesktopTab) => {
    onInvitationsOpenChange(false);
    setTab(next);
  };

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
          onInvite={handleInviteTeamMember}
        />
      );
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

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <NetworkDesktopHubHero
        orgId={orgId}
        orgName={orgName}
        email={email}
        modelLabel={modelLabel}
        totalConnections={totalConnections}
        clientCount={clientCount}
        supplierCount={supplierCount}
      />

      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabScrollContent}
        >
          {TABS.map((t) => {
            const active = !invitationsOpen && tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => selectTab(t.id)}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
            style={styles.tabActionIconBtn}
            onPress={() => router.push(ROUTES.CHAT as never)}
            accessibilityRole="button"
            accessibilityLabel="Open chat"
          >
            <MessageSquare size={16} color={METRONIC.text} />
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
      </View>

      {panel}
    </ScrollView>
  );
}
