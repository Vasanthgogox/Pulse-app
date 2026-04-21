/**
 * Trip route + metadata summary card.
 * Shows pickup → drop, client, load type, distance, and key financials at a glance.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, View } from "react-native";
import type { TripRow } from "../../../services/trips.service";

interface TripSummaryCardProps {
  trip: TripRow;
  clientName?: string | null;
  driverName?: string | null;
  vehicleLabel?: string | null;
}

export function TripSummaryCard({
  trip,
  clientName,
  driverName,
  vehicleLabel,
}: TripSummaryCardProps) {
  const displayClient = clientName ?? trip.client_name ?? "—";
  const pickup = trip.pickup_area?.trim() || "—";
  const drop = trip.drop_location?.trim() || "—";
  const distance = trip.distance ? `${trip.distance} km` : null;
  const loadType = trip.load_type?.trim() || null;
  const pickupDate = trip.pickup_date
    ? new Date(trip.pickup_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <View style={styles.card}>
      {/* Route row */}
      <View style={styles.routeRow}>
        <View style={styles.routePoints}>
          <View style={styles.routePointRow}>
            <View style={[styles.routeDot, styles.routeDotOrigin]} />
            <Text style={styles.routeLocation} numberOfLines={2}>
              {pickup}
            </Text>
          </View>

          <View style={styles.routeLine} />

          <View style={styles.routePointRow}>
            <View style={[styles.routeDot, styles.routeDotDest]} />
            <Text style={styles.routeLocation} numberOfLines={2}>
              {drop}
            </Text>
          </View>
        </View>

        {distance && (
          <View style={styles.distanceBadge}>
            <FontAwesome name="road" size={10} color={Theme.textMuted} />
            <Text style={styles.distanceText}>{distance}</Text>
          </View>
        )}
      </View>

      <View style={styles.divider} />

      {/* Meta grid */}
      <View style={styles.metaGrid}>
        <MetaItem icon="user" label="Client" value={displayClient} />
        {pickupDate && <MetaItem icon="calendar" label="Date" value={pickupDate} />}
        {loadType && <MetaItem icon="cube" label="Load type" value={loadType} />}
        {vehicleLabel && <MetaItem icon="truck" label="Vehicle" value={vehicleLabel} />}
        {driverName && <MetaItem icon="id-card" label="Driver" value={driverName} />}
        {trip.notes && (
          <MetaItem icon="sticky-note" label="Notes" value={trip.notes} fullWidth />
        )}
      </View>

      {/* Status badge row */}
      <View style={styles.statusRow}>
        <StatusBadge status={trip.status} />
        <View style={styles.financeSummary}>
          <Text style={styles.financeLabel}>Client rate</Text>
          <Text style={styles.financeValue}>
            ₹{Number(trip.client_price ?? 0).toLocaleString("en-IN")}
          </Text>
        </View>
        {Number(trip.margin ?? 0) !== 0 && (
          <View style={styles.financeSummary}>
            <Text style={styles.financeLabel}>Margin</Text>
            <Text
              style={[
                styles.financeValue,
                Number(trip.margin) > 0 ? styles.positive : styles.negative,
              ]}
            >
              ₹{Math.abs(Number(trip.margin)).toLocaleString("en-IN")}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaItem({
  icon,
  label,
  value,
  fullWidth,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  value: string;
  fullWidth?: boolean;
}) {
  return (
    <View style={[styles.metaItem, fullWidth && styles.metaItemFull]}>
      <View style={styles.metaLabelRow}>
        <FontAwesome name={icon} size={10} color={Theme.textMuted} style={styles.metaIcon} />
        <Text style={styles.metaLabel}>{label}</Text>
      </View>
      <Text style={styles.metaValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "").toLowerCase();
  const { label, bg, text } = resolveStatusStyle(s);
  return (
    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
      <Text style={[styles.statusBadgeText, { color: text }]}>{label}</Text>
    </View>
  );
}

function resolveStatusStyle(status: string): {
  label: string;
  bg: string;
  text: string;
} {
  if (status === "completed" || status === "delivered" || status === "done") {
    return { label: "Completed", bg: Theme.positiveMuted, text: Theme.positive };
  }
  if (status === "in_progress" || status === "in_transit" || status === "picked_up") {
    return { label: "In Progress", bg: "rgba(99,102,241,0.1)", text: "#4338ca" };
  }
  if (status === "arrived" || status === "at_destination" || status === "at_drop") {
    return { label: "Arrived", bg: "rgba(251,191,36,0.15)", text: Theme.warning };
  }
  if (status === "assigned") {
    return {
      label: "Assigned",
      bg: Theme.tripHubUnassignedPillBg,
      text: Theme.textPrimaryDark,
    };
  }
  if (status === "cancelled" || status === "canceled") {
    return { label: "Cancelled", bg: "rgba(220,38,38,0.1)", text: Theme.negative };
  }
  return { label: status || "Draft", bg: Theme.surfaceGray, text: Theme.textMuted };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 12,
    overflow: "hidden",
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingBottom: 12,
    gap: 12,
  },
  routePoints: {
    flex: 1,
  },
  routePointRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  routeDotOrigin: {
    borderColor: Theme.primary,
    backgroundColor: Theme.screenBackground,
  },
  routeDotDest: {
    borderColor: Theme.positive,
    backgroundColor: Theme.screenBackground,
  },
  routeLine: {
    width: 2,
    height: 18,
    backgroundColor: Theme.borderMedium,
    marginLeft: 4,
    marginVertical: 4,
  },
  routeLocation: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: "center",
  },
  distanceText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 16,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 8,
  },
  metaItem: {
    width: "47%",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 10,
    padding: 10,
  },
  metaItemFull: {
    width: "100%",
  },
  metaLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  metaIcon: {
    opacity: 0.6,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    paddingTop: 0,
    flexWrap: "wrap",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  financeSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
  },
  financeLabel: {
    fontSize: 10,
    color: Theme.textMuted,
    fontWeight: "500",
  },
  financeValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  positive: {
    color: Theme.positive,
  },
  negative: {
    color: Theme.negative,
  },
});
