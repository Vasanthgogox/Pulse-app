/**
 * Add Trip — form fields (pickup, drop, client, price, rate, notes) + 02 Asset Allocation (driver, vehicle).
 * Single inline client search; create-client sub-modal when adding new.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { formatIndianVehicleNumber, formatIndianVehicleNumberInput, formatMobileNumber } from "@/lib/format";
import { validatePhone } from "@/lib/phoneValidation";
import { type ClientRow } from "@/features/clients/services/clients.service";
import {
    getDriversByOrganization,
    searchExistingDriversByPhone,
    type DriverRow,
} from "@/features/drivers/services/drivers.service";
import {
    getSuppliersByOrganization,
    type SupplierRow,
} from "@/features/suppliers/services/suppliers.service";
import {
    getTripsByOrganization,
} from "@/features/trips/services/trips.service";
import {
    getVehiclesByOrganization,
    type VehicleRow,
} from "@/features/vehicles/services/vehicles.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Dimensions,
    FlatList,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { ClientSearchField } from "./ClientSearchField";
import { LocationSearchField } from "./LocationSearchField";
import type { AddTripFormState } from "./types";
import type { useAddTripForm } from "./useAddTripForm";

const inputStyle = {
  borderColor: Theme.borderInput,
  color: Theme.textPrimary,
  backgroundColor: Theme.surfaceForm,
};
const labelStyle = { color: Theme.textMutedDemo };

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: {
    paddingBottom: Layout.sectionSpacing + 8,
    flexGrow: 1,
  },
  sectionCard: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: Layout.screenPaddingHorizontal + 2,
    marginBottom: Layout.sectionSpacing,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Layout.headerPaddingBelowInset,
    paddingLeft: Layout.screenPaddingHorizontal - 4,
    borderLeftWidth: 4,
    borderLeftColor: Theme.primaryText,
  },
  sectionCardIcon: {
    marginRight: 10,
    opacity: 0.9,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  routeCard: {
    backgroundColor: Theme.darkSurface,
    borderRadius: 12,
    padding: Layout.screenPaddingHorizontal + 2,
    marginBottom: Layout.headerPaddingBelowInset,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  routeDot: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Theme.darkInputBg,
    borderRadius: 8,
    marginHorizontal: 6,
  },
  routeDotFirst: { marginLeft: 0 },
  routeDotLast: { marginRight: 0 },
  routeDotLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  routeDotValue: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textOnDark,
  },
  routeDotPlaceholder: {
    fontSize: 13,
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  routeArrow: {
    paddingHorizontal: 4,
  },
  routeSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: Layout.sectionSpacing - 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Theme.darkSurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  routeSummaryArrow: {
    marginRight: 8,
  },
  routeSummaryText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textOnDark,
    minWidth: 0,
  },
  routeStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.darkSurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    gap: 10,
  },
  routeStat: {
    flex: 1,
    minWidth: 0,
  },
  routeStatLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  routeStatValue: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  routeStatsLoadingText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal - 2,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: Layout.minTouchTargetSize,
    marginBottom: Layout.screenPaddingHorizontal - 2,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  pickerFieldWrap: {
    position: "relative",
    marginBottom: Layout.sectionSpacing,
  },
  pickerWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: Layout.screenPaddingHorizontal - 2,
  },
  pickerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  pickerPlaceholder: {
    color: Theme.placeholder,
    fontWeight: "500",
  },
  clearPick: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  clearPickText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.teslaRed,
    textTransform: "uppercase",
  },
  optionsList: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 10,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal - 2,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    minHeight: Layout.minTouchTargetSize,
  },
  optionRowActive: {
    backgroundColor: Theme.surfaceLight,
  },
  optionText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
    flex: 1,
  },
  sourceRow: {
    flexDirection: "row",
    gap: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  sourceOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Layout.headerPaddingBelowInset + 2,
    paddingHorizontal: Layout.screenPaddingHorizontal - 4,
    gap: 8,
    borderRightWidth: 1,
    borderRightColor: Theme.borderLight,
    minHeight: Layout.minTouchTargetSize,
  },
  sourceOptionLast: {
    borderRightWidth: 0,
  },
  sourceOptionActive: {
    backgroundColor: Theme.primaryText,
  },
  sourceOptionIconWrap: {
    width: Layout.minTouchTargetSize - 8,
    height: Layout.minTouchTargetSize - 8,
    borderRadius: (Layout.minTouchTargetSize - 8) / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceOptionIconWrapActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  sourceOptionIconWrapInactive: {
    backgroundColor: Theme.surfaceBorder,
  },
  sourceOptionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sourceOptionLabelActive: {
    color: Theme.textOnDark,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Layout.screenPaddingHorizontal - 4,
    marginBottom: Layout.screenPaddingHorizontal - 4,
  },
  checkLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  warningText: {
    fontSize: 12,
    color: Theme.teslaRed,
    fontWeight: "600",
  },
  hintText: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 4,
    marginBottom: 8,
  },
  driverFoundRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  driverFoundIcon: {
    marginRight: 6,
  },
  driverFoundText: {
    color: Theme.positive,
    fontWeight: "600",
    marginTop: 0,
    marginBottom: 0,
  },
  driverConfirmCard: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  driverConfirmCardConfirmed: {
    borderColor: Theme.darkGreen,
    backgroundColor: Theme.positiveMuted,
  },
  driverConfirmTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  driverConfirmMainText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginTop: 0,
    marginBottom: 0,
  },
  driverConfirmMainTextConfirmed: {
    color: Theme.darkGreen,
  },
  driverConfirmSubText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 3,
    marginBottom: 0,
  },
  driverConfirmActionText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.primary,
  },
  addOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  addOptionRowText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.primaryText,
  },
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  dropdownModalPositioned: {
    position: "absolute",
    height: 200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceForm,
    overflow: "hidden",
    elevation: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  pickerFlatList: {
    flex: 1,
    maxHeight: 198,
  },
  dropdownModalCard: {
    alignSelf: "stretch",
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    maxHeight: 340,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  dropdownModalTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Layout.headerPaddingBelowInset - 2,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  dropdownModalScroll: {
    maxHeight: 260,
  },
  dropdownModalScrollContent: {
    paddingVertical: 8,
    paddingBottom: Layout.screenPaddingHorizontal,
  },
  dropdownOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    minHeight: Layout.minTouchTargetSize,
  },
  dropdownOptionRowActive: {
    backgroundColor: Theme.surfaceLight,
  },
  dropdownOptionText: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimary,
    flex: 1,
  },
  dropdownAddRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    minHeight: Layout.minTouchTargetSize,
  },
  dropdownAddRowText: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.primary,
  },
});

const baseInput = [styles.input, inputStyle];
const label = [styles.label, labelStyle];

export interface AddTripFormFieldsProps {
  state: AddTripFormState;
  setters: ReturnType<typeof useAddTripForm>["setters"];
  clients: ClientRow[];
  clientsLoading: boolean;
  organizationId: string | null;
  refetchClients: () => void;
}

export function AddTripFormFields({
  state,
  setters,
  clients,
  clientsLoading,
  organizationId,
  refetchClients,
}: AddTripFormFieldsProps) {
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [pickupDropdownOpen, setPickupDropdownOpen] = useState(false);
  const [dropDropdownOpen, setDropDropdownOpen] = useState(false);
  const [pickerType, setPickerType] = useState<"driver" | "vehicle" | null>(
    null,
  );
  const [pickerLayout, setPickerLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [driverIdsOnActiveTrip, setDriverIdsOnActiveTrip] = useState<string[]>(
    [],
  );
  const [vehicleIdsOnActiveTrip, setVehicleIdsOnActiveTrip] = useState<
    string[]
  >([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const driverWrapRef = useRef<View>(null);
  const vehicleWrapRef = useRef<View>(null);

  useEffect(() => {
    if (!pickerType) {
      setPickerLayout(null);
      return;
    }
    setPickerLayout(null);
    const id = setTimeout(() => {
      const ref =
        pickerType === "driver"
          ? driverWrapRef.current
          : vehicleWrapRef.current;
      if (ref) {
        ref.measureInWindow((x, y, width, height) => {
          setPickerLayout({ x, y, width, height });
        });
      }
    }, 50);
    return () => clearTimeout(id);
  }, [pickerType]);

  const fetchFleet = useCallback(() => {
    if (!organizationId) return;
    setFleetLoading(true);
    Promise.all([
      getDriversByOrganization(organizationId),
      getVehiclesByOrganization(organizationId),
      getTripsByOrganization(organizationId),
    ]).then(([dRes, vRes, tRes]) => {
      const allDrivers = dRes.error ? [] : (dRes.drivers ?? []);
      setDrivers(allDrivers.filter((d) => !d.left_at));
      setVehicles(vRes.error ? [] : vRes.vehicles);
      const trips = tRes.error ? [] : (tRes.trips ?? []);
      const activeStatuses = ["assigned", "in_progress"];
      const activeTrips = trips.filter((t) =>
        activeStatuses.includes((t.status || "").toLowerCase()),
      );
      const busyDrivers = Array.from(
        new Set(
          activeTrips
            .filter((t) => t.driver_id)
            .map((t) => t.driver_id as string),
        ),
      );
      // Vehicle is busy only when it is on an active trip that has a driver assigned.
      // If a driver has no trip, their assigned vehicle stays free for create-trip.
      const busyVehicles = Array.from(
        new Set(
          activeTrips
            .filter((t) => t.vehicle_id && t.driver_id)
            .map((t) => t.vehicle_id as string),
        ),
      );
      setDriverIdsOnActiveTrip(busyDrivers);
      setVehicleIdsOnActiveTrip(busyVehicles);
      setFleetLoading(false);
    });
  }, [organizationId]);

  const fetchSuppliers = useCallback(() => {
    if (!organizationId) return;
    setSuppliersLoading(true);
    getSuppliersByOrganization(organizationId).then((r) => {
      setSuppliers(r.error ? [] : r.suppliers);
      setSuppliersLoading(false);
    });
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) fetchFleet();
  }, [organizationId, fetchFleet]);

  useEffect(() => {
    if (
      state.driverId &&
      driverIdsOnActiveTrip.length > 0 &&
      driverIdsOnActiveTrip.includes(state.driverId)
    ) {
      setters.setDriverId(null);
    }
  }, [state.driverId, driverIdsOnActiveTrip, setters]);

  useEffect(() => {
    if (
      state.vehicleId &&
      vehicleIdsOnActiveTrip.length > 0 &&
      vehicleIdsOnActiveTrip.includes(state.vehicleId)
    ) {
      setters.setVehicleId(null);
    }
  }, [state.vehicleId, vehicleIdsOnActiveTrip, setters]);

  useEffect(() => {
    if (organizationId && state.supplySource === "aggregate") fetchSuppliers();
  }, [organizationId, state.supplySource, fetchSuppliers]);

  const driverPhoneLookupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDriverPhoneNameRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.supplySource !== "aggregate") return;
    const trimmed = state.driverPhone.trim();
    if (!trimmed) {
      setters.setDriverPhoneName(null);
      lastDriverPhoneNameRef.current = null;
      setters.setDriverPhoneConfirmed(false);
      return;
    }
    if (driverPhoneLookupTimeoutRef.current) clearTimeout(driverPhoneLookupTimeoutRef.current);
    driverPhoneLookupTimeoutRef.current = setTimeout(() => {
      driverPhoneLookupTimeoutRef.current = null;
      const normalized = trimmed.replace(/\s+/g, "");
      if (normalized.length < 10) {
        setters.setDriverPhoneName(null);
        setters.setDriverPhoneConfirmed(false);
        return;
      }
      searchExistingDriversByPhone(normalized).then(({ error: err, matches }) => {
        if (err || !matches.length) {
          setters.setDriverPhoneName(null);
          setters.setDriverPhoneConfirmed(false);
          return;
        }
        const nextName = matches[0].full_name ?? null;
        setters.setDriverPhoneName(nextName);
        // If the resolved name changes, the user needs to confirm again.
        if (nextName && nextName !== lastDriverPhoneNameRef.current) {
          setters.setDriverPhoneConfirmed(false);
        }
        lastDriverPhoneNameRef.current = nextName;
      });
    }, 400);
    return () => {
      if (driverPhoneLookupTimeoutRef.current) clearTimeout(driverPhoneLookupTimeoutRef.current);
    };
  }, [state.supplySource, state.driverPhone, setters]);

  const handleSelectClient = (c: ClientRow) => {
    setters.setClientSelection(c.id, c.name);
  };

  const closePicker = useCallback(() => setPickerType(null), []);
  const pickerOpen = pickerType !== null;
  const availableDrivers = drivers.filter(
    (d) => !driverIdsOnActiveTrip.includes(d.id),
  );
  const availableVehicles = vehicles.filter(
    (v) => !vehicleIdsOnActiveTrip.includes(v.id),
  );
  const pickerData =
    pickerType === "driver"
      ? availableDrivers
      : pickerType === "vehicle"
        ? availableVehicles
        : [];
  const selectedId =
    pickerType === "driver"
      ? state.driverId
      : pickerType === "vehicle"
        ? state.vehicleId
        : null;
  const setSelectedId =
    pickerType === "driver"
      ? setters.setDriverId
      : pickerType === "vehicle"
        ? setters.setVehicleId
        : () => {};

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={true}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={
        !clientDropdownOpen && !pickerOpen && !supplierDropdownOpen && !pickupDropdownOpen && !dropDropdownOpen
      }
    >
      {/* 01 — Route first, then client & price */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionCardHeader}>
          <FontAwesome
            name="map-marker"
            size={14}
            color={Theme.primaryText}
            style={styles.sectionCardIcon}
          />
          <Text style={styles.sectionTitle}>01 — Route</Text>
        </View>
        <LocationSearchField
          label="Pickup area *"
          placeholder="e.g. Mumbai, BKC"
          value={state.pickupArea}
          onChangeText={setters.setPickupArea}
          onSelectPlace={(_name, coords) => setters.setPickupCoords(coords.lat, coords.lon)}
          inputStyle={baseInput}
          labelStyle={label}
          onDropdownOpenChange={setPickupDropdownOpen}
        />
        <LocationSearchField
          label="Drop location *"
          placeholder="e.g. Pune, Hinjewadi"
          value={state.dropLocation}
          onChangeText={setters.setDropLocation}
          onSelectPlace={(_name, coords) => setters.setDropCoords(coords.lat, coords.lon)}
          inputStyle={baseInput}
          labelStyle={label}
          onDropdownOpenChange={setDropDropdownOpen}
        />
        {state.pickupArea.trim() && state.dropLocation.trim() ? (
          <View style={styles.routeSummaryRow}>
            <FontAwesome name="long-arrow-right" size={12} color={Theme.teslaRed} style={styles.routeSummaryArrow} />
            <Text style={styles.routeSummaryText} numberOfLines={1}>
              {state.pickupArea.trim()} → {state.dropLocation.trim()}
            </Text>
          </View>
        ) : null}

        {(state.routeLoading || state.routeDistanceKm != null || state.routeEtaLabel != null) ? (
          <View style={styles.routeStatsRow}>
            <View style={styles.routeStat}>
              <Text style={styles.routeStatLabel}>Distance</Text>
              <Text style={styles.routeStatValue}>
                {state.routeLoading ? "…" : state.routeDistanceKm != null ? `${state.routeDistanceKm} km` : "—"}
              </Text>
            </View>
            <View style={styles.routeStat}>
              <Text style={styles.routeStatLabel}>ETA</Text>
              <Text style={styles.routeStatValue}>
                {state.routeLoading ? "…" : state.routeEtaLabel != null ? state.routeEtaLabel : "—"}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.sectionCardHeader}>
          <FontAwesome
            name="user"
            size={14}
            color={Theme.primaryText}
            style={styles.sectionCardIcon}
          />
          <Text style={styles.sectionTitle}>02 — Client & price</Text>
        </View>
        <ClientSearchField
          clients={clients}
          loading={clientsLoading}
          selectedId={state.clientId}
          clientName={state.clientName}
          onSelectClient={handleSelectClient}
          onClearSelection={setters.clearClientSelection}
          onClientNameChange={setters.setClientName}
          showCreateClientOption={false}
          onDropdownOpenChange={setClientDropdownOpen}
          inputStyle={baseInput}
          labelStyle={label}
        />
        <Text style={label}>Client sales price (₹) *</Text>
        <TextInput
          style={baseInput}
          placeholder="0"
          placeholderTextColor={Theme.placeholder}
          value={state.clientPrice}
          onChangeText={setters.setClientPrice}
          keyboardType="decimal-pad"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
        />
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionCardHeader}>
          <FontAwesome
            name="cube"
            size={14}
            color={Theme.primaryText}
            style={styles.sectionCardIcon}
          />
          <Text style={styles.sectionTitle}>03 — Source of supply</Text>
        </View>
        <View style={styles.sourceRow}>
          <TouchableOpacity
            style={[
              styles.sourceOption,
              state.supplySource === "asset" && styles.sourceOptionActive,
            ]}
            onPress={() => setters.setSupplySource("asset")}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.sourceOptionIconWrap,
                state.supplySource === "asset"
                  ? styles.sourceOptionIconWrapActive
                  : styles.sourceOptionIconWrapInactive,
              ]}
            >
              <FontAwesome
                name="truck"
                size={16}
                color={
                  state.supplySource === "asset"
                    ? Theme.textOnDark
                    : Theme.textMuted
                }
              />
            </View>
            <Text
              style={[
                styles.sourceOptionLabel,
                state.supplySource === "asset" &&
                  styles.sourceOptionLabelActive,
              ]}
            >
              Asset
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sourceOption,
              styles.sourceOptionLast,
              state.supplySource === "aggregate" && styles.sourceOptionActive,
            ]}
            onPress={() => setters.setSupplySource("aggregate")}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.sourceOptionIconWrap,
                state.supplySource === "aggregate"
                  ? styles.sourceOptionIconWrapActive
                  : styles.sourceOptionIconWrapInactive,
              ]}
            >
              <FontAwesome
                name="handshake-o"
                size={16}
                color={
                  state.supplySource === "aggregate"
                    ? Theme.textOnDark
                    : Theme.textMuted
                }
              />
            </View>
            <Text
              style={[
                styles.sourceOptionLabel,
                state.supplySource === "aggregate" &&
                  styles.sourceOptionLabelActive,
              ]}
            >
              Aggregate
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {state.supplySource === "asset" && (
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <FontAwesome
              name="truck"
              size={14}
              color={Theme.primaryText}
              style={styles.sectionCardIcon}
            />
            <Text style={styles.sectionTitle}>04 — Asset allocation</Text>
          </View>
          <View style={styles.checkRow}>
            <Switch
              value={state.assignLater}
              onValueChange={setters.setAssignLater}
              trackColor={{ false: Theme.borderInput, true: Theme.primaryText }}
              thumbColor={Theme.screenBackground}
            />
            <Text style={styles.checkLabel}>
              Assign later (vehicle & driver from trip detail)
            </Text>
          </View>
          {state.assignLater && (
            <Text
              style={[
                styles.warningText,
                { marginBottom: Layout.screenPaddingHorizontal - 4 },
              ]}
            >
              Vehicle & Driver must be assigned before trip start.
            </Text>
          )}
          <Text style={label}>Driver {!state.assignLater ? "*" : ""}</Text>
          <View
            ref={driverWrapRef}
            style={styles.pickerFieldWrap}
            collapsable={false}
          >
            <View style={styles.pickerWrap}>
              <TouchableOpacity
                style={[baseInput, styles.pickerBtn]}
                onPress={() =>
                  !fleetLoading &&
                  !state.assignLater &&
                  setPickerType((t) => (t === "driver" ? null : "driver"))
                }
                activeOpacity={0.7}
                disabled={fleetLoading}
              >
                <Text
                  style={[
                    styles.pickerText,
                    !state.driverId && styles.pickerPlaceholder,
                  ]}
                  numberOfLines={1}
                >
                  {fleetLoading
                    ? "Loading…"
                    : state.driverId
                      ? (drivers.find((d) => d.id === state.driverId)?.name ??
                        "Selected")
                      : state.assignLater
                        ? "Assign from trip detail"
                        : "Select driver *"}
                </Text>
                <FontAwesome
                  name="chevron-down"
                  size={14}
                  color={Theme.textMutedDemo}
                />
              </TouchableOpacity>
              {state.driverId && (
                <TouchableOpacity
                  style={styles.clearPick}
                  onPress={() => setters.setDriverId(null)}
                  hitSlop={8}
                >
                  <Text style={styles.clearPickText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {!state.assignLater && availableDrivers.length === 0 && !fleetLoading && (
            <Text style={styles.hintText}>
              {drivers.length === 0
                ? "No drivers yet. Add drivers from Resources → Drivers first."
                : "All drivers are currently on a trip. Assign later or try again when a driver is free."}
            </Text>
          )}
          <Text style={label}>Vehicle {!state.assignLater ? "*" : ""}</Text>
          <View
            ref={vehicleWrapRef}
            style={styles.pickerFieldWrap}
            collapsable={false}
          >
            <View style={styles.pickerWrap}>
              <TouchableOpacity
                style={[baseInput, styles.pickerBtn]}
                onPress={() =>
                  !fleetLoading &&
                  !state.assignLater &&
                  setPickerType((t) => (t === "vehicle" ? null : "vehicle"))
                }
                activeOpacity={0.7}
                disabled={fleetLoading}
              >
                <Text
                  style={[
                    styles.pickerText,
                    !state.vehicleId && styles.pickerPlaceholder,
                  ]}
                  numberOfLines={1}
                >
                  {fleetLoading
                    ? "Loading…"
                    : state.vehicleId
                      ? (formatIndianVehicleNumber(vehicles.find((v) => v.id === state.vehicleId)?.vehicle_number ?? "") || "Selected")
                      : state.assignLater
                        ? "Assign from trip detail"
                        : "Select vehicle *"}
                </Text>
                <FontAwesome
                  name="chevron-down"
                  size={14}
                  color={Theme.textMutedDemo}
                />
              </TouchableOpacity>
              {state.vehicleId && (
                <TouchableOpacity
                  style={styles.clearPick}
                  onPress={() => setters.setVehicleId(null)}
                  hitSlop={8}
                >
                  <Text style={styles.clearPickText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {!state.assignLater && availableVehicles.length === 0 && !fleetLoading && (
            <Text style={styles.hintText}>
              {vehicles.length === 0
                ? "No vehicles yet. Add vehicles from Resources → Vehicles first."
                : "All vehicles are currently on a trip. Assign later or try again when a vehicle is free."}
            </Text>
          )}
          {pickerOpen && pickerLayout && (
            <Modal
              visible
              transparent
              animationType="fade"
              onRequestClose={closePicker}
            >
              <View style={styles.dropdownModalOverlay}>
                <TouchableWithoutFeedback onPress={closePicker}>
                  <View style={StyleSheet.absoluteFill} />
                </TouchableWithoutFeedback>
                <View
                  style={[
                    styles.dropdownModalPositioned,
                    {
                      top: pickerLayout.y + pickerLayout.height + 4,
                      left: Layout.screenPaddingHorizontal,
                      width:
                        Dimensions.get("window").width -
                        2 * Layout.screenPaddingHorizontal,
                    },
                  ]}
                  onStartShouldSetResponder={() => true}
                >
                  <FlatList<(typeof pickerData)[number]>
                    data={pickerData}
                    keyExtractor={(item) => item.id}
                    style={styles.pickerFlatList}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                      const isSelected = item.id === selectedId;
                      const itemLabel =
                        pickerType === "driver"
                          ? (item as DriverRow).name
                          : `${formatIndianVehicleNumber((item as VehicleRow).vehicle_number)}${(item as VehicleRow).vehicle_type ? ` · ${(item as VehicleRow).vehicle_type}` : ""}`;
                      return (
                        <TouchableOpacity
                          style={[
                            styles.optionRow,
                            isSelected && styles.optionRowActive,
                          ]}
                          onPress={() => {
                            setSelectedId(isSelected ? null : item.id);
                            closePicker();
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.optionText} numberOfLines={1}>
                            {itemLabel}
                          </Text>
                          {isSelected && (
                            <FontAwesome
                              name="check"
                              size={12}
                              color={Theme.darkGreen}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    }}
                  />
                </View>
              </View>
            </Modal>
          )}
        </View>
      )}

      {state.supplySource === "aggregate" && (
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <FontAwesome
              name="users"
              size={14}
              color={Theme.primaryText}
              style={styles.sectionCardIcon}
            />
            <Text style={styles.sectionTitle}>04 — Associated partner</Text>
          </View>
          <Text style={label}>Associated Partner *</Text>
          <View style={styles.pickerWrap}>
            <TouchableOpacity
              style={[baseInput, styles.pickerBtn]}
              onPress={() =>
                !suppliersLoading && setSupplierDropdownOpen((prev) => !prev)
              }
              activeOpacity={0.7}
              disabled={suppliersLoading}
            >
              <Text
                style={[
                  styles.pickerText,
                  !state.supplierId && styles.pickerPlaceholder,
                ]}
                numberOfLines={1}
              >
                {suppliersLoading
                  ? "Loading…"
                  : state.supplierId
                    ? ((suppliers.find((s) => s.id === state.supplierId)
                        ?.company_name ||
                        suppliers.find((s) => s.id === state.supplierId)
                          ?.name) ??
                      "Selected")
                    : "Select partner"}
              </Text>
              <FontAwesome
                name={supplierDropdownOpen ? "chevron-up" : "chevron-down"}
                size={12}
                color={Theme.textMutedDemo}
              />
            </TouchableOpacity>
            {state.supplierId && (
              <TouchableOpacity
                style={styles.clearPick}
                onPress={() => {
                  setters.setSupplierId(null);
                  setSupplierDropdownOpen(false);
                }}
                hitSlop={8}
              >
                <Text style={styles.clearPickText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          {supplierDropdownOpen && (
            <Modal
              visible
              transparent
              animationType="fade"
              statusBarTranslucent
            >
              <View style={styles.dropdownModalOverlay}>
                <TouchableWithoutFeedback
                  onPress={() => setSupplierDropdownOpen(false)}
                >
                  <View style={StyleSheet.absoluteFill} />
                </TouchableWithoutFeedback>
                <View
                  style={styles.dropdownModalCard}
                  onStartShouldSetResponder={() => true}
                >
                  <Text style={styles.dropdownModalTitle}>Select partner</Text>
                  <ScrollView
                    style={styles.dropdownModalScroll}
                    contentContainerStyle={styles.dropdownModalScrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                    bounces
                  >
                    {suppliers.length === 0 ? (
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          {
                            padding: Layout.screenPaddingHorizontal,
                            color: Theme.textMuted,
                          },
                        ]}
                      >
                        No partners yet. Add suppliers from the Suppliers page
                        first.
                      </Text>
                    ) : (
                      suppliers.map((s) => (
                        <TouchableOpacity
                          key={s.id}
                          style={[
                            styles.dropdownOptionRow,
                            state.supplierId === s.id &&
                              styles.dropdownOptionRowActive,
                          ]}
                          onPress={() => {
                            setters.setSupplierId(
                              state.supplierId === s.id ? null : s.id,
                            );
                            setSupplierDropdownOpen(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={styles.dropdownOptionText}
                            numberOfLines={1}
                          >
                            {s.company_name ||
                              s.name ||
                              s.contact_person ||
                              "—"}
                          </Text>
                          {state.supplierId === s.id && (
                            <FontAwesome
                              name="check"
                              size={14}
                              color={Theme.darkGreen}
                            />
                          )}
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </View>
              </View>
            </Modal>
          )}
          <Text style={label}>Partner rate (₹) *</Text>
          <TextInput
            style={baseInput}
            placeholder="0"
            placeholderTextColor={Theme.placeholder}
            value={state.supplierRate}
            onChangeText={setters.setSupplierRate}
            keyboardType="decimal-pad"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
          <Text style={label}>Advance paid (₹)</Text>
          <TextInput
            style={baseInput}
            placeholder="Optional"
            placeholderTextColor={Theme.placeholder}
            value={state.advancePaid}
            onChangeText={setters.setAdvancePaid}
            keyboardType="decimal-pad"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
          <View style={[styles.checkRow, { marginTop: 12 }]}>
            <Switch
              value={state.assignLater}
              onValueChange={setters.setAssignLater}
              trackColor={{ false: Theme.borderInput, true: Theme.primaryText }}
              thumbColor={Theme.screenBackground}
            />
            <Text style={styles.checkLabel}>
              Assign later (vehicle & driver phone from trip detail)
            </Text>
          </View>
          {state.assignLater && (
            <Text
              style={[
                styles.warningText,
                { marginBottom: Layout.screenPaddingHorizontal - 4 },
              ]}
            >
              Vehicle & Driver must be assigned before trip start.
            </Text>
          )}
          <Text style={[styles.sectionTitle, { marginTop: 12, marginBottom: 6 }]}>
            DRIVER FOR TRACKING (PHONE) {!state.assignLater ? "*" : ""}
          </Text>
          <TextInput
            style={baseInput}
            placeholder={state.assignLater ? "e.g. +91 98765 43210 (optional)" : "e.g. +91 98765 43210 (required)"}
            placeholderTextColor={Theme.placeholder}
            value={state.driverPhone}
            onChangeText={(v) => setters.setDriverPhone(formatMobileNumber(v))}
            keyboardType="phone-pad"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="tel"
          />
          {state.driverPhoneName ? (
            <TouchableOpacity
              onPress={() => setters.setDriverPhoneConfirmed(!state.driverPhoneConfirmed)}
              activeOpacity={0.85}
              style={[
                styles.driverConfirmCard,
                state.driverPhoneConfirmed && styles.driverConfirmCardConfirmed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Confirm driver for tracking"
            >
              <View style={styles.driverConfirmTextWrap}>
                <Text
                  style={[
                    styles.driverConfirmMainText,
                    state.driverPhoneConfirmed && styles.driverConfirmMainTextConfirmed,
                  ]}
                  numberOfLines={1}
                >
                  {state.driverPhoneConfirmed
                    ? `Confirmed: ${state.driverPhoneName}`
                    : `Found: ${state.driverPhoneName}`}
                </Text>
                <Text style={styles.driverConfirmSubText}>
                  {state.driverPhoneConfirmed
                    ? "Tap again to change"
                    : "Tap to confirm before creating the trip"}
                </Text>
              </View>
              <FontAwesome
                name="check-circle"
                size={18}
                color={state.driverPhoneConfirmed ? Theme.darkGreen : Theme.primary}
              />
            </TouchableOpacity>
          ) : null}
          {state.driverPhoneName && state.driverPhoneConfirmed ? (
            <Text style={[styles.hintText, { marginTop: 8, fontSize: 11 }]}>
              Share the OTP with the driver; they must enter it in the app to claim this trip.
            </Text>
          ) : null}
          {(() => {
            const trimmed = state.driverPhone.trim();
            const normalizedLen = trimmed.replace(/\s+/g, "").length;
            const validLength = normalizedLen >= 10;
            const validationError = validatePhone(trimmed);
            const showNotFound =
              validLength && !validationError && !state.driverPhoneName;
            if (showNotFound) {
              return (
                <Text style={[styles.hintText, { marginTop: 4, color: Theme.textSecondary }]}>
                  No driver found for this number. You can still create the trip.
                </Text>
              );
            }
            return null;
          })()}
          {state.driverPhone.trim() && validatePhone(state.driverPhone.trim()) ? (
            <View style={[styles.driverFoundRow, { marginTop: 4 }]}>
              <FontAwesome
                name="exclamation-circle"
                size={14}
                color={Theme.negative}
                style={styles.driverFoundIcon}
              />
              <Text style={[styles.hintText, { color: Theme.negative, marginTop: 0, marginBottom: 0 }]}>
                {validatePhone(state.driverPhone.trim())}
              </Text>
            </View>
          ) : null}
          <Text style={[label, { marginTop: 12 }]}>Vehicle {!state.assignLater ? "*" : ""}</Text>
          <TextInput
            style={baseInput}
            placeholder={state.assignLater ? "e.g. TN 67 GH 7654 (optional)" : "e.g. TN 67 GH 7654 (required)"}
            placeholderTextColor={Theme.placeholder}
            value={state.aggregateVehicleText}
            onChangeText={(v) => setters.setAggregateVehicleText(formatIndianVehicleNumberInput(v))}
            autoCorrect={false}
            spellCheck={false}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </View>
      )}

      <View style={styles.sectionCard}>
        <View style={styles.sectionCardHeader}>
          <FontAwesome
            name="sticky-note-o"
            size={14}
            color={Theme.primaryText}
            style={styles.sectionCardIcon}
          />
          <Text style={styles.sectionTitle}>Notes</Text>
        </View>
        <Text style={label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.notesInput, inputStyle]}
          placeholder="Optional"
          placeholderTextColor={Theme.placeholder}
          value={state.notes}
          onChangeText={setters.setNotes}
          multiline
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
        />
      </View>
    </ScrollView>
  );
}
