import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";

function parseAmount(raw: string): number | null {
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

export type PartnerRateSaleMarginStripProps = {
  /** Client sale value (from Load step). */
  saleValue: string;
  /** Partner rate being typed. */
  partnerRate: string;
};

/**
 * Live sale vs margin under partner-rate entry — updates while typing.
 */
export const PartnerRateSaleMarginStrip = memo(function PartnerRateSaleMarginStrip({
  saleValue,
  partnerRate,
}: PartnerRateSaleMarginStripProps) {
  const sale = useMemo(() => parseAmount(saleValue), [saleValue]);
  const rate = useMemo(() => parseAmount(partnerRate), [partnerRate]);

  const margin = sale != null && rate != null ? sale - rate : null;
  const marginPct =
    margin != null && sale != null && sale > 0
      ? (margin / sale) * 100
      : null;

  const hasSale = sale != null && sale > 0;
  const hasRate = rate != null && String(partnerRate).replace(/[^\d.]/g, "").length > 0;

  if (!hasSale && !hasRate) return null;

  const marginTone =
    margin == null
      ? "neutral"
      : margin > 0
        ? "positive"
        : margin < 0
          ? "negative"
          : "neutral";

  return (
    <View
      style={styles.root}
      accessibilityLabel={
        hasSale && margin != null
          ? `Sale ${formatInr(sale!)}, margin ${formatInr(margin)}${
              marginPct != null ? `, ${marginPct.toFixed(0)} percent` : ""
            }`
          : hasSale
            ? `Sale ${formatInr(sale!)}`
            : undefined
      }
    >
      <View style={styles.cell}>
        <Text style={styles.label}>Sale</Text>
        <Text style={styles.value} numberOfLines={1}>
          {hasSale ? formatInr(sale!) : "—"}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={[styles.cell, styles.cellEnd]}>
        <Text style={styles.label}>Margin</Text>
        {hasSale && hasRate && margin != null ? (
          <View style={styles.marginValueRow}>
            <Text
              style={[
                styles.value,
                marginTone === "positive" && styles.valuePositive,
                marginTone === "negative" && styles.valueNegative,
              ]}
              numberOfLines={1}
            >
              {margin < 0 ? "−" : ""}
              {formatInr(Math.abs(margin))}
            </Text>
            {marginPct != null ? (
              <Text
                style={[
                  styles.pct,
                  marginTone === "positive" && styles.valuePositive,
                  marginTone === "negative" && styles.valueNegative,
                ]}
              >
                {marginPct >= 0 ? "+" : ""}
                {marginPct.toFixed(0)}%
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.valueMuted} numberOfLines={1}>
            {hasSale ? "Type rate" : "Set sale first"}
          </Text>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    gap: 0,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: "center",
  },
  cellEnd: {
    alignItems: "flex-end",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: Theme.borderLight,
    marginHorizontal: 12,
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  value: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  valueMuted: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  valuePositive: {
    color: Theme.positive,
  },
  valueNegative: {
    color: Theme.negative,
  },
  marginValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  pct: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
  },
});
