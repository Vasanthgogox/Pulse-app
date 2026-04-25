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
  type ConnectionFilterTab,
} from "@/features/network/components/ConnectionsView";
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
} from "lucide-react-native";
import { useOrganization } from "@/contexts/OrganizationContext";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
  const [recentAddedNames, setRecentAddedNames] = useState<string[]>([]);
  const recentPulse = React.useRef(new Animated.Value(1)).current;
  const prevConnectionCountRef = React.useRef<number | null>(null);

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
  const totalConnections = useMemo(
    () =>
      ((clientsQ.data ?? []) as unknown[]).length +
      ((suppliersQ.data ?? []) as unknown[]).length +
      (driversQ.data ?? []).filter((d) => !d.left_at).length,
    [clientsQ.data, suppliersQ.data, driversQ.data],
  );
  const newestConnectionNames = useMemo(() => {
    const now = Date.now();
    const recentWithinMs = 24 * 60 * 60 * 1000;
    const names: string[] = [];

    for (const c of (clientsQ.data ?? []) as Array<{ name?: string | null; created_at?: string | null }>) {
      const created = c.created_at ? new Date(c.created_at).getTime() : 0;
      if (created > 0 && now - created <= recentWithinMs && c.name?.trim()) {
        names.push(c.name.trim().toUpperCase());
      }
    }
    for (const s of (suppliersQ.data ?? []) as Array<{ name?: string | null; created_at?: string | null }>) {
      const created = s.created_at ? new Date(s.created_at).getTime() : 0;
      if (created > 0 && now - created <= recentWithinMs && s.name?.trim()) {
        names.push(s.name.trim().toUpperCase());
      }
    }
    for (const d of (driversQ.data ?? []) as Array<{ name?: string | null; left_at?: string | null; created_at?: string | null }>) {
      if (d.left_at) continue;
      const created = d.created_at ? new Date(d.created_at).getTime() : 0;
      if (created > 0 && now - created <= recentWithinMs && d.name?.trim()) {
        names.push(d.name.trim().toUpperCase());
      }
    }

    return Array.from(new Set(names)).slice(0, 3);
  }, [clientsQ.data, suppliersQ.data, driversQ.data]);

  useEffect(() => {
    const prev = prevConnectionCountRef.current;
    if (prev == null) {
      prevConnectionCountRef.current = totalConnections;
      return;
    }
    if (totalConnections > prev) {
      setRecentAddedNames(newestConnectionNames);
    }
    prevConnectionCountRef.current = totalConnections;
  }, [totalConnections, newestConnectionNames]);

  useEffect(() => {
    const runPulse = (value: Animated.Value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1.08, duration: 650, useNativeDriver: true }),
          Animated.timing(value, { toValue: 1, duration: 650, useNativeDriver: true }),
        ]),
      );
    const recentAnim = recentAddedNames.length > 0 ? runPulse(recentPulse) : null;
    recentAnim?.start();
    return () => {
      recentAnim?.stop();
      recentPulse.setValue(1);
    };
  }, [recentAddedNames.length, recentPulse]);

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

  const hubBar = (
    <View style={styles.hubBar}>
      {recentAddedNames.length > 0 ? (
        <Animated.View style={[styles.hubTopRow, { transform: [{ scale: recentPulse }] }]}>
          <Pressable
            style={styles.recentAddedChip}
          >
            <Text style={styles.recentAddedLabel}>Recently added</Text>
            <Text style={styles.recentAddedNames} numberOfLines={1}>
              {recentAddedNames.join(", ")}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}

    </View>
  );

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
        <View style={[styles.networkMergedRow, !isWideNetwork && styles.networkMergedRowStack]}>
          <View style={[styles.sectionBlock, isWideNetwork && styles.networkMergedPanePrimary]}>
            <View style={[styles.connectionsCard, isWideNetwork && styles.networkMergedCard]}>
              <View style={styles.sectionHeadingRowSpread}>
                <View style={styles.sectionHeadingRowCompact}>
                  <Activity size={14} color={Theme.textPrimaryDark} />
                  <View style={styles.sectionTitleBlock}>
                    <Text style={styles.sectionKicker}>Operations pulse</Text>
                    <Text style={styles.sectionHeading}>Your connections</Text>
                  </View>
                </View>
                <View style={styles.connectionsHeaderControls}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.inlineFilterScroll}
                    style={[styles.inlineTabsWrap, styles.inlineTabsWrapHeader]}
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
              <View style={[styles.sectionHeadingRowSpread, styles.invitationsMergedHeader]}>
                <View style={styles.sectionHeadingRowCompact}>
                  <UserPlus2 size={15} color={Theme.textPrimaryDark} />
                  <View style={styles.sectionTitleBlock}>
                    <Text style={styles.sectionKicker}>Inbound mission protocol</Text>
                    <Text style={styles.sectionHeading}>{pendingCount} pending syncs</Text>
                  </View>
                  <View style={styles.invitationsHeaderControls}>
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
                  <View style={[styles.inlineSearchBox, styles.invHeaderSearchBox]}>
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
              <View style={styles.sectionHeadingRowSpread}>
                <View style={styles.sectionHeadingRowCompact}>
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

  const broadcastStrip = (
    <NetworkStoryStrip
      orgId={orgId}
      orgName={organization?.name ?? ""}
      feedPosts={feedPosts}
      feedLoading={feedQ.isLoading}
      onCreatePost={onCreatePost}
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {broadcastStrip}
      {hubBar}

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
    paddingTop: 4,
    paddingBottom: 18,
    backgroundColor: Theme.screenBackground,
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
  connectionsHeaderControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    justifyContent: "flex-end",
    minWidth: 0,
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
  sectionHeadingRowSpread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 6,
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
  hubBar: {
    backgroundColor: Theme.screenBackground,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  hubTopRow: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 2,
  },
  recentAddedChip: {
    width: "100%",
    marginTop: 2,
    minHeight: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 12,
    paddingVertical: 7,
    justifyContent: "center",
    gap: 2,
  },
  recentAddedLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
    color: Theme.textSection,
    textTransform: "uppercase",
  },
  recentAddedNames: {
    fontSize: 11,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
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
