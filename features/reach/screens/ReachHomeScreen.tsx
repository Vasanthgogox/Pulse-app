/**
 * Pulse Reach Home — the discovery entry point (Phase 2.2). Product home, not
 * an analytics screen: answers "how am I doing" (Credits/Reach
 * Delivered/Active Campaigns) and "what can I do next" (Quick Actions) before
 * showing any campaign detail.
 *
 * "Boost Existing Story" doesn't open a new story-picker (that would be new
 * functionality, not discoverability) — it opens the Network tab, where
 * boosting already happens today from within a story. Earn Credits is a
 * placeholder page only (see ReachEarnCreditsScreen). Recent Campaigns reuse
 * ReachCampaignCard (grouped by post); tapping a campaign drills into
 * ReachCampaignDetailScreen.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  useReachCampaignsQuery,
  useReachPlansQuery,
  useReachOrgSummaryQuery,
} from "@/lib/queries/useReachCampaignsQuery";
import { ReachCampaignCard } from "@/features/reach/components/ReachCampaignCard";
import { groupReachCampaignsByPost } from "@/features/reach/utils/campaignFormat";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { ArrowLeft, ChevronRight, Coins, Eye, Gift, Rocket, Truck } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const RECENT_TRIP_GROUPS_LIMIT = 3;

export default function ReachHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;

  const summaryQ = useReachOrgSummaryQuery(orgId);
  const campaignsQ = useReachCampaignsQuery(orgId);
  const plansQ = useReachPlansQuery();
  const summary = summaryQ.data;
  const recentGroups = groupReachCampaignsByPost(campaignsQ.data ?? []).slice(0, RECENT_TRIP_GROUPS_LIMIT);
  const planById = new Map((plansQ.data ?? []).map((p) => [p.id, p]));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={Theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Pulse Reach</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {summaryQ.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Theme.primary} />
          </View>
        ) : (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={styles.statValueRow}>
                <Coins size={16} color={Theme.accentGold} />
                <Text style={styles.statValue}>{summary?.walletBalance ?? 0}</Text>
              </View>
              <Text style={styles.statLabel}>Credits</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statValueRow}>
                <Rocket size={16} color={Theme.primary} />
                <Text style={styles.statValue}>{summary?.campaigns.active ?? 0}</Text>
              </View>
              <Text style={styles.statLabel}>Active Campaigns</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statValueRow}>
                <Eye size={16} color={Theme.textSecondary} />
                <Text style={styles.statValue}>
                  {summary?.reach.delivered ?? 0}
                  <Text style={styles.statValueMuted}>/{summary?.reach.promised ?? 0}</Text>
                </Text>
              </View>
              <Text style={styles.statLabel}>Campaign Reach</Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionHeader}>Quick Actions</Text>
        <View style={styles.quickActionsCol}>
          <Pressable
            style={styles.quickActionRow}
            onPress={() => router.push(ROUTES.TABS.NETWORK as never)}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: Theme.primary + "14" }]}>
              <Truck size={16} color={Theme.primary} />
            </View>
            <View style={styles.quickActionTextCol}>
              <Text style={styles.quickActionTitle}>Boost Existing Story</Text>
              <Text style={styles.quickActionSub}>Open a load story to boost it</Text>
            </View>
            <ChevronRight size={16} color={Theme.textMuted} />
          </Pressable>
          <Pressable
            style={styles.quickActionRow}
            onPress={() => router.push(ROUTES.REACH.EARN_CREDITS as never)}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: Theme.accentGoldMuted }]}>
              <Gift size={16} color={Theme.accentGold} />
            </View>
            <View style={styles.quickActionTextCol}>
              <Text style={styles.quickActionTitle}>Earn Credits</Text>
              <Text style={styles.quickActionSub}>See how to get more credits</Text>
            </View>
            <ChevronRight size={16} color={Theme.textMuted} />
          </Pressable>
        </View>

        <View style={styles.recentHeaderRow}>
          <Text style={styles.sectionHeader}>Recent Campaigns</Text>
          <Pressable onPress={() => router.push(ROUTES.REACH.HISTORY as never)} style={styles.seeAllBtn}>
            <Text style={styles.seeAllText}>Campaign History</Text>
            <ChevronRight size={13} color={Theme.textMuted} />
          </Pressable>
        </View>

        {campaignsQ.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Theme.primary} />
          </View>
        ) : recentGroups.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Rocket size={28} color={Theme.textMuted} />
            <Text style={styles.emptyTitle}>No campaigns yet</Text>
            <Text style={styles.emptyBody}>Boost a load story to see it here.</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {recentGroups.map((group) => (
              <ReachCampaignCard
                key={group[0].post_id ?? group[0].id}
                campaigns={group}
                planById={planById}
                onCampaignPress={(id) => router.push(ROUTES.REACH.campaignDetail(id) as never)}
              />
            ))}
          </View>
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
  headerTitle: { fontSize: 18, fontWeight: "800", color: Theme.textPrimaryDark },
  content: { padding: Layout.screenPaddingHorizontal, gap: 10, paddingBottom: 24 },
  loadingWrap: { alignItems: "center", paddingVertical: 24 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    gap: 6,
  },
  statValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statValue: { fontSize: 20, fontWeight: "900", color: Theme.textPrimaryDark },
  statValueMuted: { fontSize: 13, fontWeight: "700", color: Theme.textMuted },
  statLabel: { fontSize: 10, fontWeight: "600", color: Theme.textMuted, textTransform: "uppercase" },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
  },
  quickActionsCol: { gap: 8 },
  quickActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
  },
  quickActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionTextCol: { flex: 1, gap: 1, minWidth: 0 },
  quickActionTitle: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  quickActionSub: { fontSize: 11, fontWeight: "500", color: Theme.textMuted },
  recentHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 8 },
  seeAllText: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  emptyWrap: { alignItems: "center", paddingVertical: 32, gap: 6 },
  emptyTitle: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  emptyBody: { fontSize: 11, color: Theme.textMuted, textAlign: "center" },
});
