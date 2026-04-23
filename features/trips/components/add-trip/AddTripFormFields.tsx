/**
 * Create Trip — layout inspired by web mock (sections, segmented supply, preview card).
 * Wired to useAddTripForm / org services; Theme tokens only (no Tailwind).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
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
import { getTripsByOrganization } from "@/features/trips/services/trips.service";
import {
    getVehiclesByOrganization,
    type VehicleRow,
} from "@/features/vehicles/services/vehicles.service";
import {
    formatIndianVehicleNumber,
    formatIndianVehicleNumberInput,
    formatMobileNumber,
} from "@/lib/format";
import { validatePhone } from "@/lib/phoneValidation";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
    AlertCircle,
    Building2,
    CheckCircle2,
    Clock,
    FileText,
    IndianRupee,
    Info,
    MapPin,
    Navigation,
    Phone,
    Truck,
    User,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewStyle } from "react-native";
import {
    ActivityIndicator,
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
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LocationSearchField } from "./LocationSearchField";
import type { AddTripFormState } from "./types";
import type { useAddTripForm } from "./useAddTripForm";

function joinRoutePreview(city: string, detail: string): string {
  const c = city.trim();
  const d = detail.trim();
  if (c && d) return `${c} · ${d}`;
  return d || c || "—";
}

const inputStyle = {
  borderColor: Theme.borderInput,
  color: Theme.textPrimary,
  backgroundColor: Theme.surfaceForm,
};
const labelStyle = { color: Theme.textMutedDemo };

export interface AddTripFormFieldsProps {
  state: AddTripFormState;
  setters: ReturnType<typeof useAddTripForm>["setters"];
  clients: ClientRow[];
  clientsLoading: boolean;
  organizationId: string | null;
  refetchClients: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitting?: boolean;
}

export function AddTripFormFields({
  state,
  setters,
  clients,
  clientsLoading,
  organizationId,
  refetchClients,
  onSubmit,
  canSubmit,
  submitting = false,
}: AddTripFormFieldsProps) {
  void refetchClients;
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 720;
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

  const driverPhoneLookupTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
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
    if (driverPhoneLookupTimeoutRef.current)
      clearTimeout(driverPhoneLookupTimeoutRef.current);
    driverPhoneLookupTimeoutRef.current = setTimeout(() => {
      driverPhoneLookupTimeoutRef.current = null;
      const normalized = trimmed.replace(/\s+/g, "");
      if (normalized.length < 10) {
        setters.setDriverPhoneName(null);
        setters.setDriverPhoneConfirmed(false);
        return;
      }
      searchExistingDriversByPhone(normalized).then(
        ({ error: err, matches }) => {
          if (err || !matches.length) {
            setters.setDriverPhoneName(null);
            setters.setDriverPhoneConfirmed(false);
            return;
          }
          const nextName = matches[0].full_name ?? null;
          setters.setDriverPhoneName(nextName);
          if (nextName && nextName !== lastDriverPhoneNameRef.current) {
            setters.setDriverPhoneConfirmed(false);
          }
          lastDriverPhoneNameRef.current = nextName;
        },
      );
    }, 400);
    return () => {
      if (driverPhoneLookupTimeoutRef.current)
        clearTimeout(driverPhoneLookupTimeoutRef.current);
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

  const scrollBlocked =
    pickerOpen ||
    supplierDropdownOpen ||
    pickupDropdownOpen ||
    dropDropdownOpen;

  const supplyIsAsset = state.supplySource === "asset";
  const busyFleetHintAsset =
    supplyIsAsset &&
    !state.assignLater &&
    !fleetLoading &&
    availableDrivers.length === 0;

  const baseInputArr = [styles.input, inputStyle];

  return (
    <View style={styles.pageWrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              Layout.sectionSpacing + insets.bottom + (isWide ? 140 : 200),
          },
        ]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!scrollBlocked}
      >
        <View
          style={[
            styles.contentMax,
            {
              paddingHorizontal: isWide ? 24 : Layout.screenPaddingHorizontal,
            },
          ]}
        >
          {/* 01 Route */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>01</Text>
              </View>
              <Text style={styles.cardTitle}>Route Details</Text>
            </View>

            <View style={[styles.gridRow, isWide && styles.gridRowWide]}>
              <View style={styles.gridCol}>
                <Text style={[styles.label, labelStyle]}>Origin & Pickup</Text>
                <View style={styles.iconField}>
                  <MapPin
                    size={18}
                    color={Theme.iconMuted}
                    style={styles.iconInField}
                  />
                  <TextInput
                    style={[styles.iconInput, inputStyle]}
                    placeholder="Origin city (optional)"
                    placeholderTextColor={Theme.placeholder}
                    value={state.pickupCity}
                    onChangeText={setters.setPickupCity}
                    autoCorrect={false}
                  />
                </View>
                <LocationSearchField
                  label="Specific pickup area *"
                  placeholder="e.g. Mumbai, BKC"
                  value={state.pickupArea}
                  onChangeText={setters.setPickupArea}
                  onSelectPlace={(_name, coords) =>
                    setters.setPickupCoords(coords.lat, coords.lon)
                  }
                  inputStyle={baseInputArr}
                  labelStyle={[styles.label, labelStyle]}
                  onDropdownOpenChange={setPickupDropdownOpen}
                />
              </View>
              <View style={styles.gridCol}>
                <Text style={[styles.label, labelStyle]}>
                  Destination & Drop
                </Text>
                <View style={styles.iconField}>
                  <Navigation
                    size={18}
                    color={Theme.iconMuted}
                    style={styles.iconInField}
                  />
                  <TextInput
                    style={[styles.iconInput, inputStyle]}
                    placeholder="Destination city (optional)"
                    placeholderTextColor={Theme.placeholder}
                    value={state.dropCity}
                    onChangeText={setters.setDropCity}
                    autoCorrect={false}
                  />
                </View>
                <LocationSearchField
                  label="Specific drop location *"
                  placeholder="e.g. Pune, Hinjewadi"
                  value={state.dropLocation}
                  onChangeText={setters.setDropLocation}
                  onSelectPlace={(_name, coords) =>
                    setters.setDropCoords(coords.lat, coords.lon)
                  }
                  inputStyle={baseInputArr}
                  labelStyle={[styles.label, labelStyle]}
                  onDropdownOpenChange={setDropDropdownOpen}
                />
              </View>
            </View>

            {state.pickupArea.trim() && state.dropLocation.trim() ? (
              <View style={styles.routeSummary}>
                <FontAwesome
                  name="long-arrow-right"
                  size={12}
                  color={Theme.teslaRed}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.routeSummaryText} numberOfLines={2}>
                  {joinRoutePreview(state.pickupCity, state.pickupArea)} →{" "}
                  {joinRoutePreview(state.dropCity, state.dropLocation)}
                </Text>
              </View>
            ) : null}

            {state.routeLoading ||
            state.routeDistanceKm != null ||
            state.routeEtaLabel != null ? (
              <View style={styles.routeStats}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeStatLab}>Distance</Text>
                  <Text style={styles.routeStatVal}>
                    {state.routeLoading
                      ? "…"
                      : state.routeDistanceKm != null
                        ? `${state.routeDistanceKm} km`
                        : "—"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeStatLab}>ETA</Text>
                  <Text style={styles.routeStatVal}>
                    {state.routeLoading
                      ? "…"
                      : state.routeEtaLabel != null
                        ? state.routeEtaLabel
                        : "—"}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* 02 Client & Commercials */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>02</Text>
              </View>
              <Text style={styles.cardTitle}>Client & Commercials</Text>
            </View>

            <View style={[styles.gridRow, isWide && styles.gridRowWide]}>
              <View style={styles.gridCol}>
                <Text style={[styles.label, labelStyle]}>Select client</Text>
                {clientsLoading ? (
                  <ActivityIndicator color={Theme.iconPrimary} />
                ) : clients.length === 0 ? (
                  <Text style={styles.mutedSmall}>
                    No clients yet. Add clients from the Clients page first.
                  </Text>
                ) : (
                  <ScrollView
                    style={styles.clientList}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    {clients.map((c) => {
                      const selected = state.clientId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[
                            styles.clientCard,
                            selected && styles.clientCardOn,
                            Platform.OS === "web"
                              ? ({ cursor: "pointer" } as ViewStyle)
                              : null,
                          ]}
                          onPress={() => handleSelectClient(c)}
                          activeOpacity={0.85}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              style={[
                                styles.clientName,
                                selected && styles.clientNameOn,
                              ]}
                              numberOfLines={1}
                            >
                              {c.name}
                            </Text>
                            {c.address ? (
                              <View style={styles.clientMetaRow}>
                                <Clock size={11} color={Theme.textMuted} />
                                <Text
                                  style={styles.clientSub}
                                  numberOfLines={1}
                                >
                                  {c.address}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View
                            style={[
                              styles.radioOuter,
                              selected && styles.radioOuterOn,
                            ]}
                          >
                            {selected ? (
                              <CheckCircle2
                                size={16}
                                color={Theme.iconPrimary}
                              />
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <View style={styles.gridCol}>
                <Text style={[styles.label, labelStyle]}>
                  Client sales price (₹) *
                </Text>
                <View style={styles.priceWrap}>
                  <IndianRupee
                    size={20}
                    color={Theme.iconMuted}
                    style={styles.rupeeIcon}
                  />
                  <TextInput
                    style={styles.priceInput}
                    placeholder="0"
                    placeholderTextColor={Theme.placeholder}
                    value={state.clientPrice}
                    onChangeText={setters.setClientPrice}
                    keyboardType="decimal-pad"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.infoCallout}>
                  <Info size={16} color={Theme.iconPrimary} />
                  <Text style={styles.infoCalloutText}>
                    Revenue should match what you bill this client for this
                    lane. Adjust if this trip differs.
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* 03 Supply & Allocation */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>03</Text>
              </View>
              <Text style={styles.cardTitle}>Supply & Allocation</Text>
            </View>

            <View style={styles.segment}>
              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  supplyIsAsset && styles.segmentBtnOn,
                  Platform.OS === "web"
                    ? ({ cursor: "pointer" } as ViewStyle)
                    : null,
                ]}
                onPress={() => setters.setSupplySource("asset")}
                activeOpacity={0.85}
              >
                <Truck
                  size={16}
                  color={supplyIsAsset ? Theme.iconPrimary : Theme.textMuted}
                />
                <Text
                  style={[
                    styles.segmentLab,
                    supplyIsAsset && styles.segmentLabOn,
                  ]}
                >
                  Internal
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  !supplyIsAsset && styles.segmentBtnOn,
                  Platform.OS === "web"
                    ? ({ cursor: "pointer" } as ViewStyle)
                    : null,
                ]}
                onPress={() => setters.setSupplySource("aggregate")}
                activeOpacity={0.85}
              >
                <Building2
                  size={16}
                  color={!supplyIsAsset ? Theme.iconPrimary : Theme.textMuted}
                />
                <Text
                  style={[
                    styles.segmentLab,
                    !supplyIsAsset && styles.segmentLabOn,
                  ]}
                >
                  Partner
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.checkRow, { marginBottom: 16 }]}>
              <Switch
                value={state.assignLater}
                onValueChange={setters.setAssignLater}
                trackColor={{
                  false: Theme.borderInput,
                  true: Theme.darkBackground,
                }}
                thumbColor={Theme.screenBackground}
              />
              <Text style={styles.checkLabel}>
                {supplyIsAsset
                  ? "Assign later (vehicle & driver from trip detail)"
                  : "Assign later (vehicle & driver phone from trip detail)"}
              </Text>
            </View>
            {state.assignLater ? (
              <Text style={styles.warningText}>
                Vehicle & driver must be assigned before trip start.
              </Text>
            ) : null}

            {supplyIsAsset ? (
              <>
                {busyFleetHintAsset ? (
                  <View style={styles.warnBanner}>
                    <AlertCircle size={14} color={Theme.warning} />
                    <Text style={styles.warnBannerText}>
                      {drivers.length === 0
                        ? "No drivers yet. Add drivers from Drivers first."
                        : "All drivers are on a trip. Enable Assign later or retry when someone is free."}
                    </Text>
                  </View>
                ) : null}
                {!state.assignLater &&
                availableVehicles.length === 0 &&
                !fleetLoading ? (
                  <View style={styles.warnBanner}>
                    <AlertCircle size={14} color={Theme.warning} />
                    <Text style={styles.warnBannerText}>
                      {vehicles.length === 0
                        ? "No vehicles yet. Add vehicles from Vehicles first."
                        : "All vehicles are on active trips. Assign later or retry later."}
                    </Text>
                  </View>
                ) : null}

                <View style={[styles.gridRow, isWide && styles.gridRowWide]}>
                  <View style={styles.gridCol}>
                    <Text style={[styles.label, labelStyle]}>
                      Assign driver {!state.assignLater ? "*" : ""}
                    </Text>
                    <View style={styles.iconField}>
                      <User
                        size={18}
                        color={Theme.iconMuted}
                        style={styles.iconInField}
                      />
                      <View ref={driverWrapRef} collapsable={false}>
                        <TouchableOpacity
                          style={[
                            styles.fakeInput,
                            inputStyle,
                            styles.pickerInner,
                          ]}
                          onPress={() =>
                            !fleetLoading &&
                            !state.assignLater &&
                            setPickerType((t) =>
                              t === "driver" ? null : "driver",
                            )
                          }
                          disabled={fleetLoading}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={
                              state.driverId || state.assignLater
                                ? styles.pickerText
                                : styles.pickerPh
                            }
                            numberOfLines={1}
                          >
                            {fleetLoading
                              ? "Loading…"
                              : state.driverId
                                ? (drivers.find((d) => d.id === state.driverId)
                                    ?.name ?? "Selected")
                                : state.assignLater
                                  ? "Assign from trip detail"
                                  : "Select driver"}
                          </Text>
                          <FontAwesome
                            name="chevron-down"
                            size={12}
                            color={Theme.textMuted}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  <View style={styles.gridCol}>
                    <Text style={[styles.label, labelStyle]}>
                      Vehicle {!state.assignLater ? "*" : ""}
                    </Text>
                    <View style={styles.iconField}>
                      <Truck
                        size={18}
                        color={Theme.iconMuted}
                        style={styles.iconInField}
                      />
                      <View ref={vehicleWrapRef} collapsable={false}>
                        <TouchableOpacity
                          style={[
                            styles.fakeInput,
                            inputStyle,
                            styles.pickerInner,
                          ]}
                          onPress={() =>
                            !fleetLoading &&
                            !state.assignLater &&
                            setPickerType((t) =>
                              t === "vehicle" ? null : "vehicle",
                            )
                          }
                          disabled={fleetLoading}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={
                              state.vehicleId || state.assignLater
                                ? styles.pickerText
                                : styles.pickerPh
                            }
                            numberOfLines={1}
                          >
                            {fleetLoading
                              ? "Loading…"
                              : state.vehicleId
                                ? formatIndianVehicleNumber(
                                    vehicles.find(
                                      (v) => v.id === state.vehicleId,
                                    )?.vehicle_number ?? "",
                                  ) || "Selected"
                                : state.assignLater
                                  ? "Assign from trip detail"
                                  : "Select vehicle"}
                          </Text>
                          <FontAwesome
                            name="chevron-down"
                            size={12}
                            color={Theme.textMuted}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.label, labelStyle]}>
                  Transport partner *
                </Text>
                <View style={styles.pickerRow}>
                  <TouchableOpacity
                    style={[styles.input, inputStyle, styles.pickerFlex]}
                    onPress={() =>
                      !suppliersLoading && setSupplierDropdownOpen((p) => !p)
                    }
                    disabled={suppliersLoading}
                  >
                    <Text
                      style={
                        state.supplierId ? styles.pickerText : styles.pickerPh
                      }
                      numberOfLines={1}
                    >
                      {suppliersLoading
                        ? "Loading…"
                        : state.supplierId
                          ? suppliers.find((s) => s.id === state.supplierId)
                              ?.company_name ||
                            suppliers.find((s) => s.id === state.supplierId)
                              ?.name ||
                            "Selected"
                          : "Choose partner"}
                    </Text>
                    <FontAwesome
                      name={
                        supplierDropdownOpen ? "chevron-up" : "chevron-down"
                      }
                      size={12}
                      color={Theme.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                <View style={[styles.gridRow, isWide && styles.gridRowWide]}>
                  <View style={styles.gridCol}>
                    <Text style={[styles.label, labelStyle]}>
                      Partner rate (₹) *
                    </Text>
                    <TextInput
                      style={[styles.input, inputStyle]}
                      placeholder="0"
                      placeholderTextColor={Theme.placeholder}
                      value={state.supplierRate}
                      onChangeText={setters.setSupplierRate}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.gridCol}>
                    <Text style={[styles.label, labelStyle]}>
                      Advance paid (₹)
                    </Text>
                    <TextInput
                      style={[styles.input, inputStyle]}
                      placeholder="Optional"
                      placeholderTextColor={Theme.placeholder}
                      value={state.advancePaid}
                      onChangeText={setters.setAdvancePaid}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <Text style={[styles.label, labelStyle, { marginTop: 8 }]}>
                  Driver phone (tracking) {!state.assignLater ? "*" : ""}
                </Text>
                <View style={styles.iconField}>
                  <Phone
                    size={18}
                    color={Theme.iconMuted}
                    style={styles.iconInField}
                  />
                  <TextInput
                    style={[styles.iconInput, inputStyle]}
                    placeholder={
                      state.assignLater ? "Optional" : "e.g. +91 98765 43210"
                    }
                    placeholderTextColor={Theme.placeholder}
                    value={state.driverPhone}
                    onChangeText={(v) =>
                      setters.setDriverPhone(formatMobileNumber(v))
                    }
                    keyboardType="phone-pad"
                  />
                </View>
                {state.driverPhoneName ? (
                  <TouchableOpacity
                    onPress={() =>
                      setters.setDriverPhoneConfirmed(
                        !state.driverPhoneConfirmed,
                      )
                    }
                    style={[
                      styles.driverConfirmCard,
                      state.driverPhoneConfirmed &&
                        styles.driverConfirmCardConfirmed,
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          styles.driverConfirmMain,
                          state.driverPhoneConfirmed && {
                            color: Theme.darkGreen,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {state.driverPhoneConfirmed
                          ? `Confirmed: ${state.driverPhoneName}`
                          : `Found: ${state.driverPhoneName}`}
                      </Text>
                      <Text style={styles.driverConfirmSub}>
                        {state.driverPhoneConfirmed
                          ? "Tap again to change"
                          : "Tap to confirm before creating the trip"}
                      </Text>
                    </View>
                    <CheckCircle2
                      size={18}
                      color={
                        state.driverPhoneConfirmed
                          ? Theme.darkGreen
                          : Theme.iconPrimary
                      }
                    />
                  </TouchableOpacity>
                ) : null}
                {state.driverPhone.trim() &&
                validatePhone(state.driverPhone.trim()) ? (
                  <Text style={[styles.warningText, { marginTop: 4 }]}>
                    {validatePhone(state.driverPhone.trim())}
                  </Text>
                ) : null}

                <Text style={[styles.label, labelStyle, { marginTop: 12 }]}>
                  Vehicle number {!state.assignLater ? "*" : ""}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    inputStyle,
                    {
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    },
                  ]}
                  placeholder={
                    state.assignLater ? "Optional" : "e.g. TN 67 GH 7654"
                  }
                  placeholderTextColor={Theme.placeholder}
                  value={state.aggregateVehicleText}
                  onChangeText={(v) =>
                    setters.setAggregateVehicleText(
                      formatIndianVehicleNumberInput(v),
                    )
                  }
                  autoCapitalize="characters"
                />
              </>
            )}

            {pickerOpen && pickerLayout ? (
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
                  >
                    <FlatList
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
                          >
                            <Text style={styles.optionText} numberOfLines={1}>
                              {itemLabel}
                            </Text>
                            {isSelected ? (
                              <FontAwesome
                                name="check"
                                size={12}
                                color={Theme.darkGreen}
                              />
                            ) : null}
                          </TouchableOpacity>
                        );
                      }}
                    />
                  </View>
                </View>
              </Modal>
            ) : null}

            {supplierDropdownOpen ? (
              <Modal
                visible
                transparent
                animationType="fade"
                onRequestClose={() => setSupplierDropdownOpen(false)}
              >
                <View style={styles.dropdownModalOverlay}>
                  <TouchableWithoutFeedback
                    onPress={() => setSupplierDropdownOpen(false)}
                  >
                    <View style={StyleSheet.absoluteFill} />
                  </TouchableWithoutFeedback>
                  <View style={styles.dropdownModalCard}>
                    <Text style={styles.dropdownModalTitle}>
                      Select partner
                    </Text>
                    <ScrollView
                      style={styles.dropdownModalScroll}
                      keyboardShouldPersistTaps="handled"
                    >
                      {suppliers.length === 0 ? (
                        <Text style={styles.mutedPad}>
                          No partners yet. Add suppliers first.
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
                            {state.supplierId === s.id ? (
                              <FontAwesome
                                name="check"
                                size={14}
                                color={Theme.darkGreen}
                              />
                            ) : null}
                          </TouchableOpacity>
                        ))
                      )}
                    </ScrollView>
                  </View>
                </View>
              </Modal>
            ) : null}
          </View>

          {/* 04 Notes */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>04</Text>
              </View>
              <Text style={styles.cardTitle}>Notes & Instructions</Text>
            </View>
            <View style={styles.iconField}>
              <FileText
                size={18}
                color={Theme.iconMuted}
                style={styles.iconInField}
              />
              <TextInput
                style={[styles.notesInput, inputStyle, { paddingLeft: 44 }]}
                placeholder="Any specific delivery instructions or cargo details…"
                placeholderTextColor={Theme.placeholder}
                value={state.notes}
                onChangeText={setters.setNotes}
                multiline
              />
            </View>
          </View>

          {/* Primary CTA */}
          <View style={styles.ctaBlock}>
            <TouchableOpacity
              style={[
                styles.primaryCta,
                (!canSubmit || submitting) && styles.primaryCtaDis,
                Platform.OS === "web"
                  ? ({ cursor: "pointer" } as ViewStyle)
                  : null,
              ]}
              onPress={onSubmit}
              disabled={!canSubmit || submitting}
              activeOpacity={0.9}
            >
              {submitting ? (
                <ActivityIndicator color={Theme.textOnPrimary} />
              ) : (
                <>
                  <CheckCircle2 size={22} color={Theme.textOnPrimary} />
                  <Text style={styles.primaryCtaText}>Create Trip Now</Text>
                </>
              )}
            </TouchableOpacity>
            {!canSubmit && !submitting ? (
              <Text style={styles.ctaHint}>
                Please fill all mandatory fields to continue
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* Floating preview — hidden on very narrow widths to avoid blocking the form */}
      {winW >= 420 ? (
        <View
          style={[
            styles.previewCard,
            {
              bottom: insets.bottom + 16,
              right: Math.max(16, insets.right + 8),
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.previewHead}>
            <Text style={styles.previewHeadTitle}>Trip Preview</Text>
            <View style={styles.livePill}>
              <Text style={styles.livePillText}>Live</Text>
            </View>
          </View>
          <View style={styles.previewBody}>
            <View style={styles.previewLine}>
              <Text style={styles.previewLab}>Pickup</Text>
              <Text style={styles.previewVal} numberOfLines={2}>
                {joinRoutePreview(state.pickupCity, state.pickupArea)}
              </Text>
            </View>
            <View style={styles.previewLine}>
              <Text style={styles.previewLab}>Drop</Text>
              <Text style={styles.previewVal} numberOfLines={2}>
                {joinRoutePreview(state.dropCity, state.dropLocation)}
              </Text>
            </View>
            <View style={styles.previewDivider} />
            <View style={styles.previewRow2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewLab}>Client</Text>
                <Text style={styles.previewVal} numberOfLines={1}>
                  {state.clientName.trim() || "—"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewLab}>Revenue</Text>
                <Text style={[styles.previewVal, { color: Theme.darkGreen }]}>
                  ₹{state.clientPrice.trim() || "0"}
                </Text>
              </View>
            </View>
            <View style={styles.previewFoot}>
              <Text style={styles.previewFootLeft}>
                {supplyIsAsset ? "Internal" : "Partner"}
              </Text>
              <Text style={styles.previewFootRight} numberOfLines={1}>
                {supplyIsAsset
                  ? state.vehicleId
                    ? formatIndianVehicleNumber(
                        vehicles.find((v) => v.id === state.vehicleId)
                          ?.vehicle_number ?? "",
                      ) || "—"
                    : state.assignLater
                      ? "Assign later"
                      : "—"
                  : state.aggregateVehicleText.trim() || "—"}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.blobA} pointerEvents="none" />
      <View style={styles.blobB} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  pageWrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 8,
  },
  contentMax: {
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 24,
    marginBottom: 24,
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
      },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    paddingBottom: 14,
    marginBottom: 20,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.iconPrimary,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  gridRow: { gap: 20 },
  gridRowWide: { flexDirection: "row", alignItems: "flex-start", gap: 32 },
  gridCol: { flex: 1, minWidth: 0 },
  label: {
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "600",
    minHeight: 52,
    marginBottom: 12,
    ...Platform.select<ViewStyle>({
      web: { outlineStyle: "none" },
    }),
  },
  iconField: {
    position: "relative",
    marginBottom: 12,
  },
  iconInField: {
    position: "absolute",
    left: 14,
    top: 16,
    zIndex: 1,
  },
  iconInput: {
    borderRadius: 12,
    paddingLeft: 44,
    paddingRight: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "600",
    minHeight: 52,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceForm,
    color: Theme.textPrimary,
    ...Platform.select<ViewStyle>({
      web: { outlineStyle: "none" },
    }),
  },
  fakeInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 2,
    minHeight: 52,
  },
  pickerInner: {
    paddingLeft: 44,
    paddingRight: 12,
    flex: 1,
  },
  pickerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  pickerPh: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.placeholder,
  },
  pickerRow: { flexDirection: "row", marginBottom: 12 },
  pickerFlex: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  routeSummary: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: Theme.darkSurface,
    marginTop: 4,
    marginBottom: 12,
  },
  routeSummaryText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  routeStats: {
    flexDirection: "row",
    gap: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
  },
  routeStatLab: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  routeStatVal: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  clientList: { maxHeight: 280 },
  clientCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    marginBottom: 10,
    backgroundColor: Theme.screenBackground,
  },
  clientCardOn: {
    borderColor: Theme.darkBackground,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  clientName: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  clientNameOn: { color: Theme.iconPrimary },
  clientMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  clientSub: {
    fontSize: 11,
    color: Theme.textMuted,
    flex: 1,
  },
  radioOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterOn: {
    borderColor: Theme.darkBackground,
    backgroundColor: Theme.screenBackground,
  },
  priceWrap: {
    position: "relative",
    marginBottom: 12,
  },
  rupeeIcon: {
    position: "absolute",
    left: 14,
    top: 18,
    zIndex: 1,
  },
  priceInput: {
    borderRadius: 16,
    paddingLeft: 44,
    paddingRight: 16,
    paddingVertical: 16,
    fontSize: 24,
    fontWeight: "800",
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: Theme.surfaceForm,
    color: Theme.textPrimaryDark,
    ...Platform.select<ViewStyle>({
      web: { outlineStyle: "none" },
    }),
  },
  infoCallout: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.04)",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  infoCalloutText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
  },
  segment: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  segmentBtnOn: {
    backgroundColor: Theme.screenBackground,
    ...Platform.select<ViewStyle>({
      web: { boxShadow: "0 1px 2px rgba(0,0,0,0.06)" },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  segmentLab: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  segmentLabOn: { color: Theme.iconPrimary },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  warningText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.teslaRed,
    marginBottom: 10,
  },
  warnBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Theme.warningMuted,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 12,
  },
  warnBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.warning,
    lineHeight: 16,
  },
  notesInput: {
    minHeight: 120,
    textAlignVertical: "top",
    paddingTop: 14,
    borderRadius: 20,
    borderWidth: 2,
    fontSize: 15,
    fontWeight: "500",
  },
  ctaBlock: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 32,
  },
  primaryCta: {
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Theme.darkBackground,
    paddingVertical: 18,
    borderRadius: 16,
    minHeight: 56,
    ...Platform.select<ViewStyle>({
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.35)" },
      default: {
        shadowColor: Theme.darkBackground,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 4,
      },
    }),
  },
  primaryCtaDis: {
    opacity: 0.45,
  },
  primaryCtaText: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  ctaHint: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  previewCard: {
    position: "absolute",
    width: 300,
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    zIndex: 50,
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: "0 12px 40px rgba(15,23,42,0.15)",
      },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 10,
      },
    }),
  },
  previewHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.darkSurface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  previewHeadTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textOnDark,
  },
  livePill: {
    backgroundColor: Theme.darkBackground,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  livePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  previewBody: { padding: 16, gap: 10 },
  previewLine: { gap: 4 },
  previewLab: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  previewVal: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  previewDivider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 4,
  },
  previewRow2: { flexDirection: "row", gap: 12 },
  previewFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 12,
    backgroundColor: Theme.surfaceLight,
    marginTop: 4,
  },
  previewFootLeft: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  previewFootRight: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    maxWidth: 140,
    textAlign: "right",
  },
  blobA: {
    position: "absolute",
    top: "18%",
    left: "-12%",
    width: 280,
    height: 280,
    borderRadius: 200,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    zIndex: -1,
  },
  blobB: {
    position: "absolute",
    bottom: "-8%",
    right: "-8%",
    width: 220,
    height: 220,
    borderRadius: 200,
    backgroundColor: "rgba(232, 33, 39, 0.06)",
    zIndex: -1,
  },
  mutedSmall: {
    fontSize: 12,
    color: Theme.textMuted,
    marginBottom: 8,
  },
  mutedPad: {
    padding: Layout.screenPaddingHorizontal,
    color: Theme.textMuted,
    fontSize: 14,
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
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
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
  dropdownModalCard: {
    alignSelf: "stretch",
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    maxHeight: 340,
    overflow: "hidden",
    elevation: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  dropdownModalTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  dropdownModalScroll: {
    maxHeight: 260,
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
  driverConfirmMain: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  driverConfirmSub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 3,
  },
});
