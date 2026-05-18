/**
 * useStaffHandshake — manages all state and handlers for the
 * Staff Handshake / Deploy modal (Asset roster + Aggregate ad-hoc flows).
 * FSM-style: open(load) → fill form → deployRoster/deployAdHoc → close.
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
import React from "react";

interface UseStaffHandshakeParams {
  orgId: string | null;
  myQuotes: DirectQuoteRow[];
  onSuccess: (msg: string) => void;
}

export interface StaffHandshakeResult {
  state: {
    isOpen: boolean;
    currentLoad: IndentRow | null;
    isDeploying: boolean;
    showOtp: boolean;
    // form fields (read-only for modal display):
    useAdHocDriver: boolean;
    assignDriverId: string | null;
    assignVehicleId: string | null | undefined;
    assignVehicleRegistration: string;
    aggregateDriverTrackingName: string;
    aggregateDriverPhone: string;
    aggregatePhoneName: string | null;
    aggregatePhoneNotFound: boolean;
    aggregatePhoneInTrip: boolean;
    subcontractSupplierId: string | null;
    subcontractRate: string;
    aggregateAdvancePaid: string;
    deployOtpCode: string | null;
    deployOtpExpiresAt: string | null;
    deployTripIdForOtp: string | null;
    staffHandshakeAssignLater: boolean;
    // computed readiness flags:
    rosterReady: boolean;
    adHocReady: boolean;
    aggregateTrackingFlowReady: boolean;
    aggregatePartnerHandshakeComplete: boolean;
    aggregateHasDriverName: boolean;
    aggregateHasVehicleText: boolean;
  };
  set: {
    useAdHocDriver: (v: boolean) => void;
    assignDriverId: (id: string | null) => void;
    assignVehicleId: (id: string | null | undefined) => void;
    assignVehicleRegistration: (v: string) => void;
    aggregateDriverTrackingName: (v: string) => void;
    aggregateDriverPhone: (v: string) => void;
    aggregatePhoneName: (v: string | null) => void;
    aggregatePhoneNotFound: (v: boolean) => void;
    aggregatePhoneInTrip: (v: boolean) => void;
    subcontractSupplierId: (id: string | null) => void;
    subcontractRate: (v: string) => void;
    aggregateAdvancePaid: (v: string) => void;
    deployOtpCode: (v: string | null) => void;
    deployOtpExpiresAt: (v: string | null) => void;
    deployTripIdForOtp: (v: string | null) => void;
    staffHandshakeAssignLater: (v: boolean) => void;
    aggregateDriverNameManualRef: React.MutableRefObject<boolean>;
  };
  open: (load: IndentRow) => void;
  close: () => void;
  deployRoster: () => Promise<void>;
  deployAdHoc: () => Promise<void>;
  backFromOtp: () => void;
}

export function useStaffHandshake({
  orgId,
  myQuotes,
  onSuccess,
}: UseStaffHandshakeParams): StaffHandshakeResult {
  const router = useRouter();
  const invalidateTrips = useInvalidateTrips();
  const invalidateIndents = useInvalidateIndents();
  const queryClient = useQueryClient();

  // FSM-style open/close state
  const [currentLoad, setCurrentLoad] = useState<IndentRow | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  // Form fields
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

  // Phone lookup side-effect — stays inside the hook
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
          const { matches: matchesWithCode } =
            await searchExistingDriversByPhone(`+91${last10}`);
          foundName = matchesWithCode[0]?.full_name ?? null;
        }

        setAggregatePhoneName(foundName);
        if (foundName && !aggregateDriverNameManualRef.current) {
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
    }, 400) as unknown as number;
    return () => {
      if (aggregatePhoneLookupTimeoutRef.current)
        clearTimeout(aggregatePhoneLookupTimeoutRef.current);
    };
  }, [aggregateDriverPhone, orgId]);

  // Computed readiness flags
  const rosterReady =
    !useAdHocDriver && !!assignDriverId && typeof assignVehicleId === "string";
  const adHocReady = useAdHocDriver;

  const aggregateHasDriverName = aggregateDriverTrackingName.trim().length > 0;
  const aggregateHasDriverPhone = aggregateDriverPhone.trim().length > 0;
  const aggregateHasVehicleText = assignVehicleRegistration.trim().length > 0;
  const aggregateTrackingFlowReady =
    aggregateHasDriverName && aggregateHasDriverPhone && aggregateHasVehicleText;

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

  /** Reset all form state to defaults */
  const resetForm = useCallback(() => {
    setUseAdHocDriver(false);
    setAssignDriverId(null);
    setAssignVehicleId(undefined);
    setAssignVehicleRegistration("");
    setAggregateDriverTrackingName("");
    setAggregateDriverPhone("");
    setAggregatePhoneName(null);
    setAggregatePhoneNotFound(false);
    setAggregatePhoneInTrip(false);
    setSubcontractSupplierId(null);
    setSubcontractRate("");
    setAggregateAdvancePaid("");
    setDeployOtpCode(null);
    setDeployOtpExpiresAt(null);
    setDeployTripIdForOtp(null);
    setStaffHandshakeAssignLater(false);
    aggregateDriverNameManualRef.current = false;
  }, []);

  const open = useCallback(
    (load: IndentRow) => {
      resetForm();
      setCurrentLoad(load);
    },
    [resetForm],
  );

  const close = useCallback(() => {
    setCurrentLoad(null);
    resetForm();
  }, [resetForm]);

  const backFromOtp = useCallback(() => {
    if (deployOtpCode) {
      setDeployOtpCode(null);
      setDeployOtpExpiresAt(null);
      setDeployTripIdForOtp(null);
      return;
    }
    close();
  }, [deployOtpCode, close]);

  const deployRoster = useCallback(async () => {
    const load = currentLoad;
    if (!load) return;
    if (isDeploying) return;
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
      setCurrentLoad(null);
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
      setIsDeploying(true);
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
      setCurrentLoad(null);
      setAssignDriverId(null);
      setAssignVehicleId(undefined);
      setAssignVehicleRegistration("");
      setUseAdHocDriver(false);
      onSuccess("Voyage authorized — trip created.");
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
      setIsDeploying(false);
    }
  }, [
    currentLoad,
    isDeploying,
    orgId,
    myQuotes,
    assignDriverId,
    assignVehicleId,
    invalidateTrips,
    invalidateIndents,
    onSuccess,
    router,
  ]);

  const deployAdHoc = useCallback(async () => {
    const load = currentLoad;
    if (!load) return;
    if (isDeploying) return;
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
      setCurrentLoad(null);
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
      setIsDeploying(true);
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

      if (deferHandshakeAssignment || !phoneTrimmed || phoneErr) {
        await saveSubcontract();
        await updateIndent(load.id, { status: "completed" });
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        setCurrentLoad(null);
        setIsDeploying(false);
        onSuccess(
          deferHandshakeAssignment
            ? "Trip created — add driver and vehicle on trip detail when ready."
            : "Trip created (OTP not generated)",
        );
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
        setCurrentLoad(null);
        setIsDeploying(false);
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
        setCurrentLoad(null);
        setIsDeploying(false);
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
        setCurrentLoad(null);
        setIsDeploying(false);
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
      onSuccess("OTP generated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      Alert.alert("Could not deploy", msg);
    } finally {
      staffHandshakeDeployLockRef.current = false;
      setIsDeploying(false);
    }
  }, [
    currentLoad,
    isDeploying,
    orgId,
    myQuotes,
    subcontractSupplierId,
    subcontractRate,
    staffHandshakeAssignLater,
    aggregateDriverTrackingName,
    aggregateDriverPhone,
    assignVehicleRegistration,
    assignVehicleId,
    queryClient,
    invalidateTrips,
    invalidateIndents,
    onSuccess,
    router,
  ]);

  return {
    state: {
      isOpen: currentLoad !== null,
      currentLoad,
      isDeploying,
      showOtp: deployOtpCode !== null,
      useAdHocDriver,
      assignDriverId,
      assignVehicleId,
      assignVehicleRegistration,
      aggregateDriverTrackingName,
      aggregateDriverPhone,
      aggregatePhoneName,
      aggregatePhoneNotFound,
      aggregatePhoneInTrip,
      subcontractSupplierId,
      subcontractRate,
      aggregateAdvancePaid,
      deployOtpCode,
      deployOtpExpiresAt,
      deployTripIdForOtp,
      staffHandshakeAssignLater,
      rosterReady,
      adHocReady,
      aggregateTrackingFlowReady,
      aggregatePartnerHandshakeComplete,
      aggregateHasDriverName,
      aggregateHasVehicleText,
    },
    set: {
      useAdHocDriver: setUseAdHocDriver,
      assignDriverId: setAssignDriverId,
      assignVehicleId: setAssignVehicleId,
      assignVehicleRegistration: setAssignVehicleRegistration,
      aggregateDriverTrackingName: setAggregateDriverTrackingName,
      aggregateDriverPhone: setAggregateDriverPhone,
      aggregatePhoneName: setAggregatePhoneName,
      aggregatePhoneNotFound: setAggregatePhoneNotFound,
      aggregatePhoneInTrip: setAggregatePhoneInTrip,
      subcontractSupplierId: setSubcontractSupplierId,
      subcontractRate: setSubcontractRate,
      aggregateAdvancePaid: setAggregateAdvancePaid,
      deployOtpCode: setDeployOtpCode,
      deployOtpExpiresAt: setDeployOtpExpiresAt,
      deployTripIdForOtp: setDeployTripIdForOtp,
      staffHandshakeAssignLater: setStaffHandshakeAssignLater,
      aggregateDriverNameManualRef,
    },
    open,
    close,
    deployRoster,
    deployAdHoc,
    backFromOtp,
  };
}
