/**
 * Horizontal reel card — one campaign in the Story Campaign Studio deck.
 * Selected card gets the brand-ink active ring; metrics come from live RPC.
 */
import Theme from "@/constants/Theme";
import type { ReachCampaignRow, ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { useReachCampaignMetricsQuery } from "@/lib/queries/useReachCampaignsQuery";
import { getCampaignIdentity } from "@/features/reach/utils/campaignIdentity";
import { getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import { formatINR } from "@/lib/format";
import { MapPin, Rocket, Smartphone, Zap } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

interface ReachCampaignReelCardProps {
  /** The trip's current/highest-tier campaign — one card per trip, never one per boost. */
  campaign: ReachCampaignRow;
  plan: ReachPlanRow | undefined;
  /** How many boosts (re-broadcasts/upgrades) this trip has had in total. */
  boostCount: number;
  /** Plan names across all of this trip's boosts, oldest first. Shown only when boostCount > 1. */
  planTimeline: string[];
  selected: boolean;
  onSelect: () => void;
  onOpenDetail: () => void;
  onBoost: () => void;
}

export function ReachCampaignReelCard({
  campaign,
  plan,
  boostCount,
  planTimeline,
  selected,
  onSelect,
  onOpenDetail,
  onBoost,
}: ReachCampaignReelCardProps) {
  const id = getCampaignIdentity(campaign);
  const display = plan ? getReachPlanDisplay(plan.code) : undefined;
  const planColor = display?.color ?? Theme.primary;
  const metricsQ = useReachCampaignMetricsQuery(campaign.id);
  const m = metricsQ.data;
  const isActive = campaign.status === "active";
  // Collapse consecutive repeats ("Starter → Starter → Growth" reads as noise).
  const tierPath = planTimeline.filter((p, i) => i === 0 || p !== planTimeline[i - 1]);
  const pickupLabel = campaign.load_pickup_date
    ? new Date(campaign.load_pickup_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <Pressable
      onPress={onSelect}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <View style={[styles.avatar, isActive && styles.avatarLive]}>
            <Text style={styles.avatarText}>{id.initials}</Text>
          </View>
          <View style={styles.titleCol}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>{id.title}</Text>
              <View
                style={[
                  styles.statusPill,
                  isActive ? styles.statusActive : styles.statusMuted,
                ]}
              >
                <Text style={[styles.statusText, isActive && styles.statusTextActive]}>
                  {campaign.status}
                </Text>
              </View>
            </View>
            <Text style={styles.tripId}>{id.tripId}</Text>
          </View>
        </View>
        <View style={[styles.tierPill, { backgroundColor: planColor + "14", borderColor: planColor + "40" }]}>
          <Zap size={10} color={planColor} />
          <Text style={[styles.tierText, { color: planColor }]}>{plan?.name ?? "Boost"}</Text>
        </View>
      </View>

      {boostCount > 1 ? (
        <View style={styles.timelineRow}>
          <Text style={styles.timelineText} numberOfLines={1}>
            {boostCount} boosts · {tierPath.join(" → ")}
          </Text>
        </View>
      ) : null}

      <View style={styles.miniPhone}>
        <View style={styles.miniPhoneTop}>
          {id.route ? (
            <View style={styles.routeRow}>
              <MapPin size={10} color={Theme.success} />
              <Text style={styles.routeText} numberOfLines={1}>{id.route}</Text>
            </View>
          ) : (
            <Text style={styles.routeText}>Story boost</Text>
          )}
          <View style={styles.sponsoredTag}>
            <Text style={styles.sponsoredTagText}>Sponsored</Text>
          </View>
        </View>
        <View style={styles.specRow}>
          <View style={styles.specCell}>
            <Text style={styles.specLabel}>Vehicle</Text>
            <Text style={styles.specValue} numberOfLines={1}>
              {id.truck ?? "Any vehicle"}
            </Text>
          </View>
          {pickupLabel ? (
            <>
              <View style={styles.specDivider} />
              <View style={styles.specCell}>
                <Text style={styles.specLabel}>Pickup</Text>
                <Text style={styles.specValue} numberOfLines={1}>
                  {pickupLabel}
                </Text>
              </View>
            </>
          ) : null}
          <View style={styles.specDivider} />
          <View style={styles.specCell}>
            <Text style={styles.specLabel}>Est. Fare</Text>
            <Text style={styles.specFare} numberOfLines={1}>
              {campaign.load_rate != null && campaign.load_rate > 0
                ? formatINR(campaign.load_rate)
                : "On request"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.boostBtn} onPress={onBoost}>
            <Rocket size={11} color={Theme.buttonPrimaryText} />
          <Text style={styles.boostBtnText}>
            {isActive ? "Upgrade Boost" : "Re-Boost"}
          </Text>
        </Pressable>
        <Pressable style={styles.previewBtn} onPress={onOpenDetail}>
          <Smartphone size={11} color={Theme.primary} />
          <Text style={styles.previewBtnText}>Open</Text>
        </Pressable>
      </View>

      {metricsQ.isLoading || !m ? (
        <View style={styles.metricsLoading}>
          <ActivityIndicator size="small" color={Theme.primary} />
        </View>
      ) : (
        <View style={styles.metrics}>
          <View style={styles.metricCell}>
            <Text style={styles.metricValue}>{m.impressions.toLocaleString()}</Text>
            <Text style={styles.metricLabel}>Reach</Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricValue}>{m.views.toLocaleString()}</Text>
            <Text style={styles.metricLabel}>Views</Text>
          </View>
          <View style={[styles.metricCell, styles.metricBids]}>
            <Text style={[styles.metricValue, styles.metricBidsValue]}>{m.bids}</Text>
            <Text style={[styles.metricLabel, styles.metricBidsLabel]}>Bids</Text>
          </View>
          <View style={[styles.metricCell, styles.metricCredits]}>
            <Text style={styles.metricValue}>{m.creditsUsed}</Text>
            <Text style={[styles.metricLabel, styles.metricCreditsLabel]}>Credits</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 320,
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Theme.networkCardBorder,
    padding: 12,
    gap: 10,
  },
  cardSelected: {
    borderColor: Theme.primary,
    shadowColor: Theme.brandBlueShadow,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  topLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLive: {
    borderWidth: 2,
    borderColor: Theme.success,
  },
  avatarText: { fontSize: 10, fontWeight: "900", color: Theme.success },
  titleCol: { flex: 1, minWidth: 0, gap: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  title: { fontSize: 11, fontWeight: "900", color: Theme.textPrimaryDark, flexShrink: 1 },
  tripId: { fontSize: 9, fontWeight: "700", color: Theme.textMuted, fontVariant: ["tabular-nums"] },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusActive: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.networkHubListCardConnectedBorder,
  },
  statusMuted: { backgroundColor: Theme.surface, borderColor: Theme.borderLight },
  statusText: { fontSize: 8, fontWeight: "800", textTransform: "capitalize", color: Theme.textMuted },
  statusTextActive: { color: Theme.success },
  tierPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  tierText: { fontSize: 9, fontWeight: "800", textTransform: "uppercase" },

  timelineRow: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.surface,
  },
  timelineText: { fontSize: 9, fontWeight: "700", color: Theme.textMuted },

  miniPhone: {
    backgroundColor: Theme.tripSelectionSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.tripSelectionBorder,
    padding: 10,
    gap: 8,
  },
  miniPhoneTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, minWidth: 0 },
  routeText: { fontSize: 9, fontWeight: "700", color: Theme.accentGold, flexShrink: 1 },
  sponsoredTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.accentGoldMuted,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
    flexShrink: 0,
  },
  sponsoredTagText: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.accentGold,
    textTransform: "uppercase",
  },
  specRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.tripSelectionInsetBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.tripSelectionInsetBorder,
    paddingVertical: 8,
  },
  specCell: { flex: 1, alignItems: "center", gap: 2, minWidth: 0, paddingHorizontal: 4 },
  specDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: Theme.borderOnDark },
  specLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  specValue: { fontSize: 11, fontWeight: "900", color: Theme.textOnDark },
  specFare: { fontSize: 11, fontWeight: "900", color: Theme.accentGold },

  actions: { flexDirection: "row", gap: 6 },
  boostBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingVertical: 7,
  },
  boostBtnText: { fontSize: 10, fontWeight: "800", color: Theme.buttonPrimaryText },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  previewBtnText: { fontSize: 10, fontWeight: "800", color: Theme.textPrimaryDark },

  metricsLoading: { paddingVertical: 8, alignItems: "center" },
  metrics: {
    flexDirection: "row",
    gap: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  metricCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    gap: 1,
  },
  metricBids: {
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardConnectedBorder,
  },
  metricCredits: {
    backgroundColor: Theme.accentGoldMuted,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
  },
  metricValue: { fontSize: 10, fontWeight: "900", color: Theme.textPrimaryDark, fontVariant: ["tabular-nums"] },
  metricBidsValue: { color: Theme.success },
  metricLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  metricBidsLabel: { color: Theme.success },
  metricCreditsLabel: { color: Theme.accentGoldPressed },
});
