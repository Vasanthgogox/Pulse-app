import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";

import { LedgerTicketChrome } from "@/components/ledger/LedgerTicketChrome";
import Theme from "@/constants/Theme";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import type {
  TripAdjustmentImpact,
  TripAdjustmentType,
} from "@/features/trips/services/tripAdjustments";

export interface TripAdjustmentSuccessViewProps {
  type: TripAdjustmentType;
  impact: TripAdjustmentImpact;
  amount: number;
  reason: string;
  tripCode?: string | null;
  isAssetDriverCost?: boolean;
  deductionActionLabel?: string | null;
  onApplyDeduction?: () => void;
  onDone: () => void;
}

export const TripAdjustmentSuccessView = memo(function TripAdjustmentSuccessView(
  props: TripAdjustmentSuccessViewProps,
) {
  const insets = useSafeAreaInsets();
  const signed = props.impact === "plus" ? "+" : "−";
  const accent = props.type === "revenue" ? Theme.primary : "#0f766e";
  const amountColor = props.impact === "plus" ? Theme.teslaRed : Theme.darkGreen;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.content}>
        <LedgerTicketChrome
          headerKicker="PULSE PROVISION"
          headerCaption="Adjustment posted"
          headerCode="SYNCED"
          headerColor={accent}
          notchBackdrop="#f1f5f9"
        >
          <View style={styles.hero}>
            <View style={[styles.checkBadge, { borderColor: accent, backgroundColor: `${accent}18` }]}>
              <Check size={28} color={accent} strokeWidth={3} />
            </View>
            <Text style={styles.title}>Provision saved</Text>
            <Text style={[styles.amount, { color: amountColor }]}>
              {signed}₹
              {props.amount.toLocaleString("en-IN", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </Text>
            <Text style={styles.meta}>
              {props.isAssetDriverCost
                ? props.impact === "plus"
                  ? "Pay driver (DN)"
                  : "Deduct from driver (CN)"
                : `${props.type === "revenue" ? "Revenue" : "Supplier cost"} · ${
                    props.impact === "plus" ? "Debit (DN)" : "Credit (CN)"
                  }`}
            </Text>
          </View>

          <View style={styles.reasonBlock}>
            <Text style={styles.fieldLabel}>Reason</Text>
            <Text style={styles.reasonValue} numberOfLines={3}>
              {props.reason}
            </Text>
          </View>

          {props.tripCode ? (
            <Text style={styles.tripCode}>Trip {props.tripCode}</Text>
          ) : null}
        </LedgerTicketChrome>
      </View>

      {props.deductionActionLabel && props.onApplyDeduction ? (
        <Pressable
          style={[styles.deductionBtn, { borderColor: "#0f766e" }]}
          onPress={props.onApplyDeduction}
          accessibilityRole="button"
          accessibilityLabel={props.deductionActionLabel}
        >
          <Text style={[styles.deductionBtnText, { color: "#0f766e" }]}>
            {props.deductionActionLabel}
          </Text>
        </Pressable>
      ) : null}

      <Pressable style={[styles.doneBtn, { backgroundColor: accent }]} onPress={props.onDone}>
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 16,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    width: "100%",
    paddingVertical: 8,
  },
  hero: {
    alignItems: "center",
    gap: 6,
    paddingBottom: 8,
  },
  checkBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  amount: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
  },
  meta: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  reasonBlock: { gap: 4, marginTop: 4 },
  fieldLabel: {
    ...FinanceTxnTypography.fieldLabel,
    color: Theme.textMuted,
  },
  reasonValue: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 13,
    lineHeight: 18,
  },
  tripCode: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  deductionBtn: {
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 2,
    backgroundColor: "#fff",
  },
  deductionBtnText: {
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  doneBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
});
