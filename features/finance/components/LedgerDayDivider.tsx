/**
 * Cash-flow day separator — chat date pill centered, Paid / Rcvd on the flanks.
 * `──── PAID ₹X   [29 May]   RCVD ₹Y ────`
 */
import { formatChatDividerDate } from "@/features/chat/components/shared/ChatDateDivider";
import {
  CASH_LEDGER_MAX_WIDTH,
  LEDGER_AVATAR_SIZE,
  LEDGER_RIGHT_COLUMN_WIDTH,
  LEDGER_ROW_GAP,
} from "@/features/finance/components/ledger/ledgerTransactionLayout";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

export { CASH_LEDGER_MAX_WIDTH } from "@/features/finance/components/ledger/ledgerTransactionLayout";

type FlowFilter = "all" | "out" | "in";

type Props = {
  dateStr?: string;
  label?: string;
  paidLabel: string;
  receivedLabel: string;
  flowFilter: FlowFilter;
  onToggleExpand?: () => void;
  onFlowFilter: (filter: FlowFilter) => void;
  maxWidth?: number;
  contentPaddingHorizontal?: number;
  /** Desktop: align Paid / Rcvd with transaction row columns. */
  columnAligned?: boolean;
};

export function LedgerDayDivider({
  dateStr,
  label: labelOverride,
  paidLabel,
  receivedLabel,
  flowFilter,
  onToggleExpand,
  onFlowFilter,
  maxWidth,
  contentPaddingHorizontal,
  columnAligned = false,
}: Props) {
  const dateLabel =
    labelOverride ?? (dateStr ? formatChatDividerDate(dateStr) : "");
  if (!dateLabel) return null;

  const wrapStyle = [
    styles.wrap,
    maxWidth != null && {
      width: maxWidth,
      maxWidth: "100%" as const,
      alignSelf: "center" as const,
    },
    contentPaddingHorizontal != null && {
      paddingHorizontal: contentPaddingHorizontal,
    },
  ];

  if (columnAligned) {
    return (
      <View style={wrapStyle}>
        <View style={styles.columnAlignedRow}>
          <View style={{ width: LEDGER_AVATAR_SIZE, flexShrink: 0 }} />
          <View style={styles.columnAlignedMain}>
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
            <View style={styles.columnAlignedRcvdSlot}>
              <Pressable
                onPress={() => onFlowFilter(flowFilter === "in" ? "all" : "in")}
                style={[
                  styles.metric,
                  styles.metricAlignEnd,
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
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={wrapStyle}>
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
        <Text style={styles.datePillText} numberOfLines={1}>
          {dateLabel}
        </Text>
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
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 10,
    gap: 8,
    minWidth: 0,
    width: "100%",
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
    height: StyleSheet.hairlineWidth,
    backgroundColor: "transparent",
    minWidth: 10,
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
    backgroundColor: "transparent",
  },
  metricActiveIn: {
    backgroundColor: "transparent",
  },
  metricKey: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  metricOutValue: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  metricInValue: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.darkGreen,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  datePill: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 68,
  },
  datePillText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.15,
    textAlign: "center",
  },
  columnAlignedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: LEDGER_ROW_GAP,
    width: "100%",
    minWidth: 0,
  },
  columnAlignedMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minWidth: 0,
  },
  columnAlignedRcvdSlot: {
    width: LEDGER_RIGHT_COLUMN_WIDTH,
    alignItems: "flex-end",
    flexShrink: 0,
  },
  metricAlignEnd: {
    alignItems: "flex-end",
  },
});
