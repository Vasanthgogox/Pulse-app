import Theme from "@/constants/Theme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { SalesTripTableRow } from "@/features/network/utils/connectionSalesAnalytics.util";
import { formatINRChip } from "@/lib/format";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  row: SalesTripTableRow;
  received: number;
  due: number;
};

export const ClientAnalyticsMobileTripCard = memo(function ClientAnalyticsMobileTripCard({
  row,
  received,
  due,
}: Props) {
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
          <Text style={styles.metricLabel}>Sales</Text>
          <Text style={styles.metricValue}>{formatINRChip(row.sales)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Received</Text>
          <Text style={[styles.metricValue, styles.metricPositive]}>
            {formatINRChip(received)}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Due</Text>
          <Text
            style={[
              styles.metricValue,
              due > 0 ? styles.metricDue : styles.metricMuted,
            ]}
          >
            {formatINRChip(due)}
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
  },
  ref: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "800",
    color: METRONIC.link,
    letterSpacing: -0.2,
  },
  lane: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.text,
    lineHeight: 17,
  },
  metrics: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: METRONIC.border,
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
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "700",
    color: METRONIC.text,
    fontVariant: ["tabular-nums"],
  },
  metricPositive: {
    color: Theme.positive,
  },
  metricDue: {
    color: Theme.warning,
  },
  metricMuted: {
    color: METRONIC.muted,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: "46%",
  },
  statusComplete: {
    backgroundColor: Theme.positiveMuted,
  },
  statusActive: {
    backgroundColor: "#EEF6FF",
  },
  statusPending: {
    backgroundColor: "#F3F4F6",
  },
  statusText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  statusCompleteText: {
    color: Theme.positive,
  },
  statusActiveText: {
    color: METRONIC.link,
  },
  statusPendingText: {
    color: METRONIC.muted,
  },
});
