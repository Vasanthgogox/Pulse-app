/**
 * Network tab — Allies hub (stories, connections, discover) and embedded Load center.
 * Full-width layout; top bar switches Network ↔ Load (no left sidebar on web).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import {
  ConnectionsView,
  type ConnectedOrg,
  type ConnectionFilterTab,
} from "@/features/network/components/ConnectionsView";
import { RecentAddedStrip } from "@/features/network/components/RecentAddedStrip";
import { DiscoverView } from "@/features/network/components/DiscoverView";
import { InvitationsView } from "@/features/network/components/InvitationsView";
import { StoryReel } from "@/features/network/components/StoryReel";
import { isPostVisibleForOrg, type PostRow } from "@/features/network/services/posts.service";
import {
  useClientsQuery,
  useConnectionRequestsReceivedQuery,
  useDriversQuery,
  useInvalidateNetwork,
  useNetworkFeedQuery,
  useRealtimeNetworkInvalidation,
  useSuppliersQuery,
} from "@/lib/queries";
import { useRouter } from "expo-router";
import {
  Activity,
  Compass,
  Search,
  UserPlus2,
  Users,
} from "lucide-react-native";
import { useOrganization } from "@/contexts/OrganizationContext";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function isStoryPost(p: PostRow): boolean {
  return p.type === "LOAD" || p.type === "VEHICLE_AVAILABILITY";
}

function NetworkStoryStrip({
  orgId,
  orgName,
  feedPosts,
  feedLoading,
  onCreatePost,
  headerActions,
}: {
  orgId: string;
  orgName: string;
  feedPosts: PostRow[];
  feedLoading: boolean;
  onCreatePost: () => void;
  headerActions?: React.ReactNode;
}) {
  const storyPosts = useMemo(() => feedPosts.filter(isStoryPost), [feedPosts]);
  if (feedLoading && storyPosts.length === 0) {
    return (
      <View style={styles.storyLoading}>
        <ActivityIndicator color={Theme.teslaRed} />
        <Text style={styles.storyLoadingLabel}>Syncing stories…</Text>
      </View>
    );
  }
  return (
    <StoryReel
      posts={storyPosts}
      orgId={orgId}
      orgName={orgName}
      onCreatePost={onCreatePost}
      headerActions={headerActions}
    />
  );
}

export default function NetworkScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWideNetwork = Platform.OS === "web" && width >= 1180;
  const isMobileLayout = width < 820;
  const isCompactPhone = width < 420;
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const [refreshing, setRefreshing] = useState(false);
  const [connSearch, setConnSearch] = useState("");
  const [connFilter, setConnFilter] = useState<ConnectionFilterTab>("ALL");
  const [connSearchOpen, setConnSearchOpen] = useState(false);
  const [invSubTab, setInvSubTab] = useState<"received" | "sent">("received");
  const [invSearch, setInvSearch] = useState("");
  const [invSearchOpen, setInvSearchOpen] = useState(false);
  const [discoverSearchOpen, setDiscoverSearchOpen] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState("");

  useRealtimeNetworkInvalidation(orgId);
  const receivedQ = useConnectionRequestsReceivedQuery(orgId);
  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const feedQ = useNetworkFeedQuery(orgId);
  const invalidateNetwork = useInvalidateNetwork(orgId);

  const filterTabs = useMemo(
    () => ["ALL", "CLIENT", "SUPPLIER", "DRIVER"] as ConnectionFilterTab[],
    [],
  );

  const pendingCount = useMemo(
    () => (receivedQ.data ?? []).filter((r) => r.status === "pending").length,
    [receivedQ.data],
  );
  const clientCount = useMemo(
    () => ((clientsQ.data ?? []) as unknown[]).length,
    [clientsQ.data],
  );
  const supplierCount = useMemo(
    () => ((suppliersQ.data ?? []) as unknown[]).length,
    [suppliersQ.data],
  );
  const driverCount = useMemo(
    () => (driversQ.data ?? []).filter((d) => !d.left_at).length,
    [driversQ.data],
  );
  const totalConnections = useMemo(
    () => clientCount + supplierCount + driverCount,
    [clientCount, supplierCount, driverCount],
  );
  const recentAddedConnections = useMemo((): ConnectedOrg[] => {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000;
    type R = ConnectedOrg & { createdAt: number };
    const acc: R[] = [];

    for (const c of (clientsQ.data ?? []) as Array<{
      id: string;
      name: string;
      phone?: string | null;
      linked_organization_id?: string | null;
      is_integrated?: boolean;
      created_at?: string | null;
      avatar_url?: string | null;
      avatar_seed?: string | null;
      mutual_count?: number | null;
      mutual_connections_count?: number | null;
      rating?: number | null;
      average_rating?: number | null;
    }>) {
      const created = c.created_at ? new Date(c.created_at).getTime() : 0;
      if (created === 0 || now - created > windowMs || !c.name?.trim()) continue;
      acc.push({
        id: c.id,
        name: c.name,
        role: "CLIENT",
        is_integrated: c.is_integrated ?? Boolean(c.linked_organization_id),
        avatar_url: c.avatar_url ?? null,
        avatar_seed: c.avatar_seed ?? null,
        mutual_count: c.mutual_count ?? c.mutual_connections_count ?? null,
        rating: c.rating ?? c.average_rating ?? null,
        phone: c.phone ?? null,
        linked_organization_id: c.linked_organization_id ?? null,
        createdAt: created,
      });
    }

    for (const s of (suppliersQ.data ?? []) as Array<{
      id: string;
      name: string | null;
      phone?: string | null;
      linked_organization_id?: string | null;
      supplier_type?: string | null;
      is_integrated?: boolean;
      created_at?: string | null;
      avatar_url?: string | null;
      avatar_seed?: string | null;
      mutual_count?: number | null;
      mutual_connections_count?: number | null;
      rating?: number | null;
      average_rating?: number | null;
    }>) {
      const created = s.created_at ? new Date(s.created_at).getTime() : 0;
      if (created === 0 || now - created > windowMs) continue;
      const name = s.name?.trim() ? s.name.trim() : "Supplier";
      acc.push({
        id: s.id,
        name,
        role: "SUPPLIER",
        is_integrated: s.is_integrated ?? (s.supplier_type === "integrated" || Boolean(s.linked_organization_id)),
        avatar_url: s.avatar_url ?? null,
        avatar_seed: s.avatar_seed ?? null,
        mutual_count: s.mutual_count ?? s.mutual_connections_count ?? null,
        rating: s.rating ?? s.average_rating ?? null,
        phone: s.phone ?? null,
        linked_organization_id: s.linked_organization_id ?? null,
        createdAt: created,
      });
    }

    for (const d of driversQ.data ?? []) {
      if (d.left_at) continue;
      const dr = d as {
        id: string;
        name: string;
        user_id?: string | null;
        left_at?: string | null;
        created_at?: string | null;
        phone?: string | null;
        avatar_url?: string | null;
        avatar_seed?: string | null;
        mutual_count?: number | null;
        mutual_connections_count?: number | null;
        rating?: number | null;
        average_rating?: number | null;
      };
      const created = dr.created_at ? new Date(dr.created_at).getTime() : 0;
      if (created === 0 || now - created > windowMs || !dr.name?.trim()) continue;
      acc.push({
        id: `driver-${dr.id}`,
        name: dr.name,
        role: "DRIVER",
        is_integrated: Boolean(dr.user_id),
        avatar_url: dr.avatar_url ?? null,
        avatar_seed: dr.avatar_seed ?? null,
        mutual_count: dr.mutual_count ?? dr.mutual_connections_count ?? null,
        rating: dr.rating ?? dr.average_rating ?? null,
        phone: dr.phone ?? null,
        createdAt: created,
      });
    }

    return acc
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 5)
      .map((row) => {
        const { createdAt, ...rest } = row;
        void createdAt;
        return rest;
      });
  }, [clientsQ.data, suppliersQ.data, driversQ.data]);

  const onCreatePost = () => router.push("/(modals)/create-post");
  const allowLoadPosts = organization?.capabilities?.canBid ?? true;
  const feedPosts = useMemo(
    () => (feedQ.data ?? []).filter((post) => isPostVisibleForOrg(post, { allowLoadPosts })),
    [feedQ.data, allowLoadPosts],
  );

  const onRefresh = useCallback(async () => {
    if (!orgId) return;
    setRefreshing(true);
    try {
      await Promise.all([
        feedQ.refetch(),
        receivedQ.refetch(),
        clientsQ.refetch(),
        suppliersQ.refetch(),
        driversQ.refetch(),
      ]);
      invalidateNetwork();
    } finally {
      setRefreshing(false);
    }
  }, [orgId, feedQ, receivedQ, clientsQ, suppliersQ, driversQ, invalidateNetwork]);

  if (!orgId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Theme.teslaRed} style={{ marginTop: 60 }} />
      </View>
    );
  }

  const hasRecent = recentAddedConnections.length > 0;
  const splitSideBySide = width >= 900;

  const scrollContent = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingBottom:
            24 +
            insets.bottom +
            Layout.demoTabBarScrollBottomInset +
            Layout.tabBarBottomPaddingMin,
        },
      ]}
      showsVerticalScrollIndicator={false}
      {...tabBarScrollProps}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Theme.teslaRed}
        />
      }
    >
      <>
        <NetworkStoryStrip
          orgId={orgId}
          orgName={organization?.name ?? ""}
          feedPosts={feedPosts}
          feedLoading={feedQ.isLoading}
          onCreatePost={onCreatePost}
        />
        <View
          style={[
            styles.splitBelowStory,
            hasRecent && splitSideBySide && styles.splitBelowStoryRow,
          ]}
        >
          <View
            style={[
              styles.splitPaneSnapshot,
              hasRecent && splitSideBySide && styles.splitPaneSnapshotInRow,
              (!hasRecent || !splitSideBySide) && styles.splitPaneSnapshotFull,
            ]}
          >
            <View
              style={[
                styles.snapshotCard,
                hasRecent && splitSideBySide && styles.snapshotCardStretch,
              ]}
            >
              <View style={styles.snapshotHeaderRow}>
                <View style={styles.snapshotIconRing} accessibilityElementsHidden>
                  <Users size={12} color={Theme.primary} strokeWidth={2.2} />
                </View>
                <Text style={styles.snapshotKicker}>Allies snapshot</Text>
              </View>
              <Text style={styles.snapshotPrimary} numberOfLines={1}>
                {totalConnections} live connections
              </Text>
              <View style={styles.snapshotSplitRow}>
                <View style={styles.snapshotStatCell}>
                  <Text style={styles.snapshotStatN}>{clientCount}</Text>
                  <Text style={styles.snapshotStatL} numberOfLines={1}>
                    Clients
                  </Text>
                </View>
                <View style={styles.snapshotStatDividerV} />
                <View style={styles.snapshotStatCell}>
                  <Text style={styles.snapshotStatN}>{supplierCount}</Text>
                  <Text style={styles.snapshotStatL} numberOfLines={1}>
                    Suppliers
                  </Text>
                </View>
                <View style={styles.snapshotStatDividerV} />
                <View style={styles.snapshotStatCell}>
                  <Text style={styles.snapshotStatN}>{driverCount}</Text>
                  <Text style={styles.snapshotStatL} numberOfLines={1}>
                    Drivers
                  </Text>
                </View>
              </View>
              <Text style={styles.snapshotSecondary} numberOfLines={1}>
                {pendingCount} pending syncs
              </Text>
            </View>
          </View>
          {hasRecent ? (
            <View
              style={[
                styles.splitPaneRecent,
                splitSideBySide && styles.splitPaneRecentInRow,
                !splitSideBySide && styles.splitPaneRecentStack,
              ]}
            >
              <RecentAddedStrip
                orgId={orgId}
                items={recentAddedConnections}
                layout="split"
                onAfterInAppSuccess={async () => {
                  await Promise.all([clientsQ.refetch(), suppliersQ.refetch()]);
                  invalidateNetwork();
                }}
              />
            </View>
          ) : null}
        </View>
        <View style={[styles.networkMergedRow, !isWideNetwork && styles.networkMergedRowStack]}>
          <View style={[styles.sectionBlock, isWideNetwork && styles.networkMergedPanePrimary]}>
            <View style={[styles.connectionsCard, isWideNetwork && styles.networkMergedCard]}>
              <View
                style={[
                  styles.sectionHeadingRowSpread,
                  isMobileLayout && styles.sectionHeadingRowSpreadMobile,
                ]}
              >
                <View
                  style={[
                    styles.sectionHeadingRowCompact,
                    isMobileLayout && styles.sectionHeadingRowCompactMobile,
                  ]}
                >
                  <Activity size={14} color={Theme.textPrimaryDark} />
                  <View style={styles.sectionTitleBlock}>
                    <Text style={styles.sectionKicker}>Operations pulse</Text>
                    <Text style={styles.sectionHeading}>Your connections</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.connectionsHeaderControls,
                    isMobileLayout && styles.connectionsHeaderControlsMobile,
                  ]}
                >
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.inlineFilterScroll}
                    style={[
                      styles.inlineTabsWrap,
                      styles.inlineTabsWrapHeader,
                      isMobileLayout && styles.inlineTabsWrapHeaderMobile,
                    ]}
                  >
                    {filterTabs.map((t) => {
                      const active = connFilter === t;
                      return (
                        <Pressable
                          key={t}
                          onPress={() => setConnFilter(t)}
                          style={[styles.inlineFilterPill, active && styles.inlineFilterPillOn]}
                        >
                          <Text style={[styles.inlineFilterPillText, active && styles.inlineFilterPillTextOn]}>
                            {t}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  {connSearchOpen ? (
                    <View style={styles.inlineSearchBox}>
                      <Search size={13} color={Theme.textSecondary} />
                      <TextInput
                        style={styles.inlineSearchInput}
                        placeholder="Search…"
                        placeholderTextColor={Theme.textSecondary}
                        value={connSearch}
                        onChangeText={setConnSearch}
                        returnKeyType="search"
                        autoFocus
                      />
                      <Pressable
                        onPress={() => {
                          setConnSearch("");
                          setConnSearchOpen(false);
                        }}
                        hitSlop={8}
                      >
                        <Text style={styles.inlineSearchClose}>×</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setConnSearchOpen(true)}
                      style={({ pressed }) => [styles.inlineSearchIconBtn, pressed && { opacity: 0.72 }]}
                      hitSlop={8}
                    >
                      <Search size={13} color={Theme.textPrimaryDark} strokeWidth={2.4} />
                    </Pressable>
                  )}
                </View>
              </View>
              <ConnectionsView
                orgId={orgId}
                embedded
                hubMode
                hubSearch={connSearch}
                hubFilter={connFilter}
              />
            </View>
          </View>

          <View style={[styles.sectionBlock, isWideNetwork && styles.networkMergedPaneSecondary]}>
            <View style={[styles.invitationsCard, isWideNetwork && styles.networkMergedCard]}>
              <View
                style={[
                  styles.sectionHeadingRowSpread,
                  styles.invitationsMergedHeader,
                  isMobileLayout && styles.sectionHeadingRowSpreadMobile,
                ]}
              >
                <View
                  style={[
                    styles.sectionHeadingRowCompact,
                    isMobileLayout && styles.sectionHeadingRowCompactMobile,
                  ]}
                >
                  <UserPlus2 size={15} color={Theme.textPrimaryDark} />
                  <View style={styles.sectionTitleBlock}>
                    <Text style={styles.sectionKicker}>Inbound mission protocol</Text>
                    <Text style={styles.sectionHeading}>{pendingCount} pending syncs</Text>
                  </View>
                  <View
                    style={[
                      styles.invitationsHeaderControls,
                      isMobileLayout && styles.invitationsHeaderControlsMobile,
                    ]}
                  >
                    <View style={[styles.invSubRowCompact, styles.invSubRowCompactHeader]}>
                      {(["received", "sent"] as const).map((k) => {
                        const on = invSubTab === k;
                        return (
                          <Pressable
                            key={k}
                            onPress={() => setInvSubTab(k)}
                            style={[
                              styles.inlineFilterPill,
                              styles.invHeaderTabPill,
                              on && styles.inlineFilterPillOn,
                            ]}
                          >
                            <Text
                              style={[
                                styles.inlineFilterPillText,
                                styles.invHeaderTabText,
                                on && styles.inlineFilterPillTextOn,
                              ]}
                            >
                              {k === "received" ? "RECEIVED" : "SENT"}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
                {invSearchOpen ? (
                  <View
                    style={[
                      styles.inlineSearchBox,
                      styles.invHeaderSearchBox,
                      isCompactPhone && styles.invHeaderSearchBoxCompact,
                    ]}
                  >
                    <Search size={13} color={Theme.textSecondary} />
                    <TextInput
                      style={styles.inlineSearchInput}
                      placeholder={invSubTab === "received" ? "Search received…" : "Search sent…"}
                      placeholderTextColor={Theme.textSecondary}
                      value={invSearch}
                      onChangeText={setInvSearch}
                      returnKeyType="search"
                      autoFocus
                    />
                    <Pressable
                      onPress={() => {
                        setInvSearch("");
                        setInvSearchOpen(false);
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.inlineSearchClose}>×</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setInvSearchOpen(true)}
                    style={({ pressed }) => [
                      styles.inlineSearchIconBtn,
                      styles.invHeaderSearchBtn,
                      pressed && { opacity: 0.72 },
                    ]}
                    hitSlop={8}
                  >
                    <Search size={13} color={Theme.textPrimaryDark} strokeWidth={2.4} />
                  </Pressable>
                )}
              </View>
              <InvitationsView
                orgId={orgId}
                embedded
                variant="hub"
                subTab={invSubTab}
                onSubTabChange={setInvSubTab}
                search={invSearch}
                onSearchChange={setInvSearch}
              />
            </View>
          </View>

          <View style={[styles.sectionBlock, isWideNetwork && styles.networkMergedPaneTertiary]}>
            <View style={[styles.discoverCard, isWideNetwork && styles.networkMergedCard]}>
              <View
                style={[
                  styles.sectionHeadingRowSpread,
                  isMobileLayout && styles.sectionHeadingRowSpreadMobile,
                ]}
              >
                <View
                  style={[
                    styles.sectionHeadingRowCompact,
                    isMobileLayout && styles.sectionHeadingRowCompactMobile,
                  ]}
                >
                  <Compass size={14} color={Theme.textSecondary} />
                  <View style={styles.sectionTitleBlock}>
                    <Text style={styles.sectionKicker}>Discover potential allies</Text>
                    <Text style={styles.sectionHeading}>Grow your network</Text>
                  </View>
                </View>
                <View style={styles.discoverHeaderActions}>
                  {discoverSearchOpen ? (
                    <View style={styles.discoverSearchInline}>
                      <Search size={13} color={Theme.textSecondary} />
                      <TextInput
                        style={styles.discoverSearchInput}
                        placeholder="Search network..."
                        placeholderTextColor={Theme.textSecondary}
                        value={discoverSearch}
                        onChangeText={setDiscoverSearch}
                        returnKeyType="search"
                        autoCapitalize="words"
                        autoFocus
                      />
                      <Pressable
                        onPress={() => {
                          setDiscoverSearch("");
                          setDiscoverSearchOpen(false);
                        }}
                        hitSlop={8}
                      >
                        <Text style={styles.discoverSearchClose}>×</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setDiscoverSearchOpen(true)}
                      style={({ pressed }) => [styles.discoverSearchIconBtn, pressed && { opacity: 0.72 }]}
                      hitSlop={8}
                    >
                      <Search size={14} color={Theme.textPrimaryDark} strokeWidth={2.4} />
                    </Pressable>
                  )}
                </View>
              </View>
              <DiscoverView
                orgId={orgId}
                embedded
                search={discoverSearch}
                onSearchChange={setDiscoverSearch}
                showSearchChrome={false}
              />
            </View>
          </View>
        </View>
      </>
    </ScrollView>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {scrollContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    minHeight: 0,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 0,
    paddingBottom: 18,
    backgroundColor: Theme.screenBackground,
  },
  splitBelowStory: {
    width: "100%",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 12,
  },
  splitBelowStoryRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  splitPaneSnapshot: {
    minWidth: 0,
    alignSelf: "stretch",
  },
  /** 60% — flexBasis 0 so ratio holds vs wide snapshot copy */
  splitPaneSnapshotInRow: {
    flex: 6,
    flexBasis: 0,
  },
  splitPaneSnapshotFull: {
    width: "100%",
  },
  splitPaneRecent: {
    minWidth: 0,
    alignSelf: "stretch",
  },
  /** 40% */
  splitPaneRecentInRow: {
    flex: 4,
    flexBasis: 0,
  },
  splitPaneRecentStack: {
    width: "100%",
  },
  snapshotCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    backgroundColor: Theme.screenBackground,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  snapshotCardStretch: {
    flex: 1,
  },
  snapshotSplitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingTop: 2,
  },
  snapshotStatCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 2,
  },
  snapshotStatN: {
    fontSize: 16,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  snapshotStatL: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  snapshotStatDividerV: {
    width: StyleSheet.hairlineWidth * 2,
    alignSelf: "stretch",
    minHeight: 32,
    backgroundColor: Theme.borderLight,
  },
  snapshotHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  snapshotIconRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  snapshotKicker: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
    color: Theme.textSection,
    textTransform: "uppercase",
  },
  snapshotPrimary: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  snapshotSecondary: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  storyLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  storyLoadingLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  ribbonOuter: {
    backgroundColor: Theme.screenBackground,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  ribbonScroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingRight: 24,
  },
  ribbonCard: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
  },
  ribbonChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  ribbonChipLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  ribbonChipCount: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.primary,
    fontStyle: "italic",
  },
  ribbonChipCountMuted: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
    maxWidth: 72,
  },
  ribbonBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.teslaRed,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  ribbonBadgeText: { fontSize: 9, fontWeight: "900", color: Theme.textOnPrimary },
  ribbonChipMuted: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 4,
  },
  ribbonMoreText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  missionCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 8,
    marginBottom: 6,
    backgroundColor: Theme.screenBackground,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  missionCardHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    backgroundColor: Theme.surfaceForm,
  },
  missionCardTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 1.4,
  },
  sectionBlock: {
    marginTop: 10,
  },
  networkMergedRow: {
    marginHorizontal: 0,
    marginTop: 14,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 18,
  },
  networkMergedRowStack: {
    marginHorizontal: 0,
    flexDirection: "column",
    gap: 18,
  },
  networkMergedPanePrimary: {
    marginTop: 0,
  },
  networkMergedPaneSecondary: {
    marginTop: 0,
  },
  networkMergedPaneTertiary: {
    marginTop: 0,
  },
  networkMergedCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 0,
    marginBottom: 0,
  },
  connectionsCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 2,
  },
  discoverCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 10,
    backgroundColor: Theme.screenBackground,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 6,
  },
  inlineControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  inlineTabsWrap: {
    flex: 1,
    minWidth: 0,
  },
  inlineTabsWrapHeader: {
    flex: 0,
    maxWidth: 340,
  },
  inlineTabsWrapHeaderMobile: {
    flex: 1,
    maxWidth: "100%" as const,
  },
  connectionsHeaderControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    justifyContent: "flex-end",
    minWidth: 0,
  },
  connectionsHeaderControlsMobile: {
    width: "100%" as const,
    justifyContent: "space-between",
    gap: 10,
  },
  inlineFilterScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 6,
  },
  inlineFilterPill: {
    minHeight: 22,
    paddingHorizontal: 9,
    borderRadius: 11,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    justifyContent: "center",
  },
  inlineFilterPillOn: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  inlineFilterPillText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: Theme.textSecondary,
  },
  inlineFilterPillTextOn: {
    color: Theme.textOnDark,
  },
  inlineSearchIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  inlineSearchBox: {
    minHeight: 28,
    maxWidth: 210,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: 14,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  inlineSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
  },
  inlineSearchClose: {
    fontSize: 15,
    lineHeight: 16,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  sectionHeadingRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    flex: 1,
  },
  sectionHeadingRowCompactMobile: {
    width: "100%" as const,
  },
  sectionHeadingRowSpread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionHeadingRowSpreadMobile: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 10,
  },
  sectionTitleBlock: {
    minWidth: 0,
    gap: 4,
  },
  sectionKicker: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2.2,
    color: Theme.textSection,
    textTransform: "uppercase",
  },
  sectionHeading: {
    ...Typography.subTabLabel,
    fontSize: 13,
    color: Theme.textPrimaryDark,
    letterSpacing: 1.6,
  },
  expandSignal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Theme.aggregatePillBg,
  },
  expandSignalText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.primary,
    letterSpacing: 1,
  },
  discoverHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 1,
    minWidth: 44,
  },
  discoverSearchIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  discoverSearchInline: {
    minHeight: 34,
    width: 230,
    maxWidth: 260,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: 17,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  discoverSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
  },
  discoverSearchClose: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  loadCenterReturnBtn: {
    marginLeft: "auto",
    minHeight: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    justifyContent: "center",
  },
  loadCenterReturnBtnOn: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceGray,
  },
  loadCenterReturnText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    color: Theme.textSecondary,
  },
  loadCenterReturnTextOn: {
    color: Theme.textPrimaryDark,
  },
  segmentRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  segmentBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  segmentBtnActive: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceGray,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    color: Theme.textSecondary,
  },
  segmentTextOn: { color: Theme.textPrimaryDark },
  segmentLabelInline: { flexDirection: "row", alignItems: "center", gap: 6 },
  segmentPendingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.teslaRed,
  },
  storyInviteBadge: {
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Theme.teslaRed,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  storyInviteBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    letterSpacing: 0.1,
  },
  storyTopSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  storyTopSwitchAnimWrap: {
    overflow: "hidden",
  },
  storyTopSwitchBtn: {
    minHeight: 40,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    justifyContent: "center",
    alignItems: "center",
  },
  storyTopSwitchBtnOn: {
    borderColor: Theme.borderOnDark,
    backgroundColor: Theme.darkBackground,
  },
  storyTopSwitchText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  storyTopSwitchTextOn: {
    color: Theme.textOnPrimary,
  },
  hubTools: {
    marginTop: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 9,
  },
  hubSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hubSearchInput: {
    flex: 1,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    fontWeight: "700",
  },
  filterPillScroll: { flexDirection: "row", gap: 8, paddingRight: 8 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  filterPillOn: { backgroundColor: Theme.textPrimaryDark, borderColor: Theme.textPrimaryDark },
  filterPillText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: Theme.textSecondary,
  },
  filterPillTextOn: { color: Theme.textOnDark },
  invSubRow: { flexDirection: "row", gap: 10, marginBottom: 2 },
  invSubRowCompact: { flexDirection: "row", gap: 5, flex: 1, minWidth: 0 },
  invSubRowCompactHeader: {
    flex: 0,
    alignItems: "center",
    flexShrink: 0,
  },
  invitationsMergedHeader: {
    alignItems: "center",
    flexWrap: "nowrap",
    minHeight: 48,
    paddingBottom: 10,
    justifyContent: "space-between",
  },
  invitationsHeaderControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    justifyContent: "flex-start",
    marginLeft: 10,
    minWidth: 188,
  },
  invitationsHeaderControlsMobile: {
    marginLeft: 0,
    minWidth: 0,
    width: "100%" as const,
  },
  invHeaderTabPill: {
    minHeight: 28,
    minWidth: 86,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  invHeaderTabText: {
    fontSize: 9,
    letterSpacing: 0.65,
  },
  invHeaderSearchBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginLeft: "auto",
    flexShrink: 0,
  },
  invHeaderSearchBox: {
    marginLeft: "auto",
    width: 220,
  },
  invHeaderSearchBoxCompact: {
    marginLeft: 0,
    width: "100%" as const,
  },
  invSubBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  invSubBtnOn: { borderBottomColor: Theme.teslaRed },
  invSubText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: Theme.textSecondary,
  },
  invSubTextOn: { color: Theme.textPrimaryDark },
  onYourLabel: {
    ...Typography.subTabLabel,
    color: Theme.textSection,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 6,
  },
  invitationsCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 10,
    backgroundColor: Theme.screenBackground,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    overflow: "hidden",
    paddingBottom: 10,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  headerBadge: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 7,
  },
  headerBadgeText: {
    fontSize: 7,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    letterSpacing: 0.6,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    marginTop: 2,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 14,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  headerTitle: {
    ...Typography.networkScreenTitle,
    color: Theme.textPrimaryDark,
  },
  headerSubtitle: {
    ...Typography.headerSubtitle,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  headerCreateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 14,
    backgroundColor: Theme.textPrimaryDark,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  headerCreateBtnText: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
});
