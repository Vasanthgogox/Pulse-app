import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { LedgerTicketChrome } from "@/components/ledger/LedgerTicketChrome";
import Theme from "@/constants/Theme";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import { formatINR } from "@/lib/format";
import type {
  TripAdjustmentImpact,
  TripAdjustmentType,
} from "@/features/trips/services/tripAdjustments";

export interface TripAdjustmentReviewTicketProps {
  type: TripAdjustmentType;
  impact: TripAdjustmentImpact;
  amount: number;
  reason: string;
  tripCode?: string | null;
  baseAmount?: number;
  revisedAmount?: number;
}

function laneLabel(type: TripAdjustmentType): string {
  return type === "revenue" ? "Revenue (Sale)" : "Cost (Supplier)";
}

function impactLabel(impact: TripAdjustmentImpact): string {
  return impact === "plus" ? "Debit note (DN)" : "Credit note (CN)";
}

export const TripAdjustmentReviewTicket = memo(function TripAdjustmentReviewTicket(
  props: TripAdjustmentReviewTicketProps,
) {
  const signed = props.impact === "plus" ? "+" : "−";
  const headerColor = props.type === "revenue" ? Theme.primary : "#0f766e";
  const amountColor = props.impact === "plus" ? Theme.teslaRed : Theme.darkGreen;

  return (
    <LedgerTicketChrome
      headerKicker="PULSE PROVISION"
      headerCaption="Finance adjustment"
      headerCode={props.tripCode?.trim() || "TRIP"}
      headerColor={headerColor}
    >
      <View style={styles.amountRow}>
        <View>
          <Text style={styles.amountEyebrow}>Adjustment</Text>
          <Text style={[styles.amountValue, { color: amountColor }]}>
            {signed}₹
            {props.amount.toLocaleString("en-IN", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </Text>
        </View>
        <View style={[styles.pill, { borderColor: amountColor, backgroundColor: `${amountColor}14` }]}>
          <Text style={[styles.pillText, { color: amountColor }]}>
            {impactLabel(props.impact)}
          </Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <View style={styles.statCell}>
          <Text style={styles.fieldLabel}>Lane</Text>
          <Text style={styles.fieldValue}>{laneLabel(props.type)}</Text>
        </View>
        <View style={[styles.statCell, styles.statCellRight]}>
          <Text style={[styles.fieldLabel, styles.alignRight]}>Effect</Text>
          <Text style={[styles.fieldValue, styles.alignRight]}>
            {props.impact === "plus" ? "Increases amount" : "Reduces amount"}
          </Text>
        </View>
      </View>

      <View style={styles.reasonBlock}>
        <Text style={styles.fieldLabel}>Reason</Text>
        <Text style={styles.reasonValue} numberOfLines={3}>
          {props.reason}
        </Text>
      </View>

      {props.baseAmount != null && props.revisedAmount != null ? (
        <View style={styles.revisedBlock}>
          <Text style={styles.fieldLabel}>Revised {props.type === "revenue" ? "sale" : "cost"}</Text>
          <View style={styles.revisedRow}>
            <Text style={styles.revisedBase}>{formatINR(props.baseAmount)}</Text>
            <Text style={styles.revisedArrow}>→</Text>
            <Text
              style={[
                styles.revisedValue,
                { color: props.type === "revenue" ? Theme.primary : "#0f766e" },
              ]}
            >
              {formatINR(props.revisedAmount)}
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.stubHint}>
        Tear along the line — tap Save below to post this CN/DN to the trip books.
      </Text>
    </LedgerTicketChrome>
  );
});

const styles = StyleSheet.create({
  amountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
  },
  amountEyebrow: {
    ...FinanceTxnTypography.fieldLabel,
    color: Theme.textMuted,
  },
  amountValue: {
    marginTop: 2,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCell: { flex: 1, minWidth: 0, gap: 2 },
  statCellRight: { alignItems: "flex-end" },
  fieldLabel: {
    ...FinanceTxnTypography.fieldLabel,
    color: Theme.textMuted,
  },
  fieldValue: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 12,
    lineHeight: 16,
  },
  alignRight: { textAlign: "right" },
  reasonBlock: { gap: 4 },
  reasonValue: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  revisedBlock: {
    marginTop: 4,
    gap: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  revisedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  revisedBase: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  revisedArrow: {
    fontSize: 14,
    color: Theme.textMuted,
  },
  revisedValue: {
    fontSize: 16,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  stubHint: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    fontStyle: "italic",
    lineHeight: 14,
    marginTop: 2,
  },
});
