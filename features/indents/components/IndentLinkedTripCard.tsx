/**
 * Converted indent → linked trip. Tappable hub card on indent review detail.
 */
import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import Theme from "@/constants/Theme";
import {
  indentHubCardShadow,
  indentReviewHubText,
} from "@/features/indents/styles/indentReviewHubStyles";
import { getTripOperationalDisplay } from "@/features/operations/display";
import type { TripRow } from "@/features/trips/services/trips.service";
import { useOpenTripDetail } from "@/lib/navigation/useOpenTripDetail";
import Feather from "@expo/vector-icons/Feather";
import { ChevronRight, Truck } from "lucide-react-native";
import { memo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

const cardShadow = indentHubCardShadow as ViewStyle;

export type IndentLinkedTripCardProps = {
  trip: TripRow;
  driverLabel?: string | null;
  vehicleLabel?: string | null;
  allocationPending?: boolean;
  compact?: boolean;
  stacked?: boolean;
};

function formatTripStageLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!s) return "Pending";
  const known: Record<string, string> = {
    completed: "Completed",
    delivered: "Completed",
    done: "Completed",
    in_transit: "In transit",
    in_progress: "In progress",
    at_destination: "At destination",
    at_drop: "At destination",
    assigned: "Assigned",
    deployed: "Deployed",
    cancelled: "Cancelled",
    open: "Open",
  };
  if (known[s]) return known[s];
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function stagePillStyle(status: string | null | undefined) {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "completed" || s === "delivered" || s === "done") {
    return { pill: styles.stagePillDone, text: styles.stagePillDoneText };
  }
  if (s === "cancelled" || s === "canceled") {
    return { pill: styles.stagePillMuted, text: styles.stagePillMutedText };
  }
  if (s === "in_transit" || s === "in transit" || s === "in_progress") {
    return { pill: styles.stagePillActive, text: styles.stagePillActiveText };
  }
  return { pill: styles.stagePillNeutral, text: styles.stagePillNeutralText };
}

export const IndentLinkedTripCard = memo(function IndentLinkedTripCard({
  trip,
  driverLabel,
  vehicleLabel,
  allocationPending = false,
  compact,
  stacked,
}: IndentLinkedTripCardProps) {
  const { openTripDetail } = useOpenTripDetail();

  const tripRef = getTripOperationalDisplay({
    trip_number: trip.trip_number ?? null,
    display_trip_id: trip.display_trip_id ?? null,
    trip_operational_code: trip.trip_operational_code ?? null,
  });
  const stageLabel = formatTripStageLabel(trip.status);
  const stageStyles = stagePillStyle(trip.status);
  const origin = (trip.pickup_area || "—").trim() || "—";
  const destination = (trip.drop_location || trip.drop_area || "—").trim() || "—";

  const driver = (driverLabel ?? trip.driver_display_name ?? "").trim();
  const vehicle = (vehicleLabel ?? trip.vehicle_display_number ?? "").trim();
  const assignmentLine = allocationPending
    ? "Assign driver & vehicle on trip"
    : [driver || "No driver", vehicle || "No vehicle"].join(" · ");

  return (
    <Pressable
      onPress={() => openTripDetail(trip.id)}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        stacked && styles.cardStacked,
        pressed && styles.cardPressed,
        cardShadow,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open trip ${tripRef}`}
      accessibilityHint="Opens trip detail"
    >
      <View style={styles.orb} pointerEvents="none" />

      <View style={styles.headRow}>
        <View style={styles.headLeft}>
          <View style={styles.iconTile}>
            <Truck size={16} color={Theme.textPrimaryDark} strokeWidth={2.2} />
          </View>
          <View style={styles.headCopy}>
            <Text style={[styles.kicker, compact && styles.kickerCompact]}>
              Linked trip
            </Text>
            <Text style={[styles.tripRef, compact && styles.tripRefCompact]} numberOfLines={1}>
              {tripRef}
            </Text>
          </View>
        </View>
        <View style={styles.headRight}>
          <View style={[styles.stagePill, stageStyles.pill]}>
            <Text style={[styles.stagePillText, stageStyles.text]} numberOfLines={1}>
              {stageLabel}
            </Text>
          </View>
          <ChevronRight size={16} color={Theme.textMuted} strokeWidth={2.4} />
        </View>
      </View>

      <LoadCardRouteRow
        origin={origin}
        destination={destination}
        compact
        style={[styles.route, compact && styles.routeCompact]}
      />

      <View style={styles.footerRow}>
        <Feather
          name={allocationPending ? "alert-circle" : "user-check"}
          size={11}
          color={allocationPending ? Theme.warning : Theme.textMuted}
        />
        <Text
          style={[
            styles.assignmentLine,
            allocationPending && styles.assignmentLinePending,
            compact && styles.assignmentLineCompact,
          ]}
          numberOfLines={1}
        >
          {assignmentLine}
        </Text>
        <Text style={styles.openHint}>Open</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    gap: 10,
    overflow: "hidden",
    alignSelf: "stretch",
  },
  cardCompact: {
    padding: 10,
    gap: 8,
    borderRadius: 10,
  },
  cardStacked: {
    marginTop: 0,
  },
  cardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
  orb: {
    position: "absolute",
    top: -48,
    right: -32,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Theme.loadAddButtonBg,
    opacity: 0.12,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    zIndex: 1,
  },
  headLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surfaceLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  kicker: {
    ...indentReviewHubText.fieldLabel,
    fontSize: 8,
    color: Theme.textRouteCard,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  kickerCompact: {
    fontSize: 7,
  },
  tripRef: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
  tripRefCompact: {
    fontSize: 12,
  },
  headRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    paddingTop: 2,
  },
  stagePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 108,
  },
  stagePillText: {
    ...indentReviewHubText.chipLabel,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  stagePillDone: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  stagePillDoneText: {
    color: Theme.positive,
  },
  stagePillActive: {
    backgroundColor: Theme.loadStatusTabTrayBg,
    borderColor: Theme.loadStatusTabTrayBorder,
  },
  stagePillActiveText: {
    color: Theme.loadAddButtonText,
  },
  stagePillNeutral: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderMedium,
  },
  stagePillNeutralText: {
    color: Theme.textPrimaryDark,
  },
  stagePillMuted: {
    backgroundColor: Theme.surfaceLight,
    borderColor: Theme.borderLight,
  },
  stagePillMutedText: {
    color: Theme.textMuted,
  },
  route: {
    marginBottom: 0,
    zIndex: 1,
  },
  routeCompact: {
    marginTop: -2,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    zIndex: 1,
  },
  assignmentLine: {
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 12,
  },
  assignmentLineCompact: {
    fontSize: 8,
    lineHeight: 11,
  },
  assignmentLinePending: {
    color: Theme.warning,
    fontWeight: "700",
  },
  openHint: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.loadAddButtonText,
    flexShrink: 0,
  },
});
