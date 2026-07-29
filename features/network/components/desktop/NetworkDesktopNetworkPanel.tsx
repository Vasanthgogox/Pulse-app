/**
 * Merged Network tab — reference split layout:
 * left Intelligent filters + profiles-connected widgets,
 * right Your connections + Discover partners.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import type {
  ConnectedOrg,
  ConnectionFilterTab,
} from "@/features/network/components/ConnectionsView";
import { NetworkDesktopConnectionsPanel } from "@/features/network/components/desktop/NetworkDesktopConnectionsPanel";
import { NetworkDesktopGrowPanel } from "@/features/network/components/desktop/NetworkDesktopGrowPanel";
import { NetworkDesktopSalesGrowWidget } from "@/features/network/components/desktop/NetworkDesktopSalesGrowWidget";
import { NetworkDesktopSidebarFeatureAd } from "@/features/network/components/desktop/NetworkDesktopSidebarFeatureAd";
import { NetworkDesktopSidebarPromoBanners } from "@/features/network/components/desktop/NetworkDesktopSidebarPromoBanners";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { DiscoverOrg } from "@/features/network/services/discover.service";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { MoreVertical, UserPlus } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  type ViewStyle,
} from "react-native";

type Props = {
  orgId: string;
  totalConnections: number;
  clientCount: number;
  supplierCount: number;
  connSearch: string;
  onConnSearchChange: (v: string) => void;
  connFilter: ConnectionFilterTab;
  onConnFilterChange: (v: ConnectionFilterTab) => void;
  discoverSearch: string;
  discoverOrgSearch: string;
  onDiscoverSearchChange: (v: string) => void;
  discoverInviteCount: number;
  discoverInviteLimit: number;
  onDiscoverInviteCountChange: (count: number, limit: number) => void;
  onOpenProfileFromConnection: (item: ConnectedOrg) => void;
  onOpenProfileFromDiscover: (org: DiscoverOrg) => void;
  onPressMutuals: (org: { id: string; name: string }) => void;
  onOpenMutualProfile: (org: MutualConnectionRow) => void;
  onConnectionsComputed?: (connections: ConnectedOrg[]) => void;
  onChatIntegrated?: (item: ConnectedOrg) => void;
};

type ConnSortMode = "recommended" | "active" | "alpha";

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.salesFilterChip, active && styles.salesFilterChipOn]}
    >
      <Text
        style={[
          styles.salesFilterChipText,
          active && styles.salesFilterChipTextOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const SIDEBAR_PROFILE_LIMIT = 4;

export function NetworkDesktopNetworkPanel({
  orgId,
  totalConnections,
  clientCount,
  supplierCount,
  connSearch,
  onConnSearchChange,
  connFilter,
  onConnFilterChange,
  discoverSearch,
  discoverOrgSearch,
  onDiscoverSearchChange,
  discoverInviteCount,
  discoverInviteLimit,
  onDiscoverInviteCountChange,
  onOpenProfileFromConnection,
  onOpenProfileFromDiscover,
  onPressMutuals,
  onOpenMutualProfile,
  onConnectionsComputed,
  onChatIntegrated,
}: Props) {
  const compact = useProfileHubCompact();
  const growAnchorRef = useRef<View>(null);
  const [connections, setConnections] = useState<ConnectedOrg[]>([]);
  const [sortMode, setSortMode] = useState<ConnSortMode>("recommended");

  const handleConnectionsComputed = useCallback(
    (items: ConnectedOrg[]) => {
      setConnections(items);
      onConnectionsComputed?.(items);
    },
    [onConnectionsComputed],
  );

  const sidebarProfiles = useMemo(
    () => connections.slice(0, SIDEBAR_PROFILE_LIMIT),
    [connections],
  );

  const filtersActive = connFilter !== "ALL" || sortMode !== "recommended";

  const clearFilters = () => {
    onConnFilterChange("ALL");
    setSortMode("recommended");
  };

  const scrollToGrow = () => {
    if (Platform.OS === "web") {
      const node = growAnchorRef.current as unknown as {
        scrollIntoView?: (opts?: ScrollIntoViewOptions) => void;
      } | null;
      node?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
  };

  const splitStyle: ViewStyle = compact
    ? local.splitStacked
    : local.splitRow;
  const sidebarStyle: ViewStyle = compact
    ? local.sidebarStacked
    : local.sidebarFixed;

  return (
    <View style={[styles.salesBody, local.body]}>
      <View style={splitStyle}>
        <View style={sidebarStyle}>
          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Intelligent filters</Text>
            <Text style={styles.salesFilterHint}>
              Narrow connections by role and activity
            </Text>

            <Text style={styles.salesFilterGroup}>Sort</Text>
            <View style={styles.tagWrap}>
              <FilterChip
                label="Recommended"
                active={sortMode === "recommended"}
                onPress={() => setSortMode("recommended")}
              />
              <FilterChip
                label="Most active"
                active={sortMode === "active"}
                onPress={() => setSortMode("active")}
              />
              <FilterChip
                label="A–Z"
                active={sortMode === "alpha"}
                onPress={() => setSortMode("alpha")}
              />
            </View>

            <Text style={styles.salesFilterGroup}>Role</Text>
            <View style={styles.tagWrap}>
              {(
                [
                  ["ALL", "All"],
                  ["CLIENT", "Clients"],
                  ["SUPPLIER", "Suppliers"],
                  ["DRIVER", "Fleet"],
                ] as const
              ).map(([value, label]) => (
                <FilterChip
                  key={value}
                  label={label}
                  active={connFilter === value}
                  onPress={() => onConnFilterChange(value)}
                />
              ))}
            </View>

            {filtersActive ? (
              <Pressable onPress={clearFilters} style={styles.salesClearBtn}>
                <Text style={styles.salesClearBtnText}>Clear all filters</Text>
              </Pressable>
            ) : null}
          </View>

          <NetworkDesktopSalesGrowWidget
            orgId={orgId}
            onOpenProfile={onOpenProfileFromDiscover}
            onViewAllGrow={scrollToGrow}
            inviteDailyCapReached={
              discoverInviteCount >= discoverInviteLimit
            }
          />

          <NetworkDesktopSidebarPromoBanners />

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>
              {connections.length} profiles connected
            </Text>
            {sidebarProfiles.map((item, idx) => {
              const tripsCount = item.total_trips ?? 0;
              const entityType =
                item.role === "DRIVER"
                  ? "driver"
                  : item.role === "SUPPLIER"
                    ? "supplier"
                    : "client";
              return (
                <Pressable
                  key={`${item.role}-${item.id}`}
                  onPress={() => onOpenProfileFromConnection(item)}
                  style={[
                    styles.growConnectedRow,
                    idx === sidebarProfiles.length - 1 &&
                      styles.growConnectedRowLast,
                  ]}
                >
                  <PartyAvatar
                    name={item.name}
                    initialsColorSeed={item.id}
                    avatarUrl={item.avatar_url}
                    avatarSeed={item.avatar_seed}
                    entityType={entityType}
                    size={36}
                  />
                  <View style={styles.salesContributorTextCol}>
                    <Text style={styles.salesContributorName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.salesContributorMeta}>
                      {tripsCount} trips · {item.role.toLowerCase()}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.growConnectedMenu}
                    hitSlop={8}
                    onPress={() => onOpenProfileFromConnection(item)}
                  >
                    <MoreVertical size={14} color={METRONIC.muted} />
                  </Pressable>
                </Pressable>
              );
            })}
            {sidebarProfiles.length === 0 ? (
              <Text style={styles.salesEmptySide}>
                Connect partners to see them here.
              </Text>
            ) : null}
            <Pressable
              style={styles.growConnectProfileBtn}
              onPress={scrollToGrow}
              accessibilityRole="button"
              accessibilityLabel="Connect profile"
            >
              <UserPlus size={14} color={METRONIC.text} />
              <Text style={styles.growConnectProfileBtnText}>
                Connect profile
              </Text>
            </Pressable>
          </View>

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Network snapshot</Text>
            <View style={styles.salesContributorRow}>
              <Text style={styles.salesContributorMeta}>Clients</Text>
              <Text style={styles.salesContributorName}>{clientCount}</Text>
            </View>
            <View style={styles.salesContributorRow}>
              <Text style={styles.salesContributorMeta}>Suppliers</Text>
              <Text style={styles.salesContributorName}>{supplierCount}</Text>
            </View>
            <View
              style={[
                styles.salesContributorRow,
                styles.salesContributorRowLast,
              ]}
            >
              <Text style={styles.salesContributorMeta}>Total</Text>
              <Text style={styles.salesContributorName}>{totalConnections}</Text>
            </View>
          </View>

          <NetworkDesktopSidebarFeatureAd layout="stack" />
        </View>

        <View style={local.mainCol}>
          <NetworkDesktopConnectionsPanel
            orgId={orgId}
            totalConnections={totalConnections}
            connSearch={connSearch}
            onConnSearchChange={onConnSearchChange}
            connFilter={connFilter}
            onConnFilterChange={onConnFilterChange}
            onOpenProfile={onOpenProfileFromConnection}
            onConnectionsComputed={handleConnectionsComputed}
            onChatIntegrated={onChatIntegrated}
            onConnectProfile={scrollToGrow}
            hubSortMode={sortMode}
            onHubSortModeChange={setSortMode}
            embedded
          />

          <View style={local.sectionDivider} />

          <View ref={growAnchorRef} collapsable={false}>
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
              embedded
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const local: Record<string, ViewStyle> = {
  body: {
    backgroundColor: METRONIC.bodyBg,
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
    flexWrap: "nowrap",
  },
  splitStacked: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
    width: "100%",
  },
  sidebarFixed: {
    width: 280,
    maxWidth: 300,
    flexShrink: 0,
    gap: 10,
  },
  sidebarStacked: {
    width: "100%",
    gap: 10,
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: METRONIC.border,
    marginVertical: 14,
    opacity: 0.85,
  },
};
