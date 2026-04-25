/**
 * Network tab — Allies hub (stories, connections, discover) and embedded Load center.
 * Full-width layout; top bar switches Network ↔ Load (no left sidebar on web).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import type { IndentRow } from "@/features/indents";
import {
  ConnectionsView,
  type ConnectionFilterTab,
} from "@/features/network/components/ConnectionsView";
import { DiscoverView } from "@/features/network/components/DiscoverView";
import { InvitationsView } from "@/features/network/components/InvitationsView";
import { LoadCenterView } from "@/features/network/components/LoadCenterView";
import { ShareLoadSheet } from "@/features/network/components/ShareLoadSheet";
import { StoryReel } from "@/features/network/components/StoryReel";
import { isPostVisibleForOrg, type PostRow } from "@/features/network/services/posts.service";
import {
  useClientsQuery,
  useConnectionRequestsReceivedQuery,
  useDriversQuery,
  useInvalidateNetwork,
  useInvalidatePosts,
  useNetworkFeedQuery,
  useRealtimeNetworkInvalidation,
  useSuppliersQuery,
} from "@/lib/queries";
import { ROUTES } from "@/lib/routes";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Activity,
  Compass,
  Search,
  Truck,
  UserPlus2,
} from "lucide-react-native";
import { useOrganization } from "@/contexts/OrganizationContext";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const [refreshing, setRefreshing] = useState(false);
  const [networkSegment, setNetworkSegment] = useState<"connections" | "invitations" | "load">("load");
  const [connSearch, setConnSearch] = useState("");
  const [connFilter, setConnFilter] = useState<ConnectionFilterTab>("ALL");
  const [connSearchOpen, setConnSearchOpen] = useState(false);
  const [invSubTab, setInvSubTab] = useState<"received" | "sent">("received");
  const [invSearch, setInvSearch] = useState("");
  const [invSearchOpen, setInvSearchOpen] = useState(false);
  const [discoverSearchOpen, setDiscoverSearchOpen] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState("");
  const [shareLoad, setShareLoad] = useState<IndentRow | null>(null);
  const [recentAddedNames, setRecentAddedNames] = useState<string[]>([]);
  const invitePulse = React.useRef(new Animated.Value(1)).current;
  const recentPulse = React.useRef(new Animated.Value(1)).current;
  const prevConnectionCountRef = React.useRef<number | null>(null);

  useEffect(() => {
    if (tabParam === "load") {
      setNetworkSegment("load");
    }
  }, [tabParam]);

  useRealtimeNetworkInvalidation(orgId);
  const receivedQ = useConnectionRequestsReceivedQuery(orgId);
  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const feedQ = useNetworkFeedQuery(orgId);
  const invalidateNetwork = useInvalidateNetwork(orgId);
  const invalidatePosts = useInvalidatePosts(orgId);

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
    const inviteAnim = pendingCount > 0 ? runPulse(invitePulse) : null;
    const recentAnim = recentAddedNames.length > 0 ? runPulse(recentPulse) : null;
    inviteAnim?.start();
    recentAnim?.start();
    return () => {
      inviteAnim?.stop();
      recentAnim?.stop();
      invitePulse.setValue(1);
      recentPulse.setValue(1);
    };
  }, [pendingCount, recentAddedNames.length, invitePulse, recentPulse]);

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
            onPress={() => setNetworkSegment("connections")}
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
      {networkSegment === "connections" ? (
        <>
          <View style={styles.sectionBlock}>
            <View style={styles.connectionsCard}>
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
          <View style={styles.sectionBlock}>
            <View style={styles.discoverCard}>
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
        </>
      ) : networkSegment === "invitations" ? (
        <View style={styles.sectionBlock}>
          <View style={styles.invitationsCard}>
            <View style={styles.sectionHeadingRowSpread}>
              <View style={styles.sectionHeadingRowCompact}>
                <UserPlus2 size={15} color={Theme.textPrimaryDark} />
                <View style={styles.sectionTitleBlock}>
                  <Text style={styles.sectionKicker}>Inbound mission protocol</Text>
                  <Text style={styles.sectionHeading}>{pendingCount} pending syncs</Text>
                </View>
              </View>
              <View style={styles.invitationsHeaderControls}>
                <View style={[styles.invSubRowCompact, styles.invSubRowCompactHeader]}>
                  {(["received", "sent"] as const).map((k) => {
                    const on = invSubTab === k;
                    return (
                      <Pressable
                        key={k}
                        onPress={() => setInvSubTab(k)}
                        style={[styles.inlineFilterPill, on && styles.inlineFilterPillOn]}
                      >
                        <Text style={[styles.inlineFilterPillText, on && styles.inlineFilterPillTextOn]}>
                          {k === "received" ? "RECEIVED" : "SENT"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {invSearchOpen ? (
                  <View style={styles.inlineSearchBox}>
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
                    style={({ pressed }) => [styles.inlineSearchIconBtn, pressed && { opacity: 0.72 }]}
                    hitSlop={8}
                  >
                    <Search size={13} color={Theme.textPrimaryDark} strokeWidth={2.4} />
                  </Pressable>
                )}
              </View>
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
      ) : null}
    </ScrollView>
  );

  const broadcastStrip = (
    <NetworkStoryStrip
      orgId={orgId}
      orgName={organization?.name ?? ""}
      feedPosts={feedPosts}
      feedLoading={feedQ.isLoading}
      onCreatePost={onCreatePost}
      headerActions={
        <View style={styles.storyTopSwitchRow}>
          <Pressable
            onPress={() => setNetworkSegment("connections")}
            style={[
              styles.storyTopSwitchBtn,
              styles.storyTopSwitchBtnIconOnly,
              networkSegment === "connections" && styles.storyTopSwitchBtnWide,
              networkSegment === "connections" && styles.storyTopSwitchBtnOn,
            ]}
            hitSlop={6}
          >
            <View style={styles.segmentLabelInline}>
              <Activity
                size={12}
                color={networkSegment === "connections" ? Theme.textOnPrimary : Theme.textSecondary}
                strokeWidth={2.2}
              />
              {networkSegment === "connections" ? (
                <Text style={[styles.storyTopSwitchText, styles.storyTopSwitchTextOn]}>
                  CONNECTIONS
                </Text>
              ) : null}
            </View>
          </Pressable>
          <Pressable
            onPress={() => setNetworkSegment("invitations")}
            style={[
              styles.storyTopSwitchBtn,
              styles.storyTopSwitchBtnIconOnly,
              networkSegment === "invitations" && styles.storyTopSwitchBtnWide,
              networkSegment === "invitations" && styles.storyTopSwitchBtnOn,
            ]}
            hitSlop={6}
          >
            <View style={styles.segmentLabelInline}>
              <UserPlus2
                size={12}
                color={networkSegment === "invitations" ? Theme.textOnPrimary : Theme.textSecondary}
                strokeWidth={2.2}
              />
              {networkSegment === "invitations" ? (
                <Text style={[styles.storyTopSwitchText, styles.storyTopSwitchTextOn]}>
                  INVITATIONS
                </Text>
              ) : null}
              {pendingCount > 0 ? (
                <Animated.View
                  style={[
                    styles.storyInviteBadge,
                    { transform: [{ scale: invitePulse }] },
                  ]}
                >
                  <Text style={styles.storyInviteBadgeText}>{pendingCount}</Text>
                </Animated.View>
              ) : null}
            </View>
          </Pressable>
          <Pressable
            onPress={() => setNetworkSegment("load")}
            style={[
              styles.storyTopSwitchBtn,
              styles.storyTopSwitchBtnIconOnly,
              networkSegment === "load" && styles.storyTopSwitchBtnWide,
              networkSegment === "load" && styles.storyTopSwitchBtnOn,
            ]}
            hitSlop={6}
          >
            <View style={styles.segmentLabelInline}>
              <Truck
                size={12}
                color={networkSegment === "load" ? Theme.textOnPrimary : Theme.textSecondary}
                strokeWidth={2.2}
              />
              {networkSegment === "load" ? (
                <Text style={[styles.storyTopSwitchText, styles.storyTopSwitchTextOn]}>
                  LOAD CENTER
                </Text>
              ) : null}
            </View>
          </Pressable>
        </View>
      }
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {broadcastStrip}
      {hubBar}

      {networkSegment === "load" ? (
        <View style={styles.loadEmbed}>
          <LoadCenterView
            contentTopPadding={0}
            onCreateIndentPress={() => router.push(ROUTES.CREATE_INDENT as Href)}
            onIndentPress={(indent) =>
              router.push(`/indent/${indent.id}` as Href)
            }
            onShareToNetwork={(indent) => setShareLoad(indent)}
          />
        </View>
      ) : (
        scrollContent
      )}

      {orgId ? (
        <ShareLoadSheet
          visible={shareLoad !== null}
          indent={shareLoad}
          orgId={orgId}
          onClose={() => setShareLoad(null)}
          onSuccess={() => {
            invalidatePosts();
            invalidateNetwork();
            setShareLoad(null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    minHeight: 0,
  },
  loadEmbed: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 0,
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
    minHeight: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
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
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    color: Theme.textSecondary,
  },
  inlineFilterPillTextOn: {
    color: Theme.textOnDark,
  },
  inlineSearchIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.teslaRed,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  storyInviteBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  storyTopSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  storyTopSwitchBtn: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    justifyContent: "center",
  },
  storyTopSwitchBtnIconOnly: {
    minWidth: 48,
    alignItems: "center",
    paddingHorizontal: 0,
  },
  storyTopSwitchBtnWide: {
    minWidth: 220,
    alignItems: "flex-start",
    paddingHorizontal: 18,
  },
  storyTopSwitchBtnOn: {
    borderColor: Theme.borderOnDark,
    backgroundColor: Theme.darkBackground,
  },
  storyTopSwitchText: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 2.1,
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
  invSubRowCompact: { flexDirection: "row", gap: 6, flex: 1, minWidth: 0 },
  invSubRowCompactHeader: {
    flex: 0,
  },
  invitationsHeaderControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-end",
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
