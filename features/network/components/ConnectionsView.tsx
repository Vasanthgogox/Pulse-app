/**
 * Connections tab — clients, suppliers, and fleet drivers.
 * `hubMode`: Network screen layout (nested cards, shared header search/filters in parent).
 */
import Theme from '@/constants/Theme';
import {
  HubConnectionListCard,
  type HubConnectionItem,
} from "@/features/network/components/NetworkConnectionHubCards";
import { runConnectionInvite } from "@/features/network/utils/connectionInvite.util";
import {
  averageScore,
  getRatingsForDrivers,
  getRatingsForSuppliers,
} from '@/features/ratings';
import { useClientsQuery, useDriversQuery, useSuppliersQuery } from '@/lib/queries';
import { getInitials } from '@/lib/stringUtils';
import {
  LayoutGrid,
  List,
  MessageCircle,
  Search,
  Users,
  Zap,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

export type ConnectionFilterTab = 'ALL' | 'CLIENT' | 'SUPPLIER' | 'DRIVER';

interface ConnectionsViewProps {
  orgId: string;
  onRefresh?: () => void;
  onOpenProfile?: (item: ConnectedOrg) => void;
  onConnectionsComputed?: (items: ConnectedOrg[]) => void;
  /** Render list without internal scroll (nested in parent ScrollView). */
  embedded?: boolean;
  /**
   * Network hub: parent owns dark header search + filter pills; use hub card layout.
   * Pass `hubSearch` + `hubFilter` (controlled).
   */
  hubMode?: boolean;
  hubSearch?: string;
  hubFilter?: ConnectionFilterTab;
}

const COVER_TOKENS = [Theme.ledgerNetBarBg, Theme.textPrimaryDark, Theme.cinematicHeaderBg, Theme.primary, Theme.darkGreen, Theme.teslaRed] as const;
function seedColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % COVER_TOKENS.length;
  return COVER_TOKENS[h];
}

function subtleAvatarTone(seed: string): { bg: string; border: string; text: string; dot: string } {
  const shift = seed.length % 2;
  return {
    bg: shift === 0 ? "#F8FAFC" : "#F1F5F9",
    border: "#EEF2F7",
    text: shift === 0 ? "#64748B" : "#475569",
    dot: "#94A3B8",
  };
}

function roleTone(role: ConnectedOrg["role"]) {
  if (role === "CLIENT") return { bg: Theme.networkClientTintBg, text: Theme.primary };
  if (role === "DRIVER") return { bg: Theme.networkDriverTintBg, text: Theme.warning };
  return { bg: Theme.networkSupplierTintBg, text: Theme.positive };
}

export interface ConnectedOrg {
  id: string;
  name: string;
  role: 'CLIENT' | 'SUPPLIER' | 'DRIVER';
  is_integrated: boolean;
  avatar_url?: string | null;
  avatar_seed?: string | null;
  mutual_count?: number | null;
  rating?: number | null;
  phone?: string | null;
  linked_organization_id?: string | null;
}

// ─── Grid Card (LinkedIn-style: cover + overlapping avatar) ───────────────────

function GridCard({ item }: { item: ConnectedOrg }) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const color = seedColor(item.id);
  const avatarTone = subtleAvatarTone(item.id);
  const tone = roleTone(item.role);
  const roleSub = item.role === "CLIENT" ? "Client" : item.role === "DRIVER" ? "Driver" : "Supplier";

  const onIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Pressable onPressIn={onIn} onPressOut={onOut} style={styles.gridCardWrap}>
      <Animated.View style={[styles.gridCard, { transform: [{ scale }] }]}>
        <View style={[styles.gridCover, { backgroundColor: color }]} />
        <View
          style={[
            styles.onlineIndicator,
            { backgroundColor: item.is_integrated ? Theme.positive : Theme.borderMedium },
          ]}
        />
        <View style={styles.gridAvatarOverlap}>
          <View style={[styles.gridAvatar, { backgroundColor: avatarTone.bg, borderColor: avatarTone.border }]}>
            <Text style={[styles.gridAvatarText, { color: avatarTone.text }]}>{getInitials(item.name)}</Text>
            {item.is_integrated && (
              <View style={styles.gridZapDot}>
                <Zap size={7} color="#fff" fill="#fff" />
              </View>
            )}
          </View>
        </View>
        <View style={styles.gridBody}>
          <Text style={styles.gridName} numberOfLines={2}>
            {item.name.toUpperCase()}
          </Text>
          <Text style={styles.gridHeadline} numberOfLines={2}>
            {roleSub}
            {item.is_integrated ? ' · on Pulse' : ' · Not on app'}
          </Text>
          <View style={styles.gridMutualRow}>
            <View style={[styles.gridMiniDot, { backgroundColor: avatarTone.dot }]} />
            <Text style={styles.gridMutualText} numberOfLines={1}>
              In your Q network
            </Text>
          </View>
          <View
            style={[
              styles.gridRoleBadge,
              {
                backgroundColor: tone.bg,
                alignSelf: 'center',
              },
            ]}
          >
            <Text
              style={[
                styles.gridRoleText,
                {
                  color: tone.text,
                },
              ]}
            >
              {item.role}
            </Text>
          </View>
        </View>
        <Pressable style={styles.gridConnectOutline} hitSlop={8}>
          <MessageCircle size={15} color={Theme.primary} strokeWidth={2.2} />
          <Text style={styles.gridConnectOutlineText}>Message</Text>
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

// ─── List Card ────────────────────────────────────────────────────────────────

function ListCard({ item }: { item: ConnectedOrg }) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const avatarTone = subtleAvatarTone(item.id);
  const tone = roleTone(item.role);

  const onIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Pressable onPressIn={onIn} onPressOut={onOut}>
      <Animated.View style={[styles.listCard, { transform: [{ scale }] }]}>
        <View style={[styles.listAvatar, { backgroundColor: avatarTone.bg, borderColor: avatarTone.border }]}>
          <Text style={[styles.listAvatarText, { color: avatarTone.text }]}>{getInitials(item.name)}</Text>
          {item.is_integrated && (
            <View style={styles.listZapDot}>
              <Zap size={7} color="#fff" fill="#fff" />
            </View>
          )}
        </View>

        <View style={styles.listInfo}>
          <Text style={styles.listName} numberOfLines={1}>{item.name.toUpperCase()}</Text>
          <View style={styles.listBadges}>
            <View
              style={[
                styles.roleBadge,
                { backgroundColor: tone.bg },
              ]}
            >
              <Text style={[styles.roleText, { color: tone.text }]}>{item.role}</Text>
            </View>
            {item.is_integrated && (
              <View style={styles.appBadge}>
                <Zap size={8} color={Theme.positive} fill={Theme.positive} />
                <Text style={styles.appBadgeText}>ON APP</Text>
              </View>
            )}
          </View>
        </View>

        <Pressable style={styles.listMsgBtn} hitSlop={10}>
          <MessageCircle size={17} color={Theme.primary} strokeWidth={2} />
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

/** For embedded parent ScrollView: non-scroll FlatList has no height; chunk into rows. */
function chunkForGrid<T>(items: T[], columns: number): T[][] {
  if (columns < 1) return [items];
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export function ConnectionsView({
  orgId,
  onRefresh,
  onOpenProfile,
  onConnectionsComputed,
  embedded,
  hubMode = false,
  hubSearch,
  hubFilter,
}: ConnectionsViewProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConnectionFilterTab>('ALL');
  const [isGrid, setIsGrid] = useState(!hubMode);
  const [refreshing, setRefreshing] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [supplierRatingsById, setSupplierRatingsById] = useState<Record<string, number | null>>({});
  const [driverRatingsById, setDriverRatingsById] = useState<Record<string, number | null>>({});
  const gridNumColumns = windowWidth >= 1200 ? 4 : windowWidth >= 900 ? 3 : 2;
  const hubNumColumns = windowWidth >= 1280 ? 7 : windowWidth >= 1180 ? 5 : 2;

  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const driversQ = useDriversQuery(orgId);

  useEffect(() => {
    let cancelled = false;
    const supplierIds = ((suppliersQ.data ?? []) as { id: string }[]).map((s) => s.id);
    if (supplierIds.length === 0) {
      setSupplierRatingsById({});
      return;
    }
    getRatingsForSuppliers(supplierIds).then(({ bySupplierId }) => {
      if (cancelled) return;
      const next: Record<string, number | null> = {};
      supplierIds.forEach((id) => {
        next[id] = averageScore(bySupplierId[id] ?? []);
      });
      setSupplierRatingsById(next);
    });
    return () => {
      cancelled = true;
    };
  }, [suppliersQ.data]);

  useEffect(() => {
    let cancelled = false;
    const driverIds = (driversQ.data ?? [])
      .filter((d) => !d.left_at)
      .map((d) => d.id);
    if (driverIds.length === 0) {
      setDriverRatingsById({});
      return;
    }
    getRatingsForDrivers(driverIds).then(({ byDriverId }) => {
      if (cancelled) return;
      const next: Record<string, number | null> = {};
      driverIds.forEach((id) => {
        next[id] = averageScore(byDriverId[id] ?? []);
      });
      setDriverRatingsById(next);
    });
    return () => {
      cancelled = true;
    };
  }, [driversQ.data]);

  const effectiveSearch = hubMode ? (hubSearch ?? '') : search;
  const effectiveFilter: ConnectionFilterTab = hubMode ? (hubFilter ?? 'ALL') : filter;

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([clientsQ.refetch(), suppliersQ.refetch(), driversQ.refetch()]);
    setRefreshing(false);
    onRefresh?.();
  };

  const connections = useMemo<ConnectedOrg[]>(() => {
    const clients: ConnectedOrg[] = ((clientsQ.data ?? []) as {
      id: string; name: string; phone?: string | null; linked_organization_id?: string | null; is_integrated?: boolean; avatar_url?: string | null; avatar_seed?: string | null; mutual_count?: number | null; mutual_connections_count?: number | null; rating?: number | null; average_rating?: number | null;
    }[]).map((c) => ({
      id: c.id,
      name: c.name,
      role: 'CLIENT' as const,
      is_integrated: c.is_integrated ?? Boolean(c.linked_organization_id),
      avatar_url: c.avatar_url ?? null,
      avatar_seed: c.avatar_seed ?? null,
      mutual_count: c.mutual_count ?? c.mutual_connections_count ?? null,
      rating: c.rating ?? c.average_rating ?? null,
      phone: c.phone ?? null,
      linked_organization_id: c.linked_organization_id ?? null,
    }));

    const suppliers: ConnectedOrg[] = ((suppliersQ.data ?? []) as {
      id: string; name: string | null; phone?: string | null; linked_organization_id?: string | null; supplier_type?: string | null; is_integrated?: boolean; avatar_url?: string | null; avatar_seed?: string | null; mutual_count?: number | null; mutual_connections_count?: number | null; rating?: number | null; average_rating?: number | null;
    }[]).map((s) => ({
      id: s.id,
      name: s.name ?? "Supplier",
      role: 'SUPPLIER' as const,
      is_integrated: s.is_integrated ?? (s.supplier_type === "integrated" || Boolean(s.linked_organization_id)),
      avatar_url: s.avatar_url ?? null,
      avatar_seed: s.avatar_seed ?? null,
      mutual_count: s.mutual_count ?? s.mutual_connections_count ?? null,
      rating: s.rating ?? s.average_rating ?? supplierRatingsById[s.id] ?? null,
      phone: s.phone ?? null,
      linked_organization_id: s.linked_organization_id ?? null,
    }));

    const driverRows = driversQ.data ?? [];
    const drivers: ConnectedOrg[] = driverRows
      .filter((d) => !d.left_at)
      .map((d) => ({
        id: `driver-${d.id}`,
        name: d.name,
        role: 'DRIVER' as const,
        is_integrated: !!d.user_id,
        avatar_url: d.avatar_url ?? null,
        avatar_seed: d.avatar_seed ?? null,
        mutual_count: (d as { mutual_count?: number | null; mutual_connections_count?: number | null }).mutual_count ??
          (d as { mutual_count?: number | null; mutual_connections_count?: number | null }).mutual_connections_count ??
          null,
        rating: (d as { rating?: number | null; average_rating?: number | null }).rating ??
          (d as { rating?: number | null; average_rating?: number | null }).average_rating ??
          driverRatingsById[d.id] ??
          null,
        phone: (d as { phone?: string | null }).phone ?? null,
      }));

    let all = [...clients, ...suppliers, ...drivers].sort((a, b) => a.name.localeCompare(b.name));
    if (effectiveFilter !== 'ALL') all = all.filter((c) => c.role === effectiveFilter);
    if (effectiveSearch.trim()) {
      const q = effectiveSearch.toLowerCase();
      all = all.filter((c) => c.name.toLowerCase().includes(q));
    }
    return all;
  }, [clientsQ.data, suppliersQ.data, driversQ.data, effectiveSearch, effectiveFilter, supplierRatingsById, driverRatingsById]);

  const toHubItem = (c: ConnectedOrg): HubConnectionItem => ({
    id: c.id,
    name: c.name,
    role: c.role,
    is_integrated: c.is_integrated,
    avatarUrl: c.avatar_url,
    avatarSeed: c.avatar_seed,
    entityType: c.role === 'DRIVER' ? 'driver' : c.role === 'SUPPLIER' ? 'supplier' : 'client',
    mutualCount: c.mutual_count,
    rating: c.rating,
    actionLabel: c.is_integrated ? "Connected" : "Send invite",
    actionLoading: invitingId === c.id,
    actionDisabled: c.role === "DRIVER" && !c.phone,
  });

  const inviteOffAppParty = async (item: ConnectedOrg) => {
    if (item.is_integrated) return;
    if (!item.phone?.trim()) {
      Alert.alert("Phone missing", `Add a phone number for ${item.name} before sending an invite.`);
      return;
    }

    setInvitingId(item.id);
    try {
      await runConnectionInvite(orgId, item, async () => {
        await Promise.all([clientsQ.refetch(), suppliersQ.refetch()]);
      });
    } finally {
      setInvitingId(null);
    }
  };

  const isLoading = clientsQ.isLoading || suppliersQ.isLoading || driversQ.isLoading;
  const total =
    ((clientsQ.data ?? []) as unknown[]).length +
    ((suppliersQ.data ?? []) as unknown[]).length +
    (driversQ.data ?? []).filter((d) => !d.left_at).length;
  const useHubLayout = hubMode;

  const gridRows = useMemo(
    () => chunkForGrid(connections, gridNumColumns),
    [connections, gridNumColumns],
  );
  const hubRows = useMemo(
    () => chunkForGrid(connections.slice(0, hubNumColumns * 2), hubNumColumns),
    [connections, hubNumColumns],
  );
  const showChrome = !hubMode;

  useEffect(() => {
    onConnectionsComputed?.(connections);
  }, [connections, onConnectionsComputed]);

  const embeddedBody = useHubLayout ? (
    isLoading ? (
      <View style={styles.embeddedLoading}>
        <ActivityIndicator color={Theme.primary} size="small" />
        <Text style={styles.embeddedLoadingText}>Loading your network…</Text>
      </View>
    ) : connections.length === 0 ? (
      <View style={styles.embeddedEmptyWrap}>
        <EmptyState />
      </View>
    ) : (
      <View style={styles.hubGridEmbedded}>
        {hubRows.map((row, ri) => (
          <View key={`hub-row-${ri}`} style={styles.hubGridRow}>
            {row.map((item) => (
              <HubConnectionListCard
                key={`hub-${item.role}-${item.id}`}
                item={toHubItem(item)}
                onActionPress={() => void inviteOffAppParty(item)}
                onCardPress={() => onOpenProfile?.(item)}
              />
            ))}
            {row.length < hubNumColumns
              ? Array.from({ length: hubNumColumns - row.length }).map((_, i) => (
                  <View key={`hub-spacer-${ri}-${i}`} style={styles.hubGridSpacer} />
                ))
              : null}
          </View>
        ))}
      </View>
    )
  ) : isLoading ? (
    <View style={styles.embeddedLoading}>
      <ActivityIndicator color={Theme.primary} size="small" />
      <Text style={styles.embeddedLoadingText}>Loading your network…</Text>
    </View>
  ) : connections.length === 0 ? (
    <View style={styles.embeddedEmptyWrap}>
      <EmptyState />
    </View>
  ) : isGrid ? (
    <View style={styles.embeddedGridRoot}>
      {gridRows.map((row, ri) => (
        <View key={`conn-row-${ri}`} style={styles.gridRowEmbedded}>
          {row.map((item) => (
            <GridCard key={`grid-${item.role}-${item.id}`} item={item} />
          ))}
        </View>
      ))}
    </View>
  ) : (
    <View style={styles.listContentEmbedded}>
      {connections.map((item) => (
        <ListCard key={`list-${item.role}-${item.id}`} item={item} />
      ))}
    </View>
  );

  return (
    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      {showChrome ? (
        <>
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{(clientsQ.data ?? []).length}</Text>
              <Text style={[styles.statLabel, { color: Theme.primary }]}>Clients</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{(suppliersQ.data ?? []).length}</Text>
              <Text style={[styles.statLabel, { color: Theme.positive }]}>Suppliers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {(driversQ.data ?? []).filter((d) => !d.left_at).length}
              </Text>
              <Text style={[styles.statLabel, { color: Theme.warning }]}>Drivers</Text>
            </View>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Search size={15} color={Theme.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search your network..."
                placeholderTextColor={Theme.textSecondary}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
            </View>
            <Pressable
              style={[styles.viewToggle, !isGrid && styles.viewToggleActive]}
              onPress={() => setIsGrid(false)}
            >
              <List size={16} color={!isGrid ? '#fff' : Theme.textSecondary} />
            </Pressable>
            <Pressable
              style={[styles.viewToggle, isGrid && styles.viewToggleActive]}
              onPress={() => setIsGrid(true)}
            >
              <LayoutGrid size={16} color={isGrid ? '#fff' : Theme.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.filterRow}>
            {(['ALL', 'CLIENT', 'SUPPLIER', 'DRIVER'] as ConnectionFilterTab[]).map((t) => (
              <Pressable
                key={t}
                style={[styles.filterTab, filter === t && styles.filterTabActive]}
                onPress={() => setFilter(t)}
              >
                <Text style={[styles.filterTabText, filter === t && styles.filterTabTextActive]}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {embedded ? (
        embeddedBody
      ) : isLoading ? (
        <ActivityIndicator color={Theme.primary} style={{ marginTop: 48 }} />
      ) : useHubLayout ? (
        <FlatList
          key="hub-list"
          data={connections}
          keyExtractor={(item) => `hub-${item.role}-${item.id}`}
          renderItem={({ item }) => (
            <HubConnectionListCard
              item={toHubItem(item)}
              onActionPress={() => void inviteOffAppParty(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled
          nestedScrollEnabled
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Theme.primary} />
          }
          ListEmptyComponent={<EmptyState />}
        />
      ) : isGrid ? (
        <FlatList
          key="grid"
          data={connections}
          keyExtractor={(item) => `grid-${item.role}-${item.id}`}
          numColumns={gridNumColumns}
          renderItem={({ item }) => <GridCard item={item} />}
          contentContainerStyle={styles.gridList}
          columnWrapperStyle={gridNumColumns > 1 ? styles.gridRow : undefined}
          showsVerticalScrollIndicator={false}
          scrollEnabled
          nestedScrollEnabled
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Theme.primary} />
          }
          ListEmptyComponent={<EmptyState />}
        />
      ) : (
        <FlatList
          key="list"
          data={connections}
          keyExtractor={(item) => `list-${item.role}-${item.id}`}
          renderItem={({ item }) => <ListCard item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled
          nestedScrollEnabled
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Theme.primary} />
          }
          ListEmptyComponent={<EmptyState />}
        />
      )}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Users size={36} color={Theme.textSecondary} strokeWidth={1.5} />
      </View>
      <Text style={styles.emptyTitle}>No connections yet</Text>
      <Text style={styles.emptySub}>
        Use Discover to find clients and suppliers and invite them to your network
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.networkPageBackground },
  containerEmbedded: { flex: 0, flexGrow: 0 },
  embeddedLoading: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 10,
  },
  embeddedLoadingText: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  embeddedEmptyWrap: { minHeight: 200, paddingBottom: 16 },
  embeddedGridRoot: { paddingBottom: 8 },
  gridRowEmbedded: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 22,
  },
  listContentEmbedded: { paddingHorizontal: 22, paddingBottom: 16, gap: 8 },
  hubGridEmbedded: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 18,
    gap: 12,
  },
  hubGridRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  hubGridSpacer: {
    flex: 1,
    minWidth: 0,
  },

  statsBar: {
    flexDirection: 'row',
    backgroundColor: Theme.networkCardBackground,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.networkCardBorder,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '900', color: Theme.textPrimary, letterSpacing: -0.5 },
  statLabel: { fontSize: 9, fontWeight: '800', color: Theme.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase' },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: Theme.surfaceBorder, marginVertical: 4 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 14,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.networkCardBorder,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 14, color: Theme.textPrimary, fontWeight: '500' },
  viewToggle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleActive: { backgroundColor: Theme.primary, borderColor: Theme.primary },

  filterRow: { flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Theme.networkCardBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.networkCardBorder,
  },
  filterTabActive: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  filterTabText: { fontSize: 11, fontWeight: '800', color: Theme.textSecondary, letterSpacing: 0.5 },
  filterTabTextActive: { color: Theme.textOnPrimary },

  // Grid layout
  gridList: { paddingHorizontal: 8, paddingBottom: 40 },
  gridRow: { flexDirection: "row", gap: 0, alignItems: "flex-start" },
  gridCardWrap: { flex: 1, padding: 4, minWidth: 0 },
  gridCard: {
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.networkCardBorder,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    position: 'relative',
    overflow: 'hidden',
    paddingBottom: 12,
  },
  gridCover: {
    height: 56,
    width: '100%',
  },
  gridAvatarOverlap: {
    marginTop: -32,
    alignItems: 'center',
    zIndex: 2,
  },
  gridBody: { paddingHorizontal: 12, paddingTop: 4, alignItems: 'center' },
  gridHeadline: {
    fontSize: 10,
    fontWeight: '500',
    color: Theme.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 4,
  },
  gridMutualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  gridMiniDot: { width: 6, height: 6, borderRadius: 3 },
  gridMutualText: { fontSize: 9, fontWeight: '500', color: Theme.textSecondary, flex: 1 },
  gridConnectOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 10,
    marginTop: 10,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Theme.primary,
  },
  gridConnectOutlineText: { fontSize: 11, fontWeight: '600', color: Theme.primary, letterSpacing: 0.1 },
  onlineIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    zIndex: 3,
  },
  gridRoleBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  gridRoleText: { fontSize: 8, fontWeight: '600', letterSpacing: 0.25 },
  gridAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    position: 'relative',
  },
  gridAvatarText: { fontSize: 13, fontWeight: '400', letterSpacing: 0.24, color: '#6B7280' },
  gridZapDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: Theme.positive,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  gridName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 16,
    letterSpacing: 0.1,
  },

  // List layout
  listContent: { paddingHorizontal: 14, paddingBottom: 40, gap: 8 },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.networkCardBorder,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  listAvatar: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    position: 'relative',
  },
  listAvatarText: { fontSize: 11, fontWeight: '400', letterSpacing: 0.2, color: '#6B7280' },
  listZapDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.positive,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  listInfo: { flex: 1, gap: 5 },
  listName: { fontSize: 12, fontWeight: '500', color: '#475569', letterSpacing: 0.08 },
  listBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  roleText: { fontSize: 9, fontWeight: '500', letterSpacing: 0.2 },
  appBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: `${Theme.positive}18`,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  appBadgeText: { fontSize: 8, fontWeight: '600', color: Theme.positive, letterSpacing: 0.25 },
  listMsgBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: Theme.networkMessageTintBg,
    borderWidth: 1,
    borderColor: Theme.networkMessageTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 40, gap: 10 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: Theme.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: Theme.textPrimary, letterSpacing: -0.3, textAlign: 'center' },
  emptySub: { fontSize: 13, color: Theme.textSecondary, textAlign: 'center', lineHeight: 19 },
});
