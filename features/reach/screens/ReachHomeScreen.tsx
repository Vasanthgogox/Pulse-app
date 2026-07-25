/**
 * Pulse Reach — Story Campaign Studio (desktop HTML-mock layout).
 * Live ticker, 4 KPIs, horizontal campaign reel + synced driver-feed preview,
 * marketing insights. Boost opens Network / campaign detail (real flows).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  useReachCampaignsQuery,
  useReachCampaignPurchasesQuery,
  useReachPlansQuery,
  useReachOrgSummaryQuery,
  useReachReferralInboxQuery,
} from "@/lib/queries/useReachCampaignsQuery";
import { ReachCampaignReelCard } from "@/features/reach/components/ReachCampaignReelCard";
import { ReachStoryPostPreview } from "@/features/reach/components/ReachStoryPostPreview";
import { groupReachCampaignsByPost } from "@/features/reach/utils/campaignFormat";
import { ReachLiveTicker } from "@/features/reach/components/ReachLiveTicker";
import { ReachMarketingInsights } from "@/features/reach/components/ReachMarketingInsights";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Coins,
  Eye,
  Gavel,
  Inbox as InboxIcon,
  Plus,
  Rocket,
  Search,
  Sparkles,
  TrendingUp,
  Zap,
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
const PAGE_MAX_WIDTH = 1440;
const CARD_WIDTH = 320;
const CARD_GAP = 14;

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
  const pagePadH = isDesktop ? 32 : Layout.screenPaddingHorizontal;

  const scrollDeck = (dir: -1 | 1) => {
    const next = Math.max(0, Math.min(groups.length - 1, deckIndex + dir));
    setDeckIndex(next);
    deckRef.current?.scrollTo({ x: next * (CARD_WIDTH + CARD_GAP), animated: true });
    if (groups[next]) setSelectedId(groups[next].primary.id);
  };

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
              <ArrowLeft size={16} color={Theme.textSecondary} />
            </Pressable>
            <View style={styles.headerDivider} />
            <View style={styles.brandIcon}>
              <Zap size={13} color={Theme.buttonPrimaryText} />
            </View>
            <View style={styles.brandText}>
              <Text style={styles.brandTitle}>Pulse Reach</Text>
              <Text style={styles.brandSub}>Story Campaign Studio</Text>
            </View>
            {isDesktop ? (
              <View style={styles.proPill}>
                <View style={styles.proDot} />
                <Text style={styles.proText}>Pro Studio</Text>
              </View>
            ) : null}
          </View>

          {isDesktop ? (
            <View style={styles.centerTabs}>
              {(
                [
                  { key: "campaigns" as const, label: "Campaigns" },
                  { key: "insights" as const, label: "Marketing Insights" },
                  { key: "credits" as const, label: "Credit Wallet" },
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
              <InboxIcon size={14} color={Theme.textSecondary} />
              {pendingRecommendations > 0 ? (
                <View style={styles.inboxBadge}>
                  <Text style={styles.inboxBadgeText}>
                    {pendingRecommendations > 9 ? "9+" : pendingRecommendations}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable style={styles.creditsPill} onPress={goCredits}>
              <Coins size={13} color={Theme.accentGoldPressed} />
              <Text style={styles.creditsValue}>
                {(summary?.walletBalance ?? 0).toLocaleString()}
              </Text>
              <Text style={styles.creditsLabel}>Credits</Text>
            </Pressable>
            {isDesktop ? (
              <Pressable style={styles.boostHeaderBtn} onPress={goBoost}>
                <Plus size={13} color={Theme.buttonPrimaryText} />
                <Text style={styles.boostHeaderText}>Boost Story</Text>
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
        {/* 4 KPIs */}
        {summaryQ.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Theme.primary} />
          </View>
        ) : (
          <View style={[styles.kpiRow, isDesktop && styles.kpiRowDesktop]}>
            <View style={[styles.kpiCard, isDesktop && styles.kpiCardDesktop]}>
              <View style={styles.kpiLeft}>
                <View style={[styles.kpiIcon, { backgroundColor: Theme.accentGoldMuted }]}>
                  <Coins size={18} color={Theme.accentGoldPressed} />
                </View>
                <View>
                  <Text style={styles.kpiValue}>
                    {(summary?.walletBalance ?? 0).toLocaleString()}
                  </Text>
                  <Text style={styles.kpiLabel}>Remaining Credits</Text>
                </View>
              </View>
              <Pressable style={styles.topUpBtn} onPress={goCredits}>
                <Text style={styles.topUpText}>+ Top Up</Text>
              </Pressable>
            </View>

            <View style={[styles.kpiCard, isDesktop && styles.kpiCardDesktop]}>
              <View style={styles.kpiLeft}>
                <View style={[styles.kpiIcon, { backgroundColor: Theme.positiveMuted }]}>
                  <Rocket size={18} color={Theme.success} />
                </View>
                <View>
                  <View style={styles.kpiValueRow}>
                    <Text style={styles.kpiValue}>{activeCount}</Text>
                    {activeCount > 0 ? (
                      <View style={styles.liveStoriesPill}>
                        <Text style={styles.liveStoriesText}>Live Stories</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.kpiLabel}>Active Stories</Text>
                </View>
              </View>
              {summary && summary.campaigns.total > 0 ? (
                <View style={styles.kpiAside}>
                  <TrendingUp size={12} color={Theme.success} />
                  <Text style={styles.kpiAsideText}>
                    {Math.round((activeCount / summary.campaigns.total) * 100)}% Active
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.kpiCard, isDesktop && styles.kpiCardDesktop]}>
              <View style={styles.kpiLeft}>
                <View style={[styles.kpiIcon, { backgroundColor: Theme.primary + "14" }]}>
                  <Eye size={18} color={Theme.primary} />
                </View>
                <View>
                  <Text style={styles.kpiValue}>
                    {(summary?.metrics.impressions ?? 0).toLocaleString()}
                  </Text>
                  <Text style={styles.kpiLabel}>Driver Impressions</Text>
                </View>
              </View>
            </View>

            <View style={[styles.kpiCard, isDesktop && styles.kpiCardDesktop]}>
              <View style={styles.kpiLeft}>
                <View style={[styles.kpiIcon, { backgroundColor: Theme.positiveMuted }]}>
                  <Gavel size={18} color={Theme.success} />
                </View>
                <View>
                  <View style={styles.kpiValueRow}>
                    <Text style={styles.kpiValue}>
                      {(summary?.metrics.bids ?? 0).toLocaleString()}
                    </Text>
                    <Text style={styles.kpiBidsUnit}>Bids</Text>
                  </View>
                  <Text style={styles.kpiLabel}>Received Bids</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Main split */}
        <View style={[styles.mainSplit, isDesktop && styles.mainSplitDesktop]}>
          <View style={[styles.leftCol, isDesktop && styles.leftColDesktop]}>
            <View style={styles.reelToolbar}>
              <View style={styles.filterPills}>
                <Pressable
                  onPress={() => setReelFilter("active")}
                  style={[styles.filterPill, reelFilter === "active" && styles.filterPillActive]}
                >
                  <View style={styles.filterDot} />
                  <Text
                    style={[
                      styles.filterPillText,
                      reelFilter === "active" && styles.filterPillTextActive,
                    ]}
                  >
                    Active Stories
                  </Text>
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{activeCount}</Text>
                  </View>
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
                    Campaign History
                  </Text>
                  <View style={[styles.filterBadge, styles.filterBadgeMuted]}>
                    <Text style={[styles.filterBadgeText, styles.filterBadgeTextMuted]}>
                      {historyCount}
                    </Text>
                  </View>
                </Pressable>
              </View>

              <View style={styles.toolbarRight}>
                <View style={styles.searchBox}>
                  <Search size={12} color={Theme.textMuted} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search ID, lane…"
                    placeholderTextColor={Theme.textMuted}
                    style={styles.searchInput}
                  />
                </View>
                {isDesktop ? (
                  <View style={styles.arrowBtns}>
                    <Pressable style={styles.arrowBtn} onPress={() => scrollDeck(-1)}>
                      <ChevronLeft size={16} color={Theme.textPrimaryDark} />
                    </Pressable>
                    <Pressable style={styles.arrowBtn} onPress={() => scrollDeck(1)}>
                      <ChevronRight size={16} color={Theme.textPrimaryDark} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>

            {campaignsQ.isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={Theme.primary} />
              </View>
            ) : groups.length === 0 ? (
              <View style={styles.emptyReel}>
                <Rocket size={28} color={Theme.textMuted} />
                <Text style={styles.emptyTitle}>No campaign stories match this view</Text>
                <Text style={styles.emptyBody}>
                  Boost a load story from Network to populate the reel.
                </Text>
              </View>
            ) : (
              <>
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
                  {groups.map(({ primary: c, boostCount, planTimeline }) => (
                    <ReachCampaignReelCard
                      key={c.id}
                      campaign={c}
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
                <View style={styles.deckFoot}>
                  <View style={styles.deckHint}>
                    <ArrowLeftRight size={11} color={Theme.textMuted} />
                    <Text style={styles.deckHintText}>
                      Swipe or use arrows to view stories one by one
                    </Text>
                  </View>
                  <Text style={styles.deckCounter}>
                    Showing {Math.min(deckIndex + 1, groups.length)} of {groups.length}
                  </Text>
                </View>
              </>
            )}

            <View style={styles.launchBar}>
              <View style={styles.launchLeft}>
                <View style={styles.launchIcon}>
                  <Sparkles size={15} color={Theme.accentGold} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.launchTitle}>Want to launch a new boost story?</Text>
                  <Text style={styles.launchSub}>
                    Promote any available trip load directly onto driver feeds instantly.
                  </Text>
                </View>
              </View>
              <Pressable style={styles.launchBtn} onPress={goBoost}>
                <Rocket size={13} color={Theme.buttonPrimaryText} />
                <Text style={styles.launchBtnText}>Boost New Trip</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.rightCol, isDesktop && styles.rightColDesktop]}>
            <ReachStoryPostPreview
              campaign={selected}
              plan={selected ? planById.get(selected.plan_id) : undefined}
              orgName={organization?.name ?? "Your org"}
              onOpenCampaign={selected ? () => goDetail(selected.id) : undefined}
            />
            <ReachMarketingInsights campaigns={allCampaigns} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.networkPageBackground },
  scroll: { flex: 1 },
  page: { gap: 14, width: "100%", paddingTop: 14 },
  pageDesktop: { maxWidth: PAGE_MAX_WIDTH, alignSelf: "center", width: "100%", gap: 16 },

  headerBleed: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.networkCardBorder,
    backgroundColor: Theme.networkGlassSurface,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 10,
    width: "100%",
  },
  headerMax: { maxWidth: PAGE_MAX_WIDTH, alignSelf: "center", width: "100%" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0, flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  headerDivider: { width: StyleSheet.hairlineWidth, height: 16, backgroundColor: Theme.borderLight },
  brandIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: 1,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: { gap: 0 },
  brandTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  brandSub: { fontSize: 9, fontWeight: "500", color: Theme.textMuted, marginTop: -1 },
  proPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardConnectedBorder,
  },
  proDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Theme.success },
  proText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.success,
    textTransform: "uppercase",
  },
  centerTabs: {
    flexDirection: "row",
    backgroundColor: Theme.surface,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 2,
  },
  centerTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  centerTabActive: { backgroundColor: Theme.cardWhite },
  centerTabText: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  centerTabTextActive: { fontWeight: "800", color: Theme.textPrimaryDark },
  creditsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Theme.accentGoldMuted,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
  },
  creditsValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  creditsLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.accentGoldPressed,
    textTransform: "uppercase",
  },
  inboxHeaderBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
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
  inboxBadgeText: { fontSize: 8, fontWeight: "900", color: Theme.textOnPrimary },
  boostHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  boostHeaderText: { fontSize: 11, fontWeight: "800", color: Theme.buttonPrimaryText },

  loadingWrap: { alignItems: "center", paddingVertical: 24 },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiRowDesktop: { flexWrap: "nowrap" },
  kpiCard: {
    flexBasis: 200,
    flexGrow: 1,
    minWidth: 170,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
    padding: 12,
    gap: 8,
  },
  kpiCardDesktop: { flex: 1, minWidth: 0, flexBasis: 0 },
  kpiLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  kpiIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
  },
  kpiValueRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  kpiLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 1,
  },
  kpiBidsUnit: { fontSize: 10, fontWeight: "800", color: Theme.success },
  liveStoriesPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
  },
  liveStoriesText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.success,
    textTransform: "uppercase",
  },
  kpiAside: { flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 0 },
  kpiAsideText: { fontSize: 10, fontWeight: "800", color: Theme.success },
  topUpBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: Theme.accentGoldMuted,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
  },
  topUpText: { fontSize: 10, fontWeight: "800", color: Theme.accentGoldPressed },

  mainSplit: { gap: 14 },
  mainSplitDesktop: { flexDirection: "row", alignItems: "flex-start", gap: 20 },
  leftCol: { gap: 12, flex: 1, minWidth: 0 },
  leftColDesktop: { flex: 7, minWidth: 0 },
  rightCol: { gap: 14, flex: 1, minWidth: 0, width: "100%" },
  rightColDesktop: { flex: 5, maxWidth: 420, minWidth: 300 },

  reelToolbar: {
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
    padding: 10,
    gap: 10,
  },
  filterPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: Theme.surface,
    borderRadius: 10,
    padding: 3,
    gap: 2,
    alignSelf: "flex-start",
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  filterPillActive: { backgroundColor: Theme.cardWhite },
  filterPillText: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  filterPillTextActive: { color: Theme.textPrimaryDark, fontWeight: "800" },
  filterDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.success },
  filterBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
  },
  filterBadgeMuted: { backgroundColor: Theme.borderMedium },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.success,
    fontVariant: ["tabular-nums"],
  },
  filterBadgeTextMuted: { color: Theme.textSecondary },
  toolbarRight: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 9,
    paddingVertical: Platform.OS === "web" ? 6 : 1,
    minWidth: 140,
    flex: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    paddingVertical: 4,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  arrowBtns: { flexDirection: "row", gap: 4 },
  arrowBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  deckContent: { gap: CARD_GAP, paddingVertical: 4, paddingRight: 8 },
  deckFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 2,
  },
  deckHint: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  deckHintText: { fontSize: 9, fontWeight: "700", color: Theme.textMuted },
  deckCounter: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
    fontVariant: ["tabular-nums"],
  },

  emptyReel: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 6,
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
  },
  emptyTitle: { fontSize: 12, fontWeight: "800", color: Theme.textPrimaryDark },
  emptyBody: { fontSize: 10, color: Theme.textMuted, textAlign: "center", paddingHorizontal: 24 },

  launchBar: {
    backgroundColor: Theme.tripSelectionSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.tripSelectionBorder,
    padding: 14,
    gap: 12,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  launchLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 200 },
  launchIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Theme.accentGoldMuted,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  launchTitle: { fontSize: 11, fontWeight: "800", color: Theme.textOnDark },
  launchSub: { fontSize: 9, fontWeight: "500", color: Theme.textOnDarkMuted, marginTop: 1 },
  launchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  launchBtnText: { fontSize: 11, fontWeight: "900", color: Theme.buttonPrimaryText },
});
