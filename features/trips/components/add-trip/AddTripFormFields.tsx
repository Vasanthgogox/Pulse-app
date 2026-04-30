/**
 * Create Trip — layout inspired by web mock (sections, segmented supply, preview card).
 * Wired to useAddTripForm / org services; Theme tokens only (no Tailwind).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
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
    ArrowRight,
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
    PlusCircle,
    Truck,
    User,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import type { ViewStyle } from "react-native";
import {
    ActivityIndicator,
    Modal,
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
import DateTimePicker from "@react-native-community/datetimepicker";
import { ROUTES } from "@/lib/routes";
import { LocationSearchField } from "./LocationSearchField";
import type { AddTripFormState } from "./types";
import type { useAddTripForm } from "./useAddTripForm";

function routePreviewLine(s: string): string {
  const t = s.trim();
  return t || "—";
}

function formatUiDateLabel(iso: string): string {
  const t = iso.trim();
  if (!t) return "Select date";
  const d = new Date(`${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getToday(): string {
  return toISODate(new Date());
}

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}

function getDayAfter(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return toISODate(d);
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
  validationMessage?: string | null;
  submitting?: boolean;
  showInlineCta?: boolean;
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
  validationMessage = null,
  submitting = false,
  showInlineCta = true,
}: AddTripFormFieldsProps) {
  void refetchClients;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const isCompactMobile = winW < 480;
  const isWide = winW >= 720;
  const isDesktopPreview = winW >= 1180;
  const showFloatingPreview = winW >= 480 && !isDesktopPreview;
  const floatingPreviewWidth = Math.min(336, Math.max(280, winW - 24));
  const collapsePreviewByDefault = winW < 560;
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [mobilePreviewExpanded, setMobilePreviewExpanded] = useState(
    !collapsePreviewByDefault,
  );
  const [clientListExpanded, setClientListExpanded] = useState(true);
  const [partnerListExpanded, setPartnerListExpanded] = useState(true);
  const [pickupDropdownOpen, setPickupDropdownOpen] = useState(false);
  const [dropDropdownOpen, setDropDropdownOpen] = useState(false);
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
  const clientPriceInputRef = useRef<TextInput>(null);
  const supplierRateInputRef = useRef<TextInput>(null);
  const advancePaidInputRef = useRef<TextInput>(null);
  const driverPhoneInputRef = useRef<TextInput>(null);
  const aggregateVehicleInputRef = useRef<TextInput>(null);
  const notesInputRef = useRef<TextInput>(null);

  const focusField = useCallback((ref: { current: TextInput | null }) => {
    requestAnimationFrame(() => {
      ref.current?.focus();
    });
  }, []);

  const focusFieldAfterModalClose = useCallback(
    (ref: { current: TextInput | null }) => {
      // Web modal close/render timing can swallow immediate focus.
      // Retry shortly after close to make focus reliable.
      focusField(ref);
      setTimeout(() => {
        ref.current?.focus();
      }, 120);
    },
    [focusField],
  );

  const openPickerNext = useCallback((_type: "driver" | "vehicle") => {}, []);

  const openSupplierPickerNext = useCallback(() => {}, []);
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
    if (!showFloatingPreview) return;
    // On compact phones, keep form-first UX by default.
    setMobilePreviewExpanded(!collapsePreviewByDefault);
  }, [showFloatingPreview, collapsePreviewByDefault]);

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

  useFocusEffect(
    useCallback(() => {
      if (!organizationId) return;
      fetchFleet();
      fetchSuppliers();
    }, [organizationId, fetchFleet, fetchSuppliers]),
  );

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
    if (state.clientId === c.id) return;
    setters.setClientSelection(c.id, c.name);
    setClientListExpanded(false);
  };

  const handleAddClientShortcut = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-client",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);
  const handleAddSupplierShortcut = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-supplier",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);
  const handleAddDriverShortcut = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-driver",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);
  const handleAddVehicleShortcut = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-vehicle",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);
  const availableDrivers = drivers.filter(
    (d) => !driverIdsOnActiveTrip.includes(d.id),
  );
  const availableVehicles = vehicles.filter(
    (v) => !vehicleIdsOnActiveTrip.includes(v.id),
  );
  const driverOptions = drivers.map((d) => ({
    ...d,
    isBusy: driverIdsOnActiveTrip.includes(d.id),
  }));
  const vehicleOptions = vehicles.map((v) => ({
    ...v,
    isBusy: vehicleIdsOnActiveTrip.includes(v.id),
  }));

  const scrollBlocked = pickupDropdownOpen || dropDropdownOpen;

  const supplyIsAsset = state.supplySource === "asset";
  const selectedClientRow = clients.find((c) => c.id === state.clientId) ?? null;
  const selectedSupplierRow = suppliers.find((s) => s.id === state.supplierId) ?? null;
  const selectedPartnerName =
    suppliers.find((s) => s.id === state.supplierId)?.name?.trim() ?? "";
  const selectedAssetDriverName =
    state.driverId != null
      ? drivers.find((d) => d.id === state.driverId)?.name?.trim() ?? ""
      : "";
  const selectedAssetVehicleNumber =
    state.vehicleId != null
      ? formatIndianVehicleNumber(
          vehicles.find((v) => v.id === state.vehicleId)?.vehicle_number ?? "",
        ) || ""
      : "";
  const aggregateDriverDisplay = state.driverPhoneName?.trim() || state.driverPhone.trim();
  const previewFooterValue = supplyIsAsset
    ? state.assignLater
      ? "Assign later"
      : [selectedAssetDriverName, selectedAssetVehicleNumber]
          .filter((part) => part.length > 0)
          .join(" - ") || "—"
    : state.assignLater
      ? "Assign later"
      : [aggregateDriverDisplay, state.aggregateVehicleText.trim()]
          .filter((part) => part.length > 0)
          .join(" - ") || "—";
  const busyFleetHintAsset =
    supplyIsAsset &&
    !state.assignLater &&
    !fleetLoading &&
    availableDrivers.length === 0;

  const aggregateDriverFoundByPhone =
    !!(state.driverPhoneName && state.driverPhone.trim());
  const aggregateDriverVehicleBothSet =
    state.supplySource === "aggregate" &&
    !state.assignLater &&
    state.driverPhone.trim().length > 0 &&
    state.aggregateVehicleText.trim().length > 0 &&
    (!aggregateDriverFoundByPhone || state.driverPhoneConfirmed);
  const assetDriverVehicleBothSet =
    supplyIsAsset &&
    !state.assignLater &&
    Boolean(state.driverId && state.vehicleId);
  const assignLaterSwitchDisabled =
    supplyIsAsset ? assetDriverVehicleBothSet : aggregateDriverVehicleBothSet;

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
        scrollEnabled={isCompactMobile ? true : !scrollBlocked}
      >
        <View
          style={[
            styles.contentMax,
            {
              paddingHorizontal: isWide
                ? 24
                : isCompactMobile
                  ? 0
                  : Layout.screenPaddingHorizontal,
            },
          ]}
        >
          <View style={[styles.mainGrid, isDesktopPreview && styles.mainGridDesktop]}>
            <View style={styles.formColumn}>
          {/* 01 Route */}
          <View style={[styles.card, isCompactMobile && styles.cardCompact]}>
            <View style={styles.cardHead}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>01</Text>
              </View>
              <Text style={[styles.cardTitle, isCompactMobile && styles.cardTitleCompact]}>Route Details</Text>
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
                  leadingIcon={<MapPin size={18} color={Theme.iconMuted} />}
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
                  leadingIcon={<Navigation size={18} color={Theme.iconMuted} />}
                  inputStyle={baseInputArr}
                  labelStyle={[styles.label, labelStyle]}
                  onDropdownOpenChange={setDropDropdownOpen}
                />
              </View>
            </View>

            <View style={[styles.gridRow, isWide && styles.gridRowWide]}>
              <View style={styles.gridCol}>
                <Text style={[styles.label, labelStyle]}>Trip start date</Text>
                <View style={styles.quickDateRow}>
                  {[
                    { label: "Today", get: getToday },
                    { label: "Tomorrow", get: getTomorrow },
                    { label: "Day after", get: getDayAfter },
                  ].map(({ label, get }) => {
                    const iso = get();
                    const isActive = state.tripStartDate === iso;
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[
                          styles.quickDateChip,
                          isActive && styles.quickDateChipActive,
                        ]}
                        onPress={() => setters.setTripStartDate(iso)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.quickDateChipText,
                            isActive && styles.quickDateChipTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {Platform.OS === "web" ? (
                  <TextInput
                    style={[styles.input, inputStyle]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Theme.placeholder}
                    value={state.tripStartDate}
                    onChangeText={setters.setTripStartDate}
                    autoCorrect={false}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.input, inputStyle, styles.dateTouchable]}
                      onPress={() => setShowStartDatePicker(true)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={
                          state.tripStartDate
                            ? styles.dateTouchableText
                            : styles.dateTouchablePlaceholder
                        }
                      >
                        {state.tripStartDate
                          ? new Date(
                              `${state.tripStartDate}T12:00:00`,
                            ).toLocaleDateString("en-IN", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "Tap to pick date"}
                      </Text>
                    </TouchableOpacity>
                    {showStartDatePicker &&
                      (Platform.OS === "android" ? (
                        <DateTimePicker
                          value={
                            state.tripStartDate
                              ? new Date(`${state.tripStartDate}T12:00:00`)
                              : new Date()
                          }
                          mode="date"
                          display="default"
                          minimumDate={new Date()}
                          onChange={(e, date) => {
                            setShowStartDatePicker(false);
                            if (e.type === "set" && date) {
                              setters.setTripStartDate(toISODate(date));
                            }
                          }}
                        />
                      ) : (
                        <Modal visible transparent animationType="slide">
                          <TouchableOpacity
                            style={styles.datePickerBackdrop}
                            activeOpacity={1}
                            onPress={() => setShowStartDatePicker(false)}
                          >
                            <View
                              style={styles.datePickerSheet}
                              onStartShouldSetResponder={() => true}
                            >
                              <View style={styles.datePickerHeader}>
                                <Text style={styles.datePickerTitle}>
                                  Pick date
                                </Text>
                                <TouchableOpacity
                                  onPress={() => setShowStartDatePicker(false)}
                                  hitSlop={12}
                                >
                                  <Text style={styles.datePickerDone}>Done</Text>
                                </TouchableOpacity>
                              </View>
                              <DateTimePicker
                                value={
                                  state.tripStartDate
                                    ? new Date(`${state.tripStartDate}T12:00:00`)
                                    : new Date()
                                }
                                mode="date"
                                display="spinner"
                                minimumDate={new Date()}
                                onChange={(_, date) =>
                                  date && setters.setTripStartDate(toISODate(date))
                                }
                              />
                            </View>
                          </TouchableOpacity>
                        </Modal>
                      ))}
                  </>
                )}
              </View>
              <View style={styles.gridCol}>
                <Text style={[styles.label, labelStyle]}>Tons</Text>
                <TextInput
                  style={[styles.input, inputStyle]}
                  placeholder="Enter load weight in tons"
                  placeholderTextColor={Theme.placeholder}
                  value={state.tons}
                  onChangeText={setters.setTons}
                  keyboardType="decimal-pad"
                  autoCorrect={false}
                />
              </View>
            </View>

            {state.pickupArea.trim() && state.dropLocation.trim() ? (
              <View style={styles.routePreviewPanel}>
                <View style={styles.routePreviewHero}>
                  <ArrowRight
                    size={20}
                    color={Theme.teslaRed}
                    strokeWidth={2.5}
                  />
                  <Text style={styles.routePreviewHeroText} numberOfLines={2}>
                    {routePreviewLine(state.pickupArea)} →{" "}
                    {routePreviewLine(state.dropLocation)}
                  </Text>
                </View>
                {state.routeLoading ||
                state.routeDistanceKm != null ||
                state.routeEtaLabel != null ? (
                  <View style={styles.routePreviewMetrics}>
                    <View style={styles.routePreviewMetricCol}>
                      <Text style={styles.routeMetricLab}>Distance</Text>
                      <Text style={styles.routeMetricVal}>
                        {state.routeLoading
                          ? "…"
                          : state.routeDistanceKm != null
                            ? `${state.routeDistanceKm} km`
                            : "—"}
                      </Text>
                    </View>
                    <View style={styles.routePreviewMetricDivider} />
                    <View style={styles.routePreviewMetricCol}>
                      <Text style={styles.routeMetricLab}>ETA</Text>
                      <Text style={styles.routeMetricVal}>
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
            ) : null}
          </View>

          {/* 02 Client & Commercials */}
          <View style={[styles.card, isCompactMobile && styles.cardCompact]}>
            <View style={styles.cardHead}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>02</Text>
              </View>
              <Text style={[styles.cardTitle, isCompactMobile && styles.cardTitleCompact]}>Client & Commercials</Text>
            </View>

            <View style={[styles.gridRow, isWide && styles.gridRowWide]}>
              <View style={styles.gridCol}>
                <View style={styles.sectionLabelRow}>
                  <Text style={[styles.label, labelStyle, styles.sectionLabelTight]}>
                    Select client
                  </Text>
                  <View style={styles.sectionLabelActions}>
                    {state.clientId ? (
                      <TouchableOpacity
                        style={styles.changeSelectionBtn}
                        onPress={() => setClientListExpanded((p) => !p)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.changeSelectionBtnText}>
                          {clientListExpanded ? "Collapse" : "Change"}
                        </Text>
                        <FontAwesome
                          name={clientListExpanded ? "chevron-up" : "chevron-down"}
                          size={11}
                          color={Theme.iconPrimary}
                        />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[
                        styles.addClientBtn,
                        Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
                      ]}
                      onPress={handleAddClientShortcut}
                      activeOpacity={0.85}
                    >
                      <PlusCircle size={14} color={Theme.iconPrimary} />
                      <Text style={styles.addClientBtnText}>Add client</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {clientsLoading ? (
                  <ActivityIndicator color={Theme.iconPrimary} />
                ) : clients.length === 0 ? (
                  <Text style={styles.mutedSmall}>
                    No clients yet. Add clients from the Clients page first.
                  </Text>
                ) : state.clientId && !clientListExpanded && selectedClientRow ? (
                  <TouchableOpacity
                    style={[styles.clientCard, styles.clientCardOn]}
                    onPress={() => setClientListExpanded(true)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.clientMain}>
                      <PartyAvatar
                        name={selectedClientRow.name ?? selectedClientRow.contact_person ?? "Client"}
                        avatarUrl={
                          (selectedClientRow as { avatar_url?: string | null }).avatar_url ?? null
                        }
                        avatarSeed={
                          (selectedClientRow as { avatar_seed?: string | null }).avatar_seed ?? null
                        }
                        entityType="client"
                        size={38}
                        borderStyle={styles.clientAvatarOn}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.clientName, styles.clientNameOn]} numberOfLines={1}>
                          {selectedClientRow.name}
                        </Text>
                        {selectedClientRow.address ? (
                          <Text style={styles.clientSub} numberOfLines={1}>
                            {selectedClientRow.address}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.changeSelectionPill}>
                      <Text style={styles.changeSelectionPillText}>Change</Text>
                    </View>
                  </TouchableOpacity>
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
                          <View style={styles.clientMain}>
                            <PartyAvatar
                              name={c.name ?? c.contact_person ?? "Client"}
                              avatarUrl={
                                (c as { avatar_url?: string | null }).avatar_url ?? null
                              }
                              avatarSeed={
                                (c as { avatar_seed?: string | null }).avatar_seed ?? null
                              }
                              entityType="client"
                              size={38}
                              borderStyle={selected ? styles.clientAvatarOn : styles.clientAvatar}
                            />
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
                <Text style={[styles.label, labelStyle, styles.sectionLabelTight]}>
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
                    ref={clientPriceInputRef}
                    keyboardType="decimal-pad"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => {
                      if (supplyIsAsset) {
                        if (state.assignLater) {
                          focusField(notesInputRef);
                        } else {
                          openPickerNext("driver");
                        }
                        return;
                      }
                      openSupplierPickerNext();
                    }}
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
          <View style={[styles.card, isCompactMobile && styles.cardCompact]}>
            <View style={styles.cardHead}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>03</Text>
              </View>
              <Text style={[styles.cardTitle, isCompactMobile && styles.cardTitleCompact]}>Supply & Allocation</Text>
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
                  color={supplyIsAsset ? Theme.textOnPrimary : "rgba(255,255,255,0.7)"}
                />
                <Text
                  style={[
                    styles.segmentLab,
                    supplyIsAsset && styles.segmentLabOn,
                  ]}
                >
                  Asset
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
                  color={!supplyIsAsset ? Theme.textOnPrimary : "rgba(255,255,255,0.7)"}
                />
                <Text
                  style={[
                    styles.segmentLab,
                    !supplyIsAsset && styles.segmentLabOn,
                  ]}
                >
                  Aggregate
                </Text>
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.assignLaterCard,
                { marginBottom: 16 },
                assignLaterSwitchDisabled && styles.assignLaterCardDisabled,
              ]}
            >
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
                  {assignLaterSwitchDisabled ? (
                    <Text style={styles.assignLaterLockedHint}>
                      Remove driver or vehicle assignment to enable assign later.
                    </Text>
                  ) : null}
                </View>
              </View>
              <Switch
                value={state.assignLater}
                onValueChange={setters.setAssignLater}
                disabled={assignLaterSwitchDisabled}
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
                        : "Some drivers are currently on active trips. Select an available driver or use Assign later."}
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
                        : "Vehicles marked 'On trip' are currently busy. Choose an available vehicle or use Assign later."}
                    </Text>
                  </View>
                ) : null}

                {!state.assignLater ? (
                  <View style={[styles.gridRow, isWide && styles.gridRowWide]}>
                    <View style={styles.gridCol}>
                      <View
                        style={[
                          styles.sectionLabelRow,
                          !isWide && styles.sectionLabelRowStack,
                        ]}
                      >
                        <Text style={[styles.label, labelStyle, styles.sectionLabelTight]}>
                          Assign driver *
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.addClientBtn,
                            !isWide && styles.addClientBtnCompact,
                            Platform.OS === "web"
                              ? ({ cursor: "pointer" } as ViewStyle)
                              : null,
                          ]}
                          onPress={handleAddDriverShortcut}
                          activeOpacity={0.85}
                        >
                          <PlusCircle size={14} color={Theme.iconPrimary} />
                          <Text style={styles.addClientBtnText}>Add driver</Text>
                        </TouchableOpacity>
                      </View>
                      {fleetLoading ? (
                        <ActivityIndicator color={Theme.iconPrimary} />
                      ) : isCompactMobile ? (
                        <View style={styles.mobileListWrap}>
                          {driverOptions.length === 0 ? (
                            <View style={styles.emptyListCard}>
                              <Text style={styles.emptyListText}>
                                No drivers added yet. Add a driver to continue.
                              </Text>
                            </View>
                          ) : (
                            driverOptions.map((d) => {
                              const selected = state.driverId === d.id;
                              const sub = [d.phone, d.email].filter(Boolean).join(" · ");
                              return (
                                <TouchableOpacity
                                  key={d.id}
                                  style={[
                                    styles.clientCard,
                                    styles.clientCardMobile,
                                    d.isBusy && styles.clientCardDisabled,
                                    selected && styles.clientCardOn,
                                    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
                                  ]}
                                  onPress={() => {
                                    if (d.isBusy) return;
                                    setters.setDriverId(selected ? null : d.id);
                                  }}
                                  disabled={d.isBusy}
                                  activeOpacity={0.85}
                                >
                                  <View style={styles.clientMain}>
                                    <PartyAvatar
                                      name={d.name ?? "Driver"}
                                      avatarUrl={(d as { avatar_url?: string | null }).avatar_url ?? null}
                                      avatarSeed={(d as { avatar_seed?: string | null }).avatar_seed ?? null}
                                      entityType="driver"
                                      size={38}
                                      borderStyle={selected ? styles.clientAvatarOn : styles.clientAvatar}
                                    />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                      <Text style={[styles.clientName, selected && styles.clientNameOn]} numberOfLines={1}>
                                        {d.name || "—"}
                                      </Text>
                                      {sub ? <Text style={styles.clientSub} numberOfLines={1}>{sub}</Text> : null}
                                    </View>
                                  </View>
                                {d.isBusy ? (
                                  <View style={styles.busyPill}>
                                    <Text style={styles.busyPillText}>On trip</Text>
                                  </View>
                                ) : (
                                  <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
                                    {selected ? <CheckCircle2 size={16} color={Theme.iconPrimary} /> : null}
                                  </View>
                                )}
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </View>
                      ) : (
                        <ScrollView
                          style={[
                            styles.clientList,
                            isCompactMobile && styles.clientListCompact,
                          ]}
                          nestedScrollEnabled={!isCompactMobile}
                          scrollEnabled={!isCompactMobile}
                          keyboardShouldPersistTaps="handled"
                        >
                          {driverOptions.map((d) => {
                            const selected = state.driverId === d.id;
                            const sub = [d.phone, d.email].filter(Boolean).join(" · ");
                            return (
                              <TouchableOpacity
                                key={d.id}
                                style={[
                                  styles.clientCard,
                                  d.isBusy && styles.clientCardDisabled,
                                  selected && styles.clientCardOn,
                                  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
                                ]}
                                onPress={() => {
                                  if (d.isBusy) return;
                                  setters.setDriverId(selected ? null : d.id);
                                }}
                                disabled={d.isBusy}
                                activeOpacity={0.85}
                              >
                                <View style={styles.clientMain}>
                                  <PartyAvatar
                                    name={d.name ?? "Driver"}
                                    avatarUrl={(d as { avatar_url?: string | null }).avatar_url ?? null}
                                    avatarSeed={(d as { avatar_seed?: string | null }).avatar_seed ?? null}
                                    entityType="driver"
                                    size={38}
                                    borderStyle={selected ? styles.clientAvatarOn : styles.clientAvatar}
                                  />
                                  <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={[styles.clientName, selected && styles.clientNameOn]} numberOfLines={1}>
                                      {d.name || "—"}
                                    </Text>
                                    {sub ? <Text style={styles.clientSub} numberOfLines={1}>{sub}</Text> : null}
                                  </View>
                                </View>
                                {d.isBusy ? (
                                  <View style={styles.busyPill}>
                                    <Text style={styles.busyPillText}>On trip</Text>
                                  </View>
                                ) : (
                                  <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
                                    {selected ? <CheckCircle2 size={16} color={Theme.iconPrimary} /> : null}
                                  </View>
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                    <View style={styles.gridCol}>
                      <View
                        style={[
                          styles.sectionLabelRow,
                          !isWide && styles.sectionLabelRowStack,
                        ]}
                      >
                        <Text style={[styles.label, labelStyle, styles.sectionLabelTight]}>
                          Vehicle *
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.addClientBtn,
                            !isWide && styles.addClientBtnCompact,
                            Platform.OS === "web"
                              ? ({ cursor: "pointer" } as ViewStyle)
                              : null,
                          ]}
                          onPress={handleAddVehicleShortcut}
                          activeOpacity={0.85}
                        >
                          <PlusCircle size={14} color={Theme.iconPrimary} />
                          <Text style={styles.addClientBtnText}>Add vehicle</Text>
                        </TouchableOpacity>
                      </View>
                      {fleetLoading ? (
                        <ActivityIndicator color={Theme.iconPrimary} />
                      ) : isCompactMobile ? (
                        <View style={styles.mobileListWrap}>
                          {vehicleOptions.length === 0 ? (
                            <View style={styles.emptyListCard}>
                              <Text style={styles.emptyListText}>
                                No vehicles added yet. Add a vehicle to continue.
                              </Text>
                            </View>
                          ) : (
                            vehicleOptions.map((v) => {
                              const selected = state.vehicleId === v.id;
                              const primary = formatIndianVehicleNumber(v.vehicle_number || "") || "—";
                              const secondary = [v.vehicle_body_type || v.vehicle_type, [v.vehicle_size, v.vehicle_axle].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
                              return (
                                <TouchableOpacity
                                  key={v.id}
                                  style={[
                                    styles.clientCard,
                                    styles.clientCardMobile,
                                    v.isBusy && styles.clientCardDisabled,
                                    selected && styles.clientCardOn,
                                    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
                                  ]}
                                  onPress={() => {
                                    if (v.isBusy) return;
                                    setters.setVehicleId(selected ? null : v.id);
                                  }}
                                  disabled={v.isBusy}
                                  activeOpacity={0.85}
                                >
                                  <View style={styles.clientMain}>
                                    <View style={styles.vehicleCardIcon}>
                                      <Truck size={18} color={Theme.iconPrimary} />
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                      <Text style={[styles.clientName, selected && styles.clientNameOn]} numberOfLines={1}>
                                        {primary}
                                      </Text>
                                      {secondary ? <Text style={styles.clientSub} numberOfLines={1}>{secondary.toUpperCase()}</Text> : null}
                                    </View>
                                  </View>
                                {v.isBusy ? (
                                  <View style={styles.busyPill}>
                                    <Text style={styles.busyPillText}>On trip</Text>
                                  </View>
                                ) : (
                                  <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
                                    {selected ? <CheckCircle2 size={16} color={Theme.iconPrimary} /> : null}
                                  </View>
                                )}
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </View>
                      ) : (
                        <ScrollView
                          style={[
                            styles.clientList,
                            isCompactMobile && styles.clientListCompact,
                          ]}
                          nestedScrollEnabled={!isCompactMobile}
                          scrollEnabled={!isCompactMobile}
                          keyboardShouldPersistTaps="handled"
                        >
                          {vehicleOptions.map((v) => {
                            const selected = state.vehicleId === v.id;
                            const primary = formatIndianVehicleNumber(v.vehicle_number || "") || "—";
                            const secondary = [v.vehicle_body_type || v.vehicle_type, [v.vehicle_size, v.vehicle_axle].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
                            return (
                              <TouchableOpacity
                                key={v.id}
                                style={[
                                  styles.clientCard,
                                  v.isBusy && styles.clientCardDisabled,
                                  selected && styles.clientCardOn,
                                  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
                                ]}
                                onPress={() => {
                                  if (v.isBusy) return;
                                  setters.setVehicleId(selected ? null : v.id);
                                }}
                                disabled={v.isBusy}
                                activeOpacity={0.85}
                              >
                                <View style={styles.clientMain}>
                                  <View style={styles.vehicleCardIcon}>
                                    <Truck size={18} color={Theme.iconPrimary} />
                                  </View>
                                  <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={[styles.clientName, selected && styles.clientNameOn]} numberOfLines={1}>
                                      {primary}
                                    </Text>
                                    {secondary ? <Text style={styles.clientSub} numberOfLines={1}>{secondary.toUpperCase()}</Text> : null}
                                  </View>
                                </View>
                                {v.isBusy ? (
                                  <View style={styles.busyPill}>
                                    <Text style={styles.busyPillText}>On trip</Text>
                                  </View>
                                ) : (
                                  <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
                                    {selected ? <CheckCircle2 size={16} color={Theme.iconPrimary} /> : null}
                                  </View>
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <View style={[styles.aggregateSplit, isWide && styles.aggregateSplitWide]}>
                  <View style={styles.aggregateLeftPane}>
                <View style={styles.sectionLabelRow}>
                  <Text style={[styles.label, labelStyle, styles.sectionLabelTight]}>
                    Transport partner *
                  </Text>
                  <View style={styles.sectionLabelActions}>
                    {state.supplierId ? (
                      <TouchableOpacity
                        style={styles.changeSelectionBtn}
                        onPress={() => setPartnerListExpanded((p) => !p)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.changeSelectionBtnText}>
                          {partnerListExpanded ? "Collapse" : "Change"}
                        </Text>
                        <FontAwesome
                          name={partnerListExpanded ? "chevron-up" : "chevron-down"}
                          size={11}
                          color={Theme.iconPrimary}
                        />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[
                        styles.addClientBtn,
                        Platform.OS === "web"
                          ? ({ cursor: "pointer" } as ViewStyle)
                          : null,
                      ]}
                      onPress={handleAddSupplierShortcut}
                      activeOpacity={0.85}
                    >
                      <PlusCircle size={14} color={Theme.iconPrimary} />
                      <Text style={styles.addClientBtnText}>Add partner</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {suppliersLoading ? (
                  <ActivityIndicator color={Theme.iconPrimary} />
                ) : suppliers.length === 0 ? (
                  <Text style={styles.mutedSmall}>
                    No partners yet. Add suppliers from your network first.
                  </Text>
                ) : state.supplierId && !partnerListExpanded && selectedSupplierRow ? (
                  <TouchableOpacity
                    style={[styles.clientCard, styles.clientCardOn]}
                    onPress={() => setPartnerListExpanded(true)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.clientMain}>
                      <PartyAvatar
                        name={selectedSupplierRow.company_name?.trim() || selectedSupplierRow.name?.trim() || "—"}
                        organizationImageUrl={(selectedSupplierRow as { organization_avatar_url?: string | null }).organization_avatar_url ?? null}
                        organizationAvatarSeed={(selectedSupplierRow as { organization_avatar_seed?: string | null }).organization_avatar_seed ?? null}
                        avatarUrl={(selectedSupplierRow as { avatar_url?: string | null }).avatar_url ?? null}
                        avatarSeed={(selectedSupplierRow as { avatar_seed?: string | null }).avatar_seed ?? null}
                        entityType="supplier"
                        size={38}
                        borderStyle={styles.clientAvatarOn}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.clientName, styles.clientNameOn]} numberOfLines={1}>
                          {selectedSupplierRow.company_name?.trim() || selectedSupplierRow.name?.trim() || "—"}
                        </Text>
                        <Text style={styles.clientSub} numberOfLines={1}>
                          {[selectedSupplierRow.supplier_type, selectedSupplierRow.phone, selectedSupplierRow.email].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.changeSelectionPill}>
                      <Text style={styles.changeSelectionPillText}>Change</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <ScrollView style={styles.clientList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {suppliers.map((s) => {
                      const selected = state.supplierId === s.id;
                      const primary = s.company_name?.trim() || s.name?.trim() || "—";
                      const secondary = [s.supplier_type, s.phone, s.email].filter(Boolean).join(" · ");
                      return (
                        <TouchableOpacity
                          key={s.id}
                          style={[styles.clientCard, selected && styles.clientCardOn, Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null]}
                          onPress={() => {
                            setters.setSupplierId(selected ? null : s.id);
                            if (!selected) setPartnerListExpanded(false);
                          }}
                          activeOpacity={0.85}
                        >
                          <View style={styles.clientMain}>
                            <PartyAvatar
                              name={primary}
                              organizationImageUrl={(s as { organization_avatar_url?: string | null }).organization_avatar_url ?? null}
                              organizationAvatarSeed={(s as { organization_avatar_seed?: string | null }).organization_avatar_seed ?? null}
                              avatarUrl={(s as { avatar_url?: string | null }).avatar_url ?? null}
                              avatarSeed={(s as { avatar_seed?: string | null }).avatar_seed ?? null}
                              entityType="supplier"
                              size={38}
                              borderStyle={selected ? styles.clientAvatarOn : styles.clientAvatar}
                            />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[styles.clientName, selected && styles.clientNameOn]} numberOfLines={1}>
                                {primary}
                              </Text>
                              {secondary ? <Text style={styles.clientSub} numberOfLines={1}>{secondary}</Text> : null}
                            </View>
                          </View>
                          <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
                            {selected ? <CheckCircle2 size={16} color={Theme.iconPrimary} /> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
                  </View>
                  <View style={styles.aggregateRightPane}>

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
                      ref={supplierRateInputRef}
                      keyboardType="decimal-pad"
                      returnKeyType="next"
                      onSubmitEditing={() => focusField(advancePaidInputRef)}
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
                      ref={advancePaidInputRef}
                      keyboardType="decimal-pad"
                      returnKeyType="next"
                      onSubmitEditing={() => {
                        if (state.assignLater) {
                          focusField(notesInputRef);
                        } else {
                          focusField(driverPhoneInputRef);
                        }
                      }}
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
                            ref={driverPhoneInputRef}
                            returnKeyType="next"
                            onSubmitEditing={() =>
                              focusField(aggregateVehicleInputRef)
                            }
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
                                  Platform.OS === "ios" ? "Menlo" : "monospace",
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
                            ref={aggregateVehicleInputRef}
                            returnKeyType="next"
                            onSubmitEditing={() => focusField(notesInputRef)}
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
                  </View>
                </View>
              </>
            )}

          </View>

          {/* 04 Notes */}
          <View style={[styles.card, isCompactMobile && styles.cardCompact]}>
            <View style={styles.cardHead}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>04</Text>
              </View>
              <Text style={[styles.cardTitle, isCompactMobile && styles.cardTitleCompact]}>Notes & Instructions</Text>
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
                ref={notesInputRef}
                multiline
              />
            </View>
          </View>

          {showInlineCta ? (
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
                  {validationMessage ?? "Please fill all mandatory fields to continue"}
                </Text>
              ) : null}
            </View>
          ) : null}
            </View>

            {isDesktopPreview ? (
              <View style={styles.previewColumn}>
                <View style={[styles.previewCard, styles.previewCardDesktop]} pointerEvents="none">
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
                    {state.pickupArea.trim() && state.dropLocation.trim() ? (
                      <View style={styles.previewRow2}>
                        <View style={styles.previewCell}>
                          <Text style={styles.previewLab}>Distance</Text>
                          <Text style={styles.previewVal}>
                            {state.routeLoading
                              ? "…"
                              : state.routeDistanceKm != null
                                ? `${state.routeDistanceKm} km`
                                : "—"}
                          </Text>
                        </View>
                        <View style={styles.previewCell}>
                          <Text style={styles.previewLab}>ETA</Text>
                          <Text style={styles.previewVal}>
                            {state.routeLoading
                              ? "…"
                              : state.routeEtaLabel != null
                                ? state.routeEtaLabel
                                : "—"}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    <View style={styles.previewDivider} />
                    {!supplyIsAsset ? (
                      <View style={styles.previewRow2}>
                        <View style={styles.previewCell}>
                          <Text style={styles.previewLab}>Partner</Text>
                          <Text style={styles.previewVal} numberOfLines={1}>
                            {selectedPartnerName || "—"}
                          </Text>
                        </View>
                        <View style={styles.previewCell}>
                          <Text style={styles.previewLab}>Partner rate</Text>
                          <Text style={[styles.previewValStrong, { color: Theme.negative }]}>
                            ₹{state.supplierRate.trim() || "0"}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    <View style={styles.previewRow2}>
                      <View style={styles.previewCell}>
                        <Text style={styles.previewLab}>Client</Text>
                        <Text style={styles.previewVal} numberOfLines={1}>
                          {state.clientName.trim() || "—"}
                        </Text>
                      </View>
                      <View style={styles.previewCell}>
                        <Text style={styles.previewLab}>Revenue</Text>
                        <Text style={[styles.previewValStrong, { color: Theme.darkGreen }]}>
                          ₹{state.clientPrice.trim() || "0"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.previewFoot}>
                      <Text style={styles.previewFootLeft}>
                        {supplyIsAsset ? "Asset" : "Aggregate"}
                      </Text>
                      <Text style={styles.previewFootRight} numberOfLines={1}>
                        {previewFooterValue}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* Floating preview — hidden on very narrow widths to avoid blocking the form */}
      {showFloatingPreview ? (
        mobilePreviewExpanded ? (
          <View
            style={[
              styles.previewCard,
              {
                width: floatingPreviewWidth,
                bottom: insets.bottom + 16,
                right: Math.max(16, insets.right + 8),
              },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.previewHead}>
              <Text style={styles.previewHeadTitle}>Trip Preview</Text>
              <View style={styles.previewHeadRight}>
                <View style={styles.livePill}>
                  <Text style={styles.livePillText}>Live</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setMobilePreviewExpanded(false)}
                  style={styles.previewCollapseBtn}
                  activeOpacity={0.8}
                >
                  <FontAwesome name="chevron-down" size={10} color={Theme.textOnPrimary} />
                </TouchableOpacity>
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
            {state.pickupArea.trim() && state.dropLocation.trim() ? (
              <View style={styles.previewRow2}>
                <View style={styles.previewCell}>
                  <Text style={styles.previewLab}>Distance</Text>
                  <Text style={styles.previewVal}>
                    {state.routeLoading
                      ? "…"
                      : state.routeDistanceKm != null
                        ? `${state.routeDistanceKm} km`
                        : "—"}
                  </Text>
                </View>
                <View style={styles.previewCell}>
                  <Text style={styles.previewLab}>ETA</Text>
                  <Text style={styles.previewVal}>
                    {state.routeLoading
                      ? "…"
                      : state.routeEtaLabel != null
                        ? state.routeEtaLabel
                        : "—"}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.previewDivider} />
            {!supplyIsAsset ? (
              <View style={styles.previewRow2}>
                <View style={styles.previewCell}>
                  <Text style={styles.previewLab}>Partner</Text>
                  <Text style={styles.previewVal} numberOfLines={1}>
                    {selectedPartnerName || "—"}
                  </Text>
                </View>
                <View style={styles.previewCell}>
                  <Text style={styles.previewLab}>Partner rate</Text>
                  <Text style={[styles.previewValStrong, { color: Theme.negative }]}>
                    ₹{state.supplierRate.trim() || "0"}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.previewRow2}>
              <View style={styles.previewCell}>
                <Text style={styles.previewLab}>Client</Text>
                <Text style={styles.previewVal} numberOfLines={1}>
                  {state.clientName.trim() || "—"}
                </Text>
              </View>
              <View style={styles.previewCell}>
                <Text style={styles.previewLab}>Revenue</Text>
                <Text style={[styles.previewValStrong, { color: Theme.darkGreen }]}>
                  ₹{state.clientPrice.trim() || "0"}
                </Text>
              </View>
            </View>
            <View style={styles.previewFoot}>
              <Text style={styles.previewFootLeft}>
                {supplyIsAsset ? "Asset" : "Aggregate"}
              </Text>
              <Text style={styles.previewFootRight} numberOfLines={1}>
                {previewFooterValue}
              </Text>
            </View>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.previewCollapsedChip,
              {
                bottom: insets.bottom + 16,
                right: Math.max(16, insets.right + 8),
              },
            ]}
            onPress={() => setMobilePreviewExpanded(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.previewCollapsedChipText}>Trip Preview</Text>
            <FontAwesome name="chevron-up" size={11} color={Theme.textOnPrimary} />
          </TouchableOpacity>
        )
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
    maxWidth: 1400,
    alignSelf: "center",
  },
  mainGrid: {
    width: "100%",
  },
  mainGridDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 24,
  },
  formColumn: {
    flex: 1,
    minWidth: 0,
  },
  previewColumn: {
    width: 360,
    paddingTop: 4,
    alignSelf: "stretch",
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 18,
    marginBottom: 18,
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
  cardCompact: {
    padding: 14,
    borderRadius: 16,
    marginBottom: 14,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    paddingBottom: 11,
    marginBottom: 14,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(2, 6, 23, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.iconPrimary,
  },
  cardTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.45,
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  cardTitleCompact: {
    fontSize: 17,
    letterSpacing: -0.25,
  },
  gridRow: { gap: 14 },
  gridRowWide: { flexDirection: "row", alignItems: "stretch", gap: 20 },
  gridCol: { flex: 1, minWidth: 0 },
  aggregateSplit: {
    gap: 14,
  },
  aggregateSplitWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
  },
  aggregateLeftPane: {
    flex: 1,
    minWidth: 0,
  },
  aggregateRightPane: {
    flex: 1,
    minWidth: 0,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 8,
  },
  sectionLabelRowStack: {
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  sectionLabelActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 8,
  },
  sectionLabelTight: {
    marginBottom: 0,
  },
  changeSelectionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  changeSelectionBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.iconPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  addClientBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  addClientBtnCompact: {
    marginTop: 2,
    alignSelf: "flex-start",
  },
  addClientBtnText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.iconPrimary,
  },
  changeSelectionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
  },
  changeSelectionPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.iconPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    marginBottom: 8,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  input: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "500",
    minHeight: 52,
    marginBottom: 10,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
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
    fontSize: 14,
    fontWeight: "500",
    minHeight: 52,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceForm,
    color: Theme.textPrimary,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  fakeInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 2,
    minHeight: 52,
  },
  dateInputTrigger: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quickDateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  quickDateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  quickDateChipActive: {
    borderColor: Theme.iconPrimary,
    backgroundColor: Theme.surfaceLight,
  },
  quickDateChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  quickDateChipTextActive: {
    color: Theme.iconPrimary,
  },
  dateTouchable: {
    justifyContent: "center",
  },
  dateTouchableText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  dateTouchablePlaceholder: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.placeholder,
  },
  datePickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "flex-end",
  },
  datePickerSheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderColor: Theme.borderLight,
  },
  datePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  datePickerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  datePickerDone: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.iconPrimary,
  },
  pickerInner: {
    paddingLeft: 44,
    paddingRight: 12,
    flex: 1,
  },
  pickerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
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
  routePreviewPanel: {
    marginTop: 6,
    marginBottom: 14,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: "0 2px 12px rgba(15,23,42,0.07)",
      },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
      },
    }),
  },
  routePreviewHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: Theme.surfaceGray,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  routePreviewHeroText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "500",
    fontStyle: "italic",
    letterSpacing: -0.25,
    lineHeight: 20,
    color: Theme.textPrimaryDark,
  },
  routePreviewMetrics: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Theme.cardWhite,
    borderTopWidth: 0,
  },
  routePreviewMetricCol: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  routePreviewMetricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  routeMetricLab: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.65,
    marginBottom: 4,
  },
  routeMetricVal: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: -0.35,
    color: Theme.textPrimaryDark,
  },
  clientList: { maxHeight: 280 },
  clientListCompact: { maxHeight: undefined },
  mobileListWrap: {
    gap: 10,
    marginBottom: 2,
  },
  emptyListCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emptyListText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  clientCardMobile: {
    marginBottom: 0,
  },
  clientCardDisabled: {
    opacity: 0.6,
  },
  busyPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
  },
  busyPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  clientCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 70,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    marginBottom: 10,
    backgroundColor: Theme.cardWhite,
  },
  clientMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 8,
  },
  clientCardOn: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  clientName: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  clientNameOn: { color: Theme.iconPrimary },
  clientAvatar: {
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
  },
  clientAvatarOn: {
    borderWidth: 2,
    borderColor: Theme.textPrimaryDark,
  },
  vehicleCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  clientMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  clientSub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    flex: 1,
  },
  radioOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterOn: {
    borderColor: Theme.darkBackground,
    backgroundColor: Theme.screenBackground,
  },
  priceWrap: {
    position: "relative",
    marginBottom: 10,
  },
  rupeeIcon: {
    position: "absolute",
    left: 14,
    top: 18,
    zIndex: 1,
  },
  priceInput: {
    borderRadius: 18,
    paddingLeft: 44,
    paddingRight: 16,
    paddingVertical: 16,
    fontSize: 32,
    fontWeight: "600",
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: Theme.surfaceForm,
    color: Theme.textPrimaryDark,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  infoCallout: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.04)",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "flex-start",
  },
  infoCalloutText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 17,
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
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 17,
  },
  segment: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: "#07090C",
    borderRadius: 20,
    padding: 6,
    borderWidth: 1,
    borderColor: "#0F1318",
    marginBottom: 16,
    gap: 6,
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: "#131820",
    borderWidth: 1,
    borderColor: "#252C36",
  },
  segmentBtnOn: {
    backgroundColor: "#000000",
    borderColor: "rgba(255,255,255,0.34)",
    ...Platform.select<ViewStyle>({
      web: { boxShadow: "0 8px 20px rgba(0,0,0,0.38)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  segmentLab: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.72)",
  },
  segmentLabOn: { color: Theme.textOnPrimary },
  assignLaterCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
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
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
    marginBottom: 4,
  },
  assignLaterSub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 17,
  },
  assignLaterCardDisabled: {
    opacity: 0.72,
  },
  assignLaterLockedHint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 8,
    lineHeight: 16,
  },
  warningText: {
    fontSize: 11,
    fontWeight: "500",
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
    fontSize: 10,
    fontWeight: "500",
    color: Theme.warning,
    lineHeight: 16,
  },
  notesInput: {
    minHeight: 84,
    textAlignVertical: "top",
    paddingTop: 14,
    borderRadius: 16,
    borderWidth: 2,
    fontSize: 14,
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
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  previewCard: {
    position: "absolute",
    width: 336,
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
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
  previewCardDesktop: {
    position: "relative",
    width: "100%",
    right: undefined,
    bottom: undefined,
    marginTop: 4,
    ...Platform.select<ViewStyle>({
      web: {
        position: "sticky" as const,
        top: 20,
      },
      default: {},
    }),
  },
  previewHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.darkSurface,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  previewHeadRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewHeadTitle: {
    fontSize: 11,
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
  previewCollapseBtn: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  previewCollapsedChip: {
    position: "absolute",
    zIndex: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.darkSurface,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    ...Platform.select<ViewStyle>({
      web: { boxShadow: "0 10px 24px rgba(15,23,42,0.2)" },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 10,
        elevation: 4,
      },
    }),
  },
  previewCollapsedChipText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  previewBody: { padding: 14, gap: 10 },
  previewLine: { gap: 4 },
  previewLab: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  previewVal: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  previewDivider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 6,
  },
  previewRow2: { flexDirection: "row", gap: 10 },
  previewCell: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  previewValStrong: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: Theme.textPrimaryDark,
  },
  previewFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Theme.surfaceLight,
    marginTop: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  previewFootLeft: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  previewFootRight: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    maxWidth: 150,
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
