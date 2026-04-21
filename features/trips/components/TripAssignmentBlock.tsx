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
  getDriverAvailabilityByPhone,
  getActiveDriverIds,
  getTripDisplayNumber,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
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
}: TripAssignmentBlockProps) {
  /** No assign/reassign when trip is completed or when view-only (e.g. load creator monitoring). */
  const effectiveCanAssign = canAssign && !isTripCompleted(trip) && !viewOnly;

  const [showPicker, setShowPicker] = useState(false);
  const [assignMode, setAssignMode] = useState<"driver" | "vehicle" | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneName, setPhoneName] = useState<string | null>(null);
  const [phoneDriverBusy, setPhoneDriverBusy] = useState(false);
  const [phoneBusyTripLabel, setPhoneBusyTripLabel] = useState<string | null>(null);
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
  const [activeDriverIds, setActiveDriverIds] = useState<Set<string>>(new Set());
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
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 768;

  useEffect(() => {
    setPickDriverId(trip.driver_id);
    setPickVehicleId(trip.vehicle_id);
  }, [trip.driver_id, trip.vehicle_id]);

  useEffect(() => {
    if (!showAssignByPhone || !trip?.id) {
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
  }, [showAssignByPhone, trip?.id]);

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
    const orgForDriver = (driverAssignOrgId ?? organizationId).trim() || organizationId;
    const { error: availabilityError, result: availability } = await getDriverAvailabilityByPhone(
      orgForDriver,
      trimmed,
      { excludeTripId: trip.id },
    );
    if (availabilityError) {
      setPhoneError(availabilityError.message);
      return;
    }
    if (availability.isBusy) {
      const conflictTripLabel = availability.ongoingTripLabel ?? "another ongoing trip";
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

    if (driverAssignOrgId) {
      const { error: rpcErr } = await assignAggregateTripDriverByPhone(
        trip.id,
        orgForDriver,
        trimmed,
        matchedVehicle ? null : (phoneVehicleInput.trim() || null),
      );
      if (rpcErr) {
        setPhoneSaving(false);
        setPhoneError(rpcErr.message);
        return;
      }
      if (matchedVehicle) {
        const { error: vehicleErr } = await updateTripAssignment(
          trip.id,
          { vehicle_id: matchedVehicle.id },
          auditOpts,
        );
        if (vehicleErr) setPhoneError(vehicleErr.message);
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
        setPhoneError(error.message);
        return;
      }
      if (matchedVehicle) {
        const { error: vehicleErr } = await updateTripAssignment(
          trip.id,
          { vehicle_id: matchedVehicle.id },
          auditOpts,
        );
        if (vehicleErr) setPhoneError(vehicleErr.message);
      } else if (phoneVehicleInput.trim()) {
        const { error: vehicleErr } = await updateTripAssignment(
          trip.id,
          { vehicle_id: null, vehicle_display_number: phoneVehicleInput.trim() },
          auditOpts,
        );
        if (vehicleErr) setPhoneError(vehicleErr.message);
      }
    }
    // Ensure OTP exists so driver app shows "Trip waiting for OTP" (get_pending_otp_claim_count).
    // Aggregate: always generate after assign; non-aggregate: refresh when replacing a driver or
    // when modal was opened as reassign (e.g. after reject trip.driver_id is already null in props).
    if (trip.supplier_id) {
      const { error: otpErr, code: newCode, expires_at: newExpires } =
        await generateTripOtp(trip.id);
      if (!otpErr && newCode != null) {
        setOtpCode(newCode);
        setOtpExpiresAt(newExpires ?? null);
      }
    } else if (phoneModalIsReassign || trip.driver_id != null) {
      const { error: otpErr, code: newCode, expires_at: newExpires } =
        await regenerateTripOtp(trip.id);
      if (!otpErr && newCode != null) {
        setOtpCode(newCode);
        setOtpExpiresAt(newExpires ?? null);
      }
    }
    setPhoneSaving(false);
    setShowPhoneModal(false);
    setPhoneInput("");
    setPhoneName(null);
    setPhoneError(null);
    setPhoneVehicleInput("");
    setPhoneModalIsReassign(false);
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
    if (!trip?.id || otpRegenerating) return;
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
  }, [trip?.id, otpRegenerating]);

  const handleGenerateOtp = useCallback(async () => {
    if (!trip?.id || otpRegenerating) return;
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
  }, [trip?.id, otpRegenerating]);

  const openPhoneModal = useCallback(
    (isReassign?: boolean, initialVehicle?: string) => {
      setPhoneModalIsReassign(isReassign ?? false);
      setPhoneInput("");
      setPhoneError(null);
      setPhoneName(null);
      const vehiclePrefill =
        initialVehicle != null && initialVehicle.trim() !== ""
          ? formatIndianVehicleNumber(initialVehicle.trim().split("·")[0]?.trim() ?? initialVehicle.trim())
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
  const hasDriver = !!(trip.driver_id || (trip.driver_display_name ?? "").trim());
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
    ]).then(([r, busyIds]) => {
      const list = r.error ? [] : (r.drivers ?? []);
      setDrivers(list.filter((d) => !d.left_at));
      setActiveDriverIds(busyIds);
    });
  }, [organizationId, trip.driver_id]);

  const openVehiclePicker = useCallback(() => {
    setAssignMode("vehicle");
    setAssignSearch("");
    setPickVehicleId(trip.vehicle_id);
    if ((propsVehicleLabel ?? "").trim() !== "") {
      const raw = (propsVehicleLabel ?? "").split("·")[0]?.trim() ?? "";
      setPickerVehicleInput(raw ? formatIndianVehicleNumber(raw) : "");
    } else if (trip.vehicle_display_number?.trim()) {
      setPickerVehicleInput(formatIndianVehicleNumber(trip.vehicle_display_number.trim()));
    } else {
      setPickerVehicleInput("");
    }
    getVehiclesByOrganization(organizationId).then((r) =>
      setVehicles(r.error ? [] : (r.vehicles ?? [])),
    );
  }, [organizationId, trip.vehicle_id, trip.vehicle_display_number, propsVehicleLabel]);

  const saveDriverOnly = useCallback(
    async (driverId: string | null) => {
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
        setAssignMode(null);
        onUpdated();
      } finally {
        setSaving(false);
      }
    },
    [trip.id, trip.driver_id, trip.vehicle_id, currentUserId, onUpdated],
  );

  const saveVehicleOnly = useCallback(
    async (vehicleId: string | null, vehicleDisplayNumber: string | null = null) => {
      setSaving(true);
      try {
        const payload: Parameters<typeof updateTripAssignment>[1] = { vehicle_id: vehicleId };
        if (vehicleDisplayNumber != null) payload.vehicle_display_number = vehicleDisplayNumber;
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
        setAssignMode(null);
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
  }, [drivers, assignSearch, showAssignByPhone, activeDriverIds, trip.driver_id]);

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

  return (
    <View style={[styles.wrapper, styles.wrapperStretch]}>
      <View style={styles.card}>
        <View style={styles.currentHeader}>
          <Text style={styles.currentHeaderTitle}>Current Assignment</Text>
          {showSourceBadge && (
            <View style={[styles.sourceBadge, sourceBadgeStyle]}>
              <Text
                style={[
                  styles.sourceBadgeText,
                  assignmentSource === "shared" && styles.sourceBadgeTextShared,
                  assignmentSource === "private" && styles.sourceBadgeTextPrivate,
                ]}
              >
                {sourceLabel}
              </Text>
            </View>
          )}
        </View>

        {/* Driver and Vehicle rows — side-by-side on web view */}
        <View style={isDesktop ? styles.twoCol : null}>
          {/* Driver row — reference: Driver Node, + Assign / Change */}
          <View style={[styles.assignRow, isDesktop && styles.webAssignRow]}>
            <View style={styles.assignRowLeft}>
              <View style={[styles.assignIcon, hasDriver ? styles.assignIconDriverActive : styles.assignIconInactive]}>
                <FontAwesome name="user" size={16} color={Theme.textMuted} />
              </View>
              <View style={styles.assignRowText}>
                <Text style={styles.assignRowLabel}>Driver</Text>
                <Text style={[styles.assignRowValue, !hasDriver && styles.assignRowValueEmpty]} numberOfLines={1}>
                  {hasDriver ? pilotText : "No assigned node"}
                </Text>
              </View>
            </View>
            {effectiveCanAssign ? (
              showAssignByPhone ? (
                <TouchableOpacity
                  style={[styles.actionBtn, hasDriver ? styles.actionBtnSecondary : styles.actionBtnPrimary]}
                  onPress={() =>
                    openPhoneModal(
                      hasDriver ||
                        !!(previousDriverName ?? "").trim(),
                      propsVehicleLabel ?? trip.vehicle_display_number ?? "",
                    )
                  }
                  activeOpacity={0.8}
                >
                  <Text style={[styles.actionBtnText, hasDriver ? styles.actionBtnTextSecondary : styles.actionBtnTextPrimary]}>
                    {hasDriver ? "Change" : "+ Assign"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.actionBtn, hasDriver ? styles.actionBtnSecondary : styles.actionBtnPrimary]}
                  onPress={openDriverPicker}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.actionBtnText, hasDriver ? styles.actionBtnTextSecondary : styles.actionBtnTextPrimary]}>
                    {hasDriver ? "Change" : "+ Assign"}
                  </Text>
                </TouchableOpacity>
              )
            ) : null}
          </View>

          {/* Vehicle row — reference: Vehicle Registry, Change */}
          <View style={[styles.assignRow, isDesktop && styles.webAssignRow]}>
            <View style={styles.assignRowLeft}>
              <View style={[styles.assignIcon, hasVehicle ? styles.assignIconVehicleActive : styles.assignIconVehicleInactive]}>
                <FontAwesome name="truck" size={14} color={Theme.textMuted} />
              </View>
              <View style={styles.assignRowText}>
                <Text style={styles.assignRowLabel}>Vehicle</Text>
                <Text style={[styles.assignRowValue, !hasVehicle && styles.assignRowValueEmpty]} numberOfLines={1}>
                  {hasVehicle
                    ? vehicleText
                        .split(" • ")
                        .map((part, i) => (i === 0 ? part : part.toUpperCase()))
                        .join(" • ")
                    : "No assigned node"}
                </Text>
              </View>
            </View>
            {effectiveCanAssign ? (
              <TouchableOpacity
                  style={[styles.actionBtn, hasVehicle ? styles.actionBtnSecondary : styles.actionBtnPrimary]}
                  onPress={openVehiclePicker}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.actionBtnText, hasVehicle ? styles.actionBtnTextSecondary : styles.actionBtnTextPrimary]}>
                    {hasVehicle ? "Change" : "+ Assign"}
                  </Text>
                </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {showAssignByPhone && (partnerName ?? "").trim() ? (
          <View style={styles.assignAggregateMeta}>
            <Text style={styles.assignAggregateMetaLabel}>Partner</Text>
            <Text style={styles.assignAggregateMetaValue} numberOfLines={1}>
              {partnerName?.trim() || "—"}
            </Text>
          </View>
        ) : null}

        {/* Aggregate OTP (only for aggregate flows that use assign-by-phone) */}
        {showAssignByPhone && (
          <View style={styles.otpInline}>
            {otpLoading && !otpCode ? (
              <Text style={styles.otpInlineMuted}>Loading OTP…</Text>
            ) : otpCode ? (
              <>
                <View style={styles.otpInlineRow}>
                  <Text style={styles.otpInlineLabel}>Share OTP</Text>
                  <Text style={styles.otpInlineCode}>{otpCode}</Text>
                </View>
                {otpExpiresAt ? (
                  <Text style={styles.otpInlineMuted}>
                    Valid until{" "}
                    {new Date(otpExpiresAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                ) : null}
                {effectiveCanAssign ? (
                  <TouchableOpacity
                    style={styles.otpInlineBtn}
                    onPress={handleRegenerateOtp}
                    disabled={otpRegenerating || otpLoading}
                    activeOpacity={0.8}
                  >
                    <FontAwesome name="refresh" size={12} color={Theme.primary} />
                    <Text style={styles.otpInlineBtnText}>
                      {otpRegenerating || otpLoading ? "Regenerating…" : "Regenerate OTP"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {otpError ? <Text style={styles.otpInlineError}>{otpError}</Text> : null}
              </>
            ) : (
              <View style={styles.otpInlineRow}>
                <Text style={styles.otpInlineMuted}>No active OTP (expired or claimed)</Text>
                {effectiveCanAssign ? (
                  <TouchableOpacity
                    style={styles.otpInlineBtn}
                    onPress={handleGenerateOtp}
                    disabled={otpRegenerating || otpLoading}
                    activeOpacity={0.8}
                  >
                    <FontAwesome name="key" size={12} color={Theme.primary} />
                    <Text style={styles.otpInlineBtnText}>
                      {otpRegenerating || otpLoading ? "Generating…" : "Generate OTP"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
        )}
        {previousDriverName ? (
          <View style={styles.previousDriverRow}>
            <Text style={styles.label}>PREVIOUS DRIVER</Text>
            <Text style={styles.value} numberOfLines={1}>
              {previousDriverName}
            </Text>
          </View>
        ) : null}
        {latestReassignmentSummary ? (
          <View style={styles.assignmentLogRow}>
            <Text style={styles.label}>LAST CHANGE</Text>
            <Text style={styles.assignmentLogText}>
              {latestReassignmentSummary}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Assignment selection overlay — driver or vehicle only, tap to assign */}
      <Modal
        visible={assignMode !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAssignMode(null)}
      >
        <View style={[styles.assignModalWrap, { paddingTop: insets.top }]}>
          <View style={styles.assignModalHeader}>
            <View style={styles.assignModalHeaderText}>
              <Text style={styles.assignModalTitle}>
                {assignMode === "driver" ? "Assign Driver" : "Select Vehicle"}
              </Text>
              <Text style={styles.assignModalSubtitle}>
                {assignMode === "driver" ? "Choose a driver" : "Choose a vehicle"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setAssignMode(null)}
              style={styles.assignModalCloseBtn}
              hitSlop={8}
              accessibilityLabel="Close"
            >
              <FontAwesome name="times" size={18} color={Theme.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.assignSearchWrap}>
            <FontAwesome name="search" size={14} color={Theme.textMuted} style={styles.assignSearchIcon} />
            <TextInput
              style={styles.assignSearchInput}
              value={assignSearch}
              onChangeText={setAssignSearch}
              placeholder={assignMode === "driver" ? "Search driver..." : "Search vehicle..."}
              placeholderTextColor={Theme.textMuted}
            />
          </View>

          <ScrollView
            style={styles.assignModalScroll}
            contentContainerStyle={[styles.assignModalScrollContent, { paddingBottom: 24 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {assignMode === "driver" ? (
              filteredDrivers.length === 0 ? (
                <Text style={styles.assignEmptyHint}>
                  No drivers. Add from Resources.
                </Text>
              ) : (
                filteredDrivers.map((d) => {
                  // A driver is "on trip" if they're in an active trip that isn't this one.
                  const isOnTrip = activeDriverIds.has(d.id) && d.id !== trip.driver_id;
                  const isAvailable = !d.left_at && !isOnTrip;
                  const initial = (d.name ?? "D").trim().charAt(0).toUpperCase();
                  const ratingMeta = getDriverRatingMeta(d);
                  const hasAvatar = !!(d.avatar_url && d.avatar_url.trim());
                  const statusText = isOnTrip
                    ? "On trip"
                    : isAvailable
                      ? "Available"
                      : "On leave";
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[
                        styles.assignRegistryCard,
                        isOnTrip && styles.assignRegistryCardBusy,
                      ]}
                      onPress={() => !isOnTrip && saveDriverOnly(d.id)}
                      disabled={saving || isOnTrip}
                      activeOpacity={isOnTrip ? 1 : 0.98}
                    >
                      <View style={styles.assignRegistryCardLeft}>
                        {hasAvatar ? (
                          <Image
                            source={{ uri: d.avatar_url!.trim() }}
                            style={[
                              styles.assignDriverAvatarImage,
                              isOnTrip && styles.assignDriverAvatarBusy,
                            ]}
                          />
                        ) : (
                          <View style={[
                            styles.assignDriverAvatarRegistry,
                            isOnTrip && styles.assignDriverAvatarBusy,
                          ]}>
                            <Text style={[
                              styles.assignDriverInitialRegistry,
                              isOnTrip && styles.assignDriverInitialBusy,
                            ]}>{initial}</Text>
                          </View>
                        )}
                        <View style={styles.assignCardBody}>
                          <Text style={[
                            styles.assignCardTitle,
                            isOnTrip && styles.assignCardTitleMuted,
                          ]} numberOfLines={1}>
                            {d.name ?? "—"}
                          </Text>
                          <Text style={[
                            styles.assignRegistrySubtext,
                            isOnTrip && styles.assignRegistrySubtextBusy,
                          ]}>
                            {statusText}
                          </Text>
                          {ratingMeta ? (
                            <View style={styles.assignRatingRow}>
                              <FontAwesome name="star" size={10} color={Theme.driverGold} />
                              <Text style={styles.assignRatingText}>
                                Rating {ratingMeta.ratingLabel}
                                {ratingMeta.countLabel ? ` ${ratingMeta.countLabel}` : ""}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      {isOnTrip ? (
                        <View style={styles.assignBusyBadge}>
                          <Text style={styles.assignBusyBadgeText}>On Trip</Text>
                        </View>
                      ) : (
                        <View style={styles.assignSyncBadge}>
                          <Text style={styles.assignSyncBadgeText}>Assign</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )
            ) : (
              <>
                {showAssignByPhone ? (
                  <View style={styles.assignAdhocVehicleWrap}>
                    <Text style={styles.assignAdhocVehicleLabel}>
                      Vehicle registration (ad-hoc)
                    </Text>
                    <Text style={styles.assignAdhocVehicleHint}>
                      Partner vehicle not in your fleet — enter number to save on trip.
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
                        !pickerVehicleInput.trim() && styles.assignAdhocVehicleBtnDisabled,
                      ]}
                      onPress={() =>
                        saveVehicleOnly(null, pickerVehicleInput.trim() || null)
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
                      No vehicles. Add from Resources.
                    </Text>
                  )
                ) : (
                  filteredVehicles.map((v) => {
                    const plate = formatIndianVehicleNumber(v.vehicle_number);
                    const typeLabel = v.vehicle_type ?? "Vehicle";
                    return (
                      <TouchableOpacity
                        key={v.id}
                        style={styles.assignRegistryCard}
                        onPress={() => saveVehicleOnly(v.id)}
                        disabled={saving}
                        activeOpacity={0.98}
                      >
                      <View style={styles.assignRegistryCardLeft}>
                        <View style={styles.assignVehicleIconWrapRegistry}>
                          <FontAwesome name="truck" size={16} color={Theme.textPrimaryDark} />
                        </View>
                        <View style={styles.assignCardBody}>
                          <Text style={styles.assignCardTitle} numberOfLines={1}>
                            {plate}
                          </Text>
                          <Text style={styles.assignRegistrySubtext}>{typeLabel}</Text>
                        </View>
                      </View>
                      <View style={styles.assignUpdateLinkBadge}>
                        <Text style={styles.assignUpdateLinkBadgeText}>Select</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )
            }
            </>
            )}
          </ScrollView>

          <View
            style={[
              styles.assignModalFooter,
              { paddingBottom: Math.max(24, insets.bottom) },
            ]}
          >
            <TouchableOpacity
              style={styles.assignCancelBtn}
              onPress={() => setAssignMode(null)}
              activeOpacity={0.9}
            >
              <Text style={styles.assignCancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPhoneModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPhoneModal(false)}
      >
        <View style={styles.assignModalWrap}>
          <View style={styles.assignModalHeader}>
            <View style={styles.assignModalHeaderText}>
              <Text style={styles.assignModalTitle}>
                {phoneModalIsReassign
                  ? "Reassign driver by phone"
                  : "Assign driver by phone"}
              </Text>
              <Text style={styles.assignModalSubtitle}>
                {phoneModalIsReassign
                  ? "New driver for " + getTripDisplayNumber(trip)
                  : "Enter driver phone for " + getTripDisplayNumber(trip)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowPhoneModal(false)}
              style={styles.assignModalCloseBtn}
              hitSlop={8}
              accessibilityLabel="Close"
            >
              <FontAwesome name="times" size={18} color={Theme.textMuted} />
            </TouchableOpacity>
          </View>

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
                  Driver currently on {phoneBusyTripLabel ?? "another ongoing trip"}
                </Text>
                <Text style={styles.phoneModalBusyHint}>
                  Reach out to {phoneName ?? "this driver"} on {phoneInput.trim() || "their phone"}
                  {" "}to confirm availability. If they are offline/unreachable, plan with another
                  {" "}driver and assign this trip there.
                </Text>
              </View>
            ) : null}
            {phoneError ? (
              <Text style={styles.phoneModalError}>{phoneError}</Text>
            ) : null}

            <Text style={[styles.assignStepLabel, styles.assignStepLabelSecond]}>
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
                (phoneSaving || phoneDriverBusy) && styles.assignConfirmBtnDisabled,
              ]}
              onPress={assignByPhone}
              disabled={phoneSaving || phoneDriverBusy}
              activeOpacity={0.9}
            >
              <FontAwesome
                name="user-plus"
                size={20}
                color={Theme.textOnPrimary}
              />
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
    borderRadius: 20,
    padding: 16,
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
    fontSize: 14,
    fontWeight: "800",
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
  statusPillTextPartial: { color: (Theme as any).warning ?? Theme.textPrimaryDark },
  statusPillTextAssigned: { color: Theme.darkGreen },

  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  assignRowValue: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  assignRowValueEmpty: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
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
    fontSize: 10,
    fontWeight: "800",
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
    textTransform: 'uppercase',
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
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
    flex: 1,
    backgroundColor: Theme.surfaceGray,
  },
  assignModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  assignModalHeaderText: { flex: 1, minWidth: 0 },
  assignModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  assignModalSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
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
    padding: 20,
    paddingBottom: 24,
  },
  assignStepLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 12,
    marginLeft: 4,
  },
  assignStepLabelSecond: { marginTop: 28 },
  assignEmptyHint: {
    fontSize: 13,
    color: Theme.textMuted,
    fontStyle: "italic",
    marginBottom: 8,
  },
  assignAdhocVehicleWrap: {
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  assignAdhocVehicleLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  assignAdhocVehicleHint: {
    fontSize: 11,
    color: Theme.textMuted,
    marginBottom: 10,
  },
  assignAdhocVehicleInput: {
    fontSize: 14,
    color: Theme.textPrimaryDark,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.screenBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 10,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  assignAdhocVehicleBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Theme.primary,
    alignItems: "center",
    },
  assignAdhocVehicleBtnDisabled: {
    opacity: 0.5,
  },
  assignAdhocVehicleBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  assignCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: 2,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  assignDriverAvatarSelected: {
    backgroundColor: Theme.primary,
  },
  assignDriverInitial: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textMuted,
  },
  assignDriverInitialSelected: {
    color: Theme.textOnPrimary,
  },
  assignCardBody: {
    flex: 1,
    marginLeft: 14,
    minWidth: 0,
  },
  assignCardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  assignCardSubtitle: {
    fontSize: 11,
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
  assignStatusText: { fontSize: 11, fontWeight: "700" },
  assignStatusTextAvailable: { color: Theme.darkGreen },
  assignStatusTextLeave: { color: "#B45309" },
  assignCheckWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
  },
  assignCheckWrapSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
  },
  assignVehicleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  assignVehicleIconWrapSelected: {
    backgroundColor: Theme.primary,
  },
  assignVehicleInput: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
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
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  assignSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 24,
    marginVertical: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  assignSearchIcon: {
    position: "absolute",
    left: 28,
  },
  assignSearchInput: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
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
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  assignRegistryCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  assignDriverAvatarRegistry: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  assignDriverAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  assignDriverInitialRegistry: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  assignSyncBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  assignSyncBadgeText: {
    fontSize: 8,
    fontWeight: "800",
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: (Theme as any).warning ?? "#D97706",
  },
  assignBusyBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: (Theme as any).warning ?? "#B45309",
    textTransform: "uppercase",
  },
  assignVehicleIconWrapRegistry: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  assignUpdateLinkBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
  },
  assignUpdateLinkBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  assignRegistrySubtext: {
    fontSize: 7,
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
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  assignCancelBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  assignConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  assignConfirmBtnDisabled: { opacity: 0.7 },
  assignConfirmBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  phoneModalInput: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
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
  phoneModalFoundWrap: { marginBottom: 10 },
  phoneModalFound: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  phoneModalHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
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
});