import Theme from "@/constants/Theme";
import { formatFinanceInr, formatPct } from "./financeProFormat";
import { StyleSheet, Text, View } from "react-native";

export function FinanceProHeroPosition({
  outstanding,
  billed,
  attributedReceipts,
  collectionPct,
}: {
  outstanding: number;
  billed: number;
  attributedReceipts: number;
  collectionPct: number;
}) {
  return (
    <View style={styles.hero}>
      <Text style={styles.kicker}>Financial position</Text>
      <Text style={styles.heroLabel}>Trip-linked outstanding</Text>
      <Text style={styles.heroValue}>{formatFinanceInr(outstanding)}</Text>
      <View style={styles.row}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Billed</Text>
          <Text style={styles.metricValue}>{formatFinanceInr(billed)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Attributed receipts</Text>
          <Text style={styles.metricValue}>
            {formatFinanceInr(attributedReceipts)}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Collection %</Text>
          <Text style={styles.metricValue}>{formatPct(collectionPct)}</Text>
        </View>
      </View>
      <Text style={styles.note}>
        Commercial trip value minus attributed client cash. Invoice totals are
        not AR.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    paddingBottom: 20,
    marginBottom: 22,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  heroLabel: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  heroValue: {
    marginTop: 4,
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1.2,
    color: Theme.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
    gap: 24,
  },
  metric: {
    minWidth: 140,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  metricValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimary,
  },
  note: {
    marginTop: 12,
    fontSize: 12,
    color: Theme.textMuted,
  },
});
