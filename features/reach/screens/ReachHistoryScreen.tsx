/**
 * Reach History — org's Reach campaigns, 4 metrics each (Impressions, Views,
 * Bids, Credits Used). No CTR/CPM/CPC by design. Named "Reach" not "Boost"
 * since future campaign types (RFQs, hiring, fleet requirements) land here too.
 *
 * Tapping a campaign navigates to ReachCampaignDetailScreen — the single
 * source of truth for one campaign (identity, plan/spend, metrics, status,
 * actions). BoostProgressSheet stays only as the in-place quick-glance
 * opened from a story's "Boosted" pill.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useReachCampaignsQuery, useReachPlansQuery, useReachOrgSummaryQuery } from "@/lib/queries/useReachCampaignsQuery";
import { ReachCampaignCard } from "@/features/reach/components/ReachCampaignCard";
import { groupReachCampaignsByPost } from "@/features/reach/utils/campaignFormat";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { ArrowLeft, Coins, Rocket } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ReachHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;

  const campaignsQ = useReachCampaignsQuery(orgId);
  const plansQ = useReachPlansQuery();
  const summaryQ = useReachOrgSummaryQuery(orgId);
  const tripGroups = groupReachCampaignsByPost(campaignsQ.data ?? []);
  const planById = new Map((plansQ.data ?? []).map((p) => [p.id, p]));
  const summary = summaryQ.data;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={Theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Reach</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {summary ? (
          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <Text style={styles.summaryTitle}>Overall Reach</Text>
              <View style={styles.walletChip}>
                <Coins size={11} color={Theme.accentGold} />
                <Text style={styles.walletChipText}>{summary.walletBalance} credits</Text>
              </View>
            </View>
            <Text style={styles.summarySubtitle}>
              {summary.campaigns.active} active · {summary.campaigns.total} total campaign
              {summary.campaigns.total === 1 ? "" : "s"}
            </Text>

            {summary.reach.promised > 0 ? (
              <View style={styles.reachDeliveredBlock}>
                <View style={styles.reachDeliveredLabelRow}>
                  <Text style={styles.reachDeliveredLabel}>Campaign Reach</Text>
                  <Text style={styles.reachDeliveredValue}>
                    {summary.reach.delivered} / {summary.reach.promised}
                  </Text>
                </View>
                <View style={styles.reachDeliveredTrack}>
                  <View
                    style={[
                      styles.reachDeliveredFill,
                      { width: `${Math.min(100, (summary.reach.delivered / summary.reach.promised) * 100)}%` },
                    ]}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.summaryMetricsRow}>
              <View style={styles.summaryMetricCell}>
                <Text style={styles.summaryMetricValue}>{summary.metrics.impressions}</Text>
                <Text style={styles.summaryMetricLabel}>Impressions</Text>
              </View>
              <View style={styles.summaryMetricCell}>
                <Text style={styles.summaryMetricValue}>{summary.metrics.views}</Text>
                <Text style={styles.summaryMetricLabel}>Viewed</Text>
              </View>
              <View style={styles.summaryMetricCell}>
                <Text style={styles.summaryMetricValue}>{summary.metrics.bids}</Text>
                <Text style={styles.summaryMetricLabel}>Bids</Text>
              </View>
              <View style={styles.summaryMetricCell}>
                <Text style={styles.summaryMetricValue}>{summary.metrics.creditsUsed}</Text>
                <Text style={styles.summaryMetricLabel}>Credits</Text>
              </View>
            </View>
          </View>
        ) : null}

        <Text style={styles.listHeader}>Campaigns</Text>

        {campaignsQ.isLoading ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator color={Theme.primary} />
          </View>
        ) : tripGroups.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Rocket size={32} color={Theme.textMuted} />
            <Text style={styles.emptyTitle}>No boosted loads yet</Text>
            <Text style={styles.emptyBody}>
              Boost a load from its story to reach more verified fleet owners.
            </Text>
          </View>
        ) : (
          tripGroups.map((group) => (
            <ReachCampaignCard
              key={group[0].post_id ?? group[0].id}
              campaigns={group}
              planById={planById}
              onCampaignPress={(id) => router.push(ROUTES.REACH.campaignDetail(id) as never)}
            />
          ))
        )}
      </ScrollView>
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
  content: { padding: Layout.screenPaddingHorizontal, gap: 12 },
  emptyWrap: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  emptyBody: { fontSize: 12, color: Theme.textMuted, textAlign: "center", paddingHorizontal: 24 },

  summaryCard: {
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  summaryTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryTitle: { fontSize: 13, fontWeight: "800", color: "#fff" },
  walletChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  walletChipText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  summarySubtitle: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.55)" },
  reachDeliveredBlock: { gap: 5, marginTop: 2 },
  reachDeliveredLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  reachDeliveredLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.7)" },
  reachDeliveredValue: { fontSize: 11, fontWeight: "800", color: "#fff" },
  reachDeliveredTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  reachDeliveredFill: { height: "100%", borderRadius: 3, backgroundColor: Theme.accentGold },
  summaryMetricsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  summaryMetricCell: { alignItems: "center", gap: 2, flex: 1 },
  summaryMetricValue: { fontSize: 18, fontWeight: "900", color: "#fff" },
  summaryMetricLabel: { fontSize: 9, fontWeight: "600", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" },
  listHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
});
