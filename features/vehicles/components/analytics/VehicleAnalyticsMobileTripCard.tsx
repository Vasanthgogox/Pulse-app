import Theme from "@/constants/Theme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { SalesTripTableRow } from "@/features/network/utils/connectionSalesAnalytics.util";
import { formatINRChip } from "@/lib/format";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  row: SalesTripTableRow;
  revenue: number;
  expense: number;
  profit: number;
};

export const VehicleAnalyticsMobileTripCard = memo(
  function VehicleAnalyticsMobileTripCard({ row, revenue, expense, profit }: Props) {
    const status = row.statusLabel.toLowerCase();
    const isComplete =
      status.includes("complete") || status.includes("delivered");
    const isActive =
      status.includes("transit") ||
      status.includes("assigned") ||
      status.includes("progress");

    return (
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.ref} numberOfLines={1}>
            {row.tripRef}
          </Text>
          <View
            style={[
              styles.statusPill,
              isComplete
                ? styles.statusComplete
                : isActive
                  ? styles.statusActive
                  : styles.statusPending,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isComplete
                  ? styles.statusCompleteText
                  : isActive
                    ? styles.statusActiveText
                    : styles.statusPendingText,
              ]}
              numberOfLines={1}
            >
              {row.statusLabel}
            </Text>
          </View>
        </View>

        <Text style={styles.lane} numberOfLines={2}>
          {row.lane}
        </Text>

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Revenue</Text>
            <Text style={styles.metricValue}>{formatINRChip(revenue)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Expense</Text>
            <Text style={[styles.metricValue, styles.metricExpense]}>
              {formatINRChip(expense)}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Profit</Text>
            <Text
              style={[
                styles.metricValue,
                profit >= 0 ? styles.metricPositive : styles.metricDue,
              ]}
            >
              {formatINRChip(profit)}
            </Text>
          </View>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    gap: 8,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  ref: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "800",
    color: METRONIC.text,
    letterSpacing: -0.2,
  },
  lane: {
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.muted,
    lineHeight: 17,
  },
  metrics: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "800",
    color: METRONIC.text,
    letterSpacing: -0.2,
  },
  metricExpense: {
    color: METRONIC.subtle,
  },
  metricPositive: {
    color: Theme.positive,
  },
  metricDue: {
    color: Theme.negative,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: "46%",
  },
  statusText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  statusComplete: {
    backgroundColor: Theme.positiveMutedDark,
  },
  statusCompleteText: {
    color: Theme.positive,
  },
  statusActive: {
    backgroundColor: "#EEF6FF",
  },
  statusActiveText: {
    color: METRONIC.link,
  },
  statusPending: {
    backgroundColor: "#F3F4F6",
  },
  statusPendingText: {
    color: METRONIC.subtle,
  },
});
