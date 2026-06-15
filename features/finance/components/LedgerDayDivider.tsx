/**
 * Cash-flow day separator — chat date pill centered, Paid / Rcvd on the flanks.
 * `──── Paid ₹X   [29 May]   Rcvd ₹Y ────`
 */
import {
  formatChatDividerDate,
} from "@/features/chat/components/shared/ChatDateDivider";
import Theme from "@/constants/Theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

type FlowFilter = "all" | "out" | "in";

type Props = {
  dateStr?: string;
  label?: string;
  paidLabel: string;
  receivedLabel: string;
  flowFilter: FlowFilter;
  onToggleExpand?: () => void;
  onFlowFilter: (filter: FlowFilter) => void;
};

export function LedgerDayDivider({
  dateStr,
  label: labelOverride,
  paidLabel,
  receivedLabel,
  flowFilter,
  onToggleExpand,
  onFlowFilter,
}: Props) {
  const dateLabel =
    labelOverride ?? (dateStr ? formatChatDividerDate(dateStr) : "");
  if (!dateLabel) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.side}>
        <View style={styles.line} />
        <Pressable
          onPress={() => onFlowFilter(flowFilter === "out" ? "all" : "out")}
          style={[
            styles.metric,
            flowFilter === "out" && styles.metricActiveOut,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Paid ${paidLabel}`}
        >
          <Text style={styles.metricKey}>Paid</Text>
          <Text style={styles.metricOutValue} numberOfLines={1}>
            {paidLabel}
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onToggleExpand}
        style={styles.datePill}
        accessibilityRole="button"
        accessibilityLabel={dateLabel}
      >
        <Text style={styles.datePillText}>{dateLabel}</Text>
      </Pressable>

      <View style={styles.side}>
        <Pressable
          onPress={() => onFlowFilter(flowFilter === "in" ? "all" : "in")}
          style={[
            styles.metric,
            flowFilter === "in" && styles.metricActiveIn,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Received ${receivedLabel}`}
        >
          <Text style={styles.metricKey}>Rcvd</Text>
          <Text style={styles.metricInValue} numberOfLines={1}>
            {receivedLabel}
          </Text>
        </Pressable>
        <View style={styles.line} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    minWidth: 0,
  },
  side: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: "#CBD5E1",
    minWidth: 8,
  },
  metric: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
  },
  metricActiveOut: {
    backgroundColor: "rgba(248,113,113,0.1)",
  },
  metricActiveIn: {
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  metricKey: {
    fontSize: 8,
    fontWeight: "600",
    color: "#94A3B8",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  metricOutValue: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.teslaRed,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  metricInValue: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.darkGreen,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  datePill: {
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(100,116,139,0.34)",
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  datePillText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#64748B",
    letterSpacing: 0.2,
  },
});
