/**
 * Middle-column Truck Assignment card — matches reference design.
 * Shows truck and driver with Change / Remove actions.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { TripRow } from "../../../services/trips.service";

interface TruckAssignmentCardProps {
  trip: TripRow;
  vehicleLabel: string | null;
  driverName: string | null;
  isDriverOnline?: boolean;
  isVehicleOnline?: boolean;
  canAssign?: boolean;
  onChangeVehicle?: () => void;
  onRemoveVehicle?: () => void;
  onViewVehicleDetails?: () => void;
  onChangeDriver?: () => void;
  onRemoveDriver?: () => void;
  onViewDriverDetails?: () => void;
}

export function TruckAssignmentCard({
  trip,
  vehicleLabel,
  driverName,
  isDriverOnline = false,
  isVehicleOnline = false,
  canAssign = false,
  onChangeVehicle,
  onRemoveVehicle,
  onViewVehicleDetails,
  onChangeDriver,
  onRemoveDriver,
  onViewDriverDetails,
}: TruckAssignmentCardProps) {
  const vehicleDisplay =
    vehicleLabel ?? trip.vehicle_display_number ?? trip.vehicle_id ?? null;
  const driverDisplay = driverName ?? trip.driver_display_name ?? trip.driver_id ?? null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Truck Assignment</Text>
        <Text style={styles.cardSubtitle}>Manage truck and driver details</Text>
      </View>

      <View style={styles.body}>
        {/* Truck row */}
        <AssignmentRow
          icon="truck"
          typeLabel="Truck"
          valueLabel={vehicleDisplay}
          isOnline={isVehicleOnline}
          unassignedText="No truck assigned"
          canChange={canAssign}
          onChangePress={onChangeVehicle}
          onRemovePress={vehicleDisplay ? onRemoveVehicle : undefined}
          onViewDetails={vehicleDisplay ? onViewVehicleDetails : undefined}
        />

        <View style={styles.separator} />

        {/* Driver row */}
        <AssignmentRow
          icon="id-card"
          typeLabel="Driver"
          valueLabel={driverDisplay}
          isOnline={isDriverOnline}
          unassignedText="No driver assigned"
          canChange={canAssign}
          onChangePress={onChangeDriver}
          onRemovePress={driverDisplay ? onRemoveDriver : undefined}
          onViewDetails={driverDisplay ? onViewDriverDetails : undefined}
        />
      </View>
    </View>
  );
}

interface AssignmentRowProps {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  typeLabel: string;
  valueLabel: string | null;
  isOnline: boolean;
  unassignedText: string;
  canChange: boolean;
  onChangePress?: () => void;
  onRemovePress?: () => void;
  onViewDetails?: () => void;
}

function AssignmentRow({
  icon,
  typeLabel,
  valueLabel,
  isOnline,
  unassignedText,
  canChange,
  onChangePress,
  onRemovePress,
  onViewDetails,
}: AssignmentRowProps) {
  return (
    <View style={styles.row}>
      {/* Icon */}
      <View style={styles.rowIconWrap}>
        <FontAwesome name={icon} size={20} color="#374151" />
      </View>

      {/* Info */}
      <View style={styles.rowInfo}>
        <Text style={styles.rowTypeLabel}>{typeLabel}</Text>
        <View style={styles.rowValueRow}>
          <Text style={[styles.rowValue, !valueLabel && styles.rowValueEmpty]}>
            {valueLabel ?? unassignedText}
          </Text>
          {valueLabel ? (
            <View
              style={[
                styles.onlineDot,
                { backgroundColor: isOnline ? "#22c55e" : "#d1d5db" },
              ]}
            />
          ) : null}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.rowActions}>
        {canChange ? (
          <>
            <ActionButton label="Change" onPress={onChangePress} variant="outline" />
            {onRemovePress ? (
              <ActionButton label="Remove" onPress={onRemovePress} variant="outline-danger" />
            ) : null}
          </>
        ) : null}
      </View>

      {/* View Details link */}
      {onViewDetails ? (
        <TouchableOpacity onPress={onViewDetails} style={styles.viewDetailsBtn} activeOpacity={0.7}>
          <Text style={styles.viewDetailsText}>View Details</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  variant,
}: {
  label: string;
  onPress?: () => void;
  variant: "outline" | "outline-danger";
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.actionBtn, variant === "outline-danger" && styles.actionBtnDanger]}
      activeOpacity={0.8}
    >
      <Text
        style={[
          styles.actionBtnText,
          variant === "outline-danger" && styles.actionBtnTextDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
  cardHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  body: {
    paddingHorizontal: 20,
  },
  separator: {
    height: 1,
    backgroundColor: "#f3f4f6",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
  },
  rowTypeLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  rowValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  rowValueEmpty: {
    color: "#9ca3af",
    fontStyle: "italic",
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowActions: {
    flexDirection: "row",
    gap: 6,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: Theme.screenBackground,
  },
  actionBtnDanger: {
    borderColor: "#fca5a5",
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  actionBtnTextDanger: {
    color: "#ef4444",
  },
  viewDetailsBtn: {
    paddingLeft: 4,
  },
  viewDetailsText: {
    fontSize: 11,
    color: "#6b7280",
    textDecorationLine: "underline",
  },
});
