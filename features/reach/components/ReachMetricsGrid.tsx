/**
 * Shared 4-metric grid (Impressions, Views, Bids, Credits Used) — used by
 * ReachHistoryScreen (list of all campaigns) and BoostProgressSheet (single
 * campaign, in-context). No CTR/CPM/CPC by design.
 */
import Theme from "@/constants/Theme";
import { useReachCampaignMetricsQuery } from "@/lib/queries/useReachCampaignsQuery";
import { Coins, Eye, Gavel, Zap } from "lucide-react-native";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export function ReachMetricsGrid({ campaignId }: { campaignId: string }) {
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
    <View style={styles.metricsRow}>
      <View style={styles.metricCell}>
        <Eye size={13} color={Theme.textMuted} />
        <Text style={styles.metricValue}>{m.impressions}</Text>
        <Text style={styles.metricLabel}>Impressions</Text>
      </View>
      <View style={styles.metricCell}>
        <Zap size={13} color={Theme.textMuted} />
        <Text style={styles.metricValue}>{m.views}</Text>
        <Text style={styles.metricLabel}>Viewed</Text>
      </View>
      <View style={styles.metricCell}>
        <Gavel size={13} color={Theme.textMuted} />
        <Text style={styles.metricValue}>{m.bids}</Text>
        <Text style={styles.metricLabel}>Bids</Text>
      </View>
      <View style={styles.metricCell}>
        <Coins size={13} color={Theme.textMuted} />
        <Text style={styles.metricValue}>{m.creditsUsed}</Text>
        <Text style={styles.metricLabel}>Credits</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  metricsRow: { flexDirection: "row", justifyContent: "space-between" },
  metricsLoading: { paddingVertical: 12, alignItems: "center" },
  metricCell: { alignItems: "center", gap: 2, flex: 1 },
  metricValue: { fontSize: 15, fontWeight: "900", color: Theme.textPrimaryDark },
  metricLabel: { fontSize: 9, fontWeight: "600", color: Theme.textMuted, textTransform: "uppercase" },
});
