/**
 * Your connections — 4-across horizontal card scroll + partners performance table.
 */
import {
  ConnectionsView,
  type ConnectedOrg,
  type ConnectionFilterTab,
} from "@/features/network/components/ConnectionsView";
import { NetworkDesktopPartnersPerformanceTable } from "@/features/network/components/desktop/NetworkDesktopPartnersPerformanceTable";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import {
  defaultSalesFilters,
  type SalesCrossFilters,
  type SalesRoleFilter,
} from "@/features/network/utils/connectionSalesAnalytics.util";
import { useTripsQuery } from "@/lib/queries/useTripsQuery";
import { Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

const FILTER_TABS: ConnectionFilterTab[] = ["ALL", "CLIENT", "SUPPLIER", "DRIVER"];

type Props = {
  orgId: string;
  totalConnections: number;
  connSearch: string;
  onConnSearchChange: (v: string) => void;
  connFilter: ConnectionFilterTab;
  onConnFilterChange: (v: ConnectionFilterTab) => void;
  onOpenProfile: (item: ConnectedOrg) => void;
  onConnectionsComputed?: (connections: ConnectedOrg[]) => void;
};

export function NetworkDesktopConnectionsPanel({
  orgId,
  totalConnections,
  connSearch,
  onConnSearchChange,
  connFilter,
  onConnFilterChange,
  onOpenProfile,
  onConnectionsComputed,
}: Props) {
  const [connections, setConnections] = useState<ConnectedOrg[]>([]);

  const handleConnectionsComputed = (items: ConnectedOrg[]) => {
    setConnections(items);
    onConnectionsComputed?.(items);
  };
  const tripsQ = useTripsQuery(orgId);
  const trips = tripsQ.data ?? [];

  const partnerFilters = useMemo((): SalesCrossFilters => {
    const base = defaultSalesFilters();
    const roles = new Set<SalesRoleFilter>();
    if (connFilter === "CLIENT") roles.add("CLIENT");
    if (connFilter === "SUPPLIER") roles.add("SUPPLIER");
    return {
      ...base,
      search: connSearch,
      roles,
    };
  }, [connSearch, connFilter]);

  return (
    <View style={styles.panel}>
      <View style={styles.sectionToolbar}>
        <View>
          <Text style={styles.sectionTitle}>
            Showing {totalConnections} connections
          </Text>
          <Text style={styles.sectionSub}>Your clients, suppliers, and fleet</Text>
        </View>
        <View style={styles.filterRow}>
          <Pressable style={styles.filterPill}>
            <Text style={styles.filterPillText}>Active</Text>
          </Pressable>
          <Pressable style={styles.filterPill}>
            <Text style={styles.filterPillText}>Latest</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.filterRow}>
        {FILTER_TABS.map((f) => {
          const active = connFilter === f;
          return (
            <Pressable
              key={f}
              onPress={() => onConnFilterChange(f)}
              style={[styles.filterPill, active && styles.filterPillOn]}
            >
              <Text style={[styles.filterPillText, active && styles.filterPillTextOn]}>
                {f}
              </Text>
            </Pressable>
          );
        })}
        <View style={styles.searchBox}>
          <Search size={14} color={METRONIC.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Type name, team…"
            placeholderTextColor={METRONIC.muted}
            value={connSearch}
            onChangeText={onConnSearchChange}
          />
        </View>
      </View>

      <View style={styles.connectionsCardsSection}>
        <ConnectionsView
          orgId={orgId}
          embedded
          hubMode
          desktopMetronicGrid
          desktopMetronicHorizontalScroll
          hubSearch={connSearch}
          hubFilter={connFilter}
          onOpenProfile={onOpenProfile}
          onConnectionsComputed={handleConnectionsComputed}
        />
      </View>

      <NetworkDesktopPartnersPerformanceTable
        connections={connections}
        trips={trips}
        baseFilters={partnerFilters}
        onOpenProfile={onOpenProfile}
        companyName="Your workspace"
        dateRangeLabel={connFilter === "ALL" ? "All connections" : connFilter}
      />
    </View>
  );
}
