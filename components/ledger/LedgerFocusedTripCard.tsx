import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Check, Route } from "lucide-react-native";

import { LedgerFocusedTripSettlementSummary } from "@/components/ledger/LedgerFocusedTripSettlementSummary";
import { LedgerSyncPalette } from "@/constants/LedgerSyncPalette";
import Theme from "@/constants/Theme";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { TripEntryFinancialSnapshot } from "@/features/finance/utils/computeTripEntryFinancials.util";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";

export type LedgerFocusedTripChip = {
  key: string;
  label: string;
  disabled?: boolean;
  onPress?: () => void;
};

export type LedgerFocusedTripCardProps = {
  tripNumber: string;
  routeLabel: string;
  flowType: "in" | "out";
  adjustments: TripAdjustment[];
  revisedAmount: number;
  financialSnapshot?: TripEntryFinancialSnapshot | null;
  ledgerTransactions?: LedgerRow[] | null;
  tripId: string;
  showClientLane?: boolean;
  showSupplierLane?: boolean;
  showDriverLane?: boolean;
  showNoDueTag?: boolean;
  noDueTagLabel?: string;
  compact?: boolean;
  /** Trip id + route render in page header instead of on the card. */
  hideTripIdentity?: boolean;
  chips?: LedgerFocusedTripChip[];
  noDuePillLabel?: string | null;
};

export const LedgerFocusedTripCard = memo(function LedgerFocusedTripCard({
  tripNumber,
  routeLabel,
  flowType,
  adjustments,
  revisedAmount,
  financialSnapshot,
  ledgerTransactions,
  tripId,
  showClientLane = true,
  showSupplierLane = true,
  showDriverLane = true,
  showNoDueTag = false,
  noDueTagLabel,
  compact = false,
  hideTripIdentity = false,
  chips = [],
  noDuePillLabel,
}: LedgerFocusedTripCardProps) {
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      {hideTripIdentity ? (
        <View style={styles.checkWatermark} pointerEvents="none">
          <View style={[styles.checkWatermarkRing, compact && styles.checkWatermarkRingCompact]}>
            <Check
              size={compact ? 32 : 48}
              color="rgba(16,185,129,0.14)"
              strokeWidth={2.5}
            />
          </View>
        </View>
      ) : (
        <View style={styles.watermark} pointerEvents="none">
          <Route
            size={compact ? 56 : 72}
            color="rgba(15,23,42,0.04)"
            strokeWidth={1.5}
          />
        </View>
      )}
      <View style={[styles.inner, compact && styles.innerCompact]}>
        {!hideTripIdentity ? (
          <>
            <View style={styles.head}>
              <Text style={[styles.tripId, compact && styles.tripIdCompact]} numberOfLines={1}>
                {tripNumber}
              </Text>
              <View style={[styles.check, compact && styles.checkCompact]}>
                <Check size={compact ? 14 : 16} color={Theme.textOnDark} strokeWidth={3} />
              </View>
            </View>
            <Text style={[styles.route, compact && styles.routeCompact]} numberOfLines={2}>
              {routeLabel}
            </Text>
          </>
        ) : null}
        <LedgerFocusedTripSettlementSummary
          flowType={flowType}
          adjustments={adjustments}
          revisedAmount={revisedAmount}
          financialSnapshot={financialSnapshot}
          ledgerTransactions={ledgerTransactions}
          tripId={tripId}
          tripDisplayNumber={tripNumber}
          showClientLane={showClientLane}
          showSupplierLane={showSupplierLane}
          showDriverLane={showDriverLane}
          showNoDueTag={showNoDueTag}
          noDueTagLabel={noDueTagLabel}
          compact={compact}
        />
        {chips.length > 0 ? (
          <View style={[styles.chips, compact && styles.chipsCompact]}>
            {chips.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[
                  styles.chip,
                  compact && styles.chipCompact,
                  c.disabled && styles.chipDisabled,
                ]}
                onPress={c.onPress}
                disabled={!c.onPress}
                activeOpacity={c.onPress ? 0.85 : 1}
              >
                <Text
                  style={[
                    styles.chipText,
                    compact && styles.chipTextCompact,
                    c.disabled && styles.chipTextDisabled,
                  ]}
                  numberOfLines={1}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : noDuePillLabel ? (
          <View style={[styles.chips, compact && styles.chipsCompact]}>
            <View style={[styles.noDuePill, compact && styles.chipCompact]}>
              <Text
                style={[styles.chipText, compact && styles.chipTextCompact]}
                numberOfLines={1}
              >
                {noDuePillLabel}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e6edf5",
    backgroundColor: Theme.cardWhite,
    padding: 14,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  cardCompact: {
    padding: 10,
    borderRadius: 12,
  },
  watermark: {
    position: "absolute",
    top: -16,
    right: -16,
    opacity: 0.5,
  },
  checkWatermark: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 0,
  },
  checkWatermarkRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16,185,129,0.06)",
    borderWidth: 2,
    borderColor: "rgba(16,185,129,0.1)",
  },
  checkWatermarkRingCompact: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  inner: {
    position: "relative",
    zIndex: 1,
    gap: 8,
    width: "100%",
    minWidth: 0,
    paddingTop: 2,
  },
  innerCompact: {
    gap: 6,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    minWidth: 0,
  },
  tripId: {
    ...FinanceTxnTypography.partyTitle,
    color: LedgerSyncPalette.ink,
    flex: 1,
    minWidth: 0,
  },
  tripIdCompact: {
    fontSize: 12,
  },
  check: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: LedgerSyncPalette.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCompact: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  route: {
    ...FinanceTxnTypography.routeWhy,
    color: LedgerSyncPalette.muted,
    marginTop: 2,
    width: "100%",
    minWidth: 0,
  },
  routeCompact: {
    fontSize: 10,
    lineHeight: 14,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eef2f7",
    width: "100%",
    minWidth: 0,
  },
  chipsCompact: {
    marginTop: 2,
    gap: 4,
  },
  chip: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipCompact: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  chipDisabled: {
    opacity: 0.55,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
    color: LedgerSyncPalette.ink,
  },
  chipTextCompact: {
    fontSize: 9,
  },
  chipTextDisabled: {
    opacity: 0.7,
  },
  noDuePill: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
});
