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
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { MessageSquare, MoreHorizontal, UserPlus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

export type NetworkDesktopTab =
  | "details"
  | "sales"
  | "goals"
  | "asset"
  | "connections"
  | "grow";

const TABS: { id: NetworkDesktopTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "sales", label: "Connection sales" },
  { id: "goals", label: "Goals" },
  { id: "asset", label: "Asset sales" },
  { id: "connections", label: "Your connections" },
  { id: "grow", label: "Grow your network" },
];

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
  onInvitationsPress: () => void;
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
  onInvitationsPress,
}: Props) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<NetworkDesktopTab>("details");
  const orgName = organization?.name?.trim() || "Your workspace";
  const email = profile?.email?.trim() || "—";
  const modelLabel =
    organization?.operatingModel?.replace(/_/g, " ") ?? "Logistics workspace";

  const panel = (() => {
    if (!orgId) {
      return (
        <View style={styles.emptyWrap}>
          <LoadingIndicator color={Theme.primary} />
        </View>
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
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
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
            style={[styles.tabActionBtn, styles.tabActionBtnPrimary]}
            onPress={onInvitationsPress}
          >
            <UserPlus size={14} color={Theme.textOnPrimary} />
            <Text style={[styles.tabActionBtnText, styles.tabActionBtnTextOn]}>
              {pendingInviteCount > 0 ? `Invites (${pendingInviteCount})` : "Invites"}
            </Text>
          </Pressable>
          <Pressable style={styles.tabActionIconBtn}>
            <MessageSquare size={16} color={METRONIC.text} />
          </Pressable>
          <Pressable style={styles.tabActionIconBtn}>
            <MoreHorizontal size={16} color={METRONIC.text} />
          </Pressable>
        </View>
      </View>

      {panel}
    </ScrollView>
  );
}
