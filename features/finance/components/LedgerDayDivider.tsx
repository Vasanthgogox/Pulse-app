/**
 * Cash-flow day separator — compact summary bar (date + paid + received).
 */
import { formatChatDividerDate } from "@/features/chat/components/shared/ChatDateDivider";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { Pressable, StyleSheet, Text, View } from "react-native";

export const CASH_LEDGER_MAX_WIDTH = 680;

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
      <View style={styles.bar}>
        <Pressable
          onPress={() => onFlowFilter(flowFilter === "out" ? "all" : "out")}
          style={[
            styles.metric,
            styles.metricLeft,
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

        <Pressable
          onPress={onToggleExpand}
          style={styles.datePill}
          accessibilityRole="button"
          accessibilityLabel={dateLabel}
        >
          <Text style={styles.datePillText} numberOfLines={1}>
            {dateLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => onFlowFilter(flowFilter === "in" ? "all" : "in")}
          style={[
            styles.metric,
            styles.metricRight,
            flowFilter === "in" && styles.metricActiveIn,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Received ${receivedLabel}`}
        >
          <Text style={[styles.metricKey, styles.metricKeyRight]}>Rcvd</Text>
          <Text style={styles.metricInValue} numberOfLines={1}>
            {receivedLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: CASH_LEDGER_MAX_WIDTH,
    alignSelf: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 8,
    zIndex: 2,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: METRONIC.bodyBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 0,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  metricLeft: {
    alignItems: "flex-start",
  },
  metricRight: {
    alignItems: "flex-end",
  },
  metricActiveOut: {
    backgroundColor: Theme.negativeMuted,
  },
  metricActiveIn: {
    backgroundColor: Theme.positiveMuted,
  },
  metricKey: {
    fontSize: 9,
    fontWeight: "600",
    color: METRONIC.muted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  metricKeyRight: {
    textAlign: "right",
  },
  metricOutValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.negative,
    fontVariant: ["tabular-nums"],
  },
  metricInValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.positive,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  datePill: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    minWidth: 84,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.text,
    letterSpacing: 0.1,
    textAlign: "center",
  },
});
