import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { LedgerSyncPalette } from "@/constants/LedgerSyncPalette";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";

export interface LedgerHeaderTripDetailProps {
  title?: string;
  partyName?: string | null;
  tripNumber?: string | null;
  routeLabel?: string | null;
  hint?: string | null;
  compact?: boolean;
  fill?: boolean;
  centered?: boolean;
}

export const LedgerHeaderTripDetail = memo(function LedgerHeaderTripDetail({
  title,
  partyName,
  tripNumber,
  routeLabel,
  hint,
  compact = false,
  fill = true,
  centered = false,
}: LedgerHeaderTripDetailProps) {
  const party = (partyName ?? "").trim();
  const trip = (tripNumber ?? "").trim();
  const route = (routeLabel ?? "").trim();
  const hintText = (hint ?? "").trim();
  const showTitleRow = Boolean((title ?? "").trim() || party);
  const showTripRow = Boolean(trip);

  if (!showTitleRow && !showTripRow && !hintText) return null;

  return (
    <View
      style={[
        styles.wrap,
        fill && styles.wrapFill,
        compact && styles.wrapCompact,
        centered && styles.wrapCentered,
      ]}
    >
      {showTitleRow ? (
        <View style={[styles.row, centered && styles.rowCentered]}>
          {(title ?? "").trim() ? (
            <Text
              style={[styles.title, compact && styles.titleCompact]}
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : null}
          {party ? (
            <Text
              style={[styles.party, compact && styles.partyCompact]}
              numberOfLines={1}
            >
              {party}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showTripRow ? (
        <View style={[styles.row, centered && styles.rowCentered]}>
          <Text
            style={[
              styles.tripId,
              compact && styles.tripIdCompact,
              centered && styles.tripIdCentered,
            ]}
            numberOfLines={1}
          >
            {trip}
          </Text>
          {route ? (
            <Text
              style={[
                styles.route,
                compact && styles.routeCompact,
                centered && styles.routeCentered,
              ]}
              numberOfLines={1}
            >
              {route}
            </Text>
          ) : null}
        </View>
      ) : hintText ? (
        <Text style={[styles.hint, compact && styles.hintCompact]} numberOfLines={1}>
          {hintText}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    minWidth: 0,
    gap: 3,
    justifyContent: "center",
  },
  wrapFill: {
    flex: 1,
  },
  wrapCompact: {
    gap: 2,
  },
  wrapCentered: {
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    minWidth: 0,
  },
  rowCentered: {
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.35,
    lineHeight: 24,
    color: LedgerSyncPalette.ink,
    flexShrink: 0,
  },
  titleCompact: {
    fontSize: 16,
    lineHeight: 20,
  },
  party: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    color: LedgerSyncPalette.muted,
    flex: 1,
    minWidth: 0,
  },
  partyCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  tripId: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 13,
    lineHeight: 17,
    fontStyle: "italic",
    color: LedgerSyncPalette.ink,
    flexShrink: 1,
    minWidth: 0,
  },
  tripIdCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  tripIdCentered: {
    flexShrink: 1,
    textAlign: "right",
  },
  route: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 11,
    lineHeight: 15,
    fontStyle: "italic",
    color: LedgerSyncPalette.muted,
    flex: 1,
    minWidth: 0,
  },
  routeCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  routeCentered: {
    textAlign: "left",
  },
  hint: {
    fontSize: 11,
    fontWeight: "600",
    color: LedgerSyncPalette.muted,
    letterSpacing: 0.2,
  },
  hintCompact: {
    fontSize: 10,
  },
});
