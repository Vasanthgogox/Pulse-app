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
  const driverDisplay =
    driverName ?? trip.driver_display_name ?? trip.driver_id ?? null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardTitle}>Assignments</Text>
          <Text style={styles.cardSubtitle}>Manage vehicle and personnel</Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* Vehicle row */}
        <AssignmentRow
          icon="truck"
          typeLabel="Vehicle"
          valueLabel={vehicleDisplay}
          isOnline={isVehicleOnline}
          canAssign={canAssign}
          onChangePress={onChangeVehicle}
          onRemovePress={vehicleDisplay ? onRemoveVehicle : undefined}
          onViewDetails={vehicleDisplay ? onViewVehicleDetails : undefined}
        />

        {/* Driver row */}
        <AssignmentRow
          icon="id-card"
          typeLabel="Driver"
          valueLabel={driverDisplay}
          isOnline={isDriverOnline}
          canAssign={canAssign}
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
  canAssign: boolean;
  onChangePress?: () => void;
  onRemovePress?: () => void;
  onViewDetails?: () => void;
}

function AssignmentRow({
  icon,
  typeLabel,
  valueLabel,
  isOnline,
  canAssign,
  onChangePress,
  onRemovePress: _onRemovePress,
  onViewDetails: _onViewDetails,
}: AssignmentRowProps) {
  const isAssigned = !!valueLabel;

  return (
    <View style={[styles.row, isAssigned ? styles.rowAssigned : styles.rowUnassigned]}>
      <View style={[styles.rowIconWrap, isAssigned ? styles.rowIconAssigned : styles.rowIconEmpty]}>
        <FontAwesome
          name={icon}
          size={isAssigned ? 20 : 18}
          color={isAssigned ? "#2563eb" : "#9ca3af"}
        />
      </View>

      <View style={styles.rowInfo}>
        <Text style={styles.rowTypeLabel}>{typeLabel}</Text>
        <View style={styles.rowValueRow}>
          <Text
            style={[
              styles.rowValue,
              !isAssigned && styles.rowValueEmpty,
              !isAssigned && styles.rowValueItalic,
            ]}
          >
            {valueLabel ?? "Unassigned"}
          </Text>
          {isAssigned ? (
            <View
              style={[
                styles.onlineDot,
                { backgroundColor: isOnline ? "#10b981" : "#e2e8f0" },
              ]}
            />
          ) : null}
        </View>
      </View>

      {canAssign ? (
        <TouchableOpacity
          style={isAssigned ? styles.changeBtn : styles.assignBtn}
          onPress={onChangePress}
          activeOpacity={0.8}
        >
          <Text style={isAssigned ? styles.changeBtnText : styles.assignBtnText}>
            {isAssigned ? "Change" : "Assign"}
          </Text>
        </TouchableOpacity>
      ) : null}
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
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },
  body: {
    padding: 16,
    gap: 10,
  },

  // Row cards
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  rowAssigned: {
    backgroundColor: "#fff",
    borderColor: "#e2e8f0",
  },
  rowUnassigned: {
    backgroundColor: "#fafafa",
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
  },
  rowIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconAssigned: {
    backgroundColor: "#eff6ff",
  },
  rowIconEmpty: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
  },
  rowTypeLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  rowValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
  },
  rowValueEmpty: {
    color: "#94a3b8",
  },
  rowValueItalic: {
    fontStyle: "italic",
    fontWeight: "500",
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Buttons
  changeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  changeBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563eb",
  },
  assignBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  assignBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#374151",
  },
});
