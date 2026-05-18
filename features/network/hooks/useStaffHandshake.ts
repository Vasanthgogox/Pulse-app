/**
 * useStaffHandshake — manages all state and handlers for the
 * Staff Handshake / Deploy modal (Asset roster + Aggregate ad-hoc flows).
 */

import { upsertTripSubcontract } from "@/features/finance/services/tripSubcontracts.service";
import { acceptAwardedQuote } from "@/features/indents/services/accept-awarded-quote.service";
import { updateIndent, type DirectQuoteRow, type IndentRow } from "@/features/indents";
import { setInitialTripForDetail } from "@/features/trips";
import {
  assignAggregateTripDriverByPhone,
  getDriverAvailabilityByPhoneGlobal,
  humanizeTripIdInRpcError,
  updateTripSupplier,
} from "@/features/trips/services/trips.service";
import { generateTripOtp } from "@/features/trips/services/tripOtp.service";
import { searchExistingDriversByPhone } from "@/features/drivers/services/drivers.service";
import { updateDirectQuoteAssignment } from "@/features/indents";
import { useInvalidateIndents, useInvalidateTrips } from "@/lib/queries";
import { validatePhone } from "@/lib/phoneValidation";
import { formatMobileNumber } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, TextInput } from "react-native";
import { Platform } from "react-native";

type LoadAction =
  | { type: "AWARD"; load: IndentRow }
  | { type: "BID"; load: IndentRow }
  | { type: "ASSIGN"; load: IndentRow }
  | null;

interface UseStaffHandshakeParams {
  orgId: string | null;
  myQuotes: DirectQuoteRow[];
  loadAction: LoadAction;
  setLoadAction: (action: LoadAction) => void;
  setAssigningTripId: (id: string | null) => void;
  assigningTripId: string | null;
  triggerSuccess: (msg: string) => void;
}

export interface StaffHandshakeResult {
  // State
  useAdHocDriver: boolean;
  setUseAdHocDriver: (v: boolean) => void;
  assignDriverId: string | null;
  setAssignDriverId: (id: string | null) => void;
  assignVehicleId: string | null | undefined;
  setAssignVehicleId: (id: string | null | undefined) => void;
  assignVehicleRegistration: string;
  setAssignVehicleRegistration: (v: string) => void;
  aggregateDriverTrackingName: string;
  setAggregateDriverTrackingName: (v: string) => void;
  aggregateDriverPhone: string;
  setAggregateDriverPhone: (v: string) => void;
  aggregatePhoneName: string | null;
  setAggregatePhoneName: (v: string | null) => void;
  aggregatePhoneNotFound: boolean;
  setAggregatePhoneNotFound: (v: boolean) => void;
  aggregatePhoneInTrip: boolean;
  setAggregatePhoneInTrip: (v: boolean) => void;
  subcontractSupplierId: string | null;
  setSubcontractSupplierId: (id: string | null) => void;
  subcontractRate: string;
  setSubcontractRate: (v: string) => void;
  aggregateAdvancePaid: string;
  setAggregateAdvancePaid: (v: string) => void;
  deployOtpCode: string | null;
  setDeployOtpCode: (v: string | null) => void;
  deployOtpExpiresAt: string | null;
  setDeployOtpExpiresAt: (v: string | null) => void;
  deployTripIdForOtp: string | null;
  setDeployTripIdForOtp: (v: string | null) => void;
  staffHandshakeAssignLater: boolean;
  setStaffHandshakeAssignLater: (v: boolean) => void;
  // Refs
  staffHandshakeDeployLockRef: React.MutableRefObject<boolean>;
  aggregateDriverNameManualRef: React.MutableRefObject<boolean>;
  aggregatePhoneLookupTimeoutRef: React.MutableRefObject<number | null>;
  // Computed values
  rosterReady: boolean;
  adHocReady: boolean;
  aggregateTrackingFlowReady: boolean;
  aggregatePartnerHandshakeComplete: boolean;
  aggregateHasDriverName: boolean;
  aggregateHasDriverPhone: boolean;
  aggregateHasVehicleText: boolean;
  // Handlers
  handleDeployRoster: (load: IndentRow) => Promise<void>;
  handleDeployAdHoc: (load: IndentRow) => Promise<void>;
  handleStaffHandshakeBack: () => void;
}

export function useStaffHandshake({
  orgId,
  myQuotes,
  loadAction,
  setLoadAction,
  setAssigningTripId,
  assigningTripId,
  triggerSuccess,
}: UseStaffHandshakeParams): StaffHandshakeResult {
  const router = useRouter();
  const invalidateTrips = useInvalidateTrips();
  const invalidateIndents = useInvalidateIndents();
  const queryClient = useQueryClient();

  const [useAdHocDriver, setUseAdHocDriver] = useState(false);
  const [assignDriverId, setAssignDriverId] = useState<string | null>(null);
  const [assignVehicleId, setAssignVehicleId] = useState<
    string | null | undefined
  >(undefined);
  const [assignVehicleRegistration, setAssignVehicleRegistration] =
    useState("");
  const [aggregateDriverTrackingName, setAggregateDriverTrackingName] =
    useState("");
  const aggregateDriverNameManualRef = useRef(false);
  const [aggregateDriverPhone, setAggregateDriverPhone] = useState("");
  const [aggregatePhoneName, setAggregatePhoneName] = useState<string | null>(
    null,
  );
  const [aggregatePhoneNotFound, setAggregatePhoneNotFound] = useState(false);
  const [aggregatePhoneInTrip, setAggregatePhoneInTrip] = useState(false);
  const aggregatePhoneLookupTimeoutRef = useRef<number | null>(null);
  /** Prevents double-submit on Staff Handshake (parallel creates → unique trip_number 409). */
  const staffHandshakeDeployLockRef = useRef(false);
  const [subcontractSupplierId, setSubcontractSupplierId] = useState<
    string | null
  >(null);
  const [subcontractRate, setSubcontractRate] = useState<string>("");
  const [aggregateAdvancePaid, setAggregateAdvancePaid] = useState<string>("");
  const [deployOtpCode, setDeployOtpCode] = useState<string | null>(null);
  const [deployOtpExpiresAt, setDeployOtpExpiresAt] = useState<string | null>(
    null,
  );
  const [deployTripIdForOtp, setDeployTripIdForOtp] = useState<string | null>(
    null,
  );
  const [staffHandshakeAssignLater, setStaffHandshakeAssignLater] =
    useState(false);

  useEffect(() => {
    const trimmed = aggregateDriverPhone.trim();
    if (aggregatePhoneLookupTimeoutRef.current)
      clearTimeout(aggregatePhoneLookupTimeoutRef.current);
    aggregatePhoneLookupTimeoutRef.current = setTimeout(() => {
      aggregatePhoneLookupTimeoutRef.current = null;
      const digits = trimmed.replace(/\D/g, "");
      const last10 = digits.slice(-10);
      if (last10.length < 10) {
        setAggregatePhoneName(null);
        setAggregatePhoneNotFound(false);
        setAggregatePhoneInTrip(false);
        return;
      }

      searchExistingDriversByPhone(last10).then(async ({ matches }) => {
        const direct = matches[0]?.full_name ?? null;
        let foundName = direct;

        if (!foundName) {
          // Some deployments store phone as +91XXXXXXXXXX; try that too.
          const { matches: matchesWithCode } =
            await searchExistingDriversByPhone(`+91${last10}`);
          foundName = matchesWithCode[0]?.full_name ?? null;
        }

        setAggregatePhoneName(foundName);
        if (foundName && !aggregateDriverNameManualRef.current) {
          // Autofill from phone lookup unless user manually edited the field.
          setAggregateDriverTrackingName(foundName);
        }
        setAggregatePhoneNotFound(!foundName);
        if (!orgId) {
          setAggregatePhoneInTrip(false);
          return;
        }
        const { result } = await getDriverAvailabilityByPhoneGlobal(last10, {
          anyOpenTripBlocks: true,
          requireAuthoritativeRpc: true,
        });
        setAggregatePhoneInTrip(result.isBusy);
      });
    }, 400);
    return () => {
      if (aggregatePhoneLookupTimeoutRef.current)
        clearTimeout(aggregatePhoneLookupTimeoutRef.current);
    };
  }, [aggregateDriverPhone, orgId]);

  const rosterReady =
    !useAdHocDriver && !!assignDriverId && typeof assignVehicleId === "string";
  const adHocReady = useAdHocDriver;

  const aggregateHasDriverName = aggregateDriverTrackingName.trim().length > 0;
  const aggregateHasDriverPhone = aggregateDriverPhone.trim().length > 0;
  const aggregateHasVehicleText = assignVehicleRegistration.trim().length > 0;
  const aggregateTrackingFlowReady =
    aggregateHasDriverName && aggregateHasDriverPhone && aggregateHasVehicleText;

  /** Aggregate Staff Handshake: partner + rate are always required before deploy. */
  const aggregatePartnerHandshakeComplete = useMemo(() => {
    const sid = (subcontractSupplierId ?? "").trim();
    const rateRaw = subcontractRate.trim();
    const rateNum = Number(rateRaw);
    return (
      sid.length > 0 &&
      rateRaw.length > 0 &&
      Number.isFinite(rateNum) &&
      rateNum >= 0
    );
  }, [subcontractSupplierId, subcontractRate]);

  const handleDeployRoster = async (load: IndentRow) => {
    if (assigningTripId === load.id) return;
    if (!orgId) {
      Alert.alert(
        "Cannot deploy",
        "Your organization context is missing. Please try again.",
      );
      return;
    }
    const status = (load.status || "").toLowerCase();
    if (status === "cancelled" || status === "closed") {
      Alert.alert(
        "Load unavailable",
        "This load has been cancelled or closed.",
      );
      setLoadAction(null);
      return;
    }
    const acceptedQuote = myQuotes.find(
      (q) =>
        (q.status || "").toLowerCase() === "accepted" &&
        q.indent_id === load.id,
    );
    if (!acceptedQuote) {
      Alert.alert("Cannot deploy", "No accepted quote found for this load.");
      return;
    }
    if (!assignDriverId || typeof assignVehicleId !== "string") {
      Alert.alert(
        "Select driver and vehicle",
        "Please select a driver and a vehicle from your org to assign trip.",
      );
      return;
    }
    if (staffHandshakeDeployLockRef.current) {
      return;
    }
    staffHandshakeDeployLockRef.current = true;
    try {
      setAssigningTripId(load.id);
      const { error: assignErr } = await updateDirectQuoteAssignment(
        acceptedQuote.id,
        assignDriverId,
        assignVehicleId,
      );
      if (assignErr) {
        Alert.alert("Could not assign", assignErr.message);
        return;
      }
      const { error: tripErr, trip } = await acceptAwardedQuote(
        acceptedQuote.id,
      );
      if (tripErr || !trip) {
        Alert.alert(
          "Could not create trip",
          tripErr?.message ?? "Unknown error.",
        );
        return;
      }
      await updateIndent(load.id, { status: "completed" });
      setLoadAction(null);
      setAssignDriverId(null);
      setAssignVehicleId(undefined);
      setAssignVehicleRegistration("");
      setUseAdHocDriver(false);
      triggerSuccess("Voyage authorized — trip created.");
      invalidateTrips(orgId);
      invalidateIndents(orgId);
      const isShipper = load.organization_id === orgId;
      if (isShipper) {
        router.push("/(tabs)/trips" as import("expo-router").Href);
      } else if (trip?.id) {
        setInitialTripForDetail(trip);
        router.push(
          `/trip/${trip.id}?entryContext=supplier` as import("expo-router").Href,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      Alert.alert("Could not deploy", msg);
    } finally {
      staffHandshakeDeployLockRef.current = false;
      setAssigningTripId(null);
    }
  };

  const handleDeployAdHoc = async (load: IndentRow) => {
    if (assigningTripId === load.id) return;
    if (!orgId) {
      Alert.alert(
        "Cannot deploy",
        "Your organization context is missing. Please try again.",
      );
      return;
    }
    const status = (load.status || "").toLowerCase();
    if (status === "cancelled" || status === "closed") {
      Alert.alert(
        "Load unavailable",
        "This load has been cancelled or closed.",
      );
      setLoadAction(null);
      return;
    }
    const acceptedQuote = myQuotes.find(
      (q) =>
        (q.status || "").toLowerCase() === "accepted" &&
        q.indent_id === load.id,
    );
    if (!acceptedQuote) {
      Alert.alert("Cannot deploy", "No accepted quote found for this load.");
      return;
    }
    const handshakeSubSupplierId = (subcontractSupplierId ?? "").trim();
    const handshakeSubRateRaw = subcontractRate.trim();
    const handshakeSubRateNum = Number(handshakeSubRateRaw);
    if (!handshakeSubSupplierId) {
      Alert.alert(
        "Partner required",
        "Select the associated partner (sub-supplier) for this trip.",
      );
      return;
    }
    if (
      handshakeSubRateRaw === "" ||
      !Number.isFinite(handshakeSubRateNum) ||
      handshakeSubRateNum < 0
    ) {
      Alert.alert(
        "Partner rate required",
        "Enter the rate you will pay this partner (₹).",
      );
      return;
    }
    /** Trip detail will hold driver / vehicle / OTP; never persist ad-hoc fields when deferring. */
    const deferHandshakeAssignment = staffHandshakeAssignLater;
    const nameTrimmed = deferHandshakeAssignment
      ? ""
      : aggregateDriverTrackingName.trim();
    const phoneTrimmed = deferHandshakeAssignment
      ? ""
      : aggregateDriverPhone.trim();
    const regTrimmed = deferHandshakeAssignment
      ? ""
      : assignVehicleRegistration.trim();
    if (!deferHandshakeAssignment && nameTrimmed.length === 0) {
      Alert.alert(
        "Driver name required",
        "Enter driver name (tracking) to continue.",
      );
      return;
    }
    if (!deferHandshakeAssignment && phoneTrimmed.length === 0) {
      Alert.alert(
        "Driver phone required",
        "Enter driver phone (tracking) to continue.",
      );
      return;
    }
    if (!deferHandshakeAssignment && regTrimmed.length === 0) {
      Alert.alert(
        "Vehicle number required",
        "Enter vehicle number to continue.",
      );
      return;
    }
    const phoneErr = phoneTrimmed ? validatePhone(phoneTrimmed) : null;
    if (!deferHandshakeAssignment && phoneErr) {
      Alert.alert("Invalid driver phone", phoneErr);
      return;
    }
    if (staffHandshakeDeployLockRef.current) {
      return;
    }
    staffHandshakeDeployLockRef.current = true;
    try {
      setAssigningTripId(load.id);
      const vehicleIdForQuote = deferHandshakeAssignment
        ? null
        : typeof assignVehicleId === "string"
          ? assignVehicleId
          : null;
      const { error: assignErr } = await updateDirectQuoteAssignment(
        acceptedQuote.id,
        null,
        vehicleIdForQuote,
      );
      if (assignErr) {
        Alert.alert("Could not assign", assignErr.message);
        return;
      }
      const regNum = deferHandshakeAssignment ? "" : regTrimmed;
      const { error: tripErr, trip } = await acceptAwardedQuote(
        acceptedQuote.id,
        {
          vehicle_display_number: regNum || undefined,
        },
      );
      if (tripErr || !trip) {
        Alert.alert(
          "Could not create trip",
          tripErr?.message ?? "Unknown error.",
        );
        return;
      }
      const subSupplierId = handshakeSubSupplierId;
      const subRateNum = handshakeSubRateNum;
      const shouldSaveSubcontract =
        subSupplierId !== "" &&
        handshakeSubRateRaw !== "" &&
        Number.isFinite(subRateNum) &&
        subRateNum >= 0;

      const saveSubcontract = async () => {
        if (!shouldSaveSubcontract) return;
        const isTripOwner = trip.organization_id === orgId;

        if (isTripOwner) {
          const { error: supplierUpdateErr } = await updateTripSupplier(
            trip.id,
            {
              supplier_id: subSupplierId,
              supplier_rate: subRateNum,
            },
          );
          if (supplierUpdateErr) {
            Alert.alert(
              "Trip created",
              `Partner was saved, but trip supplier link could not be updated. ${supplierUpdateErr.message}`,
            );
          }
        }

        const { error: subErr } = await upsertTripSubcontract({
          viewerOrgId: orgId,
          tripId: trip.id,
          supplierId: subSupplierId,
          rate: subRateNum,
        });
        if (subErr)
          Alert.alert(
            "Trip created",
            `Partner could not be saved. ${subErr.message}`,
          );
        queryClient.invalidateQueries({
          queryKey: ["q", "trips", "subcontracts", orgId],
        });
      };

      // Driver + OTP are optional: require phone only for OTP generation (not for trip creation).
      if (deferHandshakeAssignment || !phoneTrimmed || phoneErr) {
        await saveSubcontract();
        await updateIndent(load.id, { status: "completed" });
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        setLoadAction(null);
        setAssigningTripId(null);
        triggerSuccess(
          deferHandshakeAssignment
            ? "Trip created — add driver and vehicle on trip detail when ready."
            : "Trip created (OTP not generated)",
        );
        // Do not treat this as an error. OTP can be generated later from Trip Detail
        // after providing a driver phone number.
        return;
      }
      const { error: availabilityError, result: availability } =
        await getDriverAvailabilityByPhoneGlobal(phoneTrimmed, {
          excludeTripId: trip.id,
          anyOpenTripBlocks: true,
          requireAuthoritativeRpc: true,
        });
      if (availabilityError) {
        throw availabilityError;
      }
      if (availability.isBusy) {
        await saveSubcontract();
        await updateIndent(load.id, { status: "completed" });
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        setLoadAction(null);
        setAssigningTripId(null);
        Alert.alert(
          "Trip created",
          `Driver is already assigned to ${availability.ongoingTripLabel ?? "another ongoing trip"}.\n\nComplete or unassign that trip before assigning this one.`,
        );
        setInitialTripForDetail(trip);
        router.push(
          `/trip/${trip.id}?entryContext=supplier` as import("expo-router").Href,
        );
        return;
      }

      const { error: assignAggErr } = await assignAggregateTripDriverByPhone(
        trip.id,
        orgId,
        phoneTrimmed,
        regNum || null,
      );
      if (assignAggErr) {
        await saveSubcontract();
        await updateIndent(load.id, { status: "completed" });
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        setLoadAction(null);
        setAssigningTripId(null);
        Alert.alert(
          "Trip created",
          `Driver could not be assigned. ${humanizeTripIdInRpcError(assignAggErr.message, trip)}\n\nAssign driver from trip detail to generate OTP.`,
        );
        setInitialTripForDetail(trip);
        router.push(
          `/trip/${trip.id}?entryContext=supplier` as import("expo-router").Href,
        );
        return;
      }

      const {
        error: otpErr,
        code,
        expires_at,
      } = await generateTripOtp(trip.id);
      if (otpErr || !code) {
        await saveSubcontract();
        await updateIndent(load.id, { status: "completed" });
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        setLoadAction(null);
        setAssigningTripId(null);
        Alert.alert(
          "Trip created",
          "OTP could not be generated. Get OTP from the trip detail screen.",
        );
        setInitialTripForDetail(trip);
        router.push(
          `/trip/${trip.id}?entryContext=supplier` as import("expo-router").Href,
        );
        return;
      }

      setDeployOtpCode(code);
      setDeployOtpExpiresAt(expires_at ?? null);
      setDeployTripIdForOtp(trip.id);

      await saveSubcontract();

      await updateIndent(load.id, { status: "completed" });
      invalidateTrips(orgId);
      invalidateIndents(orgId);
      triggerSuccess("OTP generated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      Alert.alert("Could not deploy", msg);
    } finally {
      staffHandshakeDeployLockRef.current = false;
      setAssigningTripId(null);
    }
  };

  /** Staff Handshake: dismiss OTP preview, or close modal. */
  const handleStaffHandshakeBack = useCallback(() => {
    if (deployOtpCode) {
      setDeployOtpCode(null);
      setDeployOtpExpiresAt(null);
      setDeployTripIdForOtp(null);
      return;
    }
    setLoadAction(null);
    setDeployOtpCode(null);
    setDeployOtpExpiresAt(null);
    setDeployTripIdForOtp(null);
    setStaffHandshakeAssignLater(false);
  }, [deployOtpCode, setLoadAction]);

  return {
    useAdHocDriver,
    setUseAdHocDriver,
    assignDriverId,
    setAssignDriverId,
    assignVehicleId,
    setAssignVehicleId,
    assignVehicleRegistration,
    setAssignVehicleRegistration,
    aggregateDriverTrackingName,
    setAggregateDriverTrackingName,
    aggregateDriverPhone,
    setAggregateDriverPhone,
    aggregatePhoneName,
    setAggregatePhoneName,
    aggregatePhoneNotFound,
    setAggregatePhoneNotFound,
    aggregatePhoneInTrip,
    setAggregatePhoneInTrip,
    subcontractSupplierId,
    setSubcontractSupplierId,
    subcontractRate,
    setSubcontractRate,
    aggregateAdvancePaid,
    setAggregateAdvancePaid,
    deployOtpCode,
    setDeployOtpCode,
    deployOtpExpiresAt,
    setDeployOtpExpiresAt,
    deployTripIdForOtp,
    setDeployTripIdForOtp,
    staffHandshakeAssignLater,
    setStaffHandshakeAssignLater,
    staffHandshakeDeployLockRef,
    aggregateDriverNameManualRef,
    aggregatePhoneLookupTimeoutRef,
    rosterReady,
    adHocReady,
    aggregateTrackingFlowReady,
    aggregatePartnerHandshakeComplete,
    aggregateHasDriverName,
    aggregateHasDriverPhone,
    aggregateHasVehicleText,
    handleDeployRoster,
    handleDeployAdHoc,
    handleStaffHandshakeBack,
  };
}
