/**
 * Fleet assign UI — same TripAssignmentWorkspace chrome as reassign,
 * with Swap = pick from org roster and Confirm = save assignment.
 *
 * Selection is owned locally so parent auto-preview effects cannot clobber taps.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Plus } from "lucide-react-native";
import { useRouter } from "expo-router";

import Theme from "@/constants/Theme";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import {
  TripAssignmentWorkspace,
  type AssignmentPanelAction,
  type ChangeReasonCode,
} from "@/features/trips/components/assignment/TripAssignmentWorkspace";
import { aws } from "@/features/trips/components/assignment/tripAssignmentWorkspace.styles";
import type { TripRow } from "@/features/trips/services/trips.service";
import { formatIndianVehicleNumber, formatMobileNumber } from "@/lib/format";

type Props = {
  trip: TripRow;
  organizationId: string;
  drivers: DriverRow[];
  vehicles: VehicleRow[];
  driversLoading?: boolean;
  vehiclesLoading?: boolean;
  activeDriverIds: Set<string>;
  activeVehicleIds: Set<string>;
  activeDriverTripLabelById: Record<string, string>;
  activeVehicleTripLabelById: Record<string, string>;
  /** Initial selection (trip current or parent preview). */
  initialDriverId?: string | null;
  initialVehicleId?: string | null;
  saving: boolean;
  onConfirm: (driverId: string, vehicleId: string) => void | Promise<void>;
  onClose: () => void;
  onBeforeRegisterNavigate?: () => void;
  focus?: "driver" | "vehicle";
};

function pilotCode(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  const a = (p[0]?.[0] ?? "?").toUpperCase();
  const b = (p[1]?.[0] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

function vehicleCode(v: VehicleRow) {
  const plate = formatIndianVehicleNumber(v.vehicle_number).replace(/\s/g, "");
  return plate.slice(-3).toUpperCase() || "V";
}

/** Nested fleet roster list — must use a bounded scrollport (RN Web ignores overflowY on View). */
function AssetPickList({ children }: { children: ReactNode }) {
  if (Platform.OS === "web") {
    return (
      <div
        data-fleet-pick-list="1"
        style={{
          width: "100%",
          height: 260,
          maxHeight: 260,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingBottom: 4,
          boxSizing: "border-box",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
        onWheel={(e) => {
          const el = e.currentTarget;
          // Only trap wheel when the list can actually scroll.
          if (el.scrollHeight > el.clientHeight + 1) {
            e.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    );
  }
  return (
    <ScrollView
      style={styles.listScroll}
      contentContainerStyle={styles.listStack}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      {children}
    </ScrollView>
  );
}

export function FleetAssignWorkspace({
  trip,
  organizationId,
  drivers,
  vehicles,
  driversLoading = false,
  vehiclesLoading = false,
  activeDriverIds,
  activeVehicleIds,
  activeDriverTripLabelById,
  activeVehicleTripLabelById,
  initialDriverId = null,
  initialVehicleId = null,
  saving,
  onConfirm,
  onClose,
  onBeforeRegisterNavigate,
  focus = "driver",
}: Props) {
  const router = useRouter();
  const [driverAction, setDriverAction] = useState<AssignmentPanelAction>("SWAP");
  const [vehicleAction, setVehicleAction] = useState<AssignmentPanelAction>("SWAP");
  const [driverSearch, setDriverSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [changeReason, setChangeReason] =
    useState<ChangeReasonCode>("AD_HOC_SUBSTITUTION");
  const [changeRemarks, setChangeRemarks] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(
    initialDriverId ?? trip.driver_id ?? null,
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    initialVehicleId ?? trip.vehicle_id ?? null,
  );

  // Seed once when roster arrives (do not fight later user taps).
  useEffect(() => {
    if (selectedDriverId) return;
    const seed = initialDriverId ?? trip.driver_id;
    if (seed && drivers.some((d) => d.id === seed)) {
      setSelectedDriverId(seed);
    }
  }, [drivers, initialDriverId, trip.driver_id, selectedDriverId]);

  useEffect(() => {
    if (selectedVehicleId) return;
    const seed = initialVehicleId ?? trip.vehicle_id;
    if (seed && vehicles.some((v) => v.id === seed)) {
      setSelectedVehicleId(seed);
    }
  }, [vehicles, initialVehicleId, trip.vehicle_id, selectedVehicleId]);

  useEffect(() => {
    if (focus === "vehicle") setVehicleAction("SWAP");
    else setDriverAction("SWAP");
  }, [focus]);

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === selectedDriverId) ?? null,
    [drivers, selectedDriverId],
  );
  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId],
  );

  const filteredDrivers = useMemo(() => {
    const q = driverSearch.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter(
      (d) =>
        (d.name ?? "").toLowerCase().includes(q) ||
        (d.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "")),
    );
  }, [drivers, driverSearch]);

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => {
      const plate = formatIndianVehicleNumber(v.vehicle_number).toLowerCase();
      const type = (v.vehicle_type ?? "").toLowerCase();
      return plate.includes(q) || type.includes(q);
    });
  }, [vehicles, vehicleSearch]);

  const isDriverBusy = useCallback(
    (id: string) => activeDriverIds.has(id) && id !== trip.driver_id,
    [activeDriverIds, trip.driver_id],
  );
  const isVehicleBusy = useCallback(
    (id: string) => activeVehicleIds.has(id) && id !== trip.vehicle_id,
    [activeVehicleIds, trip.vehicle_id],
  );

  const driverDisplayName =
    selectedDriver?.name?.trim() ||
    trip.driver_display_name?.trim() ||
    "Select driver";
  const driverPhoneDisplay = selectedDriver?.phone
    ? formatMobileNumber(selectedDriver.phone)
    : null;
  const vehicleDisplayLabel = selectedVehicle
    ? formatIndianVehicleNumber(selectedVehicle.vehicle_number)
    : trip.vehicle_display_number
      ? formatIndianVehicleNumber(trip.vehicle_display_number)
      : "Select vehicle";

  const canConfirm =
    !!selectedDriverId &&
    !!selectedVehicleId &&
    !isDriverBusy(selectedDriverId) &&
    !isVehicleBusy(selectedVehicleId);

  const handleConfirm = useCallback(async () => {
    if (!selectedDriverId || !selectedVehicleId || !canConfirm) return;
    await onConfirm(selectedDriverId, selectedVehicleId);
    setToast("Assignment saved to trip manifest.");
    setTimeout(() => setToast(null), 3000);
  }, [onConfirm, selectedDriverId, selectedVehicleId, canConfirm]);

  const openAddDriver = () => {
    onClose();
    onBeforeRegisterNavigate?.();
    router.push("/(modals)/add-driver");
  };
  const openAddVehicle = () => {
    onClose();
    onBeforeRegisterNavigate?.();
    router.push("/(modals)/add-vehicle");
  };

  const selectDriver = (id: string) => {
    if (isDriverBusy(id)) return;
    setSelectedDriverId(id);
    setDriverAction("EDIT");
  };

  const selectVehicle = (id: string) => {
    if (isVehicleBusy(id)) return;
    setSelectedVehicleId(id);
    setVehicleAction("EDIT");
  };

  const driverPanelBody =
    driverAction === "SWAP" ? (
      <View style={styles.panelStack}>
        <Text style={aws.sectionHint}>Select on-duty fleet driver</Text>
        <View style={styles.searchWrap}>
          <FontAwesome
            name="search"
            size={12}
            color={Theme.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={driverSearch}
            onChangeText={setDriverSearch}
            placeholder="Search name or phone…"
            placeholderTextColor={Theme.textMuted}
          />
        </View>
        <Pressable
          onPress={openAddDriver}
          style={({ pressed }) => [styles.row, styles.addRow, pressed && styles.rowPressed]}
        >
          <View style={styles.addIcon}>
            <Plus size={18} color={Theme.textMuted} strokeWidth={3} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Add new driver</Text>
            <Text style={styles.rowSub}>
              Opens a short form; they appear in your fleet next time.
            </Text>
          </View>
        </Pressable>
        {driversLoading ? (
          <ActivityIndicator color={Theme.primary} style={{ marginVertical: 16 }} />
        ) : (
          <AssetPickList>
            {filteredDrivers.map((d) => {
              const busy = isDriverBusy(d.id);
              const selected = selectedDriverId === d.id;
              return (
                <Pressable
                  key={d.id}
                  disabled={busy}
                  onPress={() => selectDriver(d.id)}
                  style={({ pressed }) => [
                    styles.row,
                    selected && styles.rowSelectedDriver,
                    busy && styles.rowBusy,
                    pressed && !busy && styles.rowPressed,
                  ]}
                >
                  <View style={[aws.snapshotAvatarDriver, styles.avatarSm]}>
                    <Text style={[aws.snapshotAvatarText, { fontSize: 13 }]}>
                      {pilotCode(d.name ?? "?")}
                    </Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {d.name ?? "—"}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {busy
                        ? `Already in ${activeDriverTripLabelById[d.id] ?? "another trip"}`
                        : d.phone
                          ? formatMobileNumber(d.phone)
                          : "Ready"}
                    </Text>
                  </View>
                  {selected ? (
                    <FontAwesome
                      name="check-circle"
                      size={18}
                      color={Theme.networkHubListCardConnectedText}
                    />
                  ) : null}
                </Pressable>
              );
            })}
            {filteredDrivers.length === 0 ? (
              <Text style={styles.emptyText}>No drivers match your search.</Text>
            ) : null}
          </AssetPickList>
        )}
      </View>
    ) : (
      <View style={styles.panelStack}>
        <View style={aws.sectionHintRow}>
          <Text style={aws.sectionHint}>Selected driver details</Text>
          <Text style={aws.kycHint}>Fleet record</Text>
        </View>
        <View style={styles.fieldStack}>
          <View>
            <Text style={aws.fieldLabel}>Driver full name</Text>
            <TextInput
              style={[aws.input, styles.readOnly]}
              value={selectedDriver?.name ?? ""}
              editable={false}
              placeholder="Pick a driver in Swap"
              placeholderTextColor={Theme.textMuted}
            />
          </View>
          <View>
            <Text style={aws.fieldLabel}>Mobile contact no.</Text>
            <TextInput
              style={[aws.input, styles.readOnly]}
              value={
                selectedDriver?.phone
                  ? formatMobileNumber(selectedDriver.phone)
                  : ""
              }
              editable={false}
              placeholder="Phone from fleet profile"
              placeholderTextColor={Theme.textMuted}
            />
          </View>
        </View>
        <Pressable
          onPress={() => setDriverAction("SWAP")}
          style={({ pressed }) => [styles.switchLink, pressed && { opacity: 0.7 }]}
        >
          <FontAwesome name="refresh" size={12} color={Theme.networkHubListCardConnectedText} />
          <Text style={styles.switchLinkText}>Swap to another driver</Text>
        </Pressable>
      </View>
    );

  const vehiclePanelBody =
    vehicleAction === "SWAP" ? (
      <View style={styles.panelStack}>
        <Text style={aws.sectionHint}>Select available registered truck</Text>
        <View style={styles.searchWrap}>
          <FontAwesome
            name="search"
            size={12}
            color={Theme.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={vehicleSearch}
            onChangeText={setVehicleSearch}
            placeholder="Search reg no or type…"
            placeholderTextColor={Theme.textMuted}
          />
        </View>
        <Pressable
          onPress={openAddVehicle}
          style={({ pressed }) => [styles.row, styles.addRow, pressed && styles.rowPressed]}
        >
          <View style={styles.addIcon}>
            <Plus size={18} color={Theme.textMuted} strokeWidth={3} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Add new vehicle</Text>
            <Text style={styles.rowSub}>
              Opens a short form; they appear in your fleet next time.
            </Text>
          </View>
        </Pressable>
        {vehiclesLoading ? (
          <ActivityIndicator color={Theme.primary} style={{ marginVertical: 16 }} />
        ) : (
          <AssetPickList>
            {filteredVehicles.map((v) => {
              const busy = isVehicleBusy(v.id);
              const selected = selectedVehicleId === v.id;
              const plate = formatIndianVehicleNumber(v.vehicle_number);
              return (
                <Pressable
                  key={v.id}
                  disabled={busy}
                  onPress={() => selectVehicle(v.id)}
                  style={({ pressed }) => [
                    styles.row,
                    selected && styles.rowSelectedVehicle,
                    busy && styles.rowBusy,
                    pressed && !busy && styles.rowPressed,
                  ]}
                >
                  <View style={[aws.snapshotAvatarVehicle, styles.avatarSm]}>
                    <Text style={[aws.snapshotAvatarText, { fontSize: 11 }]}>
                      {vehicleCode(v)}
                    </Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {plate}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {busy
                        ? `Already in ${activeVehicleTripLabelById[v.id] ?? "another trip"}`
                        : v.vehicle_type ?? "Available"}
                    </Text>
                  </View>
                  {selected ? (
                    <FontAwesome
                      name="check-circle"
                      size={18}
                      color={Theme.assignmentVehicleAccent}
                    />
                  ) : null}
                </Pressable>
              );
            })}
            {filteredVehicles.length === 0 ? (
              <Text style={styles.emptyText}>No vehicles match your search.</Text>
            ) : null}
          </AssetPickList>
        )}
      </View>
    ) : (
      <View style={styles.panelStack}>
        <View style={aws.sectionHintRow}>
          <Text style={aws.sectionHint}>Selected vehicle details</Text>
          <Text style={[aws.kycHint, { color: Theme.assignmentVehicleAccent }]}>RC verified</Text>
        </View>
        <View style={styles.fieldStack}>
          <View>
            <Text style={aws.fieldLabel}>Registration no</Text>
            <TextInput
              style={[aws.input, styles.readOnly, { fontWeight: "800" }]}
              value={
                selectedVehicle
                  ? formatIndianVehicleNumber(selectedVehicle.vehicle_number)
                  : ""
              }
              editable={false}
              placeholder="Pick a truck in Swap"
              placeholderTextColor={Theme.textMuted}
            />
          </View>
          <View>
            <Text style={aws.fieldLabel}>Container type / specs</Text>
            <TextInput
              style={[aws.input, styles.readOnly]}
              value={selectedVehicle?.vehicle_type ?? ""}
              editable={false}
              placeholder="From fleet record"
              placeholderTextColor={Theme.textMuted}
            />
          </View>
        </View>
        <Pressable
          onPress={() => setVehicleAction("SWAP")}
          style={({ pressed }) => [styles.switchLink, pressed && { opacity: 0.7 }]}
        >
          <FontAwesome
            name="refresh"
            size={12}
            color={Theme.assignmentVehicleAccent}
          />
          <Text
            style={[
              styles.switchLinkText,
              { color: Theme.assignmentVehicleAccent },
            ]}
          >
            Swap to another truck
          </Text>
        </Pressable>
      </View>
    );

  return (
    <View style={styles.root}>
      <TripAssignmentWorkspace
        trip={trip}
        organizationId={organizationId}
        driverDisplayName={driverDisplayName}
        driverPhoneDisplay={driverPhoneDisplay}
        vehicleDisplayLabel={vehicleDisplayLabel}
        vehicleCategory={selectedVehicle?.vehicle_type ?? null}
        fulfillmentMode="ASSET"
        fulfillmentModeEditable={false}
        driverAction={driverAction}
        onDriverActionChange={setDriverAction}
        vehicleAction={vehicleAction}
        onVehicleActionChange={setVehicleAction}
        driverPanelBody={driverPanelBody}
        vehiclePanelBody={vehiclePanelBody}
        changeReason={changeReason}
        onChangeReasonChange={setChangeReason}
        changeRemarks={changeRemarks}
        onChangeRemarksChange={setChangeRemarks}
        onConfirm={() => void handleConfirm()}
        confirmDisabled={!canConfirm || saving}
        confirmLoading={saving}
        confirmLabel="Confirm & assign"
        confirmHint={
          !selectedDriverId
            ? "Select a driver from Swap driver."
            : !selectedVehicleId
              ? "Select a vehicle from Swap truck."
              : !canConfirm
                ? "Selected resource is busy on another trip."
                : null
        }
        onClose={onClose}
        toastMessage={toast}
      />
    </View>
  );
}

const styles = {
  root: {
    flex: 1,
    width: "100%" as const,
    maxWidth: Platform.OS === "web" ? 1280 : undefined,
    alignSelf: "center" as const,
  },
  panelStack: {
    gap: 10,
    width: "100%" as const,
    flexGrow: 1,
    minHeight: 0,
  },
  searchWrap: {
    width: "100%" as const,
    position: "relative" as const,
  },
  searchIcon: {
    position: "absolute" as const,
    left: 12,
    top: 13,
    zIndex: 2,
  },
  searchInput: {
    ...aws.input,
    width: "100%" as const,
    paddingLeft: 34,
  },
  listScroll: {
    width: "100%" as const,
    height: 260,
    flexGrow: 0,
    flexShrink: 0,
  },
  listStack: {
    gap: 8,
    width: "100%" as const,
    paddingBottom: 4,
  },
  row: {
    width: "100%" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
    backgroundColor: Theme.surface,
    minHeight: 56,
  },
  addRow: {
    backgroundColor: Theme.cardWhite,
  },
  rowSelectedDriver: {
    borderColor: Theme.networkHubListCardConnectedText,
    backgroundColor: Theme.networkHubListCardConnectedBg,
  },
  rowSelectedVehicle: {
    borderColor: Theme.assignmentVehicleAccent,
    backgroundColor: Theme.assignmentVehicleAccentSoft,
  },
  rowBusy: {
    opacity: 0.5,
  },
  rowPressed: {
    opacity: 0.85,
  },
  addIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  avatarSm: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: Theme.textPrimaryDark,
  },
  rowSub: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 12,
    color: Theme.textMuted,
    paddingVertical: 8,
  },
  fieldStack: {
    gap: 12,
    width: "100%" as const,
  },
  readOnly: {
    opacity: 0.9,
  },
  switchLink: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 8,
  },
  switchLinkText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: Theme.networkHubListCardConnectedText,
  },
};
