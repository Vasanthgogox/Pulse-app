/**
 * Quick-settlement % chips (40–90% + full payment) for ledger amount entry.
 */
import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { LedgerSyncPalette } from "@/constants/LedgerSyncPalette";
import { formatINR } from "@/lib/format";

export const SETTLEMENT_PCTS = [40, 50, 60, 70, 80, 90] as const;
export const FULL_SETTLEMENT_PCT = 100;

export function formatLedgerSettlementAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseLedgerAmountStr(value: string): number | null {
  const parsed = parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveActiveSettlementPct(
  dueTotalInr: number,
  amountStr: string,
): number | null {
  const parsed = parseLedgerAmountStr(amountStr);
  if (parsed == null || parsed <= 0 || dueTotalInr <= 0) return null;
  const rounded = Math.round(parsed);
  if (rounded === Math.round(dueTotalInr)) return FULL_SETTLEMENT_PCT;
  for (const pct of SETTLEMENT_PCTS) {
    if (rounded === Math.round((dueTotalInr * pct) / 100)) return pct;
  }
  return null;
}

export type LedgerSettlementPctDockProps = {
  dueTotalInr: number;
  amountStr: string;
  onAmountChange: (value: string) => void;
  accentColor: string;
  /** Light = mobile wizard; dark = desktop sync hero card. */
  variant?: "light" | "dark";
};

export const LedgerSettlementPctDock = memo(function LedgerSettlementPctDock({
  dueTotalInr,
  amountStr,
  onAmountChange,
  accentColor,
  variant = "light",
}: LedgerSettlementPctDockProps) {
  const dark = variant === "dark";
  const activePct = useMemo(
    () => resolveActiveSettlementPct(dueTotalInr, amountStr),
    [dueTotalInr, amountStr],
  );

  const applySettlementPct = useCallback(
    (pct: number) => {
      if (dueTotalInr <= 0) return;
      const value =
        pct >= FULL_SETTLEMENT_PCT
          ? dueTotalInr
          : Math.round((dueTotalInr * pct) / 100);
      onAmountChange(formatLedgerSettlementAmount(value));
    },
    [dueTotalInr, onAmountChange],
  );

  if (dueTotalInr <= 0) return null;

  const fullActive = activePct === FULL_SETTLEMENT_PCT;

  return (
    <View
      style={[
        styles.dock,
        dark && styles.dockDark,
      ]}
    >
      <Text style={[styles.sectionLabel, dark && styles.sectionLabelDark]}>
        Quick settlement
      </Text>
      <Pressable
        style={({ pressed }) => [
          styles.fullPayTile,
          dark && styles.fullPayTileDark,
          fullActive && styles.fullPayTileActive,
          fullActive && { borderColor: accentColor },
          fullActive && dark && { backgroundColor: "rgba(255,255,255,0.08)" },
          pressed && styles.pctTilePressed,
        ]}
        onPress={() => applySettlementPct(FULL_SETTLEMENT_PCT)}
        accessibilityRole="button"
        accessibilityLabel={`Full payment, ${formatINR(dueTotalInr)}`}
      >
        <Text style={[styles.fullPayLabel, dark && styles.fullPayLabelDark, fullActive && { color: accentColor }]}>
          Full payment
        </Text>
        <Text style={[styles.fullPayAmount, { color: accentColor }]}>
          {formatINR(dueTotalInr)}
        </Text>
      </Pressable>
      <Text style={[styles.subsectionLabel, dark && styles.subsectionLabelDark]}>
        Or choose % of due
      </Text>
      <View style={styles.pctGrid}>
        {SETTLEMENT_PCTS.map((pct) => {
          const preview = Math.round((dueTotalInr * pct) / 100);
          const active = activePct === pct;
          return (
            <Pressable
              key={pct}
              style={({ pressed }) => [
                styles.pctTile,
                dark && styles.pctTileDark,
                active && styles.pctTileActive,
                active && dark && { borderColor: accentColor, backgroundColor: "rgba(255,255,255,0.1)" },
                pressed && styles.pctTilePressed,
              ]}
              onPress={() => applySettlementPct(pct)}
              accessibilityRole="button"
              accessibilityLabel={`${pct} percent, ${formatINR(preview)}`}
            >
              <Text
                style={[
                  styles.pctTilePct,
                  dark && styles.pctTilePctDark,
                  active && styles.pctTilePctActive,
                  active && { color: accentColor },
                ]}
              >
                {pct}%
              </Text>
              <Text
                style={[
                  styles.pctTileAmt,
                  dark && styles.pctTileAmtDark,
                  active && styles.pctTileAmtActive,
                  active && dark && { color: Theme.textOnDark },
                ]}
                numberOfLines={1}
              >
                {formatINR(preview)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  dock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.screenBackground,
  },
  dockDark: {
    borderTopColor: "rgba(255,255,255,0.12)",
    marginTop: 10,
    paddingTop: 14,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
  },
  sectionLabel: {
    marginBottom: 6,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
    textAlign: "center",
    width: "100%",
  },
  sectionLabelDark: {
    color: LedgerSyncPalette.muted,
    letterSpacing: 0.8,
  },
  subsectionLabel: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
    textAlign: "center",
    width: "100%",
  },
  subsectionLabelDark: {
    color: LedgerSyncPalette.muted,
  },
  fullPayTile: {
    width: "100%",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 2,
    minHeight: 52,
  },
  fullPayTileDark: {
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  fullPayTileActive: {
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 2,
  },
  fullPayLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  fullPayLabelDark: {
    color: "rgba(255,255,255,0.72)",
  },
  fullPayAmount: {
    fontSize: 15,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
    lineHeight: 18,
  },
  pctGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    width: "100%",
    justifyContent: "center",
  },
  pctTile: {
    width: "31%",
    minWidth: 88,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#e6edf5",
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 2,
    minHeight: 48,
  },
  pctTileDark: {
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  pctTileActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 1.5,
  },
  pctTilePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  pctTilePct: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    lineHeight: 16,
  },
  pctTilePctDark: {
    color: "rgba(255,255,255,0.9)",
  },
  pctTilePctActive: {
    color: Theme.primary,
  },
  pctTileAmt: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
    lineHeight: 12,
    textAlign: "center",
  },
  pctTileAmtDark: {
    color: "rgba(255,255,255,0.55)",
  },
  pctTileAmtActive: {
    color: Theme.textPrimaryDark,
    fontWeight: "800",
  },
});
