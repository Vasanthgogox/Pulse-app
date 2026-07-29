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
      {!hideTripIdentity ? (
        <View style={styles.watermark} pointerEvents="none">
          <Route
            size={compact ? 56 : 72}
            color={Theme.borderInput}
            strokeWidth={1.5}
          />
        </View>
      ) : null}
      <View style={[styles.inner, compact && styles.innerCompact]}>
        {!hideTripIdentity ? (
          <>
            <View style={styles.head}>
              <Text style={[styles.tripId, compact && styles.tripIdCompact]} numberOfLines={1}>
                {tripNumber}
              </Text>
              <View style={[styles.check, compact && styles.checkCompact]}>
                <Check size={compact ? 12 : 14} color={Theme.textOnPrimary} strokeWidth={2.8} />
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    overflow: "hidden",
    position: "relative",
  },
  cardCompact: {
    padding: 12,
    borderRadius: 10,
  },
  watermark: {
    position: "absolute",
    top: -16,
    right: -16,
    opacity: 0.35,
  },
  inner: {
    position: "relative",
    zIndex: 1,
    gap: 10,
    width: "100%",
    minWidth: 0,
  },
  innerCompact: {
    gap: 8,
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
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Theme.success,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCompact: {
    width: 22,
    height: 22,
    borderRadius: 7,
  },
  route: {
    ...FinanceTxnTypography.routeWhy,
    color: Theme.textRouteCard,
    marginTop: -2,
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
    marginTop: 2,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderInput,
    width: "100%",
    minWidth: 0,
  },
  chipsCompact: {
    marginTop: 0,
    paddingTop: 8,
    gap: 5,
  },
  chip: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderInput,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipCompact: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  chipDisabled: {
    opacity: 0.55,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  chipTextCompact: {
    fontSize: 10,
  },
  chipTextDisabled: {
    opacity: 0.7,
  },
  noDuePill: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderInput,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
});
