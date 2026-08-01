/**
 * Shared 4-metric grid (Impressions, Views, Bids, Credits Used). No CTR/CPM/CPC
 * by design. Compact boxed cells matching the Pulse Reach HTML mock density.
 */
import Theme from "@/constants/Theme";
import { useReachCampaignMetricsQuery } from "@/lib/queries/useReachCampaignsQuery";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export function ReachMetricsGrid({
  campaignId,
  withDivider = false,
}: {
  campaignId: string;
  /** Top rule used inside campaign cards; leave off in sheets/detail. */
  withDivider?: boolean;
}) {
  const metricsQ = useReachCampaignMetricsQuery(campaignId);
  const m = metricsQ.data;

  if (metricsQ.isLoading || !m) {
    return (
      <View style={styles.metricsLoading}>
        <ActivityIndicator size="small" color={Theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.metricsRow, withDivider && styles.metricsRowDivided]}>
      <View style={styles.metricCell}>
        <Text style={styles.metricValue}>{m.impressions.toLocaleString()}</Text>
        <Text style={styles.metricLabel}>Impressions</Text>
      </View>
      <View style={styles.metricCell}>
        <Text style={styles.metricValue}>{m.views.toLocaleString()}</Text>
        <Text style={styles.metricLabel}>Story Views</Text>
      </View>
      <View style={styles.metricCell}>
        <Text style={[styles.metricValue, styles.metricValueBids]}>
          {m.bids}{m.bids === 1 ? " Bid" : " Bids"}
        </Text>
        <Text style={styles.metricLabel}>Driver Bids</Text>
      </View>
      <View style={[styles.metricCell, styles.metricCellCredits]}>
        <Text style={[styles.metricValue, styles.metricValueCredits]}>{m.creditsUsed}</Text>
        <Text style={[styles.metricLabel, styles.metricLabelCredits]}>Credits Spent</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: "row",
    gap: 6,
  },
  metricsRowDivided: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  metricsLoading: { paddingVertical: 10, alignItems: "center" },
  metricCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 1,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 10,
    backgroundColor: Theme.surface,
  },
  metricCellCredits: {
    backgroundColor: Theme.accentBrownWash,
    borderWidth: 1,
    borderColor: Theme.accentBrownBorder,
  },
  metricValue: { fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark },
  metricValueBids: { color: Theme.success },
  metricValueCredits: { color: Theme.accentBrownDeep },
  metricLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  metricLabelCredits: { color: Theme.accentBrown },
});
