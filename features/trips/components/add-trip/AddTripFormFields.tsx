/**
 * Create Trip — sectioned form (route, client, allocation); Theme tokens only.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import { PartyAvatar } from "@/components/PartyAvatar";
import { SmartInput } from "@/components/mobile-input";
import { type ClientRow } from "@/features/clients/services/clients.service";
import {
    getDriversByOrganization,
    type DriverRow,
    type ExistingDriverMatch,
} from "@/features/drivers/services/drivers.service";
import {
    getSuppliersByOrganization,
    type SupplierRow,
} from "@/features/suppliers/services/suppliers.service";
import {
  getDriverAvailabilityByPhoneGlobal,
  getTripsByOrganization,
} from "@/features/trips/services/trips.service";
import {
    getVehiclesByOrganization,
    type VehicleRow,
} from "@/features/vehicles/services/vehicles.service";
import { AssignmentEntityPicker } from "@/features/trips/components/AssignmentEntityPicker";
import { SupplyAllocationModeBar } from "@/features/trips/components/SupplyAllocationModeBar";
import { assignmentShellStyles } from "@/features/trips/styles/assignmentShellShared";
import {
    formatIndianVehicleNumber,
    formatIndianVehicleNumberInput,
    formatMobileNumber,
} from "@/lib/format";
import {
  applyIndianVehicleKeystroke,
  getIndianVehicleFormatHint,
  getIndianVehicleKeyboardType,
  getIndianVehicleNormalizedLength,
} from "@/lib/indianVehicleInput.util";
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
    PlusCircle,
    Truck,
    User,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import type { TextStyle, ViewStyle } from "react-native";
import {
    ActivityIndicator,
    Keyboard,
    Modal,
    Platform,
    Pressable,
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
import { ADD_TRIP_FORM } from "./addTripFormTokens";
import { AddTripWebCurrencyField } from "./AddTripWebCurrencyField";
import { PULSE_TRIP, PULSE_TRIP_RADIUS } from "./addTripPulseTheme";
import type { AllocationSubStep } from "./allocationWizardSteps";
import { useKeyboardAccessory } from "@/contexts/KeyboardAccessoryContext";
import { AggregateTrackingMobileStep } from "./AggregateTrackingMobileStep";
import { DriverPhoneRecommendations } from "./DriverPhoneRecommendations";
import { lookupDriversByPhoneVariants } from "@/features/trips/utils/driverPhoneLookup.util";
import { LocationSearchField } from "./LocationSearchField";
import type { AddTripFormState } from "./types";
import { TripCommodityFields } from "./TripCommodityFields";
import type { AddTripSourceIndent } from "./types";
import type { AddTripIssueField, AddTripValidationIssue } from "./useAddTripForm";
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
/** Transaction-row label tint on Create Trip (FinanceTxnTypography.fieldLabel uses textSecondary). */
const labelStyle = { color: Theme.textMutedDemo };
const TRIP_TERMINAL_STATUSES = new Set([
  "completed",
  "cancelled",
  "done",
  "delivered",
]);

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
  validationIssues?: AddTripValidationIssue[];
  submitting?: boolean;
  showInlineCta?: boolean;
  /** Keep Create Trip tappable while invalid; parent passes empty validationIssues until submit attempt. */
  enablePrimaryWhenInvalid?: boolean;
  /**
   * Mobile wizard mode: show a single section card at a time.
   * When unset, renders the full 01/02/03 cards.
   */
  wizardSection?: "route" | "commodity" | "client" | "allocation";
  sourceIndent?: AddTripSourceIndent | null;
  /** Mobile allocation sub-step (one screen at a time). */
  allocationSubStep?: AllocationSubStep;
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
  validationIssues = [],
  submitting = false,
  showInlineCta = true,
  enablePrimaryWhenInvalid = false,
  wizardSection,
  allocationSubStep,
  sourceIndent = null,
}: AddTripFormFieldsProps) {
  void refetchClients;
  const invalidSet = useMemo(
    () => new Set(validationIssues.map((i) => i.field)),
    [validationIssues],
  );
  const invalid = useCallback(
    (field: AddTripIssueField) => invalidSet.has(field),
    [invalidSet],
  );
  const outlineErr = useCallback(
    (field: AddTripIssueField) =>
      invalid(field) ? styles.inputErrorOutline : undefined,
    [invalid],
  );

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const isCompactMobile = winW < 480;
  const isWeb = Platform.OS === "web";
  const useWebCurrencyField = isWeb && winW >= 720;
  /** Native app + narrow web: tighter fields and section padding. */
  const isDenseForm = !isWeb || winW < 600;
  const iconFieldInputStyle = [
    styles.iconInput,
    inputStyle,
    isDenseForm && styles.iconInputDense,
  ];
  const primaryCtaDisabled = enablePrimaryWhenInvalid
    ? submitting
    : !canSubmit || submitting;
  const isWide = winW >= 720;
  /** Partner + allocation panes side-by-side (aggregate). */
  const allocationWideLayout = winW >= 920;
  /**
   * Driver phone + vehicle reg (aggregate) or assign driver + vehicle (asset) in one row.
   * Higher than `allocationWideLayout` so laptops ~1024–1100px don’t split those fields in half.
   */
  const driverVehicleSideBySide = winW >= 1100;
  /** Web only: CSS grid — row1 route|commodity; row2 client; row3 supply; row4 CTA. */
  const desktopFormGrid =
    Platform.OS === "web" && winW >= 1080 && !isCompactMobile;
  /** Desktop form shell: use viewport minus padding, capped so ultra-wide stays readable. */
  const desktopFormMaxWidth = Math.min(winW - 28, 1680);
  const showRouteCard = wizardSection == null || wizardSection === "route";
  const showCommodityCard =
    wizardSection == null || wizardSection === "commodity";
  const showClientCard = wizardSection == null || wizardSection === "client";
  const hideTonsOnRouteStep = wizardSection === "route";
  const showAllocationCard =
    wizardSection == null || wizardSection === "allocation";
  const mobileAllocWizard = allocationSubStep != null;
  const isWizardRouteStep = wizardSection === "route";
  const isWizardSingleCard =
    wizardSection != null && wizardSection !== "allocation";
  const isWizardAllocationCard = wizardSection === "allocation";
  /** Web desktop: phone + recommendations side-by-side in allocation card. */
  const webPhoneRecsAside =
    isWeb && winW >= 720 && winW >= 1080 && !mobileAllocWizard;
  const fieldLabelStyle = [
    styles.label,
    labelStyle,
    isDenseForm && styles.labelDense,
    isWizardSingleCard && styles.labelWizard,
  ];
  const fieldInputStyle = [
    styles.input,
    inputStyle,
    isDenseForm && styles.inputDense,
    isWizardSingleCard && styles.inputWizardDense,
  ];
  const showAlloc = useCallback(
    (step: AllocationSubStep) =>
      allocationSubStep == null || allocationSubStep === step,
    [allocationSubStep],
  );
  const showDriverNameField =
    !mobileAllocWizard || allocationSubStep === "driverName";
  const showDriverPhoneField =
    !mobileAllocWizard || allocationSubStep === "driverPhone";
  const showVehicleField =
    !mobileAllocWizard || allocationSubStep === "vehicle";
  /** Asset fleet pickers share the supply sub-step on mobile (not separate steps). */
  const showAssetFleetInline =
    mobileAllocWizard &&
    allocationSubStep === "supply" &&
    state.supplySource === "asset" &&
    !state.assignLater;
  /** Aggregate partner list on the supply sub-step (mobile). */
  const showAggregatePartnerInline =
    mobileAllocWizard &&
    allocationSubStep === "supply" &&
    state.supplySource === "aggregate";
  const aggregateTrackingStep = showDriverPhoneField
    ? ("driverPhone" as const)
    : showDriverNameField
      ? ("driverName" as const)
      : showVehicleField
        ? ("vehicle" as const)
        : null;
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  /** Expanded picker vs minimized summary chip — start collapsed when a value is already set. */
  const [clientListExpanded, setClientListExpanded] = useState(() => !state.clientId);
  const [driverListExpanded, setDriverListExpanded] = useState(() => !state.driverId);
  const [vehicleListExpanded, setVehicleListExpanded] = useState(() => !state.vehicleId);
  const [partnerListExpanded, setPartnerListExpanded] = useState(() => !state.supplierId);

  useEffect(() => {
    if (!state.clientId) setClientListExpanded(true);
  }, [state.clientId]);
  useEffect(() => {
    if (!state.driverId) setDriverListExpanded(true);
  }, [state.driverId]);
  useEffect(() => {
    if (!state.vehicleId) setVehicleListExpanded(true);
  }, [state.vehicleId]);
  useEffect(() => {
    if (!state.supplierId) setPartnerListExpanded(true);
  }, [state.supplierId]);
  const [pickupDropdownOpen, setPickupDropdownOpen] = useState(false);
  const [dropDropdownOpen, setDropDropdownOpen] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
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
  const aggregateDriverNameInputRef = useRef<TextInput>(null);
  const driverPhoneInputRef = useRef<TextInput>(null);
  const aggregateVehicleInputRef = useRef<TextInput>(null);
  const notesModalInputRef = useRef<TextInput>(null);
  const {
    accessoryId: kbAccessoryId,
    registerKeyboardNext,
    releaseAccessoryBar,
    dismissKeyboard,
  } = useKeyboardAccessory();

  const focusPadField = useCallback(
    (onNext: () => void, preview: string, label = "Next") => {
      registerKeyboardNext(onNext, label, preview);
    },
    [registerKeyboardNext],
  );

  const onPadValueChange = useCallback((setter: (text: string) => void, text: string) => {
    setter(text);
  }, []);

  /** End numeric entry without opening notes — notes are opened only via the notes button. */
  const finishPadFieldEntry = useCallback(() => {
    dismissKeyboard();
  }, [dismissKeyboard]);

  const focusField = useCallback((ref: { current: TextInput | null }) => {
    requestAnimationFrame(() => {
      ref.current?.focus();
    });
  }, []);

  /** Keyboard Next only — never call from onFocus (avoids iOS accessory blur races). */
  const focusNextField = useCallback(
    (ref: { current: TextInput | null }) => {
      focusField(ref);
    },
    [focusField],
  );

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

  const openNotesModal = useCallback(() => {
    setNotesModalOpen(true);
  }, []);

  useEffect(() => {
    if (!notesModalOpen) return;
    focusField(notesModalInputRef);
    const t = setTimeout(() => notesModalInputRef.current?.focus(), 160);
    return () => clearTimeout(t);
  }, [notesModalOpen, focusField]);

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
      const activeTrips = trips.filter((t) => {
        const status = String(t.status ?? "").trim().toLowerCase();
        // Keep UI in sync with server-side guards: any non-terminal trip blocks assignment.
        return !TRIP_TERMINAL_STATUSES.has(status);
      });
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
            .filter((t) => t.vehicle_id)
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
    void getSuppliersByOrganization(organizationId)
      .then((r) => {
        if (r.error) {
          if (__DEV__) {
            console.warn("[AddTrip] load suppliers:", r.error.message);
          }
          setSuppliers([]);
          return;
        }
        setSuppliers(r.suppliers);
      })
      .catch((e) => {
        if (__DEV__) {
          console.warn(
            "[AddTrip] load suppliers:",
            e instanceof Error ? e.message : e,
          );
        }
        setSuppliers([]);
      })
      .finally(() => {
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
    if (!organizationId || state.supplySource !== "aggregate") return;
    fetchSuppliers();
    if (!state.supplierId) setPartnerListExpanded(true);
  }, [organizationId, state.supplySource, fetchSuppliers, state.supplierId]);

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
  const driverPhoneLookupGenRef = useRef(0);
  const [driverPhoneMatches, setDriverPhoneMatches] = useState<ExistingDriverMatch[]>(
    [],
  );
  const [driverPhoneLookupLoading, setDriverPhoneLookupLoading] = useState(false);
  const [selectedDriverMatchId, setSelectedDriverMatchId] = useState<string | null>(
    null,
  );

  const applyDriverPhoneMatch = useCallback(
    (match: ExistingDriverMatch) => {
      const name = match.full_name?.trim() || "";
      setSelectedDriverMatchId(match.user_id);
      setters.setDriverPhoneName(name || null);
      if (name) setters.setAggregateDriverName(name);
      setters.setDriverPhoneConfirmed(Boolean(name));
    },
    [setters],
  );

  const renderDriverPhoneRecommendations = (
    phoneComplete: boolean,
    layout: "stack" | "aside" = "stack",
  ) => (
    <DriverPhoneRecommendations
      matches={driverPhoneMatches}
      loading={driverPhoneLookupLoading}
      selectedUserId={selectedDriverMatchId}
      onSelect={applyDriverPhoneMatch}
      phoneComplete={phoneComplete}
      compact={isDenseForm}
      layout={layout}
    />
  );

  useEffect(() => {
    if (state.supplySource !== "aggregate" || state.assignLater) return;
    const trimmed = state.driverPhone.trim();
    if (!trimmed) {
      setDriverPhoneMatches([]);
      setDriverPhoneLookupLoading(false);
      setSelectedDriverMatchId(null);
      setters.setDriverPhoneName(null);
      setters.setDriverPhoneConfirmed(false);
      setters.setDriverPhoneTripConflict(false, null);
      return;
    }
    if (driverPhoneLookupTimeoutRef.current)
      clearTimeout(driverPhoneLookupTimeoutRef.current);
    driverPhoneLookupTimeoutRef.current = setTimeout(() => {
      driverPhoneLookupTimeoutRef.current = null;
      const last10 = trimmed.replace(/\D/g, "").slice(-10);
      if (last10.length < 10) {
        setDriverPhoneMatches([]);
        setDriverPhoneLookupLoading(false);
        setSelectedDriverMatchId(null);
        setters.setDriverPhoneName(null);
        setters.setDriverPhoneConfirmed(false);
        setters.setDriverPhoneTripConflict(false, null);
        return;
      }

      const gen = ++driverPhoneLookupGenRef.current;
      setDriverPhoneLookupLoading(true);
      setSelectedDriverMatchId(null);
      setters.setDriverPhoneName(null);
      setters.setDriverPhoneConfirmed(false);

      lookupDriversByPhoneVariants(trimmed).then(async ({ error: err, matches }) => {
        if (driverPhoneLookupGenRef.current !== gen) return;
        setDriverPhoneLookupLoading(false);
        if (err) {
          setDriverPhoneMatches([]);
          return;
        }
        setDriverPhoneMatches(matches);

        const { error: avErr, result } = await getDriverAvailabilityByPhoneGlobal(last10, {
          anyOpenTripBlocks: true,
          requireAuthoritativeRpc: true,
        });
        if (driverPhoneLookupGenRef.current !== gen) return;

        if (avErr) {
          setters.setDriverPhoneTripConflict(true, "Busy check unavailable");
          setters.setDriverPhoneConfirmed(false);
          return;
        }
        setters.setDriverPhoneTripConflict(result.isBusy, result.ongoingTripLabel);

        if (result.isBusy) {
          setSelectedDriverMatchId(null);
          setters.setDriverPhoneName(null);
          setters.setDriverPhoneConfirmed(false);
          setters.setAggregateDriverName("");
          return;
        }

        if (matches.length === 1) {
          applyDriverPhoneMatch(matches[0]);
        }
      });
    }, 400);
    return () => {
      if (driverPhoneLookupTimeoutRef.current)
        clearTimeout(driverPhoneLookupTimeoutRef.current);
    };
  }, [
    organizationId,
    state.supplySource,
    state.assignLater,
    state.driverPhone,
    setters,
    applyDriverPhoneMatch,
  ]);

  const handleSelectClient = (c: ClientRow) => {
    if (state.clientId === c.id) return;
    releaseAccessoryBar();
    Keyboard.dismiss();
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
  const selectedDriverRow =
    driverOptions.find((d) => d.id === state.driverId) ?? null;
  const selectedVehicleRow =
    vehicleOptions.find((v) => v.id === state.vehicleId) ?? null;
  const showDriverFleetList = !state.driverId || driverListExpanded;
  const showVehicleFleetList = !state.vehicleId || vehicleListExpanded;
  const showDriverFleetSummary =
    Boolean(state.driverId && !driverListExpanded && selectedDriverRow);
  const showVehicleFleetSummary =
    Boolean(state.vehicleId && !vehicleListExpanded && selectedVehicleRow);

  const scrollBlocked =
    pickupDropdownOpen || dropDropdownOpen || notesModalOpen;

  const supplyIsAsset = state.supplySource === "asset";
  const selectedClientRow = clients.find((c) => c.id === state.clientId) ?? null;
  const selectedSupplierRow = suppliers.find((s) => s.id === state.supplierId) ?? null;
  const showPartnerList = !state.supplierId || partnerListExpanded;
  const showPartnerSummary = Boolean(
    state.supplierId && !partnerListExpanded && selectedSupplierRow,
  );
  const selectedPartnerName =
    suppliers.find((s) => s.id === state.supplierId)?.name?.trim() ?? "";
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

  return (
    <View style={styles.pageWrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isDenseForm && styles.scrollContentDense,
          isWizardSingleCard && styles.scrollContentWizard,
          {
            paddingBottom:
              Layout.sectionSpacing +
              insets.bottom +
              (desktopFormGrid ? 52 : isDenseForm ? 88 : isWide ? 68 : 108),
          },
        ]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        scrollEnabled={
          Platform.OS === "web" ? true : isCompactMobile ? true : !scrollBlocked
        }
      >
        <View
          style={[
            styles.contentMax,
            {
              maxWidth: desktopFormGrid
                ? desktopFormMaxWidth
                : isWide
                  ? 1000
                  : 960,
              paddingHorizontal: desktopFormGrid
                ? 24
                : isWide
                  ? 16
                  : isCompactMobile
                    ? 0
                    : Layout.screenPaddingHorizontal,
            },
          ]}
        >
          <View style={styles.mainGrid}>
            <View
              style={[
                styles.formColumn,
                desktopFormGrid && styles.formColumnGridWeb,
              ]}
            >
          {/* 01 Route */}
          {showRouteCard ? (
            <View
              style={[
                styles.card,
                isDenseForm && styles.cardDense,
                isWizardRouteStep && styles.cardWizardStep,
                desktopFormGrid && styles.cardGridRouteWeb,
              ]}
            >
            <View
              style={[
                styles.cardHead,
                isDenseForm && styles.cardHeadDense,
                isWizardRouteStep && styles.cardHeadWizard,
              ]}
            >
              <View
                style={[
                  styles.stepBadge,
                  isDenseForm && styles.stepBadgeDense,
                  isWizardRouteStep && styles.stepBadgeWizard,
                ]}
              >
                <Text style={styles.stepBadgeText}>01</Text>
              </View>
              <Text
                style={[
                  styles.cardTitle,
                  isDenseForm && styles.cardTitleDense,
                  isWizardRouteStep && styles.cardTitleWizard,
                ]}
              >
                Route Details
              </Text>
            </View>

            {isWizardRouteStep ? (
              <View style={styles.routeWizardBody}>
                <View style={styles.routeLocationsStack}>
                  <LocationSearchField
                    label="Pickup *"
                    placeholder="Search or pick pickup location"
                    value={state.pickupArea}
                    onChangeText={setters.setPickupArea}
                    onSelectPlace={(_name, coords) =>
                      setters.setPickupCoords(coords.lat, coords.lon)
                    }
                    leadingIcon={<MapPin size={13} color={Theme.iconMuted} />}
                    inputStyle={[...fieldInputStyle, outlineErr("pickup")]}
                    labelStyle={fieldLabelStyle}
                    compact
                    onDropdownOpenChange={setPickupDropdownOpen}
                  />
                  <LocationSearchField
                    label="Drop *"
                    placeholder="Search or pick drop location"
                    value={state.dropLocation}
                    onChangeText={setters.setDropLocation}
                    onSelectPlace={(_name, coords) =>
                      setters.setDropCoords(coords.lat, coords.lon)
                    }
                    leadingIcon={<Navigation size={13} color={Theme.iconMuted} />}
                    inputStyle={[...fieldInputStyle, outlineErr("drop")]}
                    labelStyle={fieldLabelStyle}
                    compact
                    onDropdownOpenChange={setDropDropdownOpen}
                  />
                </View>
                <View style={styles.routeDateSection}>
                  <Text style={[fieldLabelStyle, styles.routeDateLabel]}>
                    Trip start date
                  </Text>
                <View
                  style={[
                    styles.quickDateRow,
                    isDenseForm && styles.quickDateRowDense,
                    isWizardRouteStep && styles.quickDateRowWizard,
                  ]}
                >
                  {(
                    [
                      { label: "Today", get: getToday },
                      { label: "Tomorrow", get: getTomorrow },
                      { label: "Day after", get: getDayAfter },
                    ] as const
                  ).map(({ label, get }) => {
                    const iso = get();
                    const isActive = state.tripStartDate === iso;
                    return (
                      <Pressable
                        key={label}
                        style={({ pressed }) => [
                          styles.quickDateChip,
                          isDenseForm && styles.quickDateChipDense,
                          isActive && styles.quickDateChipActive,
                          pressed && styles.quickDateChipPressed,
                          Platform.OS === "web" &&
                            ({ cursor: "pointer" } as ViewStyle),
                        ]}
                        onPress={() => setters.setTripStartDate(iso)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                      >
                        <Text
                          style={[
                            styles.quickDateChipText,
                            isDenseForm && styles.quickDateChipTextDense,
                            isActive && styles.quickDateChipTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {Platform.OS === "web" ? (
                  <TextInput
                    style={[...fieldInputStyle, outlineErr("tripDate")]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Theme.placeholder}
                    value={state.tripStartDate}
                    onChangeText={setters.setTripStartDate}
                    autoCorrect={false}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      style={[
                        ...fieldInputStyle,
                        styles.dateTouchable,
                        outlineErr("tripDate"),
                      ]}
                      onPress={() => setShowStartDatePicker(true)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={
                          state.tripStartDate
                            ? [
                                styles.dateTouchableText,
                                isDenseForm && styles.dateTouchableTextDense,
                              ]
                            : [
                                styles.dateTouchablePlaceholder,
                                isDenseForm && styles.dateTouchablePlaceholderDense,
                              ]
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
              </View>
            ) : (
              <>
                <View
                  style={[
                    styles.gridRow,
                    isDenseForm && styles.gridRowDense,
                    isWide && styles.gridRowWide,
                  ]}
                >
                  <View style={styles.gridCol}>
                    <LocationSearchField
                      label="Pickup *"
                      placeholder="Search or pick pickup location"
                      value={state.pickupArea}
                      onChangeText={setters.setPickupArea}
                      onSelectPlace={(_name, coords) =>
                        setters.setPickupCoords(coords.lat, coords.lon)
                      }
                      leadingIcon={<MapPin size={isDenseForm ? 13 : 14} color={Theme.iconMuted} />}
                      inputStyle={[...fieldInputStyle, outlineErr("pickup")]}
                      labelStyle={fieldLabelStyle}
                      compact={isDenseForm}
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
                      leadingIcon={<Navigation size={isDenseForm ? 13 : 14} color={Theme.iconMuted} />}
                      inputStyle={[...fieldInputStyle, outlineErr("drop")]}
                      labelStyle={fieldLabelStyle}
                      compact={isDenseForm}
                      onDropdownOpenChange={setDropDropdownOpen}
                    />
                  </View>
                </View>
                <View
                  style={[
                    styles.gridRow,
                    isDenseForm && styles.gridRowDense,
                    isWide && styles.gridRowWide,
                  ]}
                >
                  <View style={styles.gridCol}>
                    <Text style={fieldLabelStyle}>Trip start date</Text>
                    <View
                      style={[
                        styles.quickDateRow,
                        isDenseForm && styles.quickDateRowDense,
                      ]}
                    >
                      {(
                        [
                          { label: "Today", get: getToday },
                          { label: "Tomorrow", get: getTomorrow },
                          { label: "Day after", get: getDayAfter },
                        ] as const
                      ).map(({ label, get }) => {
                        const iso = get();
                        const isActive = state.tripStartDate === iso;
                        return (
                          <Pressable
                            key={label}
                            style={({ pressed }) => [
                              styles.quickDateChip,
                              isDenseForm && styles.quickDateChipDense,
                              isActive && styles.quickDateChipActive,
                              pressed && styles.quickDateChipPressed,
                              Platform.OS === "web" &&
                                ({ cursor: "pointer" } as ViewStyle),
                            ]}
                            onPress={() => setters.setTripStartDate(iso)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isActive }}
                          >
                            <Text
                              style={[
                                styles.quickDateChipText,
                                isDenseForm && styles.quickDateChipTextDense,
                                isActive && styles.quickDateChipTextActive,
                              ]}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {Platform.OS === "web" ? (
                      <TextInput
                        style={[...fieldInputStyle, outlineErr("tripDate")]}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={Theme.placeholder}
                        value={state.tripStartDate}
                        onChangeText={setters.setTripStartDate}
                        autoCorrect={false}
                      />
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[
                            ...fieldInputStyle,
                            styles.dateTouchable,
                            outlineErr("tripDate"),
                          ]}
                          onPress={() => setShowStartDatePicker(true)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={
                              state.tripStartDate
                                ? [
                                    styles.dateTouchableText,
                                    isDenseForm && styles.dateTouchableTextDense,
                                  ]
                                : [
                                    styles.dateTouchablePlaceholder,
                                    isDenseForm &&
                                      styles.dateTouchablePlaceholderDense,
                                  ]
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
                  {!hideTonsOnRouteStep ? (
                    <View style={styles.gridCol}>
                      <Text style={fieldLabelStyle}>Tons</Text>
                      <TextInput
                        style={[
                          ...fieldInputStyle,
                          outlineErr("tons"),
                          isCompactMobile &&
                            Platform.OS === "web" &&
                            styles.mobileWebNoZoomInput,
                        ]}
                        placeholder="Enter load weight in tons"
                        placeholderTextColor={Theme.placeholder}
                        value={state.tons}
                        onChangeText={(t) => onPadValueChange(setters.setTons, t)}
                        keyboardType="decimal-pad"
                        autoCorrect={false}
                        inputAccessoryViewID={kbAccessoryId}
                        onFocus={() => {
                          focusPadField(
                            () => focusNextField(clientPriceInputRef),
                            state.tons,
                            "Next",
                          );
                        }}
                        blurOnSubmit={false}
                      />
                    </View>
                  ) : null}
                </View>
              </>
            )}

            {state.pickupArea.trim() && state.dropLocation.trim() ? (
              <View style={styles.routePreviewPanel}>
                <View style={styles.routePreviewHero}>
                  <ArrowRight
                    size={16}
                    color={PULSE_TRIP.indigo}
                    strokeWidth={2}
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
          ) : null}

          {showCommodityCard ? (
            <View
              style={[
                styles.card,
                isDenseForm && styles.cardDense,
                wizardSection === "commodity" && styles.cardWizardStep,
                desktopFormGrid && styles.cardGridCommodityWeb,
              ]}
            >
              <View
                style={[
                  styles.cardHead,
                  isDenseForm && styles.cardHeadDense,
                  wizardSection === "commodity" && styles.cardHeadWizard,
                ]}
              >
                <View
                  style={[
                    styles.stepBadge,
                    isDenseForm && styles.stepBadgeDense,
                    wizardSection === "commodity" && styles.stepBadgeWizard,
                  ]}
                >
                  <Text style={styles.stepBadgeText}>02</Text>
                </View>
                <Text
                  style={[
                    styles.cardTitle,
                    isDenseForm && styles.cardTitleDense,
                    wizardSection === "commodity" && styles.cardTitleWizard,
                  ]}
                >
                  Commodity
                </Text>
              </View>
              <TripCommodityFields
                vehicleType={state.vehicleType}
                loadType={state.loadType}
                tons={state.tons}
                onVehicleTypeChange={setters.setVehicleType}
                onLoadTypeChange={setters.setLoadType}
                onTonsChange={setters.setTons}
                vehicleTypeError={invalid("vehicleType")}
                loadTypeError={invalid("loadType")}
                tonsError={invalid("tons")}
                indentVehicleType={sourceIndent?.vehicle_type}
                indentLoadType={sourceIndent?.load_type}
                isWide={isWide && wizardSection == null}
                useFormChrome={!isDenseForm && wizardSection == null}
                preferWebSelect={Platform.OS === "web" && !isDenseForm}
                fieldLabelStyle={fieldLabelStyle}
                fieldInputStyle={fieldInputStyle}
              />
            </View>
          ) : null}

          {/* 03 Client & Commercials */}
          {showClientCard ? (
            <View
              style={[
                styles.card,
                isDenseForm && styles.cardDense,
                wizardSection === "client" && styles.cardWizardStep,
                desktopFormGrid && styles.cardGridClientWeb,
              ]}
            >
            <View
              style={[
                styles.cardHead,
                isDenseForm && styles.cardHeadDense,
                wizardSection === "client" && styles.cardHeadWizard,
              ]}
            >
              <View
                style={[
                  styles.stepBadge,
                  isDenseForm && styles.stepBadgeDense,
                  wizardSection === "client" && styles.stepBadgeWizard,
                ]}
              >
                <Text style={styles.stepBadgeText}>03</Text>
              </View>
              <Text
                style={[
                  styles.cardTitle,
                  isDenseForm && styles.cardTitleDense,
                  wizardSection === "client" && styles.cardTitleWizard,
                ]}
              >
                Client & Commercials
              </Text>
            </View>

            <View style={[styles.gridRow, isDenseForm && styles.gridRowDense, isWide && styles.gridRowWide]}>
              <View
                style={[
                  styles.gridCol,
                  invalid("client") && styles.fieldGroupRing,
                ]}
              >
                <View
                  style={isWide ? styles.clientCommercialsHeaderBand : undefined}
                >
                  <View
                    style={[
                      styles.sectionLabelRow,
                      isDenseForm && styles.sectionLabelRowDense,
                      isWide && styles.sectionLabelRowFlush,
                    ]}
                  >
                    <Text style={[...fieldLabelStyle, styles.sectionLabelTight]}>
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
                </View>
                {clientsLoading ? (
                  <ActivityIndicator color={Theme.iconPrimary} />
                ) : clients.length === 0 ? (
                  <Text style={styles.mutedSmall}>
                    No clients yet. Add clients from the Clients page first.
                  </Text>
                ) : state.clientId && !clientListExpanded && selectedClientRow ? (
                  <TouchableOpacity
                    style={[
                      styles.clientCard,
                      isDenseForm && styles.clientCardDense,
                      styles.selectionSummaryCard,
                      isWide && !isDenseForm && styles.clientCardWideBesidePrice,
                    ]}
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
                        size={isDenseForm ? 32 : 38}
                        borderStyle={styles.clientAvatarOn}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.selectionSummaryTitle} numberOfLines={1}>
                          {selectedClientRow.name}
                        </Text>
                        {selectedClientRow.address ? (
                          <Text style={styles.selectionSummarySub} numberOfLines={1}>
                            {selectedClientRow.address}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.selectionSummaryPill}>
                      <Text style={styles.selectionSummaryPillText}>Change</Text>
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
                            isDenseForm && styles.clientCardDense,
                            selected && styles.clientCardRowSelected,
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
                                isDenseForm && styles.clientNameDense,
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
                                color={Theme.darkGreen}
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
                {useWebCurrencyField ? (
                  <AddTripWebCurrencyField
                    label="Client sale price"
                    value={state.clientPrice}
                    onChange={setters.setClientPrice}
                    required
                    dense={isDenseForm}
                    errorMessage={
                      invalid("clientPrice") ? "Enter a sale price" : undefined
                    }
                  />
                ) : (
                <SmartInput
                  type="currency"
                  label="Client sale price"
                  value={state.clientPrice}
                  onChange={(raw) => setters.setClientPrice(raw)}
                  variant="field"
                  required
                  partyPreview={
                    selectedClientRow
                      ? {
                          name: selectedClientRow.name ?? "Client",
                          subtitle: selectedClientRow.address ?? undefined,
                          entityType: "client",
                          avatarUrl:
                            (selectedClientRow as { avatar_url?: string | null })
                              .avatar_url ?? null,
                          avatarSeed:
                            (selectedClientRow as { avatar_seed?: string | null })
                              .avatar_seed ?? null,
                        }
                      : undefined
                  }
                  errorMessage={invalid("clientPrice") ? "Enter a sale price" : undefined}
                />
                )}
                {!isWide ? (
                  <View style={[styles.infoCallout, isDenseForm && styles.infoCalloutDense]}>
                    <Info size={isDenseForm ? 14 : 16} color={Theme.iconPrimary} />
                    <Text
                      style={[styles.infoCalloutText, isDenseForm && styles.infoCalloutTextDense]}
                    >
                      Revenue should match what you bill this client for this
                      lane. Adjust if this trip differs.
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            {isWide ? (
              <View style={styles.infoCalloutWideSpan}>
                <Info size={16} color={Theme.iconPrimary} />
                <Text style={styles.infoCalloutText}>
                  Revenue should match what you bill this client for this lane.
                  Adjust if this trip differs.
                </Text>
              </View>
            ) : null}
          </View>
          ) : null}

          {/* 04 Supply & Allocation */}
          {showAllocationCard ? (
            <View
              style={[
                styles.card,
                isDenseForm && styles.cardDense,
                desktopFormGrid && styles.cardGridSupplyWeb,
                mobileAllocWizard &&
                  aggregateTrackingStep != null &&
                  styles.cardAllocWizardStep,
                isWizardAllocationCard &&
                  mobileAllocWizard &&
                  aggregateTrackingStep != null &&
                  styles.cardWizardStep,
              ]}
            >
            {!(mobileAllocWizard && aggregateTrackingStep) ? (
            <View style={[styles.cardHead, styles.cardHeadWithTrailingAction, isDenseForm && styles.cardHeadDense]}>
              <View style={styles.cardHeadTitleCluster}>
                <View style={[styles.stepBadge, isDenseForm && styles.stepBadgeDense]}>
                  <Text style={styles.stepBadgeText}>04</Text>
                </View>
                <Text
                  style={[styles.cardTitle, isDenseForm && styles.cardTitleDense]}
                  numberOfLines={1}
                >
                  Supply & Allocation
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.notesQuickBtn,
                  invalid("notes") ? styles.notesQuickBtnInvalid : null,
                  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
                ]}
                onPress={openNotesModal}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={
                  state.notes.trim().length > 0
                    ? "Edit trip notes"
                    : "Add trip notes"
                }
              >
                <FileText size={17} color={Theme.iconPrimary} />
                {state.notes.trim().length > 0 ? (
                  <View style={styles.notesQuickBtnDot} />
                ) : null}
              </TouchableOpacity>
            </View>
            ) : null}

            {showAlloc("supply") ? (
            <>
            <SupplyAllocationModeBar
              mode={supplyIsAsset ? "asset" : "aggregate"}
              compact={isCompactMobile}
              assignLater={state.assignLater}
              assignLaterDisabled={assignLaterSwitchDisabled}
              onModeChange={(mode) => setters.setSupplySource(mode)}
              onAssignLaterChange={setters.setAssignLater}
            />
            <View style={{ marginBottom: assignLaterSwitchDisabled ? 12 : 0 }}>
              {assignLaterSwitchDisabled ? (
                <Text style={styles.assignLaterLockedHintBelow}>
                  Remove driver or vehicle assignment to enable assign later.
                </Text>
              ) : null}
            </View>
            {state.assignLater ? (
              <Text style={styles.warningText}>
                {supplyIsAsset
                  ? "Assign vehicle and driver on the trip screen before the trip starts."
                  : "Add vehicle number and driver phone on the trip screen before the trip starts."}
              </Text>
            ) : null}
            </>
            ) : null}

            {supplyIsAsset &&
            (!mobileAllocWizard ||
              showAlloc("fleetDriver") ||
              showAlloc("fleetVehicle") ||
              showAssetFleetInline) ? (
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

                {!state.assignLater &&
                (showAlloc("fleetDriver") || !mobileAllocWizard || showAssetFleetInline) ? (
                  <View
                    style={[
                      assignmentShellStyles.assignSelectionGrid,
                      driverVehicleSideBySide &&
                        assignmentShellStyles.assignSelectionGridDesktop,
                    ]}
                  >
                    <View>
                      {fleetLoading ? (
                        <ActivityIndicator color={Theme.iconPrimary} />
                      ) : (
                        <>
                          {showDriverFleetSummary ? (
                            <TouchableOpacity
                              style={[
                                styles.clientCard,
                                isDenseForm && styles.clientCardDense,
                                styles.selectionSummaryCard,
                                { marginBottom: 10 },
                              ]}
                              onPress={() => setDriverListExpanded(true)}
                              activeOpacity={0.85}
                            >
                              <View style={styles.clientMain}>
                                <PartyAvatar
                                  name={selectedDriverRow!.name ?? "Driver"}
                                  avatarUrl={(selectedDriverRow as { avatar_url?: string | null }).avatar_url ?? null}
                                  avatarSeed={(selectedDriverRow as { avatar_seed?: string | null }).avatar_seed ?? null}
                                  entityType="driver"
                                  size={38}
                                  borderStyle={styles.clientAvatarOn}
                                />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={styles.selectionSummaryTitle} numberOfLines={1}>
                                    {selectedDriverRow!.name || "—"}
                                  </Text>
                                  <Text style={styles.selectionSummarySub} numberOfLines={1}>
                                    {[selectedDriverRow!.phone, selectedDriverRow!.email]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.selectionSummaryPill}>
                                <Text style={styles.selectionSummaryPillText}>Change</Text>
                              </View>
                            </TouchableOpacity>
                          ) : null}
                          {showDriverFleetList ? (
                            <AssignmentEntityPicker
                              title="Select Driver"
                              totalCount={driverOptions.length}
                              icon="user"
                              errorOutline={invalid("assetDriver")}
                              selectedId={state.driverId}
                              onSelect={(id) => {
                                const row = driverOptions.find((d) => d.id === id);
                                if (row?.isBusy) return;
                                setters.setDriverId(state.driverId === id ? null : id);
                                setDriverListExpanded(false);
                              }}
                              items={driverOptions.map((d) => ({
                                id: d.id,
                                title: d.name || "—",
                                subtitle: d.phone
                                  ? `Phone: ${d.phone}`
                                  : d.isBusy
                                    ? "On trip"
                                    : undefined,
                                disabled: d.isBusy,
                              }))}
                              emptyMessage="No drivers added yet. Add a driver to continue."
                              emptyActionLabel="Add driver"
                              onEmptyAction={handleAddDriverShortcut}
                              headerActionLabel="Add driver"
                              onHeaderAction={handleAddDriverShortcut}
                            />
                          ) : null}
                        </>
                      )}
                    </View>
                    {(showAlloc("fleetVehicle") || !mobileAllocWizard || showAssetFleetInline) ? (
                    <View>
                      {fleetLoading ? (
                        <ActivityIndicator color={Theme.iconPrimary} />
                      ) : (
                        <>
                          {showVehicleFleetSummary ? (
                            <TouchableOpacity
                              style={[
                                styles.clientCard,
                                isDenseForm && styles.clientCardDense,
                                styles.selectionSummaryCard,
                                { marginBottom: 10 },
                              ]}
                              onPress={() => setVehicleListExpanded(true)}
                              activeOpacity={0.85}
                            >
                              <View style={styles.clientMain}>
                                <View style={styles.vehicleCardIconSummary}>
                                  <Truck size={18} color={Theme.textOnDarkMuted} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={styles.selectionSummaryTitle} numberOfLines={1}>
                                    {formatIndianVehicleNumber(
                                      selectedVehicleRow!.vehicle_number || "",
                                    ) || "—"}
                                  </Text>
                                  <Text style={styles.selectionSummarySub} numberOfLines={1}>
                                    {[
                                      selectedVehicleRow!.vehicle_body_type ||
                                        selectedVehicleRow!.vehicle_type,
                                      [
                                        selectedVehicleRow!.vehicle_size,
                                        selectedVehicleRow!.vehicle_axle,
                                      ]
                                        .filter(Boolean)
                                        .join(" "),
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")
                                      .toUpperCase()}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.selectionSummaryPill}>
                                <Text style={styles.selectionSummaryPillText}>Change</Text>
                              </View>
                            </TouchableOpacity>
                          ) : null}
                          {showVehicleFleetList ? (
                            <AssignmentEntityPicker
                              title="Select Vehicle"
                              totalCount={vehicleOptions.length}
                              icon="truck"
                              errorOutline={invalid("assetVehicle")}
                              selectedId={state.vehicleId}
                              onSelect={(id) => {
                                const row = vehicleOptions.find((v) => v.id === id);
                                if (row?.isBusy) return;
                                setters.setVehicleId(state.vehicleId === id ? null : id);
                                setVehicleListExpanded(false);
                              }}
                              items={vehicleOptions.map((v) => ({
                                id: v.id,
                                title:
                                  formatIndianVehicleNumber(v.vehicle_number || "") || "—",
                                subtitle: [
                                  v.vehicle_body_type || v.vehicle_type,
                                  [v.vehicle_size, v.vehicle_axle].filter(Boolean).join(" "),
                                ]
                                  .filter(Boolean)
                                  .join(" · "),
                                disabled: v.isBusy,
                              }))}
                              emptyMessage="No vehicles added yet. Add a vehicle to continue."
                              emptyActionLabel="Add vehicle"
                              onEmptyAction={handleAddVehicleShortcut}
                              headerActionLabel="Add vehicle"
                              onHeaderAction={handleAddVehicleShortcut}
                            />
                          ) : null}
                        </>
                      )}
                    </View>
                    ) : null}
                    <Text style={assignmentShellStyles.supplyFooterHint}>
                      Select a driver and a vehicle from your org to continue.
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                {mobileAllocWizard && aggregateTrackingStep ? (
                  <AggregateTrackingMobileStep
                    webCentered={isWeb && winW >= 600}
                    step={aggregateTrackingStep}
                    driverName={state.aggregateDriverName}
                    onDriverNameChange={(t) =>
                      onPadValueChange(setters.setAggregateDriverName, t)
                    }
                    driverPhone={state.driverPhone}
                    onDriverPhoneChange={(v) =>
                      setters.setDriverPhone(formatMobileNumber(v))
                    }
                    vehicleText={state.aggregateVehicleText}
                    onVehicleTextChange={(v) =>
                      setters.setAggregateVehicleText(v)
                    }
                    invalid={invalid}
                    driverNameInputRef={aggregateDriverNameInputRef}
                    driverPhoneInputRef={driverPhoneInputRef}
                    vehicleInputRef={aggregateVehicleInputRef}
                    inputAccessoryViewID={kbAccessoryId}
                    driverNameFromPlatform={state.driverPhoneName?.trim() || null}
                    onFocusDriverName={() => {
                      focusPadField(
                        () => focusNextField(aggregateVehicleInputRef),
                        state.aggregateDriverName,
                      );
                    }}
                    onFocusDriverPhone={() => {
                      focusPadField(
                        () => focusNextField(aggregateDriverNameInputRef),
                        state.driverPhone,
                      );
                    }}
                    onFocusVehicle={() => {
                      focusPadField(
                        finishPadFieldEntry,
                        state.aggregateVehicleText,
                        "Next",
                      );
                    }}
                    phoneDigitHint={
                      state.driverPhone.length > 0 &&
                      state.driverPhone.length < 10
                        ? `${state.driverPhone.length}/10 digits`
                        : null
                    }
                    phoneValidationMessage={
                      state.driverPhone.trim() &&
                      validatePhone(state.driverPhone.trim())
                        ? validatePhone(state.driverPhone.trim())
                        : null
                    }
                    phoneExtras={
                      showDriverPhoneField ? (
                        <>
                          {renderDriverPhoneRecommendations(
                            state.driverPhone.length >= 10,
                            "stack",
                          )}
                          {state.driverPhoneTripConflict ? (
                            <View
                              style={[
                                styles.driverConfirmCard,
                                styles.driverConfirmCardError,
                                { marginTop: 12 },
                              ]}
                              accessibilityRole="alert"
                            >
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text
                                  style={[
                                    styles.driverConfirmMain,
                                    { color: Theme.destructive },
                                  ]}
                                  numberOfLines={2}
                                >
                                  {state.driverPhoneName?.trim()
                                    ? `${state.driverPhoneName.trim()} is already on a trip`
                                    : "This driver is already on a trip"}
                                </Text>
                                <Text style={styles.driverConfirmSub}>
                                  {state.driverPhoneTripConflictLabel
                                    ? `Open trip: ${state.driverPhoneTripConflictLabel}. Use another number or finish that trip first.`
                                    : "Driver is Busy / On Trip. Use a different number or complete the current trip first."}
                                </Text>
                              </View>
                              <AlertCircle size={20} color={Theme.destructive} />
                            </View>
                          ) : null}
                        </>
                      ) : null
                    }
                  />
                ) : (
                <View
                  style={[
                    styles.aggregateSplit,
                    allocationWideLayout && styles.aggregateSplitWide,
                    mobileAllocWizard && styles.aggregateSplitMobileWizard,
                  ]}
                >
                  {(showAlloc("partner") ||
                    !mobileAllocWizard ||
                    showAggregatePartnerInline) ? (
                  <View
                    style={[
                      styles.aggregateLeftPane,
                      allocationWideLayout && styles.aggregatePaneWide,
                    ]}
                  >
                    {suppliersLoading ? (
                      <ActivityIndicator color={Theme.iconPrimary} />
                    ) : (
                      <>
                        {showPartnerSummary ? (
                          <TouchableOpacity
                            style={[
                              styles.clientCard,
                              isDenseForm && styles.clientCardDense,
                              styles.selectionSummaryCard,
                              { marginBottom: 10 },
                            ]}
                            onPress={() => setPartnerListExpanded(true)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.clientMain}>
                              <PartyAvatar
                                name={
                                  selectedSupplierRow!.company_name?.trim() ||
                                  selectedSupplierRow!.name?.trim() ||
                                  "—"
                                }
                                organizationImageUrl={
                                  (selectedSupplierRow as {
                                    organization_avatar_url?: string | null;
                                  }).organization_avatar_url ?? null
                                }
                                organizationAvatarSeed={
                                  (selectedSupplierRow as {
                                    organization_avatar_seed?: string | null;
                                  }).organization_avatar_seed ?? null
                                }
                                avatarUrl={
                                  (selectedSupplierRow as { avatar_url?: string | null })
                                    .avatar_url ?? null
                                }
                                avatarSeed={
                                  (selectedSupplierRow as { avatar_seed?: string | null })
                                    .avatar_seed ?? null
                                }
                                entityType="supplier"
                                size={38}
                                borderStyle={styles.clientAvatarOn}
                              />
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text
                                  style={styles.selectionSummaryTitle}
                                  numberOfLines={1}
                                >
                                  {selectedSupplierRow!.company_name?.trim() ||
                                    selectedSupplierRow!.name?.trim() ||
                                    "—"}
                                </Text>
                                <Text
                                  style={styles.selectionSummarySub}
                                  numberOfLines={1}
                                >
                                  {[
                                    selectedSupplierRow!.supplier_type,
                                    selectedSupplierRow!.phone,
                                    selectedSupplierRow!.email,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.selectionSummaryPill}>
                              <Text style={styles.selectionSummaryPillText}>
                                Change
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ) : null}
                        {showPartnerList ? (
                          <AssignmentEntityPicker
                            title="Select Transport Partner"
                            totalCount={suppliers.length}
                            icon="building"
                            errorOutline={invalid("partner")}
                            selectedId={state.supplierId}
                            onSelect={(id) => {
                              const row = suppliers.find((s) => s.id === id);
                              const primary =
                                row?.company_name?.trim() ||
                                row?.name?.trim() ||
                                "—";
                              if (state.supplierId === id) {
                                releaseAccessoryBar();
                                Keyboard.dismiss();
                                setters.setSupplierSelection(null);
                                return;
                              }
                              setters.setSupplierSelection(id, primary);
                              setPartnerListExpanded(false);
                            }}
                            items={suppliers.map((s) => {
                              const primary =
                                s.company_name?.trim() || s.name?.trim() || "—";
                              const secondary = [s.supplier_type, s.phone, s.email]
                                .filter(Boolean)
                                .join(" · ");
                              return {
                                id: s.id,
                                title: primary,
                                subtitle: secondary || undefined,
                              };
                            })}
                            emptyMessage="No partners yet. Add suppliers from your network first."
                            emptyActionLabel="Add partner"
                            onEmptyAction={handleAddSupplierShortcut}
                            headerActionLabel="Add partner"
                            onHeaderAction={handleAddSupplierShortcut}
                          />
                        ) : null}
                        {!state.supplierId ? (
                          <Text style={assignmentShellStyles.supplyFooterHint}>
                            Select a transport partner
                          </Text>
                        ) : null}
                      </>
                    )}
                  </View>
                  ) : null}
                  {(showAlloc("rates") ||
                    showAlloc("driverName") ||
                    showAlloc("driverPhone") ||
                    showAlloc("vehicle") ||
                    !mobileAllocWizard) ? (
                  <View
                    style={[
                      styles.aggregateRightPane,
                      allocationWideLayout && styles.aggregatePaneWide,
                    ]}
                  >
                <View
                  style={[
                    allocationWideLayout
                      ? styles.aggregatePaneWideInner
                      : assignmentShellStyles.tripAssignSurfaceCard,
                    !allocationWideLayout && styles.aggregateSplitSurface,
                    allocationWideLayout && styles.aggregateAssignSurfaceWide,
                  ]}
                >
                {allocationWideLayout ? (
                  <>
                    <View style={styles.clientCommercialsHeaderBand}>
                      <View style={[styles.gridRow, styles.gridRowWide]}>
                        <View style={styles.gridCol}>
                          <Text style={[...fieldLabelStyle, styles.sectionLabelTight]}>
                            Partner rate (₹) *
                          </Text>
                        </View>
                        <View style={styles.gridCol}>
                          <Text style={[...fieldLabelStyle, styles.sectionLabelTight]}>
                            Advance paid (₹)
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.gridRow, styles.gridRowWide]}>
                      <View style={styles.gridCol}>
                        {useWebCurrencyField ? (
                          <AddTripWebCurrencyField
                            label="Partner rate"
                            value={state.supplierRate}
                            onChange={setters.setSupplierRate}
                            required
                            dense={isDenseForm}
                            errorMessage={
                              invalid("partnerRate")
                                ? "Enter a partner rate"
                                : undefined
                            }
                          />
                        ) : (
                        <SmartInput
                          type="currency"
                          label="Partner rate"
                          value={state.supplierRate}
                          onChange={(raw) => setters.setSupplierRate(raw)}
                          variant="field"
                          required
                          errorMessage={invalid("partnerRate") ? "Enter a partner rate" : undefined}
                        />
                        )}
                      </View>
                      <View style={styles.gridCol}>
                        {useWebCurrencyField ? (
                          <AddTripWebCurrencyField
                            label="Advance paid"
                            value={state.advancePaid}
                            onChange={setters.setAdvancePaid}
                            placeholder="Optional"
                            dense={isDenseForm}
                          />
                        ) : (
                        <SmartInput
                          type="currency"
                          label="Advance paid"
                          value={state.advancePaid}
                          onChange={(raw) => setters.setAdvancePaid(raw)}
                          variant="field"
                          placeholder="Optional"
                        />
                        )}
                      </View>
                    </View>
                  </>
                ) : (showAlloc("rates") || !mobileAllocWizard) ? (
                <View
                  style={[
                    styles.gridRow,
                    allocationWideLayout && styles.gridRowWide,
                  ]}
                >
                  <View style={styles.gridCol}>
                    {useWebCurrencyField ? (
                      <AddTripWebCurrencyField
                        label="Partner rate"
                        value={state.supplierRate}
                        onChange={setters.setSupplierRate}
                        required
                        dense={isDenseForm}
                        errorMessage={
                          invalid("partnerRate") ? "Enter a partner rate" : undefined
                        }
                      />
                    ) : (
                    <SmartInput
                      type="currency"
                      label="Partner rate"
                      value={state.supplierRate}
                      onChange={(raw) => setters.setSupplierRate(raw)}
                      variant="field"
                      required
                      partyPreview={
                        selectedSupplierRow
                          ? {
                              name:
                                selectedSupplierRow.company_name?.trim() ||
                                selectedSupplierRow.name?.trim() ||
                                "Partner",
                              subtitle: [
                                selectedSupplierRow.supplier_type,
                                selectedSupplierRow.phone,
                              ]
                                .filter(Boolean)
                                .join(" · "),
                              entityType: "supplier",
                              avatarUrl:
                                (selectedSupplierRow as { avatar_url?: string | null })
                                  .avatar_url ?? null,
                              avatarSeed:
                                (selectedSupplierRow as { avatar_seed?: string | null })
                                  .avatar_seed ?? null,
                              organizationImageUrl:
                                (selectedSupplierRow as {
                                  organization_avatar_url?: string | null;
                                }).organization_avatar_url ?? null,
                              organizationAvatarSeed:
                                (selectedSupplierRow as {
                                  organization_avatar_seed?: string | null;
                                }).organization_avatar_seed ?? null,
                            }
                          : undefined
                      }
                      errorMessage={invalid("partnerRate") ? "Enter a partner rate" : undefined}
                    />
                    )}
                  </View>
                  <View style={styles.gridCol}>
                    {useWebCurrencyField ? (
                      <AddTripWebCurrencyField
                        label="Advance paid"
                        value={state.advancePaid}
                        onChange={setters.setAdvancePaid}
                        placeholder="Optional"
                        dense={isDenseForm}
                      />
                    ) : (
                    <SmartInput
                      type="currency"
                      label="Advance paid"
                      value={state.advancePaid}
                      onChange={(raw) => setters.setAdvancePaid(raw)}
                      variant="field"
                      placeholder="Optional"
                    />
                    )}
                  </View>
                </View>
                ) : null}

                {!state.assignLater &&
                !mobileAllocWizard &&
                (showDriverNameField ||
                  showDriverPhoneField ||
                  showVehicleField) ? (
                  <>
                    <View
                      style={[
                        styles.gridRow,
                        styles.gridRowFleet,
                        styles.aggregateTrackingFieldsGrid,
                        driverVehicleSideBySide && styles.gridRowWide,
                      ]}
                    >
                      {showDriverPhoneField ? (
                      <View
                        style={[
                          webPhoneRecsAside ? styles.webAggregatePhoneRow : null,
                          mobileAllocWizard && styles.allocWizardFieldCol,
                          webPhoneRecsAside && styles.webAggregatePhoneRowCol,
                        ]}
                      >
                        <View
                          style={[
                            styles.gridCol,
                            mobileAllocWizard && styles.allocWizardFieldCol,
                            webPhoneRecsAside && styles.webAggregatePhoneFieldCol,
                          ]}
                        >
                          <Text style={[styles.label, labelStyle, styles.sectionLabelTight]}>
                            Driver phone (tracking) *
                          </Text>
                          <View
                            style={[
                              styles.inPhoneOuter,
                              isDenseForm && styles.inPhoneOuterDense,
                              invalid("driverPhone") && styles.inputErrorOutline,
                            ]}
                          >
                            <Text
                              style={styles.inPhoneFlag}
                              accessibilityLabel="India"
                            >
                              🇮🇳
                            </Text>
                            <Text style={styles.inPhoneCc}>+91</Text>
                            <TextInput
                              style={[
                                styles.inPhoneInput,
                                isDenseForm && styles.inPhoneInputDense,
                                isCompactMobile &&
                                  Platform.OS === "web" &&
                                  styles.mobileWebNoZoomInput,
                              ]}
                              placeholder="98765 43210"
                              placeholderTextColor={Theme.placeholder}
                              value={state.driverPhone}
                              onChangeText={(v) => {
                                setters.setDriverPhone(formatMobileNumber(v));
                              }}
                              keyboardType="phone-pad"
                              maxLength={10}
                              ref={driverPhoneInputRef}
                              inputAccessoryViewID={kbAccessoryId}
                              onFocus={() => {
                                focusPadField(
                                  () => focusNextField(aggregateDriverNameInputRef),
                                  state.driverPhone,
                                );
                              }}
                              blurOnSubmit={false}
                            />
                          </View>
                          {state.driverPhone.length > 0 &&
                          state.driverPhone.length < 10 ? (
                            <Text style={styles.phoneDigitHint}>
                              {state.driverPhone.length}/10 digits
                            </Text>
                          ) : null}
                          {state.driverPhone.trim() &&
                          validatePhone(state.driverPhone.trim()) ? (
                            <Text style={[styles.warningText, { marginTop: 4 }]}>
                              {validatePhone(state.driverPhone.trim())}
                            </Text>
                          ) : null}
                          {!mobileAllocWizard && !webPhoneRecsAside
                            ? renderDriverPhoneRecommendations(
                                state.driverPhone.length >= 10,
                                "stack",
                              )
                            : null}
                        </View>
                        {webPhoneRecsAside ? (
                          <View style={styles.webAggregateRecsCol}>
                            {renderDriverPhoneRecommendations(
                              state.driverPhone.length >= 10,
                              "aside",
                            )}
                          </View>
                        ) : null}
                      </View>
                      ) : null}
                      {showDriverNameField ? (
                      <View style={[styles.gridCol, mobileAllocWizard && styles.allocWizardFieldCol]}>
                        <Text style={[...fieldLabelStyle, styles.sectionLabelTight]}>
                          Driver name (tracking) *
                        </Text>
                        {state.driverPhoneName?.trim() ? (
                          <Text style={[styles.phoneDigitHint, { marginBottom: 6 }]}>
                            From platform: {state.driverPhoneName.trim()}
                          </Text>
                        ) : null}
                        <View style={styles.iconField}>
                          <User
                            size={isDenseForm ? ADD_TRIP_FORM.moneyIconSize : 16}
                            color={Theme.iconMuted}
                            style={[styles.iconInField, isDenseForm && styles.iconInFieldDense]}
                          />
                          <TextInput
                            style={[
                              ...iconFieldInputStyle,
                              outlineErr("driverName"),
                              isCompactMobile &&
                                Platform.OS === "web" &&
                                styles.mobileWebNoZoomInput,
                            ]}
                            placeholder="e.g. Suresh Kumar"
                            placeholderTextColor={Theme.placeholder}
                            value={state.aggregateDriverName}
                            onChangeText={(t) =>
                              onPadValueChange(setters.setAggregateDriverName, t)
                            }
                            ref={aggregateDriverNameInputRef}
                            autoCapitalize="words"
                            inputAccessoryViewID={kbAccessoryId}
                            onFocus={() => {
                              focusPadField(
                                () => focusNextField(aggregateVehicleInputRef),
                                state.aggregateDriverName,
                              );
                            }}
                            blurOnSubmit={false}
                          />
                        </View>
                      </View>
                      ) : null}
                      {showVehicleField ? (
                      <View
                        style={[
                          styles.gridCol,
                          mobileAllocWizard && styles.allocWizardFieldCol,
                          !driverVehicleSideBySide && styles.gridColFleetVehicle,
                        ]}
                      >
                        <Text style={[...fieldLabelStyle, styles.sectionLabelTight]}>
                          Vehicle number *
                        </Text>
                        <Text style={[styles.phoneDigitHint, { marginBottom: 6 }]}>
                          {getIndianVehicleFormatHint(
                            getIndianVehicleNormalizedLength(state.aggregateVehicleText),
                          )}
                        </Text>
                        <View style={styles.iconField}>
                          <Truck
                            size={isDenseForm ? ADD_TRIP_FORM.moneyIconSize : 16}
                            color={Theme.iconMuted}
                            style={[styles.iconInField, isDenseForm && styles.iconInFieldDense]}
                          />
                          <TextInput
                            key={getIndianVehicleKeyboardType(
                              getIndianVehicleNormalizedLength(state.aggregateVehicleText),
                            )}
                            style={[
                              ...iconFieldInputStyle,
                              outlineErr("vehicleNumber"),
                              styles.iconInputVehicleMono,
                              isCompactMobile &&
                                Platform.OS === "web" &&
                                styles.mobileWebNoZoomInput,
                            ]}
                            placeholder="e.g. TN 12 AB 3456"
                            placeholderTextColor={Theme.placeholder}
                            value={state.aggregateVehicleText}
                            onChangeText={(v) => {
                              setters.setAggregateVehicleText(applyIndianVehicleKeystroke(v));
                            }}
                            keyboardType={getIndianVehicleKeyboardType(
                              getIndianVehicleNormalizedLength(state.aggregateVehicleText),
                            )}
                            autoCapitalize={
                              getIndianVehicleKeyboardType(
                                getIndianVehicleNormalizedLength(state.aggregateVehicleText),
                              ) === "number-pad"
                                ? "none"
                                : "characters"
                            }
                            autoCorrect={false}
                            ref={aggregateVehicleInputRef}
                            inputAccessoryViewID={kbAccessoryId}
                            onFocus={() => {
                              focusPadField(
                                finishPadFieldEntry,
                                state.aggregateVehicleText,
                                "Next",
                              );
                            }}
                            blurOnSubmit={false}
                          />
                        </View>
                      </View>
                      ) : null}
                    </View>
                    {showDriverPhoneField &&
                    !mobileAllocWizard &&
                    state.driverPhoneTripConflict ? (
                      <View
                        style={[
                          styles.driverConfirmCard,
                          styles.driverConfirmCardError,
                        ]}
                        accessibilityRole="alert"
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={[
                              styles.driverConfirmMain,
                              { color: Theme.destructive },
                            ]}
                            numberOfLines={2}
                          >
                            {state.driverPhoneName?.trim()
                              ? `${state.driverPhoneName.trim()} is already on a trip`
                              : "This driver is already on a trip"}
                          </Text>
                          <Text style={styles.driverConfirmSub}>
                            {state.driverPhoneTripConflictLabel
                              ? `Open trip: ${state.driverPhoneTripConflictLabel}. Use another number or finish that trip first.`
                              : "Driver is Busy / On Trip. Use a different number or complete the current trip first."}
                          </Text>
                        </View>
                        <AlertCircle
                          size={20}
                          color={Theme.destructive}
                        />
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View style={[styles.assignLaterPartnerHint, { marginTop: 4 }]}>
                    <Info size={16} color={Theme.textMuted} />
                    <Text style={styles.assignLaterPartnerHintText}>
                      Driver phone and vehicle number are entered on the trip
                      screen.
                    </Text>
                  </View>
                )}
                </View>
                  </View>
                  ) : null}
                </View>
                )}
              </>
            )}

          </View>
          ) : null}

          {showInlineCta ? (
            <View
              style={[styles.ctaBlock, desktopFormGrid && styles.ctaGridSpanWeb]}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.primaryCta,
                  primaryCtaDisabled && styles.primaryCtaDis,
                  Platform.OS === "web" && !primaryCtaDisabled
                    ? ({ cursor: "pointer" } as ViewStyle)
                    : null,
                  pressed && !primaryCtaDisabled && { opacity: 0.92 },
                ]}
                onPress={primaryCtaDisabled ? undefined : onSubmit}
                disabled={primaryCtaDisabled}
                accessibilityRole="button"
                accessibilityLabel="Create Trip Now"
              >
                {submitting ? (
                  <ActivityIndicator color={Theme.textOnPrimary} />
                ) : (
                  <>
                    <CheckCircle2 size={18} color={Theme.textOnPrimary} />
                    <Text style={styles.primaryCtaText}>Create Trip Now</Text>
                  </>
                )}
              </Pressable>
              {!enablePrimaryWhenInvalid &&
              !canSubmit &&
              !submitting &&
              validationIssues.length === 0 ? (
                <Text style={styles.ctaHint}>
                  {validationMessage ??
                    "Please fill all mandatory fields to continue"}
                </Text>
              ) : null}
            </View>
          ) : null}
          </View>
        </View>
        </View>
      </ScrollView>

      <Modal
        visible={notesModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNotesModalOpen(false)}
      >
        <View style={styles.notesModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setNotesModalOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={styles.notesModalSheet}>
            <View style={styles.notesModalHeader}>
              <Text style={styles.notesModalTitle}>Trip notes</Text>
              <TouchableOpacity
                onPress={() => setNotesModalOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.notesModalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.label, labelStyle, styles.notesModalHint]}>
              Instructions & cargo details (optional)
            </Text>
            <TextInput
              style={[
                styles.notesModalInput,
                inputStyle,
                outlineErr("notes"),
              ]}
              placeholder="Any specific delivery instructions or cargo details…"
              placeholderTextColor={Theme.placeholder}
              value={state.notes}
              onChangeText={setters.setNotes}
              ref={notesModalInputRef}
              multiline
              textAlignVertical="top"
            />
          </View>
        </View>
      </Modal>

      <View style={styles.blobA} pointerEvents="none" />
      <View style={styles.blobB} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  pageWrap: {
    flex: 1,
    backgroundColor: PULSE_TRIP.screenBg,
  },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 12,
  },
  scrollContentDense: {
    paddingTop: 6,
  },
  scrollContentWizard: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  contentMax: {
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
  },
  mainGrid: {
    width: "100%",
  },
  formColumn: {
    width: "100%",
    minWidth: 0,
  },
  /** Desktop web: row1 route|commodity; row2 client; row3 supply; row4 CTA. */
  formColumnGridWeb: Platform.select<ViewStyle>({
    // CSS grid is not in ViewStyle — intentional RN-Web extension
    web: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      gap: 16,
      alignItems: "start",
      gridAutoRows: "min-content",
    } as unknown as ViewStyle,
    default: {},
  }),
  ctaGridSpanWeb: Platform.select<ViewStyle>({
    web: { gridColumn: "1 / -1", gridRow: 4 } as unknown as ViewStyle,
    default: {},
  }),
  /** Desktop grid: route | commodity on row 1. */
  cardGridRouteWeb: Platform.select<ViewStyle>({
    web: { gridColumn: 1, gridRow: 1 } as unknown as ViewStyle,
    default: {},
  }),
  cardGridCommodityWeb: Platform.select<ViewStyle>({
    web: { gridColumn: 2, gridRow: 1 } as unknown as ViewStyle,
    default: {},
  }),
  cardGridClientWeb: Platform.select<ViewStyle>({
    web: { gridColumn: "1 / -1", gridRow: 2 } as unknown as ViewStyle,
    default: {},
  }),
  cardGridSupplyWeb: Platform.select<ViewStyle>({
    web: { gridColumn: "1 / -1", gridRow: 3 } as unknown as ViewStyle,
    default: {},
  }),
  cardHeadWithTrailingAction: {
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  cardHeadTitleCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  notesQuickBtn: {
    position: "relative",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceForm,
    justifyContent: "center",
    alignItems: "center",
  },
  notesQuickBtnInvalid: {
    borderColor: Theme.destructive,
    borderWidth: 2,
  },
  notesQuickBtnDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.iconPrimary,
  },
  notesModalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  notesModalSheet: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "82%",
    zIndex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 4,
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: "0 16px 48px rgba(15,23,42,0.22)",
      },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 12,
      },
    }),
  },
  notesModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    marginBottom: 10,
  },
  notesModalTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 11,
    color: Theme.textPrimaryDark,
    letterSpacing: 0.35,
  },
  notesModalDone: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.iconPrimary,
  },
  notesModalHint: {
    marginBottom: 8,
  },
  notesModalInput: {
    width: "100%",
    minHeight: 120,
    maxHeight: 260,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 11,
    fontWeight: "400",
    fontStyle: "italic",
    ...Platform.select({
      web: {
        outlineStyle: "none",
        boxSizing: "border-box",
      } as any,
      default: {},
    }),
  },
  card: {
    backgroundColor: PULSE_TRIP.cardBg,
    borderRadius: PULSE_TRIP_RADIUS.card,
    borderWidth: 1,
    borderColor: PULSE_TRIP.border,
    padding: 18,
    marginBottom: ADD_TRIP_FORM.cardGap,
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: "0 4px 15px rgba(79, 70, 229, 0.05)",
      },
      default: {
        shadowColor: PULSE_TRIP.indigo,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 3,
      },
    }),
  },
  cardDense: {
    paddingHorizontal: ADD_TRIP_FORM.cardPad,
    paddingVertical: ADD_TRIP_FORM.cardPad,
    borderRadius: PULSE_TRIP_RADIUS.cardDense,
    marginBottom: ADD_TRIP_FORM.cardGap,
  },
  cardAllocWizardStep: {
    flexGrow: 1,
    minHeight: 320,
    paddingBottom: 8,
  },
  cardWizardStep: {
    marginBottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: PULSE_TRIP_RADIUS.cardDense,
  },
  cardHeadDense: {
    paddingBottom: 4,
    marginBottom: 6,
    gap: 5,
  },
  cardHeadWizard: {
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    marginBottom: 14,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_TRIP.border,
    paddingBottom: 10,
    marginBottom: 12,
  },
  stepBadgeWizard: {
    width: 26,
    height: 26,
    borderRadius: 8,
  },
  cardTitleWizard: {
    flex: 0,
    fontSize: 11,
    lineHeight: 26,
    letterSpacing: 0.85,
    paddingTop: 0,
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: "center" },
      default: {},
    }),
  },
  routeWizardBody: {
    gap: 0,
    width: "100%",
  },
  routeLocationsStack: {
    gap: 12,
    width: "100%",
  },
  routeDateSection: {
    width: "100%",
    marginTop: 14,
    paddingTop: 0,
  },
  routeFieldCol: {
    width: "100%",
    minWidth: 0,
  },
  routeDateBlock: {
    width: "100%",
    marginTop: 2,
  },
  routeDateLabel: {
    marginBottom: 6,
  },
  labelWizard: {
    marginBottom: 4,
    letterSpacing: 0.55,
  },
  inputWizardDense: {
    marginBottom: 0,
  },
  stepBadgeDense: {
    width: 20,
    height: 20,
    borderRadius: 6,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: PULSE_TRIP_RADIUS.badge,
    backgroundColor: PULSE_TRIP.indigo,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#ffffff",
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    letterSpacing: 0.8,
    fontStyle: "normal",
    fontWeight: "900",
    textTransform: "uppercase",
    color: PULSE_TRIP.text,
  },
  cardTitleDense: {
    fontSize: 10,
    letterSpacing: 0.9,
  },
  gridRowDense: { gap: 6 },
  gridRow: { gap: 10 },
  /** Extra gap when driver + vehicle stack vertically so sections don’t feel glued. */
  gridRowFleet: {
    gap: 12,
  },
  gridRowWide: { flexDirection: "row", alignItems: "stretch", gap: 16 },
  gridCol: { flex: 1, minWidth: 0 },
  gridColFleetStack: {
    flexBasis: "auto",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  gridColFleetVehicle: {
    marginTop: 3,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  /** Driver / vehicle lists fill each grid column on desktop (avoid skinny centered rails). */
  fleetPickColumnWrap: {
    width: "100%",
    minWidth: 0,
  },
  fleetPickColumnInner: {
    width: "100%",
    minWidth: 0,
  },
  aggregateSplit: {
    gap: 10,
  },
  aggregateSplitMobileWizard: {
    flexDirection: "column",
    gap: 8,
  },
  allocWizardFieldCol: {
    flexBasis: "auto",
    width: "100%",
    maxWidth: "100%",
  },
  webAggregatePhoneRow: Platform.select<ViewStyle>({
    web: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 20,
      width: "100%",
    },
    default: {},
  }),
  webAggregatePhoneRowCol: {
    width: "100%",
    minWidth: 0,
  },
  webAggregatePhoneFieldCol: Platform.select<ViewStyle>({
    web: {
      flex: 0,
      flexBasis: 280,
      maxWidth: 320,
      minWidth: 240,
    },
    default: {},
  }),
  webAggregateRecsCol: Platform.select<ViewStyle>({
    web: {
      flex: 1,
      minWidth: 260,
    },
    default: {},
  }),
  aggregateSplitWide: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 16,
  },
  aggregateLeftPane: {
    minWidth: 0,
  },
  aggregateRightPane: {
    minWidth: 0,
  },
  /** Only when partner + allocation sit in one row (wide); avoid flex:1 in a column or panes split viewport height. */
  aggregatePaneWide: {
    flex: 1,
  },
  aggregateTrackingFieldsGrid: {
    marginTop: 10,
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  aggregateSplitSurface: {
    padding: 11,
    marginBottom: 0,
    borderRadius: 14,
    flexGrow: 1,
    alignSelf: "stretch",
    minWidth: 0,
    minHeight: 0,
  },
  /** Wide aggregate: same flush columns as card 02 (no nested assignment shell card). */
  aggregatePaneWideInner: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    alignSelf: "stretch",
    padding: 0,
    marginBottom: 0,
    backgroundColor: "transparent",
  },
  /** Rate row sits directly under label band (wide layout). */
  aggregateRateInputFlush: {
    marginTop: 0,
  },
  /** Wide aggregate: surfaces stretch with the taller pane so partner card can fill vertically. */
  aggregateAssignSurfaceWide: {
    flex: 1,
    minHeight: 0,
    alignSelf: "stretch",
  },
  aggregatePartnerName: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
  },
  aggregatePartnerNameOn: {
    color: Theme.darkGreen,
  },
  aggregatePartnerMeta: {
    fontSize: 10,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textMuted,
    marginTop: 2,
    lineHeight: 14,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  sectionLabelRowStack: {
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  /** Mobile / narrow: label on its own row, full-width add action — avoids overlap with cards. */
  sectionLabelRowFleetStack: {
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 8,
    marginBottom: 10,
    width: "100%",
  },
  sectionLabelRowDense: {
    marginBottom: 4,
    gap: 6,
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
  /** Wide desktop: same vertical band for Select client actions vs price label. */
  clientCommercialsHeaderBand: {
    justifyContent: "center",
    minHeight: 40,
    marginBottom: 8,
  },
  /** Inside header band; spacing comes from clientCommercialsHeaderBand. */
  sectionLabelRowFlush: {
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
  addClientBtnFleetFullWidth: {
    alignSelf: "stretch",
    width: "100%",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 0,
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
    borderColor: Theme.tripSelectionInsetBorder,
    backgroundColor: Theme.tripSelectionInsetBg,
  },
  changeSelectionPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: ADD_TRIP_FORM.labelSpacing,
    letterSpacing: 0.6,
    lineHeight: ADD_TRIP_FORM.labelLine,
    textTransform: "uppercase",
    color: PULSE_TRIP.textMuted,
  },
  labelDense: {
    fontSize: ADD_TRIP_FORM.labelSize,
    marginBottom: ADD_TRIP_FORM.labelSpacing,
    letterSpacing: 0.6,
    lineHeight: ADD_TRIP_FORM.labelLine,
    textTransform: "uppercase",
    color: PULSE_TRIP.textMuted,
  },
  input: {
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "italic",
    minHeight: 36,
    marginBottom: 6,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  inputDense: {
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    paddingHorizontal: ADD_TRIP_FORM.fieldPadH,
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    lineHeight: ADD_TRIP_FORM.fieldLineHeight,
    fontStyle: "normal",
    fontWeight: "500",
    minHeight: ADD_TRIP_FORM.fieldHeight,
    marginBottom: ADD_TRIP_FORM.fieldGap,
    borderWidth: 1,
    borderColor: PULSE_TRIP.border,
    backgroundColor: "#f8fafc",
  },
  /** Align with `clientCard` in aggregate partner pane (card 03). */
  inputMatchSelectionCardDense: {
    minHeight: ADD_TRIP_FORM.fieldHeight,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    borderWidth: 1,
    paddingHorizontal: ADD_TRIP_FORM.fieldPadH,
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    fontStyle: "normal",
    fontWeight: "500",
  },
  inputMatchSelectionCard: {
    minHeight: 70,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: Theme.textPrimary,
    ...Platform.select({
      web: {
        width: "100%" as const,
        maxWidth: "100%" as const,
        boxSizing: "border-box" as const,
      } as any,
      default: {},
    }),
  },
  inputMatchSelectionCardSelected: {
    borderColor: Theme.darkGreen,
    backgroundColor: Theme.cardWhite,
  },
  mobileWebNoZoomInput: {
    fontSize: 16,
  },
  iconField: {
    position: "relative",
    marginBottom: 8,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select<ViewStyle>({
      web: { width: "100%" as const },
      default: {},
    }),
  },
  iconInField: {
    position: "absolute",
    left: 9,
    top: 9,
    zIndex: 1,
  },
  iconInFieldDense: {
    left: 10,
    top: 11,
  },
  iconInputDense: {
    minHeight: ADD_TRIP_FORM.fieldHeight,
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    paddingLeft: 36,
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    lineHeight: ADD_TRIP_FORM.fieldLineHeight,
    fontStyle: "normal",
    fontWeight: "500",
    borderColor: PULSE_TRIP.border,
    backgroundColor: "#f8fafc",
  },
  iconInput: {
    borderRadius: 11,
    paddingLeft: 34,
    paddingRight: 9,
    paddingVertical: 7,
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "normal",
    minHeight: 36,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceForm,
    color: Theme.textPrimary,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
        width: "100%" as const,
        maxWidth: "100%" as const,
        boxSizing: "border-box" as const,
      } as any,
      default: {},
    }),
  },
  iconInputVehicleMono: {
    ...Platform.select<TextStyle>({
      ios: { fontFamily: "Menlo" },
      android: { fontFamily: "monospace" },
      web: {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      default: {},
    }),
  },
  inPhoneOuterDense: {
    minHeight: ADD_TRIP_FORM.fieldHeight,
    borderWidth: 1,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    marginBottom: ADD_TRIP_FORM.fieldGap,
  },
  inPhoneInputDense: {
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    lineHeight: ADD_TRIP_FORM.fieldLineHeight,
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    fontStyle: "normal",
  },
  inPhoneOuter: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 11,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceForm,
    minHeight: 36,
    paddingLeft: 9,
    paddingRight: 9,
    paddingVertical: 0,
    gap: 5,
    marginBottom: 8,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select<ViewStyle>({
      web: { width: "100%" as const, boxSizing: "border-box" as const },
      default: {},
    }),
  },
  inPhoneFlag: {
    fontSize: 14,
    lineHeight: 18,
  },
  inPhoneCc: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  inPhoneInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 7,
    paddingHorizontal: 2,
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "normal",
    color: Theme.textPrimary,
    ...Platform.select({
      web: {
        outlineStyle: "none",
        width: "100%" as const,
        maxWidth: "100%" as const,
        boxSizing: "border-box" as const,
      } as any,
      default: {},
    }),
  },
  phoneDigitHint: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 4,
    marginBottom: 4,
  },
  fakeInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 2,
    minHeight: 46,
  },
  dateInputTrigger: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quickDateRowDense: {
    gap: 4,
    marginBottom: 4,
  },
  quickDateRowWizard: {
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  quickDateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  quickDateChipDense: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  quickDateChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  quickDateChipActive: {
    borderColor: PULSE_TRIP.indigo,
    backgroundColor: PULSE_TRIP.indigoLight,
  },
  quickDateChipPressed: {
    opacity: 0.82,
  },
  quickDateChipTextDense: {
    fontSize: 10,
    fontStyle: "normal",
    letterSpacing: 0.2,
  },
  quickDateChipText: {
    fontSize: 11,
    letterSpacing: 0.3,
    fontWeight: "600",
    color: Theme.textMuted,
    fontStyle: "normal",
  },
  quickDateChipTextActive: {
    color: PULSE_TRIP.indigo,
    fontWeight: "800",
  },
  dateTouchable: {
    justifyContent: "center",
  },
  dateTouchableText: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  dateTouchableTextDense: {
    fontSize: 14,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
  },
  dateTouchablePlaceholder: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    color: Theme.placeholder,
  },
  dateTouchablePlaceholderDense: {
    fontSize: 14,
    fontStyle: "normal",
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
  routePreviewPanel: {
    marginTop: 6,
    marginBottom: 12,
    borderRadius: PULSE_TRIP_RADIUS.cardDense,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: PULSE_TRIP.border,
    backgroundColor: PULSE_TRIP.cardBg,
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: "0 4px 20px rgba(79, 70, 229, 0.06)",
      },
      default: {
        shadowColor: PULSE_TRIP.indigo,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
        elevation: 3,
      },
    }),
  },
  routePreviewHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: PULSE_TRIP.indigoLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_TRIP.border,
  },
  routePreviewHeroText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    fontStyle: "normal",
    lineHeight: 18,
    letterSpacing: 0,
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
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  routePreviewMetricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  routeMetricLab: {
    ...FinanceTxnTypography.fieldLabel,
    color: Theme.textMutedDemo,
    marginBottom: 3,
  },
  routeMetricVal: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 9,
    lineHeight: 13,
  },
  clientList: { maxHeight: 280 },
  clientListCompact: { maxHeight: undefined },
  mobileListWrap: {
    gap: 10,
    marginBottom: 4,
    width: "100%",
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
  clientCardDense: {
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
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
    flexShrink: 0,
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
    overflow: "hidden",
  },
  /** Picker list: highlight chosen row (light card). */
  clientCardRowSelected: {
    borderColor: PULSE_TRIP.indigo,
    backgroundColor: PULSE_TRIP.indigoLight,
  },
  /** Minimized selected party — dark chip only after choice. */
  selectionSummaryCard: {
    backgroundColor: Theme.tripSelectionSurface,
    borderColor: Theme.darkGreen,
  },
  selectionSummaryTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  selectionSummarySub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    marginTop: 2,
  },
  selectionSummaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.tripSelectionInsetBorder,
    backgroundColor: Theme.tripSelectionInsetBg,
  },
  selectionSummaryPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  clientMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 8,
  },
  /** Wide row beside price: stretch with sales-price shell; revenue hint sits full-width below. */
  clientCardWideBesidePrice: {
    marginBottom: 0,
    alignSelf: "stretch",
    flexGrow: 1,
    minHeight: 72,
  },
  clientName: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  clientNameDense: {
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    fontWeight: "600",
    fontStyle: "normal",
    letterSpacing: 0,
  },
  clientNameOn: { color: Theme.darkGreen },
  clientAvatar: {
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
  },
  clientAvatarOn: {
    borderWidth: 2,
    borderColor: Theme.darkGreen,
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
  vehicleCardIconSummary: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Theme.tripSelectionInsetBg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.tripSelectionInsetBorder,
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
    flexShrink: 0,
    backgroundColor: Theme.surfaceForm,
  },
  radioOuterOn: {
    borderColor: Theme.darkGreen,
    backgroundColor: Theme.cardWhite,
  },
  /** Card 02: matches `clientCard` height & frame (selection row beside price). */
  priceWrapShellDense: {
    minHeight: ADD_TRIP_FORM.fieldHeight,
    paddingHorizontal: ADD_TRIP_FORM.fieldPadH,
    gap: 8,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    borderWidth: 1,
    marginBottom: ADD_TRIP_FORM.fieldGap,
  },
  priceInputDense: {
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    lineHeight: ADD_TRIP_FORM.fieldLineHeight,
    fontWeight: "600",
    minHeight: 0,
  },
  priceWrapShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 70,
    paddingHorizontal: 14,
    gap: 10,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    marginBottom: 8,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select({
      web: {
        width: "100%" as const,
        maxWidth: "100%" as const,
        boxSizing: "border-box" as const,
      } as any,
      default: {},
    }),
  },
  /** Wide desktop: sales price grows with client column so bands align above full-width hint. */
  priceWrapShellWideColumn: {
    marginBottom: 0,
    flexGrow: 1,
    minHeight: 72,
  },
  priceWrapShellSelected: {
    borderColor: Theme.darkGreen,
    backgroundColor: Theme.cardWhite,
  },
  priceWrapShellError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
  },
  priceRupeeIcon: {
    flexShrink: 0,
  },
  priceInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 0,
    fontSize: 16,
    fontWeight: "600",
    fontStyle: "normal",
    minHeight: 44,
    backgroundColor: "transparent",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    ...Platform.select({
      web: {
        outlineStyle: "none",
        width: "100%" as const,
        maxWidth: "100%" as const,
        boxSizing: "border-box" as const,
      } as any,
      default: {},
    }),
  },
  infoCalloutDense: {
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    marginTop: 2,
    gap: 6,
  },
  infoCalloutTextDense: {
    fontSize: 11,
    lineHeight: 15,
  },
  infoCallout: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: PULSE_TRIP_RADIUS.input,
    backgroundColor: PULSE_TRIP.indigoLight,
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.15)",
    alignItems: "flex-start",
  },
  infoCalloutWideSpan: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.04)",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "flex-start",
    marginTop: 12,
    width: "100%",
    alignSelf: "stretch",
  },
  infoCalloutText: {
    flex: 1,
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
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
    backgroundColor: "#07090C",
    borderRadius: 18,
    padding: 5,
    borderWidth: 1,
    borderColor: "#0F1318",
    gap: 5,
  },
  /** Asset | Aggregate pill + Assign later on one row (desktop). */
  supplyModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
    flexWrap: "nowrap",
  },
  supplyModeRowStack: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
    flexWrap: "nowrap",
  },
  segmentWrap: {
    flexShrink: 0,
  },
  segmentWrapCentered: {
    alignSelf: "center",
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 12,
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
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.85,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.72)",
  },
  segmentLabOn: { color: Theme.textOnPrimary },
  assignLaterCard: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    flex: 1,
    flexBasis: 0,
    minWidth: 160,
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceForm,
    ...Platform.select({
      web: {
        boxSizing: "border-box" as const,
      },
      default: {},
    }),
  },
  assignLaterCardStacked: {
    flex: 0,
    flexBasis: "auto",
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  assignLaterMergedWrap: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  assignLaterMergedText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimary,
    lineHeight: 18,
    ...Platform.select({
      web: {
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      } as TextStyle,
      default: {},
    }),
  },
  assignLaterMergedTextDense: {
    fontSize: 11,
    lineHeight: 15,
  },
  assignLaterTitleInline: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  assignLaterSubInline: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 18,
  },
  assignLaterSwitchWrap: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  assignLaterIconCircle: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  assignLaterLockedHintBelow: {
    marginTop: 8,
    paddingHorizontal: 10,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 15,
  },
  assignLaterCardDisabled: {
    opacity: 0.72,
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
  inputErrorOutline: {
    borderWidth: 1,
    borderColor: Theme.destructive,
  },
  fieldGroupRing: {
    borderWidth: 1,
    borderColor: Theme.destructive,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    padding: 4,
  },
  validationChecklist: {
    width: "100%",
    maxWidth: 960,
    alignSelf: "stretch",
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: "rgba(232, 33, 39, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(232, 33, 39, 0.35)",
  },
  validationChecklistHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  validationChecklistTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  validationChecklistItem: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.destructive,
    lineHeight: 14,
    marginBottom: 3,
  },
  driverConfirmCardError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
    backgroundColor: "rgba(232, 33, 39, 0.06)",
  },
  ctaBlock: {
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 14,
  },
  primaryCta: {
    width: "100%",
    maxWidth: 400,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PULSE_TRIP.indigo,
    paddingVertical: 16,
    borderRadius: PULSE_TRIP_RADIUS.btn,
    minHeight: 52,
    ...Platform.select<ViewStyle>({
      web: { boxShadow: "0 10px 20px rgba(79, 70, 229, 0.2)" },
      default: {
        shadowColor: PULSE_TRIP.indigo,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
        elevation: 5,
      },
    }),
  },
  primaryCtaDis: {
    opacity: 0.45,
  },
  primaryCtaText: {
    fontSize: 13,
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
  blobA: {
    position: "absolute",
    top: "18%",
    left: "-12%",
    width: 280,
    height: 280,
    borderRadius: 200,
    backgroundColor: PULSE_TRIP.indigoMuted,
    zIndex: -1,
  },
  blobB: {
    position: "absolute",
    bottom: "-8%",
    right: "-8%",
    width: 220,
    height: 220,
    borderRadius: 200,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    zIndex: -1,
  },
  mutedSmall: {
    fontSize: 10,
    color: Theme.textMuted,
    marginBottom: 6,
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
    borderWidth: 0,
    borderColor: Theme.driverEmeraldDark,
    backgroundColor: Theme.driverEmeraldDark,
  },
  driverConfirmMain: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
  },
  driverConfirmMainOnDark: {
    color: Theme.textOnPrimary,
    fontWeight: "600",
  },
  driverConfirmSub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 3,
    lineHeight: 14,
  },
  driverConfirmSubOnDark: {
    color: "rgba(255,255,255,0.88)",
    fontWeight: "500",
  },
});
