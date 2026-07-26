/**
 * Campaign Detail — Pulse Boost V2 Studio (HTML-mock layout).
 * Breadcrumb header with the REAL indent reference; hero identity card
 * (route corridor / required truck / current tier); health & diagnostics
 * with score ring; performance metrics + target reach; conversion pipeline
 * funnel; sticky-style right column with the live story preview
 * (Driver/Fleet perspective) and the Referral Escrow summary.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ReachCampaignHealthCard } from "@/features/reach/components/ReachCampaignHealthCard";
import { ReachCampaignTimeline } from "@/features/reach/components/ReachCampaignTimeline";
import { ReachStoryPostPreview } from "@/features/reach/components/ReachStoryPostPreview";
import { CampaignUpgradePanel } from "@/features/reach/components/CampaignUpgradePanel";
import { BoostSheet } from "@/features/reach/components/BoostSheet";
import {
  useReachCampaignsQuery,
  useReachPlansQuery,
  useReachCampaignMetricsQuery,
  useReachCampaignDeliveryQuery,
  useReachDriverReferralsQuery,
} from "@/lib/queries/useReachCampaignsQuery";
import { useInvalidatePosts } from "@/lib/queries/usePostsQuery";
import { getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import {
  formatRemaining,
  cancelReasonLabel,
  formatReachTripId,
} from "@/features/reach/utils/campaignFormat";
import {
  classifyStoredPostType,
  displayStoryContent,
  formatStoryDate,
} from "@/features/network/utils/storyDisplay";
import { formatLedgerDateTime } from "@/lib/format";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as Sharing from "expo-sharing";
import { buildPulseStoryPublicUrl } from "@/lib/routes";
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Eye,
  Filter,
  MapPin,
  Rocket,
  Send,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  Wallet,
  Zap,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DESKTOP_BREAKPOINT = 1024;
const PAGE_MAX_WIDTH = 1440;

function statusColors(status: string): { bg: string; border: string; text: string } {
  if (status === "active") {
    return {
      bg: Theme.positiveMuted,
      border: Theme.networkHubListCardConnectedBorder,
      text: Theme.success,
    };
  }
  if (status === "cancelled") {
    return { bg: Theme.surface, border: Theme.borderLight, text: Theme.textMuted };
  }
  return { bg: Theme.surface, border: Theme.borderLight, text: Theme.textSecondary };
}

export default function ReachCampaignDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;
  const params = useLocalSearchParams<{ id?: string }>();
  const campaignId = params.id ?? "";
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const invalidatePosts = useInvalidatePosts(orgId);
  const pagePadH = isDesktop ? 32 : Layout.screenPaddingHorizontal;

  const campaignsQ = useReachCampaignsQuery(orgId);
  const plansQ = useReachPlansQuery();
  const metricsQ = useReachCampaignMetricsQuery(campaignId || null);
  const deliveryQ = useReachCampaignDeliveryQuery(campaignId || null);
  const [boostAgainPostId, setBoostAgainPostId] = useState<string | null>(null);
  const [upgradeRequested, setUpgradeRequested] = useState(false);

  const campaign = campaignsQ.data?.find((c) => c.id === campaignId) ?? null;
  const hasDriverChannel = !!campaign?.distribution_channels?.includes("driver");
  const referralsQ = useReachDriverReferralsQuery(hasDriverChannel ? campaign?.id ?? null : null);
  const referrals = referralsQ.data ?? [];
  const recommendationsSent = referrals.length;
  const acceptances = referrals.filter((r) =>
    r.status === "approved" || r.status === "bid_submitted" || r.status === "rewarded",
  ).length;
  const tripsWon = referrals.filter((r) => r.status === "rewarded").length;
  const plan = plansQ.data?.find((p) => p.id === campaign?.plan_id);
  const display = plan ? getReachPlanDisplay(plan.code) : undefined;
  const planColor = display?.color ?? Theme.primary;
  const metrics = metricsQ.data;

  const postType = campaign
    ? classifyStoredPostType(campaign.snapshot_post_type, campaign.snapshot_content)
    : "UPDATE";
  const isLoad = postType === "LOAD";
  const isVehicle = postType === "VEHICLE_AVAILABILITY";
  const content = campaign ? displayStoryContent(campaign.snapshot_content) : null;
  const title = !campaign
    ? ""
    : isLoad
      ? campaign.snapshot_material?.trim() || "Load"
      : isVehicle
        ? "Vehicle Available"
        : content?.split("\n")[0]?.trim() || "Update";
  const hasRoute = isLoad && !!campaign?.snapshot_origin && !!campaign?.snapshot_destination;
  const postedLabel = campaign?.snapshot_posted_at
    ? formatStoryDate(campaign.snapshot_posted_at)
    : null;

  const hasSource = !!campaign?.post_id;
  const isActive = campaign?.status === "active";
  const isCompleted = campaign?.status === "completed";
  const isCancelled = campaign?.status === "cancelled";
  const reason = isCancelled ? cancelReasonLabel(campaign?.cancel_reason ?? null) : null;
  const statusStyle = statusColors(campaign?.status ?? "completed");
  const tripRef = campaign ? formatReachTripId(campaign) : "";

  const boostFeePaid = metrics?.creditsUsed ?? plan?.credit_price ?? 0;
  const escrowLocked = campaign?.driver_reward_enabled ? campaign.reward_reserved : 0;
  const targetReach = plan?.estimated_reach_max ?? 0;
  const reachPct =
    targetReach > 0 ? Math.min(100, Math.round(((metrics?.impressions ?? 0) / targetReach) * 100)) : 0;

  const handleViewOriginalStory = () => {
    if (!campaign?.post_id || !campaign.org_id) return;
    router.push({
      pathname: "/(modals)/story-detail",
      params: {
        postId: campaign.post_id,
        orgId: campaign.org_id,
        storyType: postType,
      },
    });
  };

  const handleShare = async () => {
    if (!campaign?.post_id || !campaign.org_id) return;
    const storyUrl = buildPulseStoryPublicUrl(campaign.post_id, campaign.org_id, postType);
    const routeLabel = hasRoute
      ? `${(campaign.snapshot_origin || "—").toUpperCase()} → ${(campaign.snapshot_destination || "—").toUpperCase()}`
      : title;
    const message = `${title} · ${routeLabel}\n\nView & bid:\n${storyUrl}`;
    try {
      const waUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(storyUrl, { dialogTitle: message });
      }
    } catch {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(storyUrl, { dialogTitle: message });
      }
    }
  };

  const header = (
    <View style={[styles.headerBleed, { paddingHorizontal: pagePadH }]}>
      <View style={[styles.headerInner, isDesktop && styles.headerMax]}>
        {/* Breadcrumbs */}
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <ArrowLeft size={16} color={Theme.textSecondary} />
          </Pressable>
          <View style={styles.headerDivider} />
          <Pressable onPress={() => router.back()} hitSlop={6}>
            <Text style={styles.crumbMuted}>Pulse Reach</Text>
          </Pressable>
          <Text style={styles.crumbSep}>/</Text>
          <Pressable onPress={() => router.back()} hitSlop={6}>
            <Text style={styles.crumbMuted}>Campaigns</Text>
          </Pressable>
          {campaign ? (
            <>
              <Text style={styles.crumbSep}>/</Text>
              <View style={styles.crumbIdChip}>
                <Text style={styles.crumbIdText} numberOfLines={1}>
                  {tripRef}
                </Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Center studio identity (desktop) */}
        {isDesktop ? (
          <View style={styles.headerCenter}>
            <Text style={styles.studioTitle}>Campaign detail</Text>
            {isActive ? (
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.livePillText}>Live</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.headerRight}>
          {hasSource ? (
            <Pressable style={styles.headerGhostBtn} onPress={handleShare}>
              <Share2 size={13} color={Theme.textRouteCard} />
              {isDesktop ? <Text style={styles.headerGhostText}>Share</Text> : null}
            </Pressable>
          ) : null}
          {isActive ? (
            <Pressable style={styles.headerDarkBtn} onPress={() => setUpgradeRequested(true)}>
              <Sparkles size={13} color={Theme.textOnPrimary} />
              <Text style={styles.headerDarkText}>Upgrade plan</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  if (!campaign) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        {campaignsQ.isLoading ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator color={Theme.primary} />
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Campaign not found</Text>
          </View>
        )}
      </View>
    );
  }

  const heroCard = (
    <View style={styles.heroCard}>
      {/* Title row */}
      <View style={styles.heroTopRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: statusStyle.bg, borderColor: statusStyle.border },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: statusStyle.text }]} />
              <Text style={[styles.statusPillText, { color: statusStyle.text }]}>
                {campaign.status}
              </Text>
            </View>
          </View>
          <View style={styles.heroMetaRow}>
            <Clock size={12} color={Theme.textMuted} />
            {postedLabel ? <Text style={styles.heroMetaText}>Posted {postedLabel}</Text> : null}
            {isActive ? (
              <>
                <Text style={styles.heroMetaDot}>•</Text>
                <Text style={styles.heroMetaStrong}>
                  Ends in {formatRemaining(campaign.expires_at)}
                </Text>
              </>
            ) : reason ? (
              <>
                <Text style={styles.heroMetaDot}>•</Text>
                <Text style={styles.heroMetaText}>{reason}</Text>
              </>
            ) : null}
          </View>
        </View>

        {/* Real indent reference */}
        <View style={styles.indentRefBox}>
          <Text style={styles.indentRefLabel}>Indent Reference</Text>
          <Text style={styles.indentRefValue} numberOfLines={1}>
            {tripRef}
          </Text>
        </View>
      </View>

      {/* Details grid */}
      <View style={[styles.heroGrid, isDesktop && styles.heroGridDesktop]}>
        {hasRoute || (isVehicle && campaign.snapshot_origin) ? (
          <View style={styles.heroCell}>
            <View style={[styles.heroCellIcon, { backgroundColor: Theme.primary + "14" }]}>
              <MapPin size={15} color={Theme.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroCellLabel}>Route Corridor</Text>
              <Text style={styles.heroCellValue} numberOfLines={1}>
                {hasRoute
                  ? `${campaign.snapshot_origin} → ${campaign.snapshot_destination}`
                  : campaign.snapshot_origin}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.heroCell}>
          <View style={[styles.heroCellIcon, { backgroundColor: Theme.positiveMuted }]}>
            <Truck size={15} color={Theme.success} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.heroCellLabel}>Required Truck</Text>
            <Text style={styles.heroCellValue} numberOfLines={1}>
              {campaign.snapshot_vehicle_type?.trim() || "Any vehicle"}
            </Text>
          </View>
        </View>

        <View style={[styles.heroCell, styles.heroCellTier]}>
          <View style={[styles.heroCellIcon, { backgroundColor: Theme.accentBrownMuted }]}>
            <Zap size={15} color={Theme.accentBrown} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.heroCellLabel, { color: Theme.accentBrownDeep }]}>
              Current Tier
            </Text>
            <View style={styles.tierValueRow}>
              <Text style={[styles.heroCellValue, { color: planColor }]} numberOfLines={1}>
                {plan?.name ?? "Boost"}
              </Text>
              {plan ? (
                <Text style={styles.tierPrice}>{plan.credit_price} cr</Text>
              ) : null}
            </View>
          </View>
          {isActive ? (
            <Pressable style={styles.tierUpgradeChip} onPress={() => setUpgradeRequested(true)}>
              <Text style={styles.tierUpgradeText}>Upgrade</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {campaign.source_deleted_at ? (
        <View style={styles.snapshotBanner}>
          <Text style={styles.snapshotBannerText}>
            Original story deleted — serving campaign snapshot
          </Text>
        </View>
      ) : null}
    </View>
  );

  const performanceCard = (
    <View style={styles.panelCard}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderLeft}>
          <View style={[styles.panelIcon, { backgroundColor: Theme.primary + "14" }]}>
            <BarChart3 size={14} color={Theme.primary} />
          </View>
          <Text style={styles.panelTitle}>Campaign Performance Metrics</Text>
        </View>
        {targetReach > 0 ? (
          <View style={styles.reachChip}>
            <Text style={styles.reachChipText}>
              {(metrics?.impressions ?? 0).toLocaleString()} / {targetReach.toLocaleString()}
            </Text>
          </View>
        ) : null}
      </View>

      {metricsQ.isLoading || !metrics ? (
        <View style={styles.metricsLoading}>
          <ActivityIndicator size="small" color={Theme.primary} />
        </View>
      ) : (
        <>
          <View style={[styles.metricGrid, isDesktop && styles.metricGridDesktop]}>
            <View style={styles.metricTile}>
              <View style={styles.metricTileTop}>
                <Text style={styles.metricTileLabel}>Impressions</Text>
                <Eye size={13} color={Theme.textMuted} />
              </View>
              <Text style={styles.metricTileValue}>{metrics.impressions.toLocaleString()}</Text>
              <Text style={styles.metricTileSub}>Fleet &amp; driver views</Text>
            </View>

            <View style={styles.metricTile}>
              <View style={styles.metricTileTop}>
                <Text style={styles.metricTileLabel}>Story Views</Text>
                <Smartphone size={13} color={Theme.textMuted} />
              </View>
              <Text style={styles.metricTileValue}>{metrics.views.toLocaleString()}</Text>
              <Text style={styles.metricTileSub}>Tap-through details</Text>
            </View>

            <View style={[styles.metricTile, styles.metricTilePositive]}>
              <View style={styles.metricTileTop}>
                <Text style={[styles.metricTileLabel, { color: Theme.success }]}>
                  Bids / Recs
                </Text>
                <Send size={13} color={Theme.success} />
              </View>
              <Text style={[styles.metricTileValue, { color: Theme.success }]}>
                {(metrics.bids + recommendationsSent).toLocaleString()}
              </Text>
              <Text style={[styles.metricTileSub, { color: Theme.success }]}>
                Opportunities generated
              </Text>
            </View>

            <View style={[styles.metricTile, styles.metricTileGold]}>
              <View style={styles.metricTileTop}>
                <Text style={[styles.metricTileLabel, { color: Theme.accentBrownDeep }]}>
                  Credits Spent
                </Text>
                <Wallet size={13} color={Theme.accentBrown} />
              </View>
              <Text style={styles.metricTileValue}>{boostFeePaid.toLocaleString()}</Text>
              <Text style={[styles.metricTileSub, { color: Theme.accentBrownDeep }]}>
                Escrow: {escrowLocked.toLocaleString()} credits
              </Text>
            </View>
          </View>

          {targetReach > 0 ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressLabels}>
                <Text style={styles.progressLabel}>Campaign Target Reach ({reachPct}%)</Text>
                <Text style={styles.progressLabel}>
                  Target: {targetReach.toLocaleString()} impressions
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${reachPct}%`, backgroundColor: planColor },
                  ]}
                />
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );

  const funnelCard = (
    <View style={styles.panelCard}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderLeft}>
          <View style={[styles.panelIcon, { backgroundColor: Theme.surface }]}>
            <Filter size={14} color={Theme.textSecondary} />
          </View>
          <Text style={styles.panelTitle}>Conversion Pipeline Funnel</Text>
        </View>
        <Text style={styles.panelAside}>Pulse Boost V2 Pipeline</Text>
      </View>

      <View style={styles.funnelRow}>
        {[
          { label: "Impressions", value: metrics?.impressions ?? 0, tone: "muted" as const },
          { label: "Story Views", value: metrics?.views ?? 0, tone: "muted" as const },
          { label: "Driver Recs", value: recommendationsSent, tone: "gold" as const },
          { label: "Fleet Bids", value: metrics?.bids ?? 0, tone: "primary" as const },
          { label: "Awarded", value: tripsWon, tone: "positive" as const },
        ].map((cell) => (
          <View
            key={cell.label}
            style={[
              styles.funnelCell,
              cell.tone === "gold" && styles.funnelCellGold,
              cell.tone === "primary" && styles.funnelCellPrimary,
              cell.tone === "positive" && styles.funnelCellPositive,
            ]}
          >
            <Text
              style={[
                styles.funnelValue,
                cell.tone === "gold" && { color: Theme.accentBrown },
                cell.tone === "primary" && { color: Theme.primary },
                cell.tone === "positive" && { color: Theme.success },
              ]}
            >
              {cell.value.toLocaleString()}
            </Text>
            <Text style={styles.funnelLabel}>{cell.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const escrowCard = (
    <View style={styles.panelCard}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderLeft}>
          <View style={[styles.panelIcon, { backgroundColor: Theme.accentBrownMuted }]}>
            <ShieldCheck size={14} color={Theme.accentBrown} />
          </View>
          <Text style={styles.panelTitle}>Referral Escrow Guarantee</Text>
        </View>
      </View>

      <View style={styles.escrowRows}>
        <View style={styles.escrowRow}>
          <Text style={styles.escrowLabel}>Boost Fee Paid</Text>
          <Text style={styles.escrowValue}>{boostFeePaid.toLocaleString()} credits</Text>
        </View>
        {campaign.driver_reward_enabled ? (
          <>
            <View style={styles.escrowRow}>
              <Text style={[styles.escrowLabel, { color: Theme.accentBrownDeep }]}>
                Referral Escrow Locked
              </Text>
              <Text style={[styles.escrowValue, { color: Theme.accentBrownDeep }]}>
                {campaign.reward_reserved.toLocaleString()} credits
              </Text>
            </View>
            <View style={styles.escrowRow}>
              <Text style={styles.escrowLabel}>Rewards Paid</Text>
              <Text style={[styles.escrowValue, { color: Theme.success }]}>
                {campaign.reward_paid.toLocaleString()} credits
              </Text>
            </View>
            <View style={[styles.escrowRow, styles.escrowRowTotal]}>
              <Text style={styles.escrowTotalLabel}>
                {campaign.reward_refunded > 0 ? "Refunded to Wallet" : "Auto-Refundable"}
              </Text>
              <Text style={styles.escrowTotalValue}>
                {(campaign.reward_refunded > 0
                  ? campaign.reward_refunded
                  : campaign.reward_reserved
                ).toLocaleString()}{" "}
                credits
              </Text>
            </View>
            <Text style={styles.escrowHint}>
              Flat {campaign.reward_amount} credits per converted referral. Unused escrow refunds
              automatically when the campaign ends.
            </Text>
          </>
        ) : (
          <Text style={styles.escrowHint}>
            No referral escrow on this campaign — driver rewards were not enabled at launch.
          </Text>
        )}
      </View>
    </View>
  );

  const detailCol = (
    <View style={styles.detailCol}>
      {heroCard}

      <ReachCampaignTimeline
        campaign={campaign}
        waves={deliveryQ.data ?? []}
        bids={metrics?.bids ?? 0}
      />

      {isActive ? (
        <CampaignUpgradePanel
          key={upgradeRequested ? "expanded" : "collapsed"}
          orgId={campaign.org_id}
          campaignId={campaign.id}
          currentPlanId={campaign.plan_id}
          defaultExpanded={upgradeRequested}
        />
      ) : null}

      <ReachCampaignHealthCard
        campaign={campaign}
        plan={plan}
        metrics={metrics}
        referrals={referrals}
      />

      {performanceCard}
      {funnelCard}

      {/* Driver network (Boost V2) */}
      {hasDriverChannel ? (
        <View style={styles.panelCard}>
          <View style={styles.panelHeader}>
            <View style={styles.panelHeaderLeft}>
              <View style={[styles.panelIcon, { backgroundColor: Theme.positiveMuted }]}>
                <Send size={14} color={Theme.success} />
              </View>
              <Text style={styles.panelTitle}>Driver Network</Text>
            </View>
          </View>
          <View style={styles.driverMetricsRow}>
            <View style={styles.driverMetricCell}>
              <Text style={styles.driverMetricValue}>{recommendationsSent}</Text>
              <Text style={styles.driverMetricLabel}>Recommendations</Text>
            </View>
            <View style={styles.driverMetricCell}>
              <Text style={styles.driverMetricValue}>{acceptances}</Text>
              <Text style={styles.driverMetricLabel}>Acceptances</Text>
            </View>
            <View style={styles.driverMetricCell}>
              <Text style={[styles.driverMetricValue, { color: Theme.success }]}>{tripsWon}</Text>
              <Text style={styles.driverMetricLabel}>Trips Won</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Structured delivery — verified-first waves + no-bid escalation */}
      {(deliveryQ.data ?? []).length > 0 ? (
        <View style={styles.panelCard}>
          <Text style={styles.sectionLabel}>Delivery</Text>
          {(deliveryQ.data ?? []).map((w) => (
            <View key={w.wave} style={styles.waveRow}>
              <View style={styles.waveBadge}>
                <Text style={styles.waveBadgeText}>
                  {w.wave === 4 ? "PUSH" : `W${w.wave}`}
                </Text>
              </View>
              <View style={styles.waveTextWrap}>
                <Text style={styles.waveTitle}>
                  {w.wave === 4
                    ? `No-bid push · ${w.targets} extra org${w.targets === 1 ? "" : "s"}`
                    : `Wave ${w.wave} · ${w.targets} org${w.targets === 1 ? "" : "s"}`}
                </Text>
                <Text style={styles.waveSub}>
                  {w.verified_targets} verified
                  {w.targets - w.verified_targets > 0
                    ? ` · ${w.targets - w.verified_targets} unverified`
                    : ""}{" "}
                  · seen by {w.viewed} · {w.bids} bid{w.bids === 1 ? "" : "s"}
                  {w.conversions > 0 ? ` · ${w.conversions} converted` : ""}
                </Text>
              </View>
              <Text style={styles.waveTime}>{formatLedgerDateTime(w.released_at)}</Text>
            </View>
          ))}
          <Text style={styles.waveHint}>
            Verified fleet owners are reached first; unverified only fill the remainder. If no
            bids arrive after all waves, one extra push of up to 20% more recipients goes out
            automatically.
          </Text>
        </View>
      ) : null}

      {/* Timing */}
      {isActive ? (
        <View style={styles.panelCard}>
          <Text style={styles.timelineHint}>
            Started {formatLedgerDateTime(campaign.published_at)} · Expires{" "}
            {formatLedgerDateTime(campaign.expires_at)}
          </Text>
        </View>
      ) : null}

      {/* Actions */}
      <View style={styles.panelCard}>
        <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>Actions</Text>
        <View style={styles.actionsCol}>
          {hasSource ? (
            <Pressable style={styles.actionRow} onPress={handleViewOriginalStory}>
              <View style={styles.actionIcon}>
                <Eye size={14} color={Theme.textPrimaryDark} />
              </View>
              <Text style={styles.actionText}>View Original Story</Text>
            </Pressable>
          ) : null}
          {isCompleted && hasSource ? (
            <Pressable
              style={styles.actionRow}
              onPress={() => setBoostAgainPostId(campaign.post_id)}
            >
              <View style={[styles.actionIcon, { backgroundColor: Theme.positiveMuted }]}>
                <Rocket size={14} color={Theme.success} />
              </View>
              <Text style={styles.actionText}>Boost Again</Text>
            </Pressable>
          ) : null}
          {hasSource ? (
            <Pressable style={styles.actionRow} onPress={handleShare}>
              <View style={styles.actionIcon}>
                <Share2 size={14} color={Theme.textPrimaryDark} />
              </View>
              <Text style={styles.actionText}>Share</Text>
            </Pressable>
          ) : null}
          {!hasSource ? (
            <Text style={styles.noSourceHint}>
              {isActive
                ? "The original story was deleted — the campaign continues serving from its snapshot."
                : "The original story was deleted — this campaign's record is preserved for history."}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {header}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.page,
          { paddingHorizontal: pagePadH, paddingBottom: 28 + insets.bottom },
          isDesktop && styles.pageDesktop,
        ]}
      >
        <View style={[styles.mainSplit, isDesktop && styles.mainSplitDesktop]}>
          <View style={[styles.leftCol, isDesktop && styles.leftColDesktop]}>
            {detailCol}
          </View>
          <View style={[styles.rightCol, !isDesktop && styles.rightColMobile]}>
            <ReachStoryPostPreview
              campaign={campaign}
              plan={plan}
              orgName={organization?.name ?? "Your org"}
              onOpenCampaign={hasSource ? handleViewOriginalStory : undefined}
              showAudienceToggle
            />
            {escrowCard}
          </View>
        </View>
      </ScrollView>

      {orgId && boostAgainPostId ? (
        <BoostSheet
          visible={!!boostAgainPostId}
          onClose={() => setBoostAgainPostId(null)}
          orgId={orgId}
          postId={boostAgainPostId}
          onBoosted={() => invalidatePosts()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.networkPageBackground },
  scroll: { flex: 1 },
  page: { gap: 16, width: "100%", paddingTop: 16 },
  pageDesktop: {
    maxWidth: PAGE_MAX_WIDTH,
    alignSelf: "center",
    width: "100%",
  },

  // ── Header ──
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
    gap: 10,
    width: "100%",
  },
  headerMax: { maxWidth: PAGE_MAX_WIDTH, alignSelf: "center", width: "100%" },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  headerDivider: {
    width: 1,
    height: 16,
    backgroundColor: Theme.borderInput,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  crumbMuted: { fontSize: 12, fontWeight: "600", color: Theme.textRouteCard },
  crumbSep: { fontSize: 12, fontWeight: "500", color: Theme.borderMedium },
  crumbIdChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    flexShrink: 1,
    minWidth: 0,
  },
  crumbIdText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  studioIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardConnectedBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  studioTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.positiveMuted,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Theme.success },
  livePillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.success,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  headerGhostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  headerGhostText: { fontSize: 12, fontWeight: "600", color: Theme.textRouteCard },
  headerDarkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.primary,
  },
  headerDarkText: { fontSize: 12, fontWeight: "700", color: Theme.textOnPrimary },

  emptyWrap: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },

  mainSplit: { gap: 16 },
  mainSplitDesktop: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  leftCol: { flex: 1, minWidth: 0, width: "100%" },
  leftColDesktop: { flex: 8, minWidth: 0 },
  rightCol: { flex: 4, minWidth: 300, maxWidth: 400, width: "100%", gap: 16 },
  rightColMobile: { maxWidth: "100%", minWidth: 0 },
  detailCol: { gap: 16 },

  // ── Hero ──
  heroCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    padding: 16,
    gap: 14,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
  },
  heroTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  heroMetaText: { fontSize: 12, fontWeight: "500", color: Theme.textRouteCard },
  heroMetaDot: { fontSize: 12, color: Theme.borderMedium },
  heroMetaStrong: { fontSize: 12, fontWeight: "700", color: Theme.textSecondary },
  indentRefBox: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "flex-start",
    flexShrink: 0,
    maxWidth: 200,
  },
  indentRefLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  indentRefValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  heroGrid: { gap: 10 },
  heroGridDesktop: { flexDirection: "row" },
  heroCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  heroCellTier: {
    backgroundColor: Theme.accentBrownWash,
    borderColor: Theme.accentBrownBorder,
  },
  heroCellIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroCellLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroCellValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginTop: 2,
  },
  tierValueRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  tierPrice: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.accentBrown,
    fontVariant: ["tabular-nums"],
  },
  tierUpgradeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.accentBrownBorder,
    flexShrink: 0,
  },
  tierUpgradeText: { fontSize: 11, fontWeight: "700", color: Theme.accentBrown },

  snapshotBanner: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.accentBrownBorder,
    backgroundColor: Theme.accentBrownWash,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  snapshotBannerText: { fontSize: 11, fontWeight: "600", color: Theme.accentBrownDeep },

  // ── Shared panel card ──
  panelCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    padding: 16,
    gap: 14,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
  },
  panelHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 9, flex: 1, minWidth: 0 },
  panelIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  panelAside: { fontSize: 11, fontWeight: "600", color: Theme.textMuted, flexShrink: 0 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
  },

  // ── Performance ──
  reachChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    flexShrink: 0,
  },
  reachChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  metricsLoading: { paddingVertical: 14, alignItems: "center" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricGridDesktop: { flexWrap: "nowrap" },
  metricTile: {
    flexBasis: 140,
    flexGrow: 1,
    minWidth: 0,
    gap: 4,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  metricTilePositive: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.networkHubListCardConnectedBorder,
  },
  metricTileGold: {
    backgroundColor: Theme.accentBrownWash,
    borderColor: Theme.accentBrownBorder,
  },
  metricTileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  metricTileLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricTileValue: {
    fontSize: 22,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.5,
  },
  metricTileSub: { fontSize: 9, fontWeight: "500", color: Theme.textMuted },
  progressBlock: { gap: 6, paddingTop: 4 },
  progressLabels: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.surfaceGray,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },

  // ── Funnel ──
  funnelRow: { flexDirection: "row", gap: 8 },
  funnelCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 3,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  funnelCellGold: {
    backgroundColor: Theme.accentBrownWash,
    borderColor: Theme.accentBrownBorder,
  },
  funnelCellPrimary: {
    backgroundColor: Theme.primary + "12",
    borderColor: Theme.primary + "33",
  },
  funnelCellPositive: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.networkHubListCardConnectedBorder,
  },
  funnelValue: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  funnelLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
  },

  // ── Escrow summary ──
  escrowRows: { gap: 9 },
  escrowRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  escrowRowTotal: {
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: Theme.borderInput,
  },
  escrowLabel: { fontSize: 12, fontWeight: "500", color: Theme.textRouteCard },
  escrowValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  escrowTotalLabel: { fontSize: 12, fontWeight: "700", color: Theme.success },
  escrowTotalValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.success,
    fontVariant: ["tabular-nums"],
  },
  escrowHint: { fontSize: 10, fontWeight: "500", color: Theme.textMuted, lineHeight: 15, marginTop: 2 },

  // ── Driver network ──
  driverMetricsRow: { flexDirection: "row", gap: 8 },
  driverMetricCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  driverMetricValue: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  driverMetricLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.2,
    textAlign: "center",
  },

  // ── Delivery ──
  waveRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  waveBadge: {
    minWidth: 38,
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  waveBadgeText: { fontSize: 10, fontWeight: "700", color: Theme.textSecondary },
  waveTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  waveTitle: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  waveSub: { fontSize: 11, fontWeight: "500", color: Theme.textMuted },
  waveTime: { fontSize: 10, fontWeight: "500", color: Theme.textMuted, flexShrink: 0 },
  waveHint: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 15,
    marginTop: 2,
  },

  timelineHint: { fontSize: 11, fontWeight: "500", color: Theme.textMuted, lineHeight: 15 },

  // ── Actions ──
  actionsCol: { gap: 8 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  actionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { fontSize: 12, fontWeight: "600", color: Theme.textPrimaryDark },
  noSourceHint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
  },
});
