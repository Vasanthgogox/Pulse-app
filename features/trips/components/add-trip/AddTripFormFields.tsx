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
    ListChecks,
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
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FleetEntityPickerModal } from "./FleetEntityPickerModal";
import { LocationSearchField } from "./LocationSearchField";
import { PartnerSupplierPickerModal } from "./PartnerSupplierPickerModal";
import type { AddTripFormState } from "./types";
import type { useAddTripForm } from "./useAddTripForm";

function routePreviewLine(s: string): string {
  const t = s.trim();
  return t || "—";
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
    if (state.supplySource !== "aggregate" || state.assignLater) return;
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
  }, [state.supplySource, state.assignLater, state.driverPhone, setters]);

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
  const selectedPartnerName =
    suppliers.find((s) => s.id === state.supplierId)?.name?.trim() ?? "";
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
              Layout.sectionSpacing + insets.bottom + (isWide ? 100 : 140),
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
                <LocationSearchField
                  label="Pickup *"
                  placeholder="Search or pick pickup location"
                  value={state.pickupArea}
                  onChangeText={setters.setPickupArea}
                  onSelectPlace={(_name, coords) =>
                    setters.setPickupCoords(coords.lat, coords.lon)
                  }
                  leadingIcon={
                    <MapPin size={18} color={Theme.iconMuted} />
                  }
                  inputStyle={baseInputArr}
                  labelStyle={[styles.label, labelStyle]}
                  onDropdownOpenChange={setPickupDropdownOpen}
                />
              </View>
              <View style={styles.gridCol}>
                <LocationSearchField
                  label="Drop *"
                  placeholder="Search or pick drop location"
                  value={state.dropLocation}
                  onChangeText={setters.setDropLocation}
                  onSelectPlace={(_name, coords) =>
                    setters.setDropCoords(coords.lat, coords.lon)
                  }
                  leadingIcon={
                    <Navigation size={18} color={Theme.iconMuted} />
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
                  {routePreviewLine(state.pickupArea)} →{" "}
                  {routePreviewLine(state.dropLocation)}
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

            <View style={[styles.assignLaterCard, { marginBottom: 16 }]}>
              <View style={styles.assignLaterCardLeft}>
                <View style={styles.assignLaterIconCircle}>
                  <ListChecks size={18} color={Theme.iconPrimary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.assignLaterTitle}>Assign later</Text>
                  <Text style={styles.assignLaterSub}>
                    {supplyIsAsset
                      ? "(vehicle & driver from trip detail)"
                      : "(vehicle & driver phone from trip detail)"}
                  </Text>
                </View>
              </View>
              <Switch
                value={state.assignLater}
                onValueChange={setters.setAssignLater}
                trackColor={{
                  false: Theme.borderInput,
                  true: Theme.darkBackground,
                }}
                thumbColor={Theme.screenBackground}
              />
            </View>
            {state.assignLater ? (
              <Text style={styles.warningText}>
                {supplyIsAsset
                  ? "Assign vehicle and driver on the trip screen before the trip starts."
                  : "Add vehicle number and driver phone on the trip screen before the trip starts."}
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

                {!state.assignLater ? (
                  <View
                    style={[styles.gridRow, isWide && styles.gridRowWide]}
                  >
                    <View style={styles.gridCol}>
                      <Text style={[styles.label, labelStyle]}>
                        Assign driver *
                      </Text>
                      <View style={styles.iconField}>
                        <User
                          size={18}
                          color={Theme.iconMuted}
                          style={styles.iconInField}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <TouchableOpacity
                            style={[
                              styles.fakeInput,
                              inputStyle,
                              styles.pickerInner,
                            ]}
                            onPress={() =>
                              !fleetLoading &&
                              setPickerType((t) =>
                                t === "driver" ? null : "driver",
                              )
                            }
                            disabled={fleetLoading}
                            activeOpacity={0.75}
                          >
                            <Text
                              style={
                                state.driverId
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
                        Vehicle *
                      </Text>
                      <View style={styles.iconField}>
                        <Truck
                          size={18}
                          color={Theme.iconMuted}
                          style={styles.iconInField}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <TouchableOpacity
                            style={[
                              styles.fakeInput,
                              inputStyle,
                              styles.pickerInner,
                            ]}
                            onPress={() =>
                              !fleetLoading &&
                              setPickerType((t) =>
                                t === "vehicle" ? null : "vehicle",
                              )
                            }
                            disabled={fleetLoading}
                            activeOpacity={0.75}
                          >
                            <Text
                              style={
                                state.vehicleId
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
                ) : null}
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

                {!state.assignLater ? (
                  <>
                    <View
                      style={[
                        styles.gridRow,
                        isWide && styles.gridRowWide,
                        { marginTop: 8 },
                      ]}
                    >
                      <View style={styles.gridCol}>
                        <Text style={[styles.label, labelStyle]}>
                          Driver phone (tracking) *
                        </Text>
                        <View style={styles.iconField}>
                          <Phone
                            size={18}
                            color={Theme.iconMuted}
                            style={styles.iconInField}
                          />
                          <TextInput
                            style={[styles.iconInput, inputStyle]}
                            placeholder="e.g. +91 98765 43210"
                            placeholderTextColor={Theme.placeholder}
                            value={state.driverPhone}
                            onChangeText={(v) =>
                              setters.setDriverPhone(formatMobileNumber(v))
                            }
                            keyboardType="phone-pad"
                          />
                        </View>
                      </View>
                      <View style={styles.gridCol}>
                        <Text style={[styles.label, labelStyle]}>
                          Vehicle number *
                        </Text>
                        <View style={styles.iconField}>
                          <Truck
                            size={18}
                            color={Theme.iconMuted}
                            style={styles.iconInField}
                          />
                          <TextInput
                            style={[
                              styles.iconInput,
                              inputStyle,
                              {
                                fontFamily:
                                  Platform.OS === "ios"
                                    ? "Menlo"
                                    : "monospace",
                              },
                            ]}
                            placeholder="e.g. TN 67 GH 7654"
                            placeholderTextColor={Theme.placeholder}
                            value={state.aggregateVehicleText}
                            onChangeText={(v) =>
                              setters.setAggregateVehicleText(
                                formatIndianVehicleNumberInput(v),
                              )
                            }
                            autoCapitalize="characters"
                          />
                        </View>
                      </View>
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
                  </>
                ) : (
                  <View style={styles.assignLaterPartnerHint}>
                    <Info size={16} color={Theme.textMuted} />
                    <Text style={styles.assignLaterPartnerHintText}>
                      Driver phone and vehicle number are entered on the trip
                      screen.
                    </Text>
                  </View>
                )}
              </>
            )}

            <FleetEntityPickerModal
              visible={pickerOpen}
              mode={pickerType ?? "vehicle"}
              drivers={availableDrivers}
              vehicles={availableVehicles}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onClose={closePicker}
            />

            <PartnerSupplierPickerModal
              visible={supplierDropdownOpen}
              suppliers={suppliers}
              loading={suppliersLoading}
              selectedId={state.supplierId}
              onSelect={setters.setSupplierId}
              onClose={() => setSupplierDropdownOpen(false)}
            />
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
                {routePreviewLine(state.pickupArea)}
              </Text>
            </View>
            <View style={styles.previewLine}>
              <Text style={styles.previewLab}>Drop</Text>
              <Text style={styles.previewVal} numberOfLines={2}>
                {routePreviewLine(state.dropLocation)}
              </Text>
            </View>
            <View style={styles.previewDivider} />
            {!supplyIsAsset ? (
              <View style={styles.previewRow2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewLab}>Partner</Text>
                  <Text style={styles.previewVal} numberOfLines={1}>
                    {selectedPartnerName || "—"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewLab}>Partner rate</Text>
                  <Text
                    style={[styles.previewVal, { color: Theme.negative }]}
                  >
                    ₹{state.supplierRate.trim() || "0"}
                  </Text>
                </View>
              </View>
            ) : null}
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
                {supplyIsAsset ? "Internal" : "Aggregate"}
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
                  : state.assignLater
                    ? "Assign later"
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
    paddingTop: 4,
  },
  contentMax: {
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
    marginBottom: 16,
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
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    paddingBottom: 10,
    marginBottom: 14,
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
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  gridRow: { gap: 14 },
  gridRowWide: { flexDirection: "row", alignItems: "flex-start", gap: 20 },
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
  assignLaterPartnerHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  assignLaterPartnerHintText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 17,
  },
  segment: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
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
  assignLaterCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceForm,
  },
  assignLaterCardLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minWidth: 0,
  },
  assignLaterIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  assignLaterTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimary,
    marginBottom: 4,
  },
  assignLaterSub: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 17,
  },
  warningText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.teslaRed,
    marginBottom: 6,
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
    minHeight: 96,
    textAlignVertical: "top",
    paddingTop: 14,
    borderRadius: 20,
    borderWidth: 2,
    fontSize: 15,
    fontWeight: "500",
  },
  ctaBlock: {
    alignItems: "center",
    paddingVertical: 16,
    marginBottom: 20,
  },
  primaryCta: {
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Theme.darkBackground,
    paddingVertical: 14,
    borderRadius: 14,
    minHeight: 52,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  previewBody: { padding: 12, gap: 8 },
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
