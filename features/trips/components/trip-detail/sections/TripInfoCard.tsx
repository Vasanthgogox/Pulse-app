import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, View } from "react-native";
import type { TripRow } from "../../../services/trips.service";
import { getTripDisplayNumber } from "../../../services/trips.service";

interface TripInfoCardProps {
  trip: TripRow;
  clientName?: string | null;
  currentStageLabel?: string;
}

export function TripInfoCard({ trip, clientName, currentStageLabel: _currentStageLabel }: TripInfoCardProps) {
  const tripNumber = getTripDisplayNumber(trip);
  const pickup = (trip.pickup_area ?? "").trim() || "—";
  const drop = (trip.drop_location ?? "").trim() || "—";
  const displayClient = clientName ?? trip.client_name ?? "—";
  const billingType = (trip as any).billing_type ?? "Fixed Billing";
  const freightAmount = trip.client_price
    ? `₹${Number(trip.client_price).toLocaleString("en-IN")}`
    : "—";

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <Text style={styles.tripNumber}>{tripNumber}</Text>
          <View style={styles.dot} />
          <View style={styles.stopsBadge}>
            <Text style={styles.stopsBadgeText}>0 Stops</Text>
          </View>
        </View>
        <Text style={styles.billingType}>{billingType}</Text>
      </View>

      {/* Route section */}
      <View style={styles.routeSection}>
        <View style={styles.routeContainer}>
          <View style={styles.routeLine} />

          <View style={styles.routeRow}>
            <View style={styles.routeDotOuterGreen}>
              <View style={[styles.routeDotInner, styles.routeDotGreen]} />
            </View>
            <View style={styles.routeTextWrap}>
              <Text style={styles.routeRowLabel}>Origin</Text>
              <Text style={styles.routeLabel} numberOfLines={2}>{pickup}</Text>
            </View>
          </View>

          <View style={[styles.routeRow, styles.routeRowBottom]}>
            <View style={styles.routeDotOuterRed}>
              <View style={[styles.routeDotInner, styles.routeDotRed]} />
            </View>
            <View style={styles.routeTextWrap}>
              <Text style={styles.routeRowLabel}>Destination</Text>
              <Text style={styles.routeLabel} numberOfLines={2}>{drop}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Meta grid */}
      <View style={styles.metaGrid}>
        <MetaCell
          label="CLIENT"
          value={displayClient}
          icon="building-o"
        />
        <MetaCell
          label="DISTANCE"
          value={trip.distance ? `${trip.distance} Km` : "—"}
          icon="road"
        />
        <MetaCell
          label="MATERIAL"
          value={trip.load_type ?? "—"}
          icon="cube"
          italic={!trip.load_type}
        />
        <MetaCell
          label="FREIGHT AMOUNT"
          value={freightAmount}
          icon="money"
          highlight
        />
        {(trip as any).weight ? (
          <MetaCell
            label="WEIGHT"
            value={`${(trip as any).weight} Tons`}
            icon="balance-scale"
          />
        ) : null}
      </View>
    </View>
  );
}

function MetaCell({
  label,
  value,
  icon,
  highlight,
  italic,
}: {
  label: string;
  value: string;
  icon?: string;
  highlight?: boolean;
  italic?: boolean;
}) {
  return (
    <View style={styles.metaCell}>
      <View style={styles.metaCellLabelRow}>
        {icon ? (
          <FontAwesome name={icon as any} size={9} color="#94a3b8" />
        ) : null}
        <Text style={styles.metaCellLabel}>{label}</Text>
      </View>
      {highlight ? (
        <View style={styles.metaCellHighlightWrap}>
          <Text style={styles.metaCellHighlightText}>{value}</Text>
        </View>
      ) : (
        <Text
          style={[
            styles.metaCellValue,
            italic && styles.metaCellValueItalic,
          ]}
          numberOfLines={2}
        >
          {value}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },

  // Header
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tripNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#cbd5e1",
  },
  stopsBadge: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stopsBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  billingType: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94a3b8",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  // Route
  routeSection: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
  },
  routeContainer: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    paddingVertical: 20,
    paddingRight: 16,
    paddingLeft: 48,
    position: "relative",
  },
  routeLine: {
    position: "absolute",
    left: 27,
    top: 32,
    bottom: 32,
    width: 2,
    backgroundColor: "#e2e8f0",
    borderRadius: 1,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  routeRowBottom: {
    marginTop: 28,
  },
  routeDotOuterGreen: {
    position: "absolute",
    left: -35,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  routeDotOuterRed: {
    position: "absolute",
    left: -35,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(244, 63, 94, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  routeDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeDotGreen: {
    backgroundColor: "#10b981",
  },
  routeDotRed: {
    backgroundColor: "#f43f5e",
  },
  routeTextWrap: {
    flex: 1,
  },
  routeRowLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  routeLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    lineHeight: 22,
  },

  // Meta grid
  metaGrid: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  metaCell: {
    width: "50%",
    paddingTop: 16,
    paddingRight: 12,
  },
  metaCellLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 5,
  },
  metaCellLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  metaCellValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e293b",
    lineHeight: 18,
  },
  metaCellValueItalic: {
    color: "#94a3b8",
    fontStyle: "italic",
    fontWeight: "400",
  },
  metaCellHighlightWrap: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  metaCellHighlightText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
});
