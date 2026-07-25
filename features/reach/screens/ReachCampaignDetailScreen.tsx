/**
 * Campaign Detail — the single source of truth for one campaign. Identity
 * (from snapshot_* columns — accurate even if the source story is edited or
 * deleted), plan/spend, the 4 metrics, status/countdown, and actions.
 * Reached from Reach Home / Campaign History (router.push) and from
 * BoostProgressSheet's "View full campaign" link.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ReachMetricsGrid } from "@/features/reach/components/ReachMetricsGrid";
import { CampaignUpgradePanel } from "@/features/reach/components/CampaignUpgradePanel";
import { BoostSheet } from "@/features/reach/components/BoostSheet";
import {
  useReachCampaignsQuery,
  useReachPlansQuery,
  useReachCampaignMetricsQuery,
} from "@/lib/queries/useReachCampaignsQuery";
import { useInvalidatePosts } from "@/lib/queries/usePostsQuery";
import { getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import { formatRemaining, cancelReasonLabel, formatReachTripId } from "@/features/reach/utils/campaignFormat";
import {
  classifyStoredPostType,
  displayStoryContent,
  formatStoryDate,
} from "@/features/network/utils/storyDisplay";
import { formatINR, formatLedgerDateTime } from "@/lib/format";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as Sharing from "expo-sharing";
import { buildPulseStoryPublicUrl } from "@/lib/routes";
import { ArrowLeft, Eye, MapPin, Rocket, Share2, Truck } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ReachCampaignDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const campaignId = params.id ?? "";
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const invalidatePosts = useInvalidatePosts(orgId);

  const campaignsQ = useReachCampaignsQuery(orgId);
  const plansQ = useReachPlansQuery();
  const metricsQ = useReachCampaignMetricsQuery(campaignId || null);
  const [boostAgainPostId, setBoostAgainPostId] = useState<string | null>(null);

  const campaign = campaignsQ.data?.find((c) => c.id === campaignId) ?? null;
  const plan = plansQ.data?.find((p) => p.id === campaign?.plan_id);
  const display = plan ? getReachPlanDisplay(plan.code) : undefined;
  const metrics = metricsQ.data;

  const postType = campaign ? classifyStoredPostType(campaign.snapshot_post_type, campaign.snapshot_content) : "UPDATE";
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
  const postedLabel = campaign?.snapshot_posted_at ? formatStoryDate(campaign.snapshot_posted_at) : null;

  const hasSource = !!campaign?.post_id;
  const isActive = campaign?.status === "active";
  const isCompleted = campaign?.status === "completed";
  const isCancelled = campaign?.status === "cancelled";
  const reason = isCancelled ? cancelReasonLabel(campaign?.cancel_reason ?? null) : null;

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

  if (!campaign) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <ArrowLeft size={20} color={Theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Campaign</Text>
          <View style={{ width: 36 }} />
        </View>
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={Theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Campaign</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.identityTitle}>{title}</Text>
          {hasRoute ? (
            <View style={styles.metaRow}>
              <MapPin size={12} color={Theme.textMuted} />
              <Text style={styles.identityMeta}>
                {campaign.snapshot_origin} → {campaign.snapshot_destination}
              </Text>
            </View>
          ) : null}
          {isVehicle && campaign.snapshot_origin ? (
            <View style={styles.metaRow}>
              <MapPin size={12} color={Theme.textMuted} />
              <Text style={styles.identityMeta}>Current location: {campaign.snapshot_origin}</Text>
            </View>
          ) : null}
          {campaign.snapshot_vehicle_type ? (
            <View style={styles.metaRow}>
              <Truck size={12} color={Theme.textMuted} />
              <Text style={styles.identityMeta}>{campaign.snapshot_vehicle_type}</Text>
            </View>
          ) : null}
          {postedLabel ? <Text style={styles.postedText}>Posted {postedLabel}</Text> : null}
          <Text style={styles.tripIdText}>{formatReachTripId(campaign.post_id, campaign.id)}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.sectionLabel}>Plan</Text>
            <Text style={styles.sectionValue}>{plan?.name ?? "—"}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.sectionLabel}>Credits Used</Text>
            <Text style={styles.sectionValue}>{metrics?.creditsUsed ?? 0}</Text>
          </View>
        </View>
        {plan ? <Text style={styles.priceText}>{formatINR(plan.price_inr)}</Text> : null}

        <View style={styles.divider} />

        <View style={styles.metricsCard}>
          <ReachMetricsGrid campaignId={campaign.id} />
        </View>

        {plan && metrics ? (
          <View style={styles.progressBlock}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>Campaign Reach</Text>
              <Text style={styles.sectionValue}>
                {Math.min(metrics.impressions, plan.estimated_reach_max)} / {plan.estimated_reach_max}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, (metrics.impressions / plan.estimated_reach_max) * 100)}%`,
                    backgroundColor: display?.color ?? Theme.primary,
                  },
                ]}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.divider} />

        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.sectionLabel}>Status</Text>
            <Text style={[styles.sectionValue, { textTransform: "capitalize" }]}>{campaign.status}</Text>
            {reason ? <Text style={styles.reasonText}>Reason: {reason}</Text> : null}
          </View>
          {isActive ? (
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.sectionLabel}>Ends in</Text>
              <Text style={styles.sectionValue}>{formatRemaining(campaign.expires_at)}</Text>
            </View>
          ) : null}
        </View>
        {isActive ? (
          <Text style={styles.timelineHint}>
            Started {formatLedgerDateTime(campaign.published_at)} · Expires {formatLedgerDateTime(campaign.expires_at)}
          </Text>
        ) : null}

        {isActive ? (
          <>
            <View style={styles.divider} />
            <CampaignUpgradePanel orgId={campaign.org_id} campaignId={campaign.id} currentPlanId={campaign.plan_id} />
          </>
        ) : null}

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>Actions</Text>
        <View style={styles.actionsCol}>
          {hasSource ? (
            <Pressable style={styles.actionRow} onPress={handleViewOriginalStory}>
              <Eye size={15} color={Theme.textPrimaryDark} />
              <Text style={styles.actionText}>View Original Story</Text>
            </Pressable>
          ) : null}
          {isCompleted && hasSource ? (
            <Pressable style={styles.actionRow} onPress={() => setBoostAgainPostId(campaign.post_id)}>
              <Rocket size={15} color={Theme.textPrimaryDark} />
              <Text style={styles.actionText}>Boost Again</Text>
            </Pressable>
          ) : null}
          {hasSource ? (
            <Pressable style={styles.actionRow} onPress={handleShare}>
              <Share2 size={15} color={Theme.textPrimaryDark} />
              <Text style={styles.actionText}>Share</Text>
            </Pressable>
          ) : null}
          {!hasSource ? (
            <Text style={styles.noSourceHint}>The original story was deleted — this campaign's record is preserved for history.</Text>
          ) : null}
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
  container: { flex: 1, backgroundColor: Theme.screenBackground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 15, fontWeight: "700", color: Theme.textPrimary },
  content: { padding: Layout.screenPaddingHorizontal, gap: 10 },
  emptyWrap: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  section: { gap: 4 },
  identityTitle: { fontSize: 17, fontWeight: "800", color: Theme.textPrimaryDark },
  identityMeta: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  postedText: { fontSize: 11, fontWeight: "600", color: Theme.textMuted, marginTop: 2 },
  tripIdText: { fontSize: 11, fontWeight: "700", color: Theme.textMuted, letterSpacing: 0.3, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Theme.borderLight, marginVertical: 2 },
  rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  sectionLabel: { fontSize: 10, fontWeight: "700", color: Theme.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  sectionValue: { fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark, marginTop: 2 },
  priceText: { fontSize: 12, fontWeight: "600", color: Theme.textMuted },
  reasonText: { fontSize: 11, fontWeight: "600", color: Theme.textMuted, marginTop: 2 },
  timelineHint: { fontSize: 11, fontWeight: "500", color: Theme.textMuted },
  metricsCard: {
    backgroundColor: Theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
  },
  progressBlock: { gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: Theme.surface, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  actionsCol: { gap: 8 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionText: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  noSourceHint: { fontSize: 11, fontWeight: "500", color: Theme.textMuted, fontStyle: "italic" },
});
