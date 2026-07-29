/**
 * Pulse Reach — Story Campaign Studio (Metronic Campaign Manager).
 * Live ticker, KPI strip, Ads Manager table + ad preview + insights.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ReachCampaignReelCard } from "@/features/reach/components/ReachCampaignReelCard";
import { ReachLiveTicker } from "@/features/reach/components/ReachLiveTicker";
import { ReachMarketingInsights } from "@/features/reach/components/ReachMarketingInsights";
import { ReachStoryPostPreview } from "@/features/reach/components/ReachStoryPostPreview";
import {
    REACH_DESKTOP_BP,
    REACH_M,
    REACH_PAGE_MAX,
    reachMetronicShared as m,
} from "@/features/reach/styles/reachMetronic";
import { groupReachCampaignsByPost } from "@/features/reach/utils/campaignFormat";
import {
    useReachCampaignPurchasesQuery,
    useReachCampaignsQuery,
    useReachOrgSummaryQuery,
    useReachPlansQuery,
    useReachReferralInboxQuery,
} from "@/lib/queries/useReachCampaignsQuery";
import {
    REACH_METRONIC_KPI_ICONS,
    type ReachMetronicKpiId,
} from "@/lib/reachMetronicAssets";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import {
    ArrowLeft,
    Coins,
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

const DESKTOP_BREAKPOINT = REACH_DESKTOP_BP;
const PAGE_MAX_WIDTH = REACH_PAGE_MAX;
const CARD_WIDTH = 300;
const CARD_GAP = 10;
const KPI_ICON_SIZE = 40;

function MetronicKpiIcon({ id }: { id: ReachMetronicKpiId }) {
  const { Icon } = REACH_METRONIC_KPI_ICONS[id];
  return (
    <View style={m.kpiIconOrb}>
      <Icon width={KPI_ICON_SIZE} height={KPI_ICON_SIZE} />
    </View>
  );
}

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
    <View style={[m.pageCanvas, { paddingTop: insets.top }]}>
      <ReachLiveTicker />

      <View style={[m.headerBleed, { paddingHorizontal: pagePadH }]}>
        <View style={[m.headerInner, isDesktop && m.headerMax]}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.back()} style={m.backBtn} hitSlop={8}>
              <ArrowLeft size={15} color={REACH_M.subtle} />
            </Pressable>
            <View style={styles.brandText}>
              <Text style={m.brandTitle}>Pulse Reach</Text>
              <Text style={m.brandSub}>Campaign Manager</Text>
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
                  style={[m.centerTab, studioTab === t.key && m.centerTabActive]}
                >
                  <Text
                    style={[
                      m.centerTabText,
                      studioTab === t.key && m.centerTabTextActive,
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
              <InboxIcon size={14} color={REACH_M.subtle} />
              {pendingRecommendations > 0 ? (
                <View style={styles.inboxBadge}>
                  <Text style={styles.inboxBadgeText}>
                    {pendingRecommendations > 9 ? "9+" : pendingRecommendations}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable style={styles.creditsPill} onPress={goCredits}>
              <Coins size={12} color={REACH_M.primary} />
              <Text style={styles.creditsValue}>
                {(summary?.walletBalance ?? 0).toLocaleString()}
              </Text>
              <Text style={styles.creditsLabel}>credits</Text>
            </Pressable>
            {isDesktop ? (
              <Pressable style={m.primaryBtn} onPress={goBoost}>
                <Plus size={13} color={Theme.textOnPrimary} />
                <Text style={m.primaryBtnText}>Create campaign</Text>
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
            <View style={[m.kpiCard, isDesktop && styles.kpiCardDesktop]}>
              <View style={styles.kpiCardTop}>
                <Text style={m.kpiLabel}>Account balance</Text>
                <MetronicKpiIcon id="balance" />
              </View>
              <View style={styles.kpiValueRow}>
                <Text style={m.kpiValue}>
                  {(summary?.walletBalance ?? 0).toLocaleString()}
                </Text>
                <Text style={styles.kpiUnit}>credits</Text>
              </View>
              <Pressable style={styles.topUpBtn} onPress={goCredits}>
                <Text style={styles.topUpText}>Top up</Text>
              </Pressable>
            </View>

            <View style={[m.kpiCard, isDesktop && styles.kpiCardDesktop]}>
              <View style={styles.kpiCardTop}>
                <Text style={m.kpiLabel}>Active campaigns</Text>
                <MetronicKpiIcon id="active" />
              </View>
              <View style={styles.kpiValueRow}>
                <Text style={m.kpiValue}>{activeCount}</Text>
                {summary && summary.campaigns.total > 0 ? (
                  <View style={styles.kpiAside}>
                    <TrendingUp size={11} color={REACH_M.successText} />
                    <Text style={styles.kpiAsideText}>
                      {Math.round((activeCount / summary.campaigns.total) * 100)}% live
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={[m.kpiCard, isDesktop && styles.kpiCardDesktop]}>
              <View style={styles.kpiCardTop}>
                <Text style={m.kpiLabel}>Impressions</Text>
                <MetronicKpiIcon id="impressions" />
              </View>
              <View style={styles.kpiValueRow}>
                <Text style={m.kpiValue}>
                  {(summary?.metrics.impressions ?? 0).toLocaleString()}
                </Text>
              </View>
            </View>

            <View style={[m.kpiCard, isDesktop && styles.kpiCardDesktop]}>
              <View style={styles.kpiCardTop}>
                <Text style={m.kpiLabel}>Results (bids)</Text>
                <MetronicKpiIcon id="results" />
              </View>
              <View style={styles.kpiValueRow}>
                <Text style={m.kpiValue}>
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
                  <Pressable style={m.primaryBtn} onPress={goBoost}>
                    <Plus size={13} color={Theme.textOnPrimary} />
                    <Text style={m.primaryBtnText}>Create campaign</Text>
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
              <Pressable style={m.primaryBtn} onPress={goBoost}>
                <Plus size={13} color={Theme.textOnPrimary} />
                <Text style={m.primaryBtnText}>Create campaign</Text>
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
  scroll: { flex: 1 },
  page: { gap: 14, width: "100%", paddingTop: 18 },
  pageDesktop: { maxWidth: PAGE_MAX_WIDTH, alignSelf: "center", width: "100%", gap: 16 },

  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0, flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  brandText: { gap: 0 },
  centerTabs: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 2,
    alignSelf: "stretch",
  },
  creditsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: REACH_M.quote,
    borderWidth: 1,
    borderColor: REACH_M.border,
  },
  creditsValue: {
    fontSize: 12,
    fontWeight: "700",
    color: REACH_M.text,
    fontVariant: ["tabular-nums"],
  },
  creditsLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: REACH_M.muted,
  },
  inboxHeaderBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: REACH_M.card,
    borderWidth: 1,
    borderColor: REACH_M.borderStrong,
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

  loadingWrap: { alignItems: "center", paddingVertical: 28 },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiRowDesktop: { flexWrap: "nowrap" },
  kpiCardDesktop: { flex: 1, minWidth: 0, flexBasis: 0 },
  kpiCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  kpiUnit: { fontSize: 12, fontWeight: "500", color: REACH_M.muted },
  kpiValueRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  kpiAside: { flexDirection: "row", alignItems: "center", gap: 3 },
  kpiAsideText: { fontSize: 11, fontWeight: "600", color: REACH_M.successText },
  topUpBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: REACH_M.card,
    borderWidth: 1,
    borderColor: REACH_M.borderStrong,
  },
  topUpText: { fontSize: 11, fontWeight: "700", color: REACH_M.primary },

  mainSplit: { gap: 12 },
  mainSplitDesktop: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  leftCol: { gap: 12, flex: 1, minWidth: 0 },
  leftColDesktop: { flex: 7, minWidth: 0 },
  rightCol: { gap: 12, flex: 1, minWidth: 0, width: "100%" },
  rightColDesktop: { flex: 4, maxWidth: 380, minWidth: 300 },
  previewStack: { gap: 12, width: "100%" },

  campaignPanel: {
    backgroundColor: REACH_M.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: REACH_M.border,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: REACH_M.shadow } as object,
      default: {},
    }),
  },
  reelToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: REACH_M.border,
    backgroundColor: REACH_M.card,
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
  filterPillActive: { borderBottomColor: REACH_M.primary },
  filterPillText: { fontSize: 13, fontWeight: "600", color: REACH_M.muted },
  filterPillTextActive: { color: REACH_M.text, fontWeight: "700" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: REACH_M.quote,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: REACH_M.border,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "web" ? 7 : 2,
    minWidth: 180,
    flexGrow: 1,
    maxWidth: 320,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: REACH_M.text,
    paddingVertical: 4,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  tableWrap: { width: "100%" },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: REACH_M.quote,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: REACH_M.border,
  },
  th: {
    fontSize: 10,
    fontWeight: "700",
    color: REACH_M.muted,
    textTransform: "uppercase",
    letterSpacing: 0.45,
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
  emptyTitle: { fontSize: 14, fontWeight: "700", color: REACH_M.text },
  emptyBody: {
    fontSize: 12,
    color: REACH_M.muted,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 320,
  },

  launchBar: {
    backgroundColor: REACH_M.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: REACH_M.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    ...Platform.select({
      web: { boxShadow: REACH_M.shadow } as object,
      default: {},
    }),
  },
  launchTitle: { fontSize: 14, fontWeight: "700", color: REACH_M.text },
  launchSub: { fontSize: 12, fontWeight: "500", color: REACH_M.muted, marginTop: 2 },
});
