/**
 * Trip detail — assign or change driver and vehicle after trip creation.
 * Shows current assignment and, when user can assign, allows changing.
 * Private Book = assigned by current user; Shared Network = assigned by another user.
 */
import Theme from "@/constants/Theme";
import {
    getDriversByOrganization,
    searchExistingDriversByPhone,
    type DriverRow,
} from "@/features/drivers/services/drivers.service";
import {
    generateTripOtp,
    getTripOtpForDisplay,
    regenerateTripOtp,
} from "@/features/trips/services/tripOtp.service";
import {
    assignAggregateTripDriverByPhone,
    assignTripDriverByPhone,
    getActiveDriverIds,
    getDriverAvailabilityByPhone,
    getTripsByOrganization,
    getTripDisplayNumber,
    humanizeTripIdInRpcError,
    isTripCompleted,
    updateTripAssignment,
    type TripRow,
} from "@/features/trips/services/trips.service";
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
import { Check, ChevronRight, Circle, Plus, Star } from "lucide-react-native";
import { useRouter } from "expo-router";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type AssignmentSource = "private" | "shared" | "unassigned";

export interface TripAssignmentBlockProps {
  trip: TripRow;
  organizationId: string;
  canAssign: boolean;
  onUpdated: () => void;
  /** Display name for current driver (avoids duplicate fetch) */
  driverName?: string | null;
  /** Display label for current vehicle (avoids duplicate fetch) */
  vehicleLabel?: string | null;
  /** For aggregate trips: partner/supplier display name (shown in Current Assignment). */
  partnerName?: string | null;
  /** Private Book (you assigned) vs Shared Network (other user assigned). When unassigned, badge can still show "Unassigned". */
  assignmentSource?: AssignmentSource;
  /** Current user id (auth.uid()). Pass to record who assigned when user saves — makes trip "Private" for this user. */
  currentUserId?: string | null;
  /** When false, hide "By phone" / "Assign by phone" (e.g. asset trips). When true or undefined, show (e.g. aggregated trips). */
  showAssignByPhone?: boolean;
  /** When set (e.g. aggregated trip), called with the current vehicle input so parent can show it in Tracking block. */
  onVehicleDisplayChange?: (value: string) => void;
  /** After reassignment, show the previous driver name on the card. */
  previousDriverName?: string | null;
  /** One-line summary of latest reassignment (for inline log inside assignment card). */
  latestReassignmentSummary?: string | null;
  /** When true, show assignment as read-only (e.g. load creator / shipper can only monitor; no + Assign, Change, or Generate OTP). */
  viewOnly?: boolean;
  /** For assign-by-phone: org to create driver row in (must be assigner\'s org so RLS allows INSERT). When set (e.g. aggregate trip), use instead of organizationId for assignTripDriverByPhone. */
  driverAssignOrgId?: string | null;
  driverAvatarUri?: string | null;
  onRatingsLoaded?: (ratings: { rated_type: string; score: number }[]) => void;
  /** Request opening a specific picker modal from parent shell UI. */
  autoOpenPickerMode?: "driver" | "vehicle" | null;
  /** Bump this value to re-trigger auto-open for same mode. */
  autoOpenPickerNonce?: number;
  /** Optional extra content rendered inside this assignment card. */
  inlineSection?: ReactNode;
  /** Close parent overlays (e.g. trip “Current assignment” sheet on web) before opening add-driver / add-vehicle. */
  onBeforeRegisterNavigate?: () => void;
}

export function TripAssignmentBlock({
  trip,
  organizationId,
  canAssign,
  onUpdated,
  driverName: propsDriverName,
  vehicleLabel: propsVehicleLabel,
  partnerName,
  assignmentSource = "unassigned",
  currentUserId,
  showAssignByPhone = true,
  onVehicleDisplayChange,
  previousDriverName,
  latestReassignmentSummary,
  viewOnly = false,
  driverAssignOrgId,
  autoOpenPickerMode = null,
  autoOpenPickerNonce = 0,
  inlineSection,
  onBeforeRegisterNavigate,
}: TripAssignmentBlockProps) {
  /** No assign/reassign when trip is completed or when view-only (e.g. load creator monitoring). */
  const effectiveCanAssign = canAssign && !isTripCompleted(trip) && !viewOnly;

  const [showPicker, setShowPicker] = useState(false);
  const [assignMode, setAssignMode] = useState<"driver" | "vehicle" | null>(
    null,
  );
  /** Selection preview before confirming assignment. */
  const [previewDriverId, setPreviewDriverId] = useState<string | null>(null);
  const [previewVehicleId, setPreviewVehicleId] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const router = useRouter();

  const closeAssignModal = useCallback(() => {
    setAssignMode(null);
    setPreviewDriverId(null);
    setPreviewVehicleId(null);
  }, []);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneName, setPhoneName] = useState<string | null>(null);
  const [phoneDriverBusy, setPhoneDriverBusy] = useState(false);
  const [phoneBusyTripLabel, setPhoneBusyTripLabel] = useState<string | null>(
    null,
  );
  const [pickPhoneVehicleId, setPickPhoneVehicleId] = useState<string | null>(
    null,
  );
  const [phoneVehicleInput, setPhoneVehicleInput] = useState("");
  const [phoneModalVehicles, setPhoneModalVehicles] = useState<VehicleRow[]>(
    [],
  );
  const phoneLookupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [otpCode, setOtpCode] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpRegenerating, setOtpRegenerating] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const normalizeVehicleNumber = useCallback(
    (s: string) => (s || "").replace(/\s+/g, "").toUpperCase().trim(),
    [],
  );
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [activeDriverIds, setActiveDriverIds] = useState<Set<string>>(
    new Set(),
  );
  const [activeVehicleIds, setActiveVehicleIds] = useState<Set<string>>(new Set());
  const [activeDriverTripLabelById, setActiveDriverTripLabelById] = useState<Record<string, string>>({});
  const [activeVehicleTripLabelById, setActiveVehicleTripLabelById] = useState<Record<string, string>>({});
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [pickDriverId, setPickDriverId] = useState<string | null>(
    trip.driver_id,
  );
  const [pickVehicleId, setPickVehicleId] = useState<string | null>(
    trip.vehicle_id,
  );
  const [pickerVehicleInput, setPickerVehicleInput] = useState("");
  const [cardVehicleInput, setCardVehicleInput] = useState("");
  const [cardVehicleSaving, setCardVehicleSaving] = useState(false);
  const [phoneModalIsReassign, setPhoneModalIsReassign] = useState(false);
  /** After aggregate assign-by-phone, show OTP before dismissing (same flow as inline OTP card). */
  const [phoneAssignOtpReveal, setPhoneAssignOtpReveal] = useState<{
    code: string;
    expires_at: string | null;
  } | null>(null);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && windowWidth >= 768;
  const hasDriverAssigned = !!trip.driver_id;
  const hasVehicleAssigned =
    !!trip.vehicle_id || !!String(trip.vehicle_display_number ?? "").trim();
  const canGenerateOtpNow = hasDriverAssigned && hasVehicleAssigned;
  const otpLockedByTripProgress = ["in_progress", "in_transit"].includes(
    String(trip.status ?? "").toLowerCase(),
  );

  useEffect(() => {
    setPickDriverId(trip.driver_id);
    setPickVehicleId(trip.vehicle_id);
  }, [trip.driver_id, trip.vehicle_id]);

  useEffect(() => {
    if (!showAssignByPhone || !trip?.id || !canGenerateOtpNow) {
      setOtpCode(null);
      setOtpExpiresAt(null);
      setOtpError(null);
      return;
    }
    setOtpLoading(true);
    setOtpError(null);
    getTripOtpForDisplay(trip.id)
      .then(({ error, code, expires_at }) => {
        if (error) {
          setOtpError(error.message);
          setOtpCode(null);
          setOtpExpiresAt(null);
        } else {
          setOtpCode(code ?? null);
          setOtpExpiresAt(expires_at ?? null);
        }
      })
      .finally(() => setOtpLoading(false));
  }, [showAssignByPhone, trip?.id, canGenerateOtpNow]);

  useEffect(() => {
    if (showAssignByPhone && (propsVehicleLabel ?? "").trim() !== "") {
      const raw = (propsVehicleLabel ?? "").split("·")[0]?.trim() ?? "";
      setCardVehicleInput(raw ? formatIndianVehicleNumber(raw) : "");
    }
  }, [showAssignByPhone, propsVehicleLabel]);

  useEffect(() => {
    if (showAssignByPhone) {
      getVehiclesByOrganization(organizationId).then((r) =>
        setVehicles(r.error ? [] : (r.vehicles ?? [])),
      );
    }
  }, [showAssignByPhone, organizationId]);

  useEffect(() => {
    if (showAssignByPhone && onVehicleDisplayChange) {
      onVehicleDisplayChange(cardVehicleInput);
    }
  }, [showAssignByPhone, onVehicleDisplayChange, cardVehicleInput]);

  const resolveVehicleIdFromInput = useCallback(
    (input: string, vehicleList: VehicleRow[]) => {
      const norm = normalizeVehicleNumber(input);
      if (!norm) return null;
      const match = vehicleList.find(
        (v) => normalizeVehicleNumber(v.vehicle_number) === norm,
      );
      return match?.id ?? null;
    },
    [normalizeVehicleNumber],
  );

  const handleCardVehicleBlur = useCallback(async () => {
    if (!showAssignByPhone || !effectiveCanAssign) return;
    const trimmed = cardVehicleInput.trim();
    if (!trimmed) return;
    const vehicleId = resolveVehicleIdFromInput(trimmed, vehicles);
    if (vehicleId === (trip.vehicle_id ?? null)) return;
    setCardVehicleSaving(true);
    const { error } = await updateTripAssignment(
      trip.id,
      { vehicle_id: vehicleId },
      currentUserId != null
        ? {
            changedBy: currentUserId,
            driverIdPrev: trip.driver_id ?? null,
            vehicleIdPrev: trip.vehicle_id ?? null,
          }
        : undefined,
    );
    setCardVehicleSaving(false);
    if (error) return;
    onVehicleDisplayChange?.(trimmed);
    onUpdated();
  }, [
    showAssignByPhone,
    effectiveCanAssign,
    cardVehicleInput,
    vehicles,
    resolveVehicleIdFromInput,
    trip.id,
    trip.driver_id,
    trip.vehicle_id,
    currentUserId,
    onVehicleDisplayChange,
    onUpdated,
  ]);

  useEffect(() => {
    const trimmed = phoneInput.trim();
    if (!trimmed) {
      setPhoneName(null);
      setPhoneDriverBusy(false);
      setPhoneBusyTripLabel(null);
      return;
    }
    if (phoneLookupTimeoutRef.current)
      clearTimeout(phoneLookupTimeoutRef.current);
    phoneLookupTimeoutRef.current = setTimeout(() => {
      phoneLookupTimeoutRef.current = null;
      const normalized = trimmed.replace(/\s+/g, "");
      if (normalized.length < 10) {
        setPhoneName(null);
        setPhoneDriverBusy(false);
        setPhoneBusyTripLabel(null);
        return;
      }
      searchExistingDriversByPhone(normalized).then(async ({ matches }) => {
        setPhoneName(matches[0]?.full_name ?? null);
        const orgForDriver =
          (driverAssignOrgId ?? organizationId).trim() || organizationId;
        const { result } = await getDriverAvailabilityByPhone(
          orgForDriver,
          normalized,
          { excludeTripId: trip.id },
        );
        setPhoneDriverBusy(result.isBusy);
        setPhoneBusyTripLabel(result.ongoingTripLabel ?? null);
      });
    }, 400);
    return () => {
      if (phoneLookupTimeoutRef.current)
        clearTimeout(phoneLookupTimeoutRef.current);
    };
  }, [phoneInput, driverAssignOrgId, organizationId, trip.id]);

  const assignByPhone = useCallback(async () => {
    const trimmed = phoneInput.trim();
    if (!trimmed) {
      setPhoneError("Enter driver phone number.");
      return;
    }
    const err = validatePhone(trimmed);
    if (err) {
      setPhoneError(err);
      return;
    }
    const orgForDriver =
      (driverAssignOrgId ?? organizationId).trim() || organizationId;
    const { error: availabilityError, result: availability } =
      await getDriverAvailabilityByPhone(orgForDriver, trimmed, {
        excludeTripId: trip.id,
      });
    if (availabilityError) {
      setPhoneError(
        humanizeTripIdInRpcError(availabilityError.message, trip),
      );
      return;
    }
    if (availability.isBusy) {
      const conflictTripLabel =
        availability.ongoingTripLabel ?? "another ongoing trip";
      setPhoneDriverBusy(true);
      setPhoneBusyTripLabel(conflictTripLabel);
      setPhoneError(
        `Driver is currently on ${conflictTripLabel}. Contact the driver first; if they are offline or unreachable, assign a different driver for this trip.`,
      );
      return;
    }
    setPhoneError(null);
    setPhoneSaving(true);
    const auditOpts =
      currentUserId != null
        ? {
            changedBy: currentUserId,
            driverIdPrev: trip.driver_id ?? null,
            vehicleIdPrev: trip.vehicle_id ?? null,
          }
        : undefined;
    const assignOpts = {
      ...auditOpts,
      trackingOnly: !!(trip.supplier_id && String(trip.supplier_id).trim()),
      // For reassignment, always require OTP claim (do not show trip directly to any driver).
      forceOtpClaim: phoneModalIsReassign,
    };
    const vehicleNumNorm = normalizeVehicleNumber(phoneVehicleInput);
    const matchedVehicle = vehicleNumNorm
      ? phoneModalVehicles.find(
          (v) => normalizeVehicleNumber(v.vehicle_number) === vehicleNumNorm,
        )
      : null;
    if (matchedVehicle) {
      const tripsRes = await getTripsByOrganization(organizationId);
      if (!tripsRes.error) {
        const activeTrips = (tripsRes.trips ?? []).filter((t) => {
          const s = String(t.status ?? "").toLowerCase();
          return t.id !== trip.id && !isTripCompleted(t) && s !== "cancelled";
        });
        const vehicleBusyTrip = activeTrips.find((t) => t.vehicle_id === matchedVehicle.id);
        if (vehicleBusyTrip && availability.isBusy) {
          const driverLabel =
            availability.ongoingTripLabel ?? "another ongoing trip";
          const vehicleLabel = getTripDisplayNumber(vehicleBusyTrip);
          setPhoneSaving(false);
          setPhoneError(
            `Driver is already in ${driverLabel} and vehicle is already in ${vehicleLabel}.`,
          );
          return;
        }
        if (vehicleBusyTrip) {
          const vehicleLabel = getTripDisplayNumber(vehicleBusyTrip);
          setPhoneSaving(false);
          setPhoneError(`Vehicle is already assigned to ${vehicleLabel}.`);
          return;
        }
      }
    }

    if (driverAssignOrgId) {
      const { error: rpcErr } = await assignAggregateTripDriverByPhone(
        trip.id,
        orgForDriver,
        trimmed,
        matchedVehicle ? null : phoneVehicleInput.trim() || null,
      );
      if (rpcErr) {
        setPhoneSaving(false);
        setPhoneError(humanizeTripIdInRpcError(rpcErr.message, trip));
        return;
      }
      if (matchedVehicle) {
        const { error: vehicleErr } = await updateTripAssignment(
          trip.id,
          { vehicle_id: matchedVehicle.id },
          auditOpts,
        );
        if (vehicleErr)
          setPhoneError(humanizeTripIdInRpcError(vehicleErr.message, trip));
      }
    } else {
      const { error } = await assignTripDriverByPhone(
        trip.id,
        orgForDriver,
        trimmed,
        assignOpts,
      );
      if (error) {
        setPhoneSaving(false);
        setPhoneError(humanizeTripIdInRpcError(error.message, trip));
        return;
      }
      if (matchedVehicle) {
        const { error: vehicleErr } = await updateTripAssignment(
          trip.id,
          { vehicle_id: matchedVehicle.id },
          auditOpts,
        );
        if (vehicleErr)
          setPhoneError(humanizeTripIdInRpcError(vehicleErr.message, trip));
      } else if (phoneVehicleInput.trim()) {
        const { error: vehicleErr } = await updateTripAssignment(
          trip.id,
          {
            vehicle_id: null,
            vehicle_display_number: phoneVehicleInput.trim(),
          },
          auditOpts,
        );
        if (vehicleErr)
          setPhoneError(humanizeTripIdInRpcError(vehicleErr.message, trip));
      }
    }
    const willHaveVehicleAssigned =
      !!matchedVehicle ||
      !!phoneVehicleInput.trim() ||
      !!trip.vehicle_id ||
      !!String(trip.vehicle_display_number ?? "").trim();

    const isAggregateTripFlow = !!(
      trip.supplier_id && String(trip.supplier_id).trim()
    );

    let regenOtp: {
      error: Error | null;
      code: string | null;
      expires_at: string | null;
    } = { error: null, code: null, expires_at: null };

    // OTP is allowed only after both driver and vehicle are assigned.
    if (willHaveVehicleAssigned && !otpLockedByTripProgress) {
      regenOtp = await regenerateTripOtp(trip.id);
      if (!regenOtp.error && regenOtp.code != null) {
        setOtpCode(regenOtp.code);
        setOtpExpiresAt(regenOtp.expires_at ?? null);
      }
    }

    setPhoneSaving(false);

    if (
      isAggregateTripFlow &&
      willHaveVehicleAssigned &&
      !otpLockedByTripProgress &&
      regenOtp.code &&
      !regenOtp.error
    ) {
      setPhoneAssignOtpReveal({
        code: regenOtp.code,
        expires_at: regenOtp.expires_at ?? null,
      });
      onUpdated();
      return;
    }

    if (
      isAggregateTripFlow &&
      willHaveVehicleAssigned &&
      !otpLockedByTripProgress &&
      regenOtp.error
    ) {
      setPhoneError(humanizeTripIdInRpcError(regenOtp.error.message, trip));
      onUpdated();
      return;
    }

    setShowPhoneModal(false);
    setPhoneInput("");
    setPhoneName(null);
    setPhoneError(null);
    setPhoneVehicleInput("");
    setPhoneModalIsReassign(false);
    setPhoneAssignOtpReveal(null);
    onUpdated();
  }, [
    trip.id,
    trip.driver_id,
    trip.vehicle_id,
    trip.supplier_id,
    organizationId,
    driverAssignOrgId,
    phoneInput,
    phoneVehicleInput,
    phoneModalVehicles,
    phoneModalIsReassign,
    currentUserId,
    normalizeVehicleNumber,
    onUpdated,
  ]);

  const handleRegenerateOtp = useCallback(async () => {
    if (!trip?.id || otpRegenerating || !canGenerateOtpNow || otpLockedByTripProgress) return;
    setOtpError(null);
    setOtpRegenerating(true);
    try {
      const { error, code, expires_at } = await regenerateTripOtp(trip.id);
      if (error) {
        setOtpError(error.message);
        return;
      }
      setOtpCode(code ?? null);
      setOtpExpiresAt(expires_at ?? null);
    } finally {
      setOtpRegenerating(false);
    }
  }, [trip?.id, otpRegenerating, canGenerateOtpNow, otpLockedByTripProgress]);

  const handleGenerateOtp = useCallback(async () => {
    if (!trip?.id || otpRegenerating || !canGenerateOtpNow || otpLockedByTripProgress) return;
    setOtpError(null);
    setOtpRegenerating(true);
    try {
      const { error, code, expires_at } = await generateTripOtp(trip.id);
      if (error) {
        setOtpError(error.message);
        return;
      }
      setOtpCode(code ?? null);
      setOtpExpiresAt(expires_at ?? null);
    } finally {
      setOtpRegenerating(false);
    }
  }, [trip?.id, otpRegenerating, canGenerateOtpNow, otpLockedByTripProgress]);

  const openPhoneModal = useCallback(
    (isReassign?: boolean, initialVehicle?: string) => {
      setPhoneModalIsReassign(isReassign ?? false);
      setPhoneAssignOtpReveal(null);
      setPhoneInput("");
      setPhoneError(null);
      setPhoneName(null);
      const vehiclePrefill =
        initialVehicle != null && initialVehicle.trim() !== ""
          ? formatIndianVehicleNumber(
              initialVehicle.trim().split("·")[0]?.trim() ??
                initialVehicle.trim(),
            )
          : "";
      setPhoneVehicleInput(vehiclePrefill);
      setShowPhoneModal(true);
      getVehiclesByOrganization(organizationId).then((r) =>
        setPhoneModalVehicles(r.error ? [] : (r.vehicles ?? [])),
      );
    },
    [organizationId],
  );

  const pilotText =
    propsDriverName ??
    ((trip.driver_display_name ?? "").trim() || (trip.driver_id ? "—" : "—"));
  const rawVehicleText =
    (propsVehicleLabel ?? "").trim() ||
    (trip.vehicle_display_number?.trim()
      ? formatIndianVehicleNumber(trip.vehicle_display_number.trim())
      : "") ||
    "";
  // Display as "PLATE • TYPE" (bullet + uppercase type) to match design
  const vehicleText =
    rawVehicleText === ""
      ? "—"
      : rawVehicleText.includes("·")
        ? rawVehicleText
            .split("·")
            .map((s) => s.trim())
            .filter(Boolean)
            .join(" • ")
        : rawVehicleText;

  /** When assigned, show only "Private Book" (no "Shared Network" label). */
  const sourceLabel =
    assignmentSource === "private" || assignmentSource === "shared"
      ? "Private Book"
      : "Unassigned";
  const sourceBadgeStyle =
    assignmentSource === "private" || assignmentSource === "shared"
      ? styles.badgePrivate
      : styles.badgeUnassigned;
  const hasDriver = !!(
    trip.driver_id || (trip.driver_display_name ?? "").trim()
  );
  const hasVehicle = !!(
    trip.vehicle_id ||
    (trip.vehicle_display_number ?? "").trim() ||
    (propsVehicleLabel ?? "").trim()
  );
  const hasAssignment = hasDriver || hasVehicle;
  const showSourceBadge = hasAssignment && assignmentSource !== "unassigned";

  const openDriverPicker = useCallback(() => {
    setAssignMode("driver");
    setAssignSearch("");
    setPickDriverId(trip.driver_id);
    Promise.all([
      getDriversByOrganization(organizationId),
      getActiveDriverIds(organizationId),
      getTripsByOrganization(organizationId),
    ]).then(([r, busyIds, tripsRes]) => {
      const list = r.error ? [] : (r.drivers ?? []);
      setDrivers(list.filter((d) => !d.left_at));
      setActiveDriverIds(busyIds);
      const activeTrips = (tripsRes.error ? [] : (tripsRes.trips ?? [])).filter((t) => {
        const s = String(t.status ?? "").toLowerCase();
        return !isTripCompleted(t) && s !== "cancelled";
      });
      const labels: Record<string, string> = {};
      for (const t of activeTrips) {
        if (t.id === trip.id) continue;
        if (t.driver_id) labels[t.driver_id] = getTripDisplayNumber(t);
      }
      setActiveDriverTripLabelById(labels);
    });
  }, [organizationId, trip.driver_id, trip.id]);

  const openVehiclePicker = useCallback(() => {
    setAssignMode("vehicle");
    setAssignSearch("");
    setPickVehicleId(trip.vehicle_id);
    if ((propsVehicleLabel ?? "").trim() !== "") {
      const raw = (propsVehicleLabel ?? "").split("·")[0]?.trim() ?? "";
      setPickerVehicleInput(raw ? formatIndianVehicleNumber(raw) : "");
    } else if (trip.vehicle_display_number?.trim()) {
      setPickerVehicleInput(
        formatIndianVehicleNumber(trip.vehicle_display_number.trim()),
      );
    } else {
      setPickerVehicleInput("");
    }
    Promise.all([
      getVehiclesByOrganization(organizationId),
      getTripsByOrganization(organizationId),
    ]).then(([vehiclesRes, tripsRes]) => {
      setVehicles(vehiclesRes.error ? [] : (vehiclesRes.vehicles ?? []));
      const activeTrips = (tripsRes.error ? [] : (tripsRes.trips ?? [])).filter((t) => {
        const s = String(t.status ?? "").toLowerCase();
        return !isTripCompleted(t) && s !== "cancelled";
      });
      const ids = new Set<string>();
      const labels: Record<string, string> = {};
      for (const t of activeTrips) {
        if (t.id === trip.id) continue;
        if (t.vehicle_id) {
          ids.add(t.vehicle_id);
          labels[t.vehicle_id] = getTripDisplayNumber(t);
        }
      }
      setActiveVehicleIds(ids);
      setActiveVehicleTripLabelById(labels);
    });
  }, [
    organizationId,
    trip.vehicle_id,
    trip.vehicle_display_number,
    propsVehicleLabel,
    trip.id,
  ]);

  useEffect(() => {
    if (!effectiveCanAssign || !autoOpenPickerMode) return;
    if (autoOpenPickerMode === "driver") {
      openDriverPicker();
      return;
    }
    openVehiclePicker();
  }, [
    autoOpenPickerMode,
    autoOpenPickerNonce,
    effectiveCanAssign,
    openDriverPicker,
    openVehiclePicker,
  ]);

  const saveDriverOnly = useCallback(
    async (driverId: string | null) => {
      if (driverId && driverId !== trip.driver_id && activeDriverIds.has(driverId)) {
        const label = activeDriverTripLabelById[driverId] ?? "another ongoing trip";
        Alert.alert("Driver already in trip", `Driver is already assigned to ${label}.`);
        return;
      }
      setSaving(true);
      try {
        const { error } = await updateTripAssignment(
          trip.id,
          { driver_id: driverId },
          currentUserId != null
            ? {
                changedBy: currentUserId,
                driverIdPrev: trip.driver_id ?? null,
                vehicleIdPrev: trip.vehicle_id ?? null,
              }
            : undefined,
        );
        if (error) {
          Alert.alert("Save failed", error.message, [{ text: "OK" }]);
          return;
        }
        closeAssignModal();
        onUpdated();
      } finally {
        setSaving(false);
      }
    },
    [
      trip.id,
      trip.driver_id,
      trip.vehicle_id,
      currentUserId,
      onUpdated,
      activeDriverIds,
      activeDriverTripLabelById,
      closeAssignModal,
    ],
  );

  const saveVehicleOnly = useCallback(
    async (
      vehicleId: string | null,
      vehicleDisplayNumber: string | null = null,
    ) => {
      if (vehicleId && vehicleId !== trip.vehicle_id && activeVehicleIds.has(vehicleId)) {
        const label = activeVehicleTripLabelById[vehicleId] ?? "another ongoing trip";
        Alert.alert("Vehicle already in trip", `Vehicle is already assigned to ${label}.`);
        return;
      }
      setSaving(true);
      try {
        const payload: Parameters<typeof updateTripAssignment>[1] = {
          vehicle_id: vehicleId,
        };
        if (vehicleDisplayNumber != null)
          payload.vehicle_display_number = vehicleDisplayNumber;
        const { error } = await updateTripAssignment(
          trip.id,
          payload,
          currentUserId != null
            ? {
                changedBy: currentUserId,
                driverIdPrev: trip.driver_id ?? null,
                vehicleIdPrev: trip.vehicle_id ?? null,
              }
            : undefined,
        );
        if (error) {
          Alert.alert("Save failed", error.message, [{ text: "OK" }]);
          return;
        }
        closeAssignModal();
        if (showAssignByPhone && vehicleDisplayNumber) {
          setCardVehicleInput(vehicleDisplayNumber);
          onVehicleDisplayChange?.(vehicleDisplayNumber);
        }
        onUpdated();
      } finally {
        setSaving(false);
      }
    },
    [
      trip.id,
      trip.driver_id,
      trip.vehicle_id,
      currentUserId,
      showAssignByPhone,
      onVehicleDisplayChange,
      onUpdated,
      activeVehicleIds,
      activeVehicleTripLabelById,
      closeAssignModal,
    ],
  );

  const filteredDrivers = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    const searched = q
      ? drivers.filter(
          (d) =>
            (d.name ?? "").toLowerCase().includes(q) ||
            (d.phone ?? "").replace(/\s+/g, "").includes(q.replace(/\s+/g, "")),
        )
      : drivers;
    const withoutCurrent = searched.filter((d) => d.id !== trip.driver_id);

    // Asset-based reassignment (no assign-by-phone): list available drivers first.
    if (!showAssignByPhone) {
      const availabilityRank = (d: DriverRow) => {
        const isOnTrip = activeDriverIds.has(d.id) && d.id !== trip.driver_id;
        if (d.left_at) return 2;
        if (isOnTrip) return 1;
        return 0; // available
      };
      return [...withoutCurrent].sort((a, b) => {
        const rankDiff = availabilityRank(a) - availabilityRank(b);
        if (rankDiff !== 0) return rankDiff;
        return (a.name ?? "").localeCompare(b.name ?? "");
      });
    }

    return withoutCurrent;
  }, [
    drivers,
    assignSearch,
    showAssignByPhone,
    activeDriverIds,
    trip.driver_id,
  ]);

  const filteredVehicles = useMemo(() => {
    const withoutCurrent = vehicles.filter((v) => v.id !== trip.vehicle_id);
    if (!assignSearch.trim()) return withoutCurrent;
    const q = assignSearch.trim().toLowerCase();
    return withoutCurrent.filter(
      (v) =>
        (v.vehicle_number ?? "").toLowerCase().includes(q) ||
        (v.vehicle_type ?? "").toLowerCase().includes(q),
    );
  }, [vehicles, assignSearch, trip.vehicle_id]);

  const getDriverRatingMeta = useCallback((driver: DriverRow) => {
    const data = driver as DriverRow & {
      rating?: number | string | null;
      rating_avg?: number | string | null;
      avg_rating?: number | string | null;
      rating_count?: number | string | null;
      ratings_count?: number | string | null;
      total_ratings?: number | string | null;
    };

    const rawRating = data.rating ?? data.rating_avg ?? data.avg_rating ?? null;
    const numericRating =
      rawRating == null
        ? NaN
        : typeof rawRating === "number"
          ? rawRating
          : Number(rawRating);
    if (!Number.isFinite(numericRating)) return null;

    const rawCount =
      data.rating_count ?? data.ratings_count ?? data.total_ratings ?? null;
    const numericCount =
      rawCount == null
        ? NaN
        : typeof rawCount === "number"
          ? rawCount
          : Number(rawCount);

    return {
      ratingLabel: numericRating.toFixed(1),
      countLabel:
        Number.isFinite(numericCount) && numericCount > 0
          ? `(${Math.round(numericCount)})`
          : null,
    };
  }, []);

  useEffect(() => {
    if (assignMode !== "driver") return;
    const list = filteredDrivers;
    if (!list.length) {
      setPreviewDriverId(null);
      return;
    }
    const driverBusyFn = (did: string) =>
      activeDriverIds.has(did) && did !== trip.driver_id;
    const firstFree = list.find((d) => {
      const onTrip = driverBusyFn(d.id);
      const available = !d.left_at && !onTrip;
      return available;
    });
    setPreviewDriverId((prev) => {
      if (prev && list.some((d) => d.id === prev)) {
        const d = list.find((x) => x.id === prev)!;
        const onTrip = driverBusyFn(d.id);
        const ok = !d.left_at && !onTrip;
        if (ok) return prev;
      }
      return firstFree?.id ?? list[0]?.id ?? null;
    });
  }, [assignMode, filteredDrivers, activeDriverIds, trip.driver_id]);

  useEffect(() => {
    if (assignMode !== "vehicle") return;
    const list = filteredVehicles;
    if (!list.length) {
      setPreviewVehicleId(null);
      return;
    }
    const vehicleBusyFn = (vid: string) =>
      activeVehicleIds.has(vid) && vid !== trip.vehicle_id;
    const firstFree = list.find((v) => !vehicleBusyFn(v.id));
    setPreviewVehicleId((prev) => {
      if (prev && list.some((v) => v.id === prev)) {
        if (!vehicleBusyFn(prev)) return prev;
      }
      return firstFree?.id ?? list[0]?.id ?? null;
    });
  }, [assignMode, filteredVehicles, activeVehicleIds, trip.vehicle_id]);

  const executePreviewAssignment = useCallback(async () => {
    if (assignMode === "driver") {
      if (!previewDriverId) return;
      await saveDriverOnly(previewDriverId);
      return;
    }
    if (assignMode === "vehicle") {
      if (!previewVehicleId) return;
      await saveVehicleOnly(previewVehicleId);
    }
  }, [
    assignMode,
    previewDriverId,
    previewVehicleId,
    saveDriverOnly,
    saveVehicleOnly,
  ]);

  const pilotCodeFromName = (name: string) => {
    const p = name.trim().split(/\s+/).filter(Boolean);
    const a = (p[0]?.[0] ?? "?").toUpperCase();
    const b = (p[1]?.[0] ?? "").toUpperCase();
    return (a + b).slice(0, 2);
  };

  const vehicleTileCode = (v: VehicleRow) => {
    const plate = formatIndianVehicleNumber(v.vehicle_number).replace(/\s/g, "");
    return plate.slice(-3).toUpperCase() || "V";
  };

  const previewDriverRow =
    assignMode === "driver" && previewDriverId
      ? filteredDrivers.find((d) => d.id === previewDriverId)
      : null;
  const previewVehicleRow =
    assignMode === "vehicle" && previewVehicleId
      ? filteredVehicles.find((v) => v.id === previewVehicleId)
      : null;

  const previewDriverBusy =
    !!previewDriverRow &&
    activeDriverIds.has(previewDriverRow.id) &&
    previewDriverRow.id !== trip.driver_id;
  const previewVehicleBusy =
    !!previewVehicleRow &&
    activeVehicleIds.has(previewVehicleRow.id) &&
    previewVehicleRow.id !== trip.vehicle_id;

  const pilotEfficiencyPct = (d: DriverRow | null | undefined) => {
    const meta = d ? getDriverRatingMeta(d) : null;
    const r = meta ? Number(meta.ratingLabel) : NaN;
    if (Number.isFinite(r)) return Math.min(100, Math.round(r * 20));
    return 88;
  };

  const vehicleHealthPct = (v: VehicleRow | null | undefined) => {
    if (!v) return 95;
    const st = String(v.status ?? "").toLowerCase();
    if (st.includes("maint")) return 72;
    if (st.includes("avail") || st.includes("ready")) return 96;
    return 90;
  };

  const renderAllocationSidebar = () => {
    if (assignMode === "driver") {
      const d = previewDriverRow;
      if (!d) {
        return (
          <View style={styles.allocSidebarEmpty}>
            <Text style={styles.allocSidebarEmptyText}>Choose a driver</Text>
          </View>
        );
      }
      const meta = getDriverRatingMeta(d);
      const busy = previewDriverBusy;
      const eff = pilotEfficiencyPct(d);
      const eth = Math.min(
        100,
        Math.round((meta ? Number(meta.ratingLabel) : 4.5) * 20),
      );
      return (
        <View style={styles.allocSidebarInner}>
          <View style={styles.allocSidebarHero}>
            <View style={styles.allocSidebarAvatar}>
              <Text style={styles.allocSidebarAvatarText}>
                {pilotCodeFromName(d.name ?? "?")}
              </Text>
            </View>
          </View>
          <Text style={styles.allocSidebarName} numberOfLines={2}>
            {d.name ?? "—"}
          </Text>
          <View style={styles.allocSidebarChip}>
            <Text style={styles.allocSidebarChipText}>Your fleet</Text>
          </View>
          <View style={styles.allocMetricBlock}>
            <View style={styles.allocMetricHead}>
              <Text style={styles.allocMetricLabel}>Performance</Text>
              <Text style={styles.allocMetricPct}>{eff}%</Text>
            </View>
            <View style={styles.allocMetricTrack}>
              <View style={[styles.allocMetricFillDark, { width: `${eff}%` }]} />
            </View>
          </View>
          <View style={styles.allocMetricBlock}>
            <View style={styles.allocMetricHead}>
              <Text style={styles.allocMetricLabel}>Reliability</Text>
              <Text style={styles.allocMetricPct}>{eth}%</Text>
            </View>
            <View style={styles.allocMetricTrack}>
              <View style={[styles.allocMetricFillBlue, { width: `${eth}%` }]} />
            </View>
          </View>
          <View style={styles.allocMiniGrid}>
            <View style={styles.allocMiniCell}>
              <Text style={styles.allocMiniVal}>—</Text>
              <Text style={styles.allocMiniLbl}>Trips</Text>
            </View>
            <View style={styles.allocMiniCell}>
              <Text style={styles.allocMiniVal}>
                {meta ? `${meta.ratingLabel}★` : "—"}
              </Text>
              <Text style={styles.allocMiniLbl}>Rating</Text>
            </View>
          </View>
          {busy ? (
            <Text style={styles.allocSidebarWarn}>
              This driver is already on another trip. Choose someone else.
            </Text>
          ) : null}
          <TouchableOpacity
            style={[
              styles.allocExecuteBtn,
              (busy || saving || !previewDriverId) && styles.allocExecuteBtnDis,
            ]}
            disabled={saving || busy || !previewDriverId}
            onPress={() => void executePreviewAssignment()}
            activeOpacity={0.9}
          >
            <Text style={styles.allocExecuteBtnText}>Save assignment</Text>
          </TouchableOpacity>
          <Text style={styles.allocVerifyHint}>Check details before saving.</Text>
        </View>
      );
    }
    const v = previewVehicleRow;
    if (!v) {
      return (
        <View style={styles.allocSidebarEmpty}>
          <Text style={styles.allocSidebarEmptyText}>Choose a vehicle</Text>
        </View>
      );
    }
    const plate = formatIndianVehicleNumber(v.vehicle_number);
    const hp = vehicleHealthPct(v);
    const busy = previewVehicleBusy;
    return (
      <View style={styles.allocSidebarInner}>
        <View style={styles.allocSidebarHero}>
          <View style={styles.allocSidebarAvatar}>
            <Text style={styles.allocSidebarAvatarText}>{vehicleTileCode(v)}</Text>
          </View>
        </View>
        <Text style={styles.allocSidebarName} numberOfLines={2}>
          {plate}
        </Text>
        <View style={styles.allocSidebarChip}>
          <Text style={styles.allocSidebarChipText}>Fleet vehicle</Text>
        </View>
        <View style={styles.allocMetricBlock}>
          <View style={styles.allocMetricHead}>
            <Text style={styles.allocMetricLabel}>Condition</Text>
            <Text style={styles.allocMetricPct}>{hp}%</Text>
          </View>
          <View style={styles.allocMetricTrack}>
            <View style={[styles.allocMetricFillDark, { width: `${hp}%` }]} />
          </View>
        </View>
        <View style={styles.allocMetricBlock}>
          <View style={styles.allocMetricHead}>
            <Text style={styles.allocMetricLabel}>Status</Text>
            <Text style={styles.allocMetricPct}>Good</Text>
          </View>
          <View style={styles.allocMetricTrack}>
            <View style={[styles.allocMetricFillBlue, { width: "96%" }]} />
          </View>
        </View>
        <View style={styles.allocMiniGrid}>
          <View style={styles.allocMiniCell}>
            <Text style={styles.allocMiniVal}>{v.capacity ?? "—"}</Text>
            <Text style={styles.allocMiniLbl}>Capacity</Text>
          </View>
          <View style={styles.allocMiniCell}>
            <Text style={styles.allocMiniVal}>{hp}%</Text>
            <Text style={styles.allocMiniLbl}>Health</Text>
          </View>
        </View>
        {busy ? (
          <Text style={styles.allocSidebarWarn}>
            Vehicle is busy on another trip.
          </Text>
        ) : null}
        <TouchableOpacity
          style={[
            styles.allocExecuteBtn,
            (busy || saving || !previewVehicleId) && styles.allocExecuteBtnDis,
          ]}
          disabled={saving || busy || !previewVehicleId}
          onPress={() => void executePreviewAssignment()}
          activeOpacity={0.9}
        >
          <Text style={styles.allocExecuteBtnText}>Save assignment</Text>
        </TouchableOpacity>
        <Text style={styles.allocVerifyHint}>Check details before saving.</Text>
      </View>
    );
  };

  return (
    <View style={[styles.wrapper, styles.wrapperStretch]}>
      <View style={styles.manifestCard}>
        <View style={styles.manifestCardHeader}>
          <Text style={styles.manifestEyebrow}>Driver & vehicle</Text>
          {showSourceBadge ? (
            <View style={[styles.sourceBadge, sourceBadgeStyle]}>
              <Text
                style={[
                  styles.sourceBadgeText,
                  assignmentSource === "shared" && styles.sourceBadgeTextShared,
                  assignmentSource === "private" &&
                    styles.sourceBadgeTextPrivate,
                ]}
              >
                {sourceLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.manifestStack}>
          <TouchableOpacity
            style={styles.manifestNodeShell}
            disabled={!effectiveCanAssign}
            activeOpacity={effectiveCanAssign ? 0.88 : 1}
            onPress={() =>
              !!effectiveCanAssign &&
              (showAssignByPhone
                ? openPhoneModal(
                    hasDriver || !!(previousDriverName ?? "").trim(),
                    propsVehicleLabel ?? trip.vehicle_display_number ?? "",
                  )
                : openDriverPicker())
            }
          >
            <View style={styles.manifestNodeInner}>
              <View style={styles.manifestNodeCopy}>
                <Text style={styles.manifestNodeKicker}>Driver</Text>
                <Text
                  style={[
                    styles.manifestNodeTitle,
                    !hasDriver && styles.manifestNodeTitleMuted,
                  ]}
                  numberOfLines={1}
                >
                  {hasDriver ? pilotText : "Not assigned"}
                </Text>
                {hasDriver ? (
                  <View style={styles.manifestNodeMetaRow}>
                    <Star size={12} color="#f59e0b" fill="#f59e0b" />
                    <Text style={styles.manifestNodeMetaText}>
                      Rated · Verified in your fleet
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.manifestActionCue}>Tap to assign a driver</Text>
                )}
              </View>
              <View style={styles.manifestNodeFab}>
                <ChevronRight size={18} color="#ffffff" strokeWidth={3} />
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.manifestNodeShell}
            disabled={!effectiveCanAssign}
            activeOpacity={effectiveCanAssign ? 0.88 : 1}
            onPress={() => !!effectiveCanAssign && openVehiclePicker()}
          >
            <View style={styles.manifestNodeInner}>
              <View style={styles.manifestNodeCopy}>
                <Text style={styles.manifestNodeKicker}>Vehicle</Text>
                <Text
                  style={[
                    styles.manifestNodeTitle,
                    !hasVehicle && styles.manifestNodeTitleMuted,
                  ]}
                  numberOfLines={2}
                >
                  {hasVehicle ? vehicleText : "Not assigned"}
                </Text>
                {!hasVehicle ? (
                  <Text style={styles.manifestVehicleCue}>
                    Assign a vehicle for this trip
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.manifestNodeFab,
                  !hasVehicle && styles.manifestNodeFabPulse,
                ]}
              >
                {hasVehicle ? (
                  <ChevronRight size={18} color="#ffffff" strokeWidth={3} />
                ) : (
                  <Plus size={18} color="#ffffff" strokeWidth={3} />
                )}
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {showAssignByPhone && (partnerName ?? "").trim() ? (
          <View style={styles.assignAggregateMeta}>
            <Text style={styles.assignAggregateMetaLabel}>Partner</Text>
            <Text style={styles.assignAggregateMetaValue} numberOfLines={1}>
              {partnerName?.trim() || "—"}
            </Text>
          </View>
        ) : null}

        {previousDriverName ? (
          <View style={styles.previousDriverRow}>
            <Text style={styles.label}>Previous driver</Text>
            <Text style={styles.value} numberOfLines={1}>
              {previousDriverName}
            </Text>
          </View>
        ) : null}
        {latestReassignmentSummary ? (
          <View style={styles.assignmentLogRow}>
            <Text style={styles.label}>Last change</Text>
            <Text style={styles.assignmentLogText}>
              {latestReassignmentSummary}
            </Text>
          </View>
        ) : null}
        {inlineSection ? (
          <View style={styles.inlineSectionWrap}>{inlineSection}</View>
        ) : null}
      </View>

      {/* Driver / vehicle picker + summary */}
      <Modal
        visible={assignMode !== null}
        animationType={Platform.OS === "web" ? "fade" : "slide"}
        presentationStyle={
          Platform.OS === "web" ? "overFullScreen" : "pageSheet"
        }
        transparent={Platform.OS === "web"}
        onRequestClose={closeAssignModal}
      >
        <View style={styles.webModalBackdrop}>
          <View
            style={[
              styles.assignModalWrap,
              styles.assignModalWrapWide,
              { paddingTop: insets.top },
            ]}
          >
            <View style={styles.allocModalHero}>
              <View style={styles.allocModalHeroText}>
                <Text style={styles.allocModalTitle}>
                  {assignMode === "driver"
                    ? "Choose driver"
                    : "Choose vehicle"}
                </Text>
                <Text style={styles.allocModalSubtitle}>
                  {isDesktop
                    ? "Select in the list, then confirm in the side panel."
                    : "Select in the list, then tap Save assignment below."}
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeAssignModal}
                style={styles.allocModalCloseBtn}
                hitSlop={8}
                accessibilityLabel="Close"
              >
                <FontAwesome name="times" size={18} color={Theme.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.allocToolbar}>
              <View style={[styles.allocSearchBar, styles.allocSearchFlex]}>
                <FontAwesome
                  name="search"
                  size={15}
                  color={Theme.textMuted}
                  style={styles.allocSearchIconInline}
                />
                <TextInput
                  style={styles.allocSearchInput}
                  value={assignSearch}
                  onChangeText={setAssignSearch}
                  placeholder={
                    assignMode === "driver"
                      ? "Search drivers…"
                      : "Search vehicles…"
                  }
                  placeholderTextColor={Theme.textMuted}
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.allocRegisterRow}
              activeOpacity={0.85}
              onPress={() => {
                closeAssignModal();
                onBeforeRegisterNavigate?.();
                if (assignMode === "driver") {
                  router.push("/(modals)/add-driver");
                } else {
                  router.push("/(modals)/add-vehicle");
                }
              }}
            >
              <View style={styles.allocRegisterLeft}>
                <View style={styles.allocRegisterPlus}>
                  <Plus size={28} color={Theme.textMuted} strokeWidth={3} />
                </View>
                <View>
                  <Text style={styles.allocRegisterTitle}>
                    {assignMode === "driver"
                      ? "Add new driver"
                      : "Add new vehicle"}
                  </Text>
                  <Text style={styles.allocRegisterHint}>
                    Opens a short form; they appear in your fleet for next time.
                  </Text>
                </View>
              </View>
              <View style={styles.allocRegisterProto}>
                <Text style={styles.allocRegisterProtoText}>Add</Text>
              </View>
            </TouchableOpacity>

            <View
              style={[
                styles.allocBodyRow,
                isDesktop ? styles.allocBodyRowDesktop : null,
              ]}
            >
              <ScrollView
                style={[
                  styles.assignModalScroll,
                  isDesktop ? styles.allocMainScrollDesktop : null,
                ]}
                contentContainerStyle={[
                  styles.assignModalScrollContent,
                  styles.allocScrollPad,
                  {
                    paddingBottom:
                      (isDesktop ? 16 : 120) + Math.max(24, insets.bottom),
                  },
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {assignMode === "driver" ? (
                  filteredDrivers.length === 0 ? (
                    <Text style={styles.assignEmptyHint}>
                      No drivers in your list yet. Use “Add new driver” above.
                    </Text>
                  ) : (
                    <View style={styles.allocGrid}>
                      {filteredDrivers.map((d) => {
                        const isOnTrip =
                          activeDriverIds.has(d.id) && d.id !== trip.driver_id;
                        const isAvailable = !d.left_at && !isOnTrip;
                        const ratingMeta = getDriverRatingMeta(d);
                        const statusText = isOnTrip
                          ? `Already in ${activeDriverTripLabelById[d.id] ?? "another trip"}`
                          : isAvailable
                            ? "Ready"
                            : "On leave";
                        const sel = previewDriverId === d.id;
                        return (
                          <TouchableOpacity
                            key={d.id}
                            style={[
                              styles.assignFlowCard,
                              sel && styles.assignFlowCardSelected,
                              isOnTrip && styles.assignFlowCardBusy,
                            ]}
                            onPress={() =>
                              !isOnTrip && setPreviewDriverId(d.id)
                            }
                            disabled={isOnTrip}
                            activeOpacity={isOnTrip ? 1 : 0.92}
                          >
                            <View style={styles.assignFlowCardLeft}>
                              <View
                                style={[
                                  styles.assignFlowTile,
                                  sel && styles.assignFlowTileSelected,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.assignFlowTileText,
                                    sel && styles.assignFlowTileTextSel,
                                  ]}
                                >
                                  {pilotCodeFromName(d.name ?? "?")}
                                </Text>
                              </View>
                              <View style={styles.assignCardBody}>
                                <Text
                                  style={[
                                    styles.assignFlowCardTitle,
                                    sel && styles.assignFlowCardTitleSel,
                                    isOnTrip && styles.assignCardTitleMuted,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {d.name ?? "—"}
                                </Text>
                                <View style={styles.assignFlowMetaRow}>
                                  <View
                                    style={[
                                      styles.assignFlowStatusPill,
                                      isOnTrip && styles.assignFlowStatusPillBusy,
                                      sel && styles.assignFlowStatusPillSel,
                                    ]}
                                  >
                                    <Circle
                                      size={8}
                                      color={
                                        sel ? Theme.buttonPrimary : Theme.textMuted
                                      }
                                      fill={
                                        sel ? Theme.buttonPrimary : "transparent"
                                      }
                                    />
                                    <Text
                                      style={[
                                        styles.assignFlowStatusText,
                                        isOnTrip && styles.assignFlowStatusTextBusy,
                                        sel && styles.assignFlowStatusTextSel,
                                      ]}
                                    >
                                      {statusText}
                                    </Text>
                                  </View>
                                  {ratingMeta ? (
                                    <View style={styles.assignFlowStarRow}>
                                      <Star
                                        size={12}
                                        color={Theme.driverGold}
                                        fill={Theme.driverGold}
                                      />
                                      <Text
                                        style={[
                                          styles.assignFlowStarText,
                                          sel && styles.assignFlowStarTextSel,
                                        ]}
                                      >
                                        {ratingMeta.ratingLabel}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              </View>
                            </View>
                            {sel ? (
                              <View style={styles.assignFlowCheck}>
                                <Check
                                  size={26}
                                  color="#fff"
                                  strokeWidth={4}
                                />
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )
                ) : (
                  <>
                    {showAssignByPhone ? (
                      <View style={styles.assignAdhocVehicleWrap}>
                        <Text style={styles.assignAdhocVehicleLabel}>
                          Vehicle registration (ad-hoc)
                        </Text>
                        <Text style={styles.assignAdhocVehicleHint}>
                          Partner vehicle not in your fleet — enter number to
                          save on trip.
                        </Text>
                        <TextInput
                          style={styles.assignAdhocVehicleInput}
                          value={pickerVehicleInput}
                          onChangeText={setPickerVehicleInput}
                          placeholder="e.g. TN 23 AB 1234"
                          placeholderTextColor={Theme.textMuted}
                        />
                        <TouchableOpacity
                          style={[
                            styles.assignAdhocVehicleBtn,
                            !pickerVehicleInput.trim() &&
                              styles.assignAdhocVehicleBtnDisabled,
                          ]}
                          onPress={() =>
                            saveVehicleOnly(
                              null,
                              pickerVehicleInput.trim() || null,
                            )
                          }
                          disabled={saving || !pickerVehicleInput.trim()}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.assignAdhocVehicleBtnText}>
                            {saving ? "Saving…" : "Save registration"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {filteredVehicles.length === 0 ? (
                      showAssignByPhone ? null : (
                        <Text style={styles.assignEmptyHint}>
                          No vehicles in your list. Use “Add new vehicle” or enter
                          a one-off registration above.
                        </Text>
                      )
                    ) : (
                      <View style={styles.allocGrid}>
                        {filteredVehicles.map((v) => {
                          const plate = formatIndianVehicleNumber(
                            v.vehicle_number,
                          );
                          const vehicleBusy =
                            activeVehicleIds.has(v.id) &&
                            v.id !== trip.vehicle_id;
                          const typeLabel = v.vehicle_type ?? "Vehicle";
                          const sel = previewVehicleId === v.id;
                          return (
                            <TouchableOpacity
                              key={v.id}
                              style={[
                                styles.assignFlowCard,
                                sel && styles.assignFlowCardSelected,
                                vehicleBusy && styles.assignFlowCardBusy,
                              ]}
                              onPress={() =>
                                !vehicleBusy && setPreviewVehicleId(v.id)
                              }
                              disabled={vehicleBusy}
                              activeOpacity={vehicleBusy ? 1 : 0.92}
                            >
                              <View style={styles.assignFlowCardLeft}>
                                <View
                                  style={[
                                    styles.assignFlowTile,
                                    sel && styles.assignFlowTileSelected,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.assignFlowTileText,
                                      sel && styles.assignFlowTileTextSel,
                                    ]}
                                  >
                                    {vehicleTileCode(v)}
                                  </Text>
                                </View>
                                <View style={styles.assignCardBody}>
                                  <Text
                                    style={[
                                      styles.assignFlowCardTitle,
                                      sel && styles.assignFlowCardTitleSel,
                                      vehicleBusy && styles.assignCardTitleMuted,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {plate}
                                  </Text>
                                  <View style={styles.assignFlowMetaRow}>
                                    <View
                                      style={[
                                        styles.assignFlowStatusPill,
                                        vehicleBusy && styles.assignFlowStatusPillBusy,
                                        sel && styles.assignFlowStatusPillSel,
                                      ]}
                                    >
                                      <Circle
                                        size={8}
                                        color={
                                          sel
                                            ? Theme.buttonPrimary
                                            : Theme.textMuted
                                        }
                                        fill={
                                          sel
                                            ? Theme.buttonPrimary
                                            : "transparent"
                                        }
                                      />
                                      <Text
                                        style={[
                                          styles.assignFlowStatusText,
                                          vehicleBusy &&
                                            styles.assignFlowStatusTextBusy,
                                          sel &&
                                            styles.assignFlowStatusTextSel,
                                        ]}
                                      >
                                        {vehicleBusy ? "Busy" : typeLabel}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              </View>
                              {sel ? (
                                <View style={styles.assignFlowCheck}>
                                  <Check
                                    size={26}
                                    color="#fff"
                                    strokeWidth={4}
                                  />
                                </View>
                              ) : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </>
                )}

                {!isDesktop ? (
                  <View style={styles.allocSidebarMobile}>{renderAllocationSidebar()}</View>
                ) : null}
              </ScrollView>

              {isDesktop ? (
                <ScrollView
                  style={styles.allocSidebarDesktopScroll}
                  contentContainerStyle={
                    styles.allocSidebarDesktopScrollContent
                  }
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {renderAllocationSidebar()}
                </ScrollView>
              ) : null}
            </View>

            {!isDesktop ? (
              <View
                style={[
                  styles.allocMobileFooter,
                  { paddingBottom: Math.max(24, insets.bottom) },
                ]}
              >
                <TouchableOpacity
                  style={styles.allocMobileFooterClose}
                  onPress={closeAssignModal}
                  activeOpacity={0.9}
                >
                  <Text style={styles.allocMobileFooterCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View
                style={[
                  styles.allocDesktopFooterBar,
                  { paddingBottom: Math.max(16, insets.bottom) },
                ]}
              >
                <TouchableOpacity
                  style={styles.allocDesktopFooterClose}
                  onPress={closeAssignModal}
                  activeOpacity={0.9}
                >
                  <Text style={styles.allocDesktopFooterCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPhoneModal}
        animationType={Platform.OS === "web" ? "fade" : "slide"}
        presentationStyle={
          Platform.OS === "web" ? "overFullScreen" : "pageSheet"
        }
        transparent={Platform.OS === "web"}
        onRequestClose={() => {
          setShowPhoneModal(false);
          setPhoneAssignOtpReveal(null);
        }}
      >
        <View style={styles.webModalBackdrop}>
          <View style={styles.assignModalWrap}>
            <View style={styles.assignModalHeader}>
              <View style={styles.assignModalHeaderText}>
                <Text style={styles.assignModalTitle}>
                  {phoneAssignOtpReveal
                    ? "OTP ready"
                    : phoneModalIsReassign
                      ? "Reassign driver by phone"
                      : "Assign driver by phone"}
                </Text>
                <Text style={styles.assignModalSubtitle}>
                  {phoneAssignOtpReveal
                    ? "Share with driver for " + getTripDisplayNumber(trip)
                    : phoneModalIsReassign
                      ? "New driver for " + getTripDisplayNumber(trip)
                      : "Enter driver phone for " + getTripDisplayNumber(trip)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowPhoneModal(false);
                  setPhoneAssignOtpReveal(null);
                }}
                style={styles.assignModalCloseBtn}
                hitSlop={8}
                accessibilityLabel="Close"
              >
                <FontAwesome name="times" size={18} color={Theme.textMuted} />
              </TouchableOpacity>
            </View>

            {phoneAssignOtpReveal ? (
              <>
                <ScrollView
                  style={styles.assignModalScroll}
                  contentContainerStyle={styles.assignModalScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.phoneOtpRevealCard}>
                    <View style={styles.phoneOtpRevealIconWrap}>
                      <FontAwesome name="key" size={22} color="#4f46e5" />
                    </View>
                    <Text style={styles.phoneOtpRevealTitle}>Verification code</Text>
                    <Text style={styles.phoneOtpRevealCode}>
                      {phoneAssignOtpReveal.code}
                    </Text>
                    {phoneAssignOtpReveal.expires_at ? (
                      <Text style={styles.phoneOtpRevealExpiry}>
                        Expires{" "}
                        {new Date(
                          phoneAssignOtpReveal.expires_at,
                        ).toLocaleString("en-IN")}
                      </Text>
                    ) : null}
                    <Text style={styles.phoneOtpRevealHint}>
                      Ask the driver to enter this code in the driver app to claim
                      the trip. You can resend from trip details if needed.
                    </Text>
                  </View>
                </ScrollView>
                <View
                  style={[
                    styles.assignModalFooter,
                    { paddingBottom: Math.max(24, insets.bottom) },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.assignConfirmBtn}
                    onPress={() => {
                      setShowPhoneModal(false);
                      setPhoneAssignOtpReveal(null);
                      setPhoneInput("");
                      setPhoneName(null);
                      setPhoneVehicleInput("");
                      setPhoneModalIsReassign(false);
                    }}
                    activeOpacity={0.9}
                  >
                    <FontAwesome name="check" size={20} color="#111827" />
                    <Text style={styles.assignConfirmBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <ScrollView
                  style={styles.assignModalScroll}
                  contentContainerStyle={styles.assignModalScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.assignStepLabel}>Driver phone</Text>
                  <TextInput
                    style={styles.phoneModalInput}
                    placeholder="e.g. +91 98765 43210"
                    placeholderTextColor={Theme.textMuted}
                    value={phoneInput}
                    onChangeText={(v) => {
                      setPhoneInput(formatMobileNumber(v));
                      setPhoneError(null);
                      setPhoneDriverBusy(false);
                      setPhoneBusyTripLabel(null);
                    }}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                    autoComplete="tel"
                  />
                  {phoneName ? (
                    <View style={styles.phoneModalFoundWrap}>
                      <Text style={styles.phoneModalFound}>Found: {phoneName}</Text>
                      <Text style={styles.phoneModalHint}>
                        {phoneModalIsReassign
                          ? "Tap Reassign below, then share the new OTP with the driver."
                          : "Tap Assign below to confirm."}
                      </Text>
                    </View>
                  ) : null}
                  {phoneDriverBusy ? (
                    <View style={styles.phoneModalBusyWrap}>
                      <Text style={styles.phoneModalInTrip}>
                        Driver currently on{" "}
                        {phoneBusyTripLabel ?? "another ongoing trip"}
                      </Text>
                      <Text style={styles.phoneModalBusyHint}>
                        Reach out to {phoneName ?? "this driver"} on{" "}
                        {phoneInput.trim() || "their phone"} to confirm
                        availability. If they are offline/unreachable, plan with
                        another driver and assign this trip there.
                      </Text>
                    </View>
                  ) : null}
                  {phoneError ? (
                    <Text style={styles.phoneModalError}>{phoneError}</Text>
                  ) : null}

                  <Text
                    style={[styles.assignStepLabel, styles.assignStepLabelSecond]}
                  >
                    Vehicle (optional)
                  </Text>
                  <TextInput
                    style={styles.phoneModalInput}
                    placeholder="e.g. TN 01 AB 1234"
                    placeholderTextColor={Theme.textMuted}
                    value={phoneVehicleInput}
                    onChangeText={(text) =>
                      setPhoneVehicleInput(formatIndianVehicleNumberInput(text))
                    }
                    autoCorrect={false}
                    autoCapitalize="characters"
                  />
                  <View style={styles.phoneProtocolCard}>
                    <View style={styles.phoneProtocolIconWrap}>
                      <FontAwesome name="mobile" size={18} color="#4f46e5" />
                    </View>
                    <View style={styles.phoneProtocolBody}>
                      <Text style={styles.phoneProtocolTitle}>Secure assignment</Text>
                      <Text style={styles.phoneProtocolText}>
                        Assigning by phone uses OTP verification. Share the code with
                        the driver after you assign them.
                      </Text>
                    </View>
                  </View>
                </ScrollView>

                <View
                  style={[
                    styles.assignModalFooter,
                    { paddingBottom: Math.max(24, insets.bottom) },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.assignConfirmBtn,
                      (phoneSaving || phoneDriverBusy) &&
                        styles.assignConfirmBtnDisabled,
                    ]}
                    onPress={assignByPhone}
                    disabled={phoneSaving || phoneDriverBusy}
                    activeOpacity={0.9}
                  >
                    <FontAwesome name="user-plus" size={20} color="#111827" />
                    <Text style={styles.assignConfirmBtnText}>
                      {phoneSaving
                        ? phoneModalIsReassign
                          ? "Reassigning…"
                          : "Assigning…"
                        : phoneDriverBusy
                          ? "Driver Busy"
                          : phoneModalIsReassign
                            ? "Reassign"
                            : "Assign"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12 },
  wrapperStretch: { alignSelf: "stretch" as const },
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 14,
    padding: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  currentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  currentHeaderTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  currentHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  statusPillUnassigned: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderLight,
  },
  statusPillPartial: {
    backgroundColor: (Theme as any).warningMuted ?? Theme.surfaceGray,
    borderColor: (Theme as any).warning ?? Theme.borderLight,
  },
  statusPillAssigned: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.darkGreen,
  },
  statusPillTextUnassigned: { color: Theme.textMuted },
  statusPillTextPartial: {
    color: (Theme as any).warning ?? Theme.textPrimaryDark,
  },
  statusPillTextAssigned: { color: Theme.darkGreen },

  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  assignRowLast: { borderBottomWidth: 0 },
  assignRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  assignIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  assignIconInactive: {
    backgroundColor: Theme.surfaceGray,
    borderColor: "transparent",
  },
  assignIconDriverActive: {
    backgroundColor: Theme.surfaceGray,
    borderColor: "transparent",
  },
  assignIconVehicleActive: {
    backgroundColor: Theme.surfaceGray,
    borderColor: "transparent",
  },
  assignIconVehicleInactive: {
    backgroundColor: Theme.surfaceGray,
    borderColor: "transparent",
  },
  assignRowText: { flex: 1, minWidth: 0 },
  assignRowLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  assignRowValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  assignRowValueEmpty: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    minWidth: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnPrimary: {
    backgroundColor: "#000",
  },
  actionBtnSecondary: {
    backgroundColor: Theme.surfaceGray,
  },
  actionBtnSecondaryAlt: {
    backgroundColor: Theme.surfaceGray,
  },
  actionBtnText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  actionBtnTextPrimary: { color: "#fff" },
  actionBtnTextSecondary: { color: Theme.textPrimaryDark },
  actionBtnTextSecondaryAlt: { color: Theme.textPrimaryDark },

  otpInline: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    gap: 6,
  },
  otpInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  otpInlineLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  otpInlineCode: {
    fontSize: 16,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 1.2,
  },
  otpInlineMuted: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  otpInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  otpInlineBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  otpInlineError: { fontSize: 9, fontWeight: "700", color: Theme.teslaRed },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
    flexWrap: "wrap",
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    flex: 1,
    minWidth: 120,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgePrivate: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.surfaceGray,
  },
  badgeShared: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.surfaceGray,
  },
  badgeUnassigned: {
    backgroundColor: Theme.surfaceLight,
    borderColor: Theme.borderInput,
  },
  sourceBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sourceBadgeTextShared: {
    color: Theme.textSection,
  },
  sourceBadgeTextPrivate: {
    color: Theme.textSection,
  },
  sourceBadgeTextUnassigned: {
    color: Theme.textPrimaryDark,
  },
  otpBlock: {
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  otpLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  otpCode: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 4,
    color: Theme.primary,
    marginBottom: 2,
  },
  otpExpiry: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginBottom: 4,
  },
  otpHint: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 2,
  },
  otpErrorText: {
    fontSize: 11,
    color: Theme.negative,
    marginTop: 6,
  },
  otpRegenerateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  otpRegenerateText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
  twoCol: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 0,
  },
  previousDriverRow: {
    marginTop: 12,
  },
  assignmentLogRow: {
    marginTop: 8,
  },
  inlineSectionWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  assignmentLogText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 4,
    lineHeight: 16,
  },
  webAssignRow: {
    flex: 1,
    borderBottomWidth: 0,
    paddingVertical: 12,
  },
  assignAggregateMeta: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  assignAggregateMetaLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  assignAggregateMetaValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    flex: 1,
    textAlign: "right",
    minWidth: 0,
  },
  col: { flex: 1, minWidth: 0 },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  value: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceForm ?? Theme.surfaceLight,
    marginTop: 2,
    marginBottom: 0,
  },
  assignBtnCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  assignBtnTextCompact: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
  },
  twoBtnRow: {
    flexDirection: "row",
    gap: 8,
    flexShrink: 0,
  },
  modalWrap: { flex: 1, backgroundColor: Theme.screenBackground },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  modalCancel: { fontSize: 16, color: Theme.textSecondary },
  modalTitle: { fontSize: 16, fontWeight: "700", color: Theme.textPrimaryDark },
  modalSave: { fontSize: 16, fontWeight: "700", color: Theme.buttonPrimary },
  modalSaveDisabled: { color: Theme.textMuted },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 16, paddingBottom: 32 },
  modalSection: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 4,
    marginBottom: 8,
  },
  optionRowActive: {
    backgroundColor: Theme.surfaceLight,
    borderColor: Theme.buttonPrimary,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    flex: 1,
  },
  emptyHint: {
    fontSize: 13,
    color: Theme.textMuted,
    fontStyle: "italic",
    marginBottom: 8,
  },
  // Premium assignment picker modal
  assignModalWrap: {
    flex: Platform.OS === "web" ? 0 : 1,
    flexDirection: "column",
    backgroundColor: "#f8fafc",
    borderRadius: Platform.OS === "web" ? 14 : 0,
    overflow: "hidden",
    ...Platform.select({
      web: {
        width: "100%",
        maxWidth: 760,
        maxHeight: "86%",
        minHeight: 420,
        borderWidth: 1,
        borderColor: Theme.borderLight,
      } as any,
    }),
  },
  assignModalWrapWide: Platform.select({
    web: {
      maxWidth: 1120,
      width: "100%",
      height: "85vh",
      maxHeight: "85vh",
      minHeight: 520,
    } as any,
    default: {},
  }),
  webModalBackdrop: {
    flex: 1,
    backgroundColor:
      Platform.OS === "web" ? "rgba(2,6,23,0.58)" : Theme.surfaceGray,
    padding: Platform.OS === "web" ? 18 : 0,
    ...Platform.select({
      web: {
        justifyContent: "center",
        alignItems: "center",
      } as any,
    }),
  },
  assignModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  assignModalHeaderText: { flex: 1, minWidth: 0 },
  assignModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  assignModalSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },
  assignModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  assignModalScroll: { flex: 1 },
  assignModalScrollContent: {
    padding: 14,
    paddingBottom: 18,
  },
  assignStepLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 8,
    marginLeft: 4,
  },
  assignStepLabelSecond: { marginTop: 18 },
  assignEmptyHint: {
    fontSize: 13,
    color: Theme.textMuted,
    fontStyle: "italic",
    marginBottom: 8,
  },
  assignAdhocVehicleWrap: {
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  assignAdhocVehicleLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  assignAdhocVehicleHint: {
    fontSize: 10,
    color: Theme.textMuted,
    marginBottom: 10,
  },
  assignAdhocVehicleInput: {
    fontSize: 13,
    color: "#0f172a",
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 10,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  assignAdhocVehicleBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
  },
  assignAdhocVehicleBtnDisabled: {
    opacity: 0.5,
  },
  assignAdhocVehicleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  assignCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "transparent",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  assignCardSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.fiscalTabActiveBg,
  },
  assignDriverAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  assignDriverAvatarSelected: {
    backgroundColor: Theme.primary,
  },
  assignDriverInitial: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  assignDriverInitialSelected: {
    color: Theme.textOnPrimary,
  },
  assignCardBody: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },
  assignCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  assignCardSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  assignStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  assignStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  assignStatusDotAvailable: { backgroundColor: Theme.darkGreen },
  assignStatusDotLeave: { backgroundColor: Theme.driverGold },
  assignStatusText: { fontSize: 10, fontWeight: "600" },
  assignStatusTextAvailable: { color: Theme.darkGreen },
  assignStatusTextLeave: { color: "#B45309" },
  assignCheckWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
  },
  assignCheckWrapSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
  },
  assignVehicleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  assignVehicleIconWrapSelected: {
    backgroundColor: Theme.primary,
  },
  assignVehicleInput: {
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.screenBackground,
    marginBottom: 10,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  assignModalFooter: {
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: "#020617",
    borderTopWidth: 1,
    borderTopColor: "#111827",
  },
  assignSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginVertical: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Theme.screenBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  assignSearchIcon: {
    position: "absolute",
    left: 28,
  },
  assignSearchInput: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingLeft: 28,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  assignRegistryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  assignRegistryCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  assignDriverAvatarRegistry: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  assignDriverAvatarImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  assignDriverInitialRegistry: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  assignSyncBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  assignSyncBadgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
  },
  assignRegistryCardBusy: {
    opacity: 0.75,
    backgroundColor: Theme.screenBackground,
  },
  assignDriverAvatarBusy: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderLight,
  },
  assignDriverInitialBusy: {
    color: Theme.textMuted,
  },
  assignCardTitleMuted: {
    color: Theme.textMuted,
  },
  assignRegistrySubtextBusy: {
    color: (Theme as any).warning ?? "#B45309",
  },
  assignBusyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: (Theme as any).warning ?? "#D97706",
  },
  assignBusyBadgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: (Theme as any).warning ?? "#B45309",
    textTransform: "uppercase",
  },
  assignVehicleIconWrapRegistry: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  assignUpdateLinkBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
  },
  assignUpdateLinkBadgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  assignRegistrySubtext: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 2,
  },
  assignRatingRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  assignRatingText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  assignCancelBtn: {
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  assignCancelBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: "rgba(255,255,255,0.8)",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  assignConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    paddingVertical: 10,
    borderRadius: 9,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  assignConfirmBtnDisabled: { opacity: 0.7 },
  assignConfirmBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  phoneModalInput: {
    borderWidth: 1,
    borderColor: "#dbe4ef",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
    backgroundColor: "#ffffff",
    marginBottom: 10,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  phoneModalFoundWrap: { marginBottom: 10 },
  phoneModalFound: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  phoneModalHint: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
  },
  phoneProtocolCard: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  phoneProtocolIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  phoneProtocolBody: {
    flex: 1,
  },
  phoneProtocolTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 2,
  },
  phoneProtocolText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
    color: "#64748b",
  },
  phoneOtpRevealCard: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(79, 70, 229, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.25)",
  },
  phoneOtpRevealIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.35)",
  },
  phoneOtpRevealTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  phoneOtpRevealCode: {
    fontSize: 36,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 8,
    marginBottom: 8,
  },
  phoneOtpRevealExpiry: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 14,
    textAlign: "center",
  },
  phoneOtpRevealHint: {
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
  },
  phoneModalError: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.negative,
    marginBottom: 10,
  },
  phoneModalInTrip: {
    fontSize: 12,
    fontWeight: "700",
    color: (Theme as any).warning ?? "#B45309",
    marginBottom: 4,
  },
  phoneModalBusyWrap: {
    marginBottom: 8,
  },
  phoneModalBusyHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 16,
  },
  phoneInput: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceForm ?? Theme.surfaceLight,
    marginBottom: 8,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  phoneFound: {
    fontSize: 13,
    color: Theme.textMuted,
    marginBottom: 8,
  },
  phoneError: {
    fontSize: 13,
    color: Theme.negative,
    marginBottom: 8,
  },

  // Driver & vehicle summary card
  manifestCard: {
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#0f172a",
    backgroundColor: "#ffffff",
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  manifestCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  manifestEyebrow: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
  },
  manifestStack: { gap: 14 },
  manifestNodeShell: {
    borderRadius: 28,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  manifestNodeInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 12,
  },
  manifestNodeCopy: { flex: 1, minWidth: 0 },
  manifestNodeKicker: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 6,
  },
  manifestNodeTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  manifestNodeTitleMuted: {
    color: "#94a3b8",
  },
  manifestNodeMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  manifestNodeMetaText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 1,
  },
  manifestActionCue: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 8,
  },
  manifestVehicleCue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.buttonPrimary,
    marginTop: 8,
  },
  manifestNodeFab: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  manifestNodeFabPulse: {
    backgroundColor: Theme.buttonPrimary,
  },

  // Driver / vehicle picker modal
  allocModalHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    gap: 12,
  },
  allocModalHeroText: { flex: 1, minWidth: 0 },
  allocModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  allocModalSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 6,
    lineHeight: 16,
  },
  allocModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  allocToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 4,
    backgroundColor: "#ffffff",
  },
  allocSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  allocSearchIconInline: {
    marginTop: 1,
  },
  allocSearchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    paddingVertical: 4,
    minWidth: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  allocSearchFlex: {
    flex: 1,
    marginHorizontal: 0,
    marginVertical: 0,
  },
  allocRegisterRow: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 32,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    backgroundColor: "rgba(248,250,252,0.9)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  allocRegisterLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  allocRegisterPlus: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  allocRegisterTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#334155",
  },
  allocRegisterHint: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94a3b8",
    marginTop: 4,
    lineHeight: 15,
  },
  allocRegisterProto: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },
  allocRegisterProtoText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  allocBodyRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  allocBodyRowDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
    paddingHorizontal: 0,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  allocMainScrollDesktop: {
    ...Platform.select({
      web: {
        flex: 1,
        minWidth: 0,
        minHeight: 0,
      } as any,
      default: {},
    }),
  },
  allocSidebarDesktopScroll: {
    width: 300,
    flexShrink: 0,
    flexGrow: 0,
    backgroundColor: "#ffffff",
    borderLeftWidth: 1,
    borderLeftColor: "#e2e8f0",
    ...Platform.select({
      web: {
        minHeight: 0,
        maxHeight: "100%",
      } as any,
      default: {},
    }),
  },
  allocSidebarDesktopScrollContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  allocScrollPad: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  allocGrid: {
    gap: 10,
  },
  assignFlowCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    marginBottom: 4,
  },
  assignFlowCardSelected: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  assignFlowCardBusy: {
    opacity: 0.55,
  },
  assignFlowCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  assignFlowTile: {
    width: 72,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  assignFlowTileSelected: {
    backgroundColor: Theme.buttonPrimary,
  },
  assignFlowTileText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
  },
  assignFlowTileTextSel: {
    color: "#ffffff",
  },
  assignFlowCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  assignFlowCardTitleSel: {
    color: "#ffffff",
  },
  assignFlowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    flexWrap: "wrap",
  },
  assignFlowStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  assignFlowStatusPillSel: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  assignFlowStatusPillBusy: {
    backgroundColor: "#fef3c7",
    borderColor: "#fcd34d",
  },
  assignFlowStatusText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  assignFlowStatusTextSel: {
    color: "#93c5fd",
  },
  assignFlowStatusTextBusy: {
    color: "#92400e",
    fontWeight: "700",
  },
  assignFlowStarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  assignFlowStarText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0f172a",
  },
  assignFlowStarTextSel: {
    color: "#fde68a",
  },
  assignFlowCheck: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    shadowColor: Theme.buttonPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },
  allocSidebarMobile: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  allocSidebarInner: {
    padding: 20,
    gap: 12,
  },
  allocSidebarEmpty: {
    padding: 24,
    alignItems: "center",
  },
  allocSidebarEmptyText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "center",
  },
  allocSidebarHero: {
    alignItems: "center",
    marginBottom: 8,
  },
  allocSidebarAvatar: {
    width: 120,
    height: 100,
    borderRadius: 32,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  allocSidebarAvatarText: {
    fontSize: 36,
    fontWeight: "900",
    color: "#ffffff",
  },
  allocSidebarName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  allocSidebarChip: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },
  allocSidebarChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  allocMetricBlock: { marginTop: 4 },
  allocMetricHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  allocMetricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  allocMetricPct: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.buttonPrimary,
  },
  allocMetricTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#f1f5f9",
    overflow: "hidden",
  },
  allocMetricFillDark: {
    height: 6,
    backgroundColor: "#0f172a",
    borderRadius: 3,
  },
  allocMetricFillBlue: {
    height: 6,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: 3,
  },
  allocMiniGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  allocMiniCell: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  allocMiniVal: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  allocMiniLbl: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
  },
  allocSidebarWarn: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.negative,
    textAlign: "center",
    marginTop: 4,
  },
  allocExecuteBtn: {
    marginTop: 12,
    paddingVertical: 18,
    borderRadius: 22,
    backgroundColor: "#0f172a",
    alignItems: "center",
  },
  allocExecuteBtnDis: {
    opacity: 0.45,
  },
  allocExecuteBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  allocVerifyHint: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 8,
  },
  allocMobileFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  allocMobileFooterClose: {
    alignItems: "center",
    paddingVertical: 12,
  },
  allocMobileFooterCloseText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textMuted,
  },
  allocDesktopFooterBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    alignItems: "flex-end",
  },
  allocDesktopFooterClose: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  allocDesktopFooterCloseText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
});
