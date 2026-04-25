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
import { type PostRow } from "@/features/network/services/posts.service";
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
}: {
  orgId: string;
  orgName: string;
  feedPosts: PostRow[];
  feedLoading: boolean;
  onCreatePost: () => void;
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
  const [networkSegment, setNetworkSegment] = useState<"connections" | "invitations" | "load">("connections");
  const [connSearch, setConnSearch] = useState("");
  const [connFilter, setConnFilter] = useState<ConnectionFilterTab>("ALL");
  const [invSubTab, setInvSubTab] = useState<"received" | "sent">("received");
  const [invSearch, setInvSearch] = useState("");
  const [discoverSearchOpen, setDiscoverSearchOpen] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState("");
  const [shareLoad, setShareLoad] = useState<IndentRow | null>(null);

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

  const onCreatePost = () => router.push("/(modals)/create-post");
  const onOpenLoadCenter = () => setNetworkSegment("load");
  const feedPosts = feedQ.data ?? [];

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
      <View style={styles.hubTopRow}>
        <View style={styles.hubEyebrowRow}>
          <Text style={styles.hubEyebrow}>Mission control</Text>
          <View style={styles.growBadge}>
            <Text style={styles.growBadgeText}>GROW MODE</Text>
          </View>
        </View>
        <View style={styles.segmentRow}>
          <Pressable
            onPress={() => setNetworkSegment("connections")}
            style={[
              styles.segmentBtn,
              networkSegment === "connections" && styles.segmentBtnActive,
            ]}
            hitSlop={6}
          >
            <Text
              style={[
                styles.segmentText,
                networkSegment === "connections" && styles.segmentTextOn,
              ]}
            >
              CONNECTIONS
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setNetworkSegment("invitations")}
            style={[
              styles.segmentBtn,
              networkSegment === "invitations" && styles.segmentBtnActive,
            ]}
            hitSlop={6}
          >
            <View style={styles.segmentLabelInline}>
              <Text
                style={[
                  styles.segmentText,
                  networkSegment === "invitations" && styles.segmentTextOn,
                ]}
              >
                INVITATIONS
              </Text>
              {pendingCount > 0 ? <View style={styles.segmentPendingDot} /> : null}
            </View>
          </Pressable>
          <Pressable
            onPress={onOpenLoadCenter}
            style={[
              styles.segmentBtn,
              networkSegment === "load" && styles.segmentBtnActive,
            ]}
            hitSlop={6}
          >
            <View style={styles.segmentLabelInline}>
              <Truck
                size={14}
                color={networkSegment === "load" ? Theme.textPrimaryDark : Theme.textSecondary}
                strokeWidth={2.2}
              />
              <Text
                style={[
                  styles.segmentText,
                  networkSegment === "load" && styles.segmentTextOn,
                ]}
              >
                LOAD CENTER
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {networkSegment === "connections" ? (
        <View style={styles.hubTools}>
          <View style={styles.hubSearchBox}>
            <Search size={16} color={Theme.textSecondary} />
            <TextInput
              style={styles.hubSearchInput}
              placeholder="Search connections…"
              placeholderTextColor={Theme.textSecondary}
              value={connSearch}
              onChangeText={setConnSearch}
              returnKeyType="search"
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterPillScroll}
          >
            {filterTabs.map((t) => {
              const active = connFilter === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setConnFilter(t)}
                  style={[styles.filterPill, active && styles.filterPillOn]}
                >
                  <Text style={[styles.filterPillText, active && styles.filterPillTextOn]}>
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : networkSegment === "invitations" ? (
        <View style={styles.hubTools}>
          <View style={styles.invSubRow}>
            {(["received", "sent"] as const).map((k) => {
              const on = invSubTab === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setInvSubTab(k)}
                  style={[styles.invSubBtn, on && styles.invSubBtnOn]}
                >
                  <Text style={[styles.invSubText, on && styles.invSubTextOn]}>
                    {k === "received" ? "RECEIVED" : "SENT"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.hubSearchBox}>
            <Search size={16} color={Theme.textSecondary} />
            <TextInput
              style={styles.hubSearchInput}
              placeholder={
                invSubTab === "received" ? "Search received…" : "Search sent invitations…"
              }
              placeholderTextColor={Theme.textSecondary}
              value={invSearch}
              onChangeText={setInvSearch}
              returnKeyType="search"
            />
          </View>
        </View>
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
              <View style={styles.sectionHeadingRow}>
                <Activity size={14} color={Theme.textPrimaryDark} />
                <View style={styles.sectionTitleBlock}>
                  <Text style={styles.sectionKicker}>Operations pulse</Text>
                  <Text style={styles.sectionHeading}>Your connections</Text>
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
    marginTop: 14,
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 12,
    flexWrap: "wrap",
  },
  hubEyebrowRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  hubEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.8,
    color: Theme.textSection,
    textTransform: "uppercase",
  },
  growBadge: {
    borderRadius: 8,
    backgroundColor: Theme.primary,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  growBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    letterSpacing: 0.8,
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
    marginTop: 18,
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
