/**
 * Left-column trip summary card — matches reference design.
 * Shows trip ID, route, stops, and a metadata grid.
 */
import Theme from "@/constants/Theme";
import { StyleSheet, Text, View } from "react-native";
import type { TripRow } from "../../../services/trips.service";
import { getTripDisplayNumber } from "../../../services/trips.service";

interface TripInfoCardProps {
  trip: TripRow;
  clientName?: string | null;
  currentStageLabel?: string;
}

/** Optional display-only fields that may arrive on the row from joined/synced sources but are not part of the canonical TripRow. */
type TripInfoExtras = {
  truck_type?: string | null;
  vehicle_type?: string | null;
  billing_type?: string | null;
  weight?: string | number | null;
};

export function TripInfoCard({ trip, clientName, currentStageLabel }: TripInfoCardProps) {
  const extras = trip as TripRow & TripInfoExtras;
  const tripNumber = getTripDisplayNumber(trip);
  const pickup = (trip.pickup_area ?? "").trim() || "—";
  const drop = (trip.drop_location ?? "").trim() || "—";
  const displayClient = clientName ?? trip.client_name ?? "—";

  const pickupDateStr = trip.pickup_date
    ? new Date(trip.pickup_date).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).replace(",", "")
    : "—";

  return (
    <View style={styles.card}>
      {/* Header bar */}
      <View style={styles.headerBar}>
        <Text style={styles.tripNumber}>{tripNumber}</Text>
        {currentStageLabel ? (
          <>
            <View style={styles.headerDivider} />
            <Text style={styles.stageLabel}>{currentStageLabel}</Text>
          </>
        ) : null}
        <View style={styles.headerDivider} />
        <Text style={styles.headerDate}>{pickupDateStr}</Text>
        <View style={styles.headerDivider} />
        <Text style={styles.stopsBadge}>0 Stop(s)</Text>
      </View>

      {/* Route */}
      <View style={styles.routeSection}>
        <RouteRow color="#22c55e" label={pickup} />
        <View style={styles.routeConnector}>
          <View style={styles.routeConnectorLine} />
        </View>
        <RouteRow color="#ef4444" label={drop} />
      </View>

      <View style={styles.divider} />

      {/* Meta grid */}
      <View style={styles.metaGrid}>
        <MetaCell label="CLIENT" value={displayClient} />
        <MetaCell
          label="DISTANCE"
          value={trip.distance ? `${trip.distance} Km` : "—"}
        />
        <MetaCell
          label="TRUCK TYPE"
          value={extras.truck_type ?? extras.vehicle_type ?? "—"}
        />
        <MetaCell
          label="BILLING TYPE"
          value={extras.billing_type ?? "Fixed"}
        />
        <MetaCell
          label="MATERIAL"
          value={trip.load_type ?? "—"}
        />
        <MetaCell
          label="FREIGHT AMOUNT"
          value={
            trip.client_price
              ? `₹${Number(trip.client_price).toLocaleString("en-IN")}`
              : "—"
          }
        />
        {extras.weight ? (
          <MetaCell label="WEIGHT" value={`${extras.weight} Tons`} />
        ) : null}
      </View>
    </View>
  );
}

function RouteRow({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.routeRow}>
      <View style={[styles.routeDot, { backgroundColor: color }]} />
      <Text style={styles.routeLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaCell}>
      <Text style={styles.metaCellLabel}>{label}</Text>
      <Text style={styles.metaCellValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    flexWrap: "wrap",
    gap: 8,
  },
  tripNumber: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.3,
  },
  stageLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  headerDate: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  stopsBadge: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  headerDivider: {
    width: 1,
    height: 14,
    backgroundColor: "#e5e7eb",
  },
  routeSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  routeConnector: {
    paddingLeft: 4,
    paddingVertical: 4,
  },
  routeConnectorLine: {
    width: 2,
    height: 16,
    backgroundColor: "#d1d5db",
    marginLeft: 3,
  },
  divider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginHorizontal: 20,
  },
  metaGrid: {
    padding: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 0,
  },
  metaCell: {
    width: "50%",
    paddingBottom: 16,
    paddingRight: 8,
  },
  metaCellLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  metaCellValue: {
    fontSize: 13,
    fontWeight: "500",
    color: "#111827",
    lineHeight: 18,
  },
});
