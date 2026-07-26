/**
 * Pulse Reach — Story Campaign Studio (desktop HTML-mock layout).
 * Live ticker, 4 KPIs, horizontal campaign reel + synced driver-feed preview,
 * marketing insights. Boost opens Network / campaign detail (real flows).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ReachCampaignReelCard } from "@/features/reach/components/ReachCampaignReelCard";
import { ReachLiveTicker } from "@/features/reach/components/ReachLiveTicker";
import { ReachMarketingInsights } from "@/features/reach/components/ReachMarketingInsights";
import { ReachStoryPostPreview } from "@/features/reach/components/ReachStoryPostPreview";
import { groupReachCampaignsByPost } from "@/features/reach/utils/campaignFormat";
import {
    useReachCampaignPurchasesQuery,
    useReachCampaignsQuery,
    useReachOrgSummaryQuery,
    useReachPlansQuery,
    useReachReferralInboxQuery,
} from "@/lib/queries/useReachCampaignsQuery";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import {
    ArrowLeft,
    Coins,
    Eye,
    Gavel,
    Inbox as InboxIcon,
    Plus,
    Rocket,
    Search,
    TrendingUp,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DESKTOP_BREAKPOINT = 1024;
const PAGE_MAX_WIDTH = 1280;
const CARD_WIDTH = 300;
const CARD_GAP = 10;

type ReelFilter = "active" | "history";
type StudioTab = "campaigns" | "insights" | "credits";

interface ReachStudioScreenProps {
  /** History route opens on completed/cancelled; Home opens on active. */
  initialReelFilter?: ReelFilter;
}

export default function ReachHomeScreen({
  initialReelFilter = "active",
}: ReachStudioScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;

  const summaryQ = useReachOrgSummaryQuery(orgId);
  const campaignsQ = useReachCampaignsQuery(orgId);
  const purchasesQ = useReachCampaignPurchasesQuery(orgId);
  const plansQ = useReachPlansQuery();
  const inboxQ = useReachReferralInboxQuery(orgId);
  const pendingRecommendations = (inboxQ.data ?? []).filter(
    (r) => r.status === "recommended",
  ).length;
  const summary = summaryQ.data;
  const allCampaigns = campaignsQ.data ?? [];
  const planById = new Map((plansQ.data ?? []).map((p) => [p.id, p]));

  const [reelFilter, setReelFilter] = useState<ReelFilter>(initialReelFilter);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [studioTab, setStudioTab] = useState<StudioTab>("campaigns");
  const deckRef = useRef<ScrollView>(null);
  const [deckIndex, setDeckIndex] = useState(0);
  const useManagerList = isDesktop;

  // One card per trip, not per campaign row. Group ACROSS every status first
  // (an upgraded/re-broadcast trip's earlier expired or cancelled campaigns
  // still belong to its timeline), then bucket each trip as "active" if any
  // of its campaigns is currently active — that's what decides which reel
  // tab it surfaces under, independent of which row happens to rank highest.
  //
  // The plan-tier timeline is read from reach_campaign_purchases, not from
  // the campaign rows themselves: upgrade_reach_campaign mutates plan_id on
  // the SAME row in place (Starter -> Growth -> Business is one row, three
  // purchases), while a re-broadcast trip gets one purchase per new row.
  // Purchases are the only source that captures both.
  const allTripGroups = useMemo(() => {
    const purchases = purchasesQ.data ?? [];
    return groupReachCampaignsByPost(allCampaigns).map((camps) => {
      const activeOnes = camps.filter((c) => c.status === "active");
      const rankPool = activeOnes.length > 0 ? activeOnes : camps;
      const byRank = [...rankPool].sort((a, b) => {
        const pa = planById.get(a.plan_id)?.sort_order ?? 0;
        const pb = planById.get(b.plan_id)?.sort_order ?? 0;
        if (pa !== pb) return pb - pa;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      const primary = byRank[0];
      const campaignIds = new Set(camps.map((c) => c.id));
      // purchasesQ is already ordered oldest-first by the query.
      const tripPurchases = purchases.filter((p) => campaignIds.has(p.campaign_id));
      const planTimeline =
        tripPurchases.length > 0
          ? tripPurchases.map((p) => planById.get(p.plan_id)?.name ?? "Boost")
          : [planById.get(primary.plan_id)?.name ?? "Boost"];
      return {
        primary,
        campaignIds: camps.map((c) => c.id),
        bucket: (activeOnes.length > 0 ? "active" : "history") as ReelFilter,
        boostCount: Math.max(tripPurchases.length, camps.length),
        planTimeline,
      };
    });
  }, [allCampaigns, plansQ.data, purchasesQ.data]);

  const activeCount = allTripGroups.filter((g) => g.bucket === "active").length;
  const historyCount = allTripGroups.filter((g) => g.bucket === "history").length;

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTripGroups.filter((g) => {
      if (g.bucket !== reelFilter) return false;
      if (!q) return true;
      const c = g.primary;
      const hay = [
        c.snapshot_material,
        c.snapshot_origin,
        c.snapshot_destination,
        c.snapshot_vehicle_type,
        c.id,
        c.post_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allTripGroups, reelFilter, search]);

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedId(null);
      setDeckIndex(0);
      return;
    }
    if (!selectedId || !groups.some((g) => g.primary.id === selectedId)) {
      setSelectedId(groups[0].primary.id);
      setDeckIndex(0);
    }
  }, [groups, selectedId]);

  const selectedGroup = groups.find((g) => g.primary.id === selectedId) ?? groups[0] ?? null;
  const selected = selectedGroup?.primary ?? null;
  const pagePadH = isDesktop ? 24 : Layout.screenPaddingHorizontal;

  const onDeckScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / (CARD_WIDTH + CARD_GAP));
    if (idx !== deckIndex && groups[idx]) {
      setDeckIndex(idx);
      setSelectedId(groups[idx].primary.id);
    }
  };

  const goBoost = () => router.push(ROUTES.TABS.NETWORK as never);
  const goCredits = () => router.push(ROUTES.REACH.EARN_CREDITS as never);
  const goDetail = (id: string) => router.push(ROUTES.REACH.campaignDetail(id) as never);

  const onTab = (tab: StudioTab) => {
    setStudioTab(tab);
    if (tab === "credits") goCredits();
    if (tab === "insights") {
      // stay on page — insights panel is always visible on desktop
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ReachLiveTicker />

      <View style={[styles.headerBleed, { paddingHorizontal: pagePadH }]}>
        <View style={[styles.headerInner, isDesktop && styles.headerMax]}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
              <ArrowLeft size={15} color={Theme.textRouteCard} />
            </Pressable>
            <View style={styles.brandText}>
              <Text style={styles.brandTitle}>Pulse Reach</Text>
              <Text style={styles.brandSub}>Campaign Manager</Text>
            </View>
          </View>

          {isDesktop ? (
            <View style={styles.centerTabs}>
              {(
                [
                  { key: "campaigns" as const, label: "Campaigns" },
                  { key: "insights" as const, label: "Insights" },
                  { key: "credits" as const, label: "Billing" },
                ] as const
              ).map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => onTab(t.key)}
                  style={[styles.centerTab, studioTab === t.key && styles.centerTabActive]}
                >
                  <Text
                    style={[
                      styles.centerTabText,
                      studioTab === t.key && styles.centerTabTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.headerRight}>
            <Pressable
              style={styles.inboxHeaderBtn}
              onPress={() => router.push(ROUTES.REACH.INBOX as never)}
              accessibilityLabel="Opportunities — recommended by drivers"
            >
              <InboxIcon size={14} color={Theme.textRouteCard} />
              {pendingRecommendations > 0 ? (
                <View style={styles.inboxBadge}>
                  <Text style={styles.inboxBadgeText}>
                    {pendingRecommendations > 9 ? "9+" : pendingRecommendations}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable style={styles.creditsPill} onPress={goCredits}>
              <Coins size={12} color={Theme.accentBrown} />
              <Text style={styles.creditsValue}>
                {(summary?.walletBalance ?? 0).toLocaleString()}
              </Text>
              <Text style={styles.creditsLabel}>credits</Text>
            </Pressable>
            {isDesktop ? (
              <Pressable style={styles.boostHeaderBtn} onPress={goBoost}>
                <Plus size={13} color={Theme.textOnPrimary} />
                <Text style={styles.boostHeaderText}>Create campaign</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.page,
          { paddingHorizontal: pagePadH, paddingBottom: 32 + insets.bottom },
          isDesktop && styles.pageDesktop,
        ]}
      >
        {/* Account overview KPIs */}
        {summaryQ.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Theme.primary} />
          </View>
        ) : (
          <View style={[styles.kpiRow, isDesktop && styles.kpiRowDesktop]}>
            <View style={[styles.kpiCard, isDesktop && styles.kpiCardDesktop]}>
              <Text style={styles.kpiLabel}>Account balance</Text>
              <View style={styles.kpiValueRow}>
                <Text style={styles.kpiValue}>
                  {(summary?.walletBalance ?? 0).toLocaleString()}
                </Text>
                <Text style={styles.kpiUnit}>credits</Text>
              </View>
              <Pressable style={styles.topUpBtn} onPress={goCredits}>
                <Text style={styles.topUpText}>Top up</Text>
              </Pressable>
            </View>

            <View style={[styles.kpiCard, isDesktop && styles.kpiCardDesktop]}>
              <Text style={styles.kpiLabel}>Active campaigns</Text>
              <View style={styles.kpiValueRow}>
                <Text style={styles.kpiValue}>{activeCount}</Text>
                {summary && summary.campaigns.total > 0 ? (
                  <View style={styles.kpiAside}>
                    <TrendingUp size={11} color={Theme.success} />
                    <Text style={styles.kpiAsideText}>
                      {Math.round((activeCount / summary.campaigns.total) * 100)}% live
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={[styles.kpiCard, isDesktop && styles.kpiCardDesktop]}>
              <Text style={styles.kpiLabel}>Impressions</Text>
              <View style={styles.kpiValueRow}>
                <Eye size={14} color={Theme.textMuted} />
                <Text style={styles.kpiValue}>
                  {(summary?.metrics.impressions ?? 0).toLocaleString()}
                </Text>
              </View>
            </View>

            <View style={[styles.kpiCard, isDesktop && styles.kpiCardDesktop]}>
              <Text style={styles.kpiLabel}>Results (bids)</Text>
              <View style={styles.kpiValueRow}>
                <Gavel size={14} color={Theme.textMuted} />
                <Text style={styles.kpiValue}>
                  {(summary?.metrics.bids ?? 0).toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Main split */}
        <View style={[styles.mainSplit, isDesktop && styles.mainSplitDesktop]}>
          <View style={[styles.leftCol, isDesktop && styles.leftColDesktop]}>
            <View style={styles.campaignPanel}>
              <View style={styles.reelToolbar}>
                <View style={styles.filterPills}>
                  <Pressable
                    onPress={() => setReelFilter("active")}
                    style={[styles.filterPill, reelFilter === "active" && styles.filterPillActive]}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        reelFilter === "active" && styles.filterPillTextActive,
                      ]}
                    >
                      Active ({activeCount})
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setReelFilter("history")}
                    style={[styles.filterPill, reelFilter === "history" && styles.filterPillActive]}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        reelFilter === "history" && styles.filterPillTextActive,
                      ]}
                    >
                      History ({historyCount})
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.searchBox}>
                  <Search size={13} color={Theme.textMuted} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search campaigns, lanes, IDs…"
                    placeholderTextColor={Theme.textMuted}
                    style={styles.searchInput}
                  />
                </View>
              </View>

              {campaignsQ.isLoading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={Theme.primary} />
                </View>
              ) : groups.length === 0 ? (
                <View style={styles.emptyReel}>
                  <Rocket size={22} color={Theme.textMuted} />
                  <Text style={styles.emptyTitle}>No campaigns in this view</Text>
                  <Text style={styles.emptyBody}>
                    Create a campaign from Network to start reaching drivers.
                  </Text>
                  <Pressable style={styles.emptyCta} onPress={goBoost}>
                    <Plus size={13} color={Theme.textOnPrimary} />
                    <Text style={styles.emptyCtaText}>Create campaign</Text>
                  </Pressable>
                </View>
              ) : useManagerList ? (
                <View style={styles.tableWrap}>
                  <View style={styles.tableHead}>
                    <Text style={[styles.th, styles.thName]}>Campaign</Text>
                    <Text style={[styles.th, styles.thCol]}>Delivery</Text>
                    <Text style={[styles.th, styles.thCol]}>Reach</Text>
                    <Text style={[styles.th, styles.thCol]}>Results</Text>
                    <Text style={[styles.th, styles.thCol]}>Spend</Text>
                    <Text style={[styles.th, styles.thWide]}>Details</Text>
                    <Text style={[styles.th, styles.thActions]}>Actions</Text>
                  </View>
                  {groups.map(({ primary: c, campaignIds, boostCount, planTimeline }) => (
                    <ReachCampaignReelCard
                      key={c.id}
                      variant="manager"
                      campaign={c}
                      tripCampaignIds={campaignIds}
                      plan={planById.get(c.plan_id)}
                      boostCount={boostCount}
                      planTimeline={planTimeline}
                      selected={c.id === selected?.id}
                      onSelect={() => setSelectedId(c.id)}
                      onOpenDetail={() => goDetail(c.id)}
                      onBoost={() => {
                        if (c.post_id) goBoost();
                        else goDetail(c.id);
                      }}
                    />
                  ))}
                </View>
              ) : (
                <ScrollView
                  ref={deckRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={CARD_WIDTH + CARD_GAP}
                  decelerationRate="fast"
                  contentContainerStyle={styles.deckContent}
                  onMomentumScrollEnd={onDeckScroll}
                  onScrollEndDrag={onDeckScroll}
                >
                  {groups.map(({ primary: c, campaignIds, boostCount, planTimeline }) => (
                    <ReachCampaignReelCard
                      key={c.id}
                      variant="deck"
                      campaign={c}
                      tripCampaignIds={campaignIds}
                      plan={planById.get(c.plan_id)}
                      boostCount={boostCount}
                      planTimeline={planTimeline}
                      selected={c.id === selected?.id}
                      onSelect={() => setSelectedId(c.id)}
                      onOpenDetail={() => goDetail(c.id)}
                      onBoost={() => {
                        if (c.post_id) goBoost();
                        else goDetail(c.id);
                      }}
                    />
                  ))}
                </ScrollView>
              )}
            </View>

            <View style={styles.launchBar}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.launchTitle}>Create a new campaign</Text>
                <Text style={styles.launchSub}>
                  Boost an available load to driver feeds and start collecting bids.
                </Text>
              </View>
              <Pressable style={styles.launchBtn} onPress={goBoost}>
                <Plus size={13} color={Theme.textOnPrimary} />
                <Text style={styles.launchBtnText}>Create campaign</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.rightCol, isDesktop && styles.rightColDesktop]}>
            <View style={styles.previewStack}>
              <ReachStoryPostPreview
                campaign={selected}
                plan={selected ? planById.get(selected.plan_id) : undefined}
                orgName={organization?.name ?? "Your org"}
                onOpenCampaign={selected ? () => goDetail(selected.id) : undefined}
              />
              <ReachMarketingInsights campaigns={allCampaigns} />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.networkPageBackground },
  scroll: { flex: 1 },
  page: { gap: 12, width: "100%", paddingTop: 16 },
  pageDesktop: { maxWidth: PAGE_MAX_WIDTH, alignSelf: "center", width: "100%", gap: 14 },

  headerBleed: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 12,
    width: "100%",
  },
  headerMax: { maxWidth: PAGE_MAX_WIDTH, alignSelf: "center", width: "100%" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0, flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  brandText: { gap: 0 },
  brandTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  brandSub: { fontSize: 11, fontWeight: "500", color: Theme.textMuted, marginTop: 0 },
  centerTabs: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 2,
    alignSelf: "stretch",
  },
  centerTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    justifyContent: "center",
  },
  centerTabActive: { borderBottomColor: Theme.primary },
  centerTabText: { fontSize: 13, fontWeight: "600", color: Theme.textMuted },
  centerTabTextActive: { fontWeight: "700", color: Theme.textPrimaryDark },
  creditsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  creditsValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  creditsLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  inboxHeaderBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: Theme.negative,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxBadgeText: { fontSize: 8, fontWeight: "800", color: Theme.textOnPrimary },
  boostHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: Theme.primary,
  },
  boostHeaderText: { fontSize: 12, fontWeight: "700", color: Theme.textOnPrimary },

  loadingWrap: { alignItems: "center", paddingVertical: 28 },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiRowDesktop: { flexWrap: "nowrap" },
  kpiCard: {
    flexBasis: 160,
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  kpiCardDesktop: { flex: 1, minWidth: 0, flexBasis: 0 },
  kpiLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.5,
  },
  kpiUnit: { fontSize: 12, fontWeight: "500", color: Theme.textMuted },
  kpiValueRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  kpiAside: { flexDirection: "row", alignItems: "center", gap: 3 },
  kpiAsideText: { fontSize: 11, fontWeight: "600", color: Theme.success },
  topUpBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  topUpText: { fontSize: 11, fontWeight: "700", color: Theme.primary },

  mainSplit: { gap: 12 },
  mainSplitDesktop: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  leftCol: { gap: 10, flex: 1, minWidth: 0 },
  leftColDesktop: { flex: 7, minWidth: 0 },
  rightCol: { gap: 12, flex: 1, minWidth: 0, width: "100%" },
  rightColDesktop: { flex: 4, maxWidth: 380, minWidth: 300 },
  previewStack: { gap: 12, width: "100%" },

  campaignPanel: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
  },
  reelToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  filterPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  filterPillActive: { borderBottomColor: Theme.primary },
  filterPillText: { fontSize: 13, fontWeight: "600", color: Theme.textMuted },
  filterPillTextActive: { color: Theme.textPrimaryDark, fontWeight: "700" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "web" ? 6 : 2,
    minWidth: 180,
    flexGrow: 1,
    maxWidth: 320,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    paddingVertical: 4,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  tableWrap: { width: "100%" },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Theme.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  th: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  thName: { flex: 1.4, minWidth: 160 },
  thCol: { width: 72 },
  thWide: { width: 120 },
  thActions: { width: 132, textAlign: "right" },

  deckContent: { gap: CARD_GAP, padding: 12 },

  emptyReel: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 6,
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  emptyBody: {
    fontSize: 12,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 320,
  },
  emptyCta: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Theme.primary,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyCtaText: { fontSize: 12, fontWeight: "700", color: Theme.textOnPrimary },

  launchBar: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  launchTitle: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  launchSub: { fontSize: 12, fontWeight: "500", color: Theme.textMuted, marginTop: 2 },
  launchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Theme.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  launchBtnText: { fontSize: 12, fontWeight: "700", color: Theme.textOnPrimary },
});
