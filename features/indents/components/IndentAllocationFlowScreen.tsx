/**
 * Full-screen indent deploy — asset and aggregate allocation wizards.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";

import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { IndentAggregateAllocationStep } from "@/features/indents/components/IndentAggregateAllocationStep";
import { IndentAllocationTripDetailsStep } from "@/features/indents/components/IndentAllocationTripDetailsStep";
import { IndentDeployOtpPanel } from "@/features/indents/components/IndentDeployOtpPanel";
import {
  getIndentAllocationWizardSteps,
  indentAllocationStepSubtitle,
  isIndentAllocationStepComplete,
  type IndentAllocationStepId,
} from "@/features/indents/components/indentAllocationWizardSteps";
import { AssetRosterPickers } from "@/features/network/components/StaffHandshakeModal";
import { useStaffHandshake } from "@/features/network/hooks/useStaffHandshake";
import { AddTripWizardProgress } from "@/features/trips/components/add-trip/AddTripWizardProgress";
import { AssignmentFlowFooter } from "@/features/trips/components/assignment/assignmentFlowFooter";
import { AssignmentFlowShell } from "@/features/trips/components/assignment/AssignmentFlowShell";
import { SupplyAllocationModeBar } from "@/features/trips/components/SupplyAllocationModeBar";
import { formatIsoDateForDisplay, isValidIsoDateString } from "@/lib/dateIso.util";
import { ROUTES } from "@/lib/routes";
import {
  useDriversQuery,
  useInvalidateIndents,
  useMyDirectQuotesQuery,
  useSuppliersQuery,
  useVisibleIndentQuery,
  useVehiclesQuery,
} from "@/lib/queries";

export type IndentAllocationFlowFocus = "driver" | "vehicle";

export interface IndentAllocationFlowScreenProps {
  indentId: string;
  /** From award modal “Assign vehicle” — open fleet vehicle step first. */
  initialFocus?: IndentAllocationFlowFocus;
  onBack: () => void;
}

export function IndentAllocationFlowScreen({
  indentId,
  initialFocus = "driver",
  onBack,
}: IndentAllocationFlowScreenProps) {
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const invalidateIndents = useInvalidateIndents();
  const [step, setStep] = useState<IndentAllocationStepId>(
    initialFocus === "vehicle" ? "vehicle" : "driver",
  );

  const {
    data: indent,
    isPending: indentPending,
    isError: indentError,
  } = useVisibleIndentQuery(orgId, indentId);

  const { data: myQuotes = [] } = useMyDirectQuotesQuery(orgId);
  const { data: drivers = [] } = useDriversQuery(orgId);
  const { data: vehicles = [] } = useVehiclesQuery(orgId);
  const { data: suppliers = [] } = useSuppliersQuery(orgId);

  const activeDrivers = useMemo(
    () => drivers.filter((d) => !d.left_at),
    [drivers],
  );

  const handshake = useStaffHandshake({
    orgId,
    myQuotes,
    onSuccess: () => {
      if (orgId) invalidateIndents(orgId);
    },
  });

  const { open, close, state, set, deployRoster, deployAdHoc, backFromOtp } = handshake;
  const {
    currentLoad,
    isDeploying,
    useAdHocDriver,
    assignDriverId,
    assignVehicleId,
    staffHandshakeAssignLater,
    deployOtpCode,
    deployPickupDate,
    deployWeightTons,
    deployVehicleType,
    deployLoadType,
    tripDetailsReady,
    subcontractSupplierId,
    subcontractRate,
    aggregateDriverTrackingName,
    aggregateDriverPhone,
    assignVehicleRegistration,
    aggregatePhoneInTrip,
    aggregatePhoneMatches,
    aggregatePhoneLookupLoading,
    aggregatePhoneSelectedUserId,
    deployTripIdForOtp,
    deployOtpExpiresAt,
  } = state;

  const flowSteps = useMemo(
    () =>
      getIndentAllocationWizardSteps({
        aggregate: useAdHocDriver,
        assignLater: staffHandshakeAssignLater,
      }),
    [useAdHocDriver, staffHandshakeAssignLater],
  );

  const stepIndex = flowSteps.findIndex((s) => s.id === step);
  const isLastStep = stepIndex >= 0 && stepIndex === flowSteps.length - 1;

  const openedIndentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!indent) return;
    if (openedIndentIdRef.current === indent.id) return;
    openedIndentIdRef.current = indent.id;
    open(indent);
    setStep(initialFocus === "vehicle" ? "vehicle" : "driver");
  }, [indent, open, initialFocus]);

  useEffect(() => {
    return () => {
      openedIndentIdRef.current = null;
      close();
    };
  }, [close]);

  useEffect(() => {
    if (!orgId || !indentId || indentPending) return;
    if (!indent || indentError) onBack();
  }, [orgId, indentId, indent, indentPending, indentError, onBack]);

  useEffect(() => {
    if (flowSteps.some((s) => s.id === step)) return;
    setStep(flowSteps[0]?.id ?? "driver");
  }, [flowSteps, step]);

  useEffect(() => {
    if (staffHandshakeAssignLater && !useAdHocDriver && step !== "commodity") {
      setStep("commodity");
    }
  }, [staffHandshakeAssignLater, useAdHocDriver, step]);

  const handleClose = useCallback(() => {
    close();
    onBack();
  }, [close, onBack]);

  const selectedDriver = activeDrivers.find((d) => String(d.id) === assignDriverId);
  const driverLabel =
    selectedDriver?.name ?? selectedDriver?.phone ?? "Not selected";
  const selectedVehicle =
    typeof assignVehicleId === "string"
      ? vehicles.find((v) => String(v.id) === assignVehicleId)
      : null;
  const vehicleLabel = selectedVehicle?.vehicle_number ?? "Not selected";

  const selectedPartner = suppliers.find((s) => s.id === subcontractSupplierId);
  const partnerLabel =
    selectedPartner?.company_name?.trim() ||
    selectedPartner?.name?.trim() ||
    "Not selected";

  const tripDateLabel = deployPickupDate
    ? formatIsoDateForDisplay(deployPickupDate)
    : "—";
  const tripWeightLabel = deployWeightTons.trim()
    ? `${deployWeightTons.trim()} t`
    : "—";

  const stepComplete = isIndentAllocationStepComplete(step, {
    assignDriverId,
    assignVehicleId,
    subcontractSupplierId,
    subcontractRate,
    aggregateDriverTrackingName,
    aggregateDriverPhone,
    assignVehicleRegistration,
    tripDetailsReady,
    aggregatePhoneInTrip,
    aggregatePhoneLookupLoading,
    aggregatePhoneMatches,
    aggregatePhoneSelectedUserId,
    staffHandshakeAssignLater,
  });

  const stepSubtitle = deployOtpCode
    ? "Share this code with the driver to claim the trip"
    : indentAllocationStepSubtitle(step, useAdHocDriver);

  const footerSummary = useMemo(() => {
    if (deployOtpCode) return "";
    if (step === "commodity" || staffHandshakeAssignLater) {
      return `${tripDateLabel} · ${tripWeightLabel}`;
    }
    if (useAdHocDriver) {
      if (step === "partner") return partnerLabel;
      if (step === "rates") return subcontractRate.trim() ? `₹${subcontractRate.trim()}` : "—";
      if (step === "driverPhone") return aggregateDriverPhone.trim() || "—";
      if (step === "driverName") return aggregateDriverTrackingName.trim() || "—";
      if (step === "vehicleReg") return assignVehicleRegistration.trim() || "—";
      return partnerLabel;
    }
    if (step === "vehicle") return `${driverLabel} · ${vehicleLabel}`;
    if (step === "driver") return driverLabel;
    return `${driverLabel} · ${vehicleLabel}`;
  }, [
    deployOtpCode,
    step,
    staffHandshakeAssignLater,
    tripDateLabel,
    tripWeightLabel,
    useAdHocDriver,
    partnerLabel,
    subcontractRate,
    aggregateDriverTrackingName,
    aggregateDriverPhone,
    assignVehicleRegistration,
    driverLabel,
    vehicleLabel,
  ]);

  const goToModeFirstStep = useCallback(
    (aggregate: boolean, assignLater: boolean) => {
      const steps = getIndentAllocationWizardSteps({ aggregate, assignLater });
      setStep(steps[0]?.id ?? (aggregate ? "partner" : "driver"));
    },
    [],
  );

  const handlePrimary = useCallback(() => {
    if (deployOtpCode) {
      handleClose();
      return;
    }
    if (!stepComplete) return;
    if (!isLastStep) {
      const next = flowSteps[stepIndex + 1];
      if (next) setStep(next.id);
      return;
    }
    if (useAdHocDriver) {
      void deployAdHoc();
    } else {
      void deployRoster();
    }
  }, [
    deployOtpCode,
    stepComplete,
    isLastStep,
    flowSteps,
    stepIndex,
    useAdHocDriver,
    deployAdHoc,
    deployRoster,
    handleClose,
  ]);

  const primaryDisabled = deployOtpCode
    ? false
    : !stepComplete || isDeploying;

  const primaryLabel = deployOtpCode
    ? "Done"
    : isLastStep
      ? useAdHocDriver && !staffHandshakeAssignLater
        ? "Deploy & get OTP"
        : "Authorize & deploy voyage"
      : "Continue";

  const showBack = !deployOtpCode && stepIndex > 0;

  const handleBack = useCallback(() => {
    if (deployOtpCode) {
      backFromOtp();
      return;
    }
    const prev = flowSteps[stepIndex - 1];
    if (prev) setStep(prev.id);
  }, [deployOtpCode, backFromOtp, flowSteps, stepIndex]);

  const pickupDateError =
    deployPickupDate && !isValidIsoDateString(deployPickupDate)
      ? "Use a valid date (YYYY-MM-DD)."
      : null;
  const weightError =
    deployWeightTons.trim() && !tripDetailsReady && step === "commodity"
      ? "Enter weight in tons (greater than 0)."
      : null;

  const showModeBar =
    !deployOtpCode &&
    (step === "driver" ||
      step === "partner" ||
      (staffHandshakeAssignLater && step === "commodity"));

  const onAddPartner = useCallback(() => {
    handleClose();
    setTimeout(
      () => {
        router.push("/(modals)/add-supplier" as import("expo-router").Href);
      },
      Platform.OS === "ios" ? 100 : 0,
    );
  }, [handleClose, router]);

  if (!currentLoad) {
    return <CenteredLoadingView message="Loading allocation…" />;
  }

  return (
    <AssignmentFlowShell
      variant="slate"
      fullScreen
      fillBody={
        step === "rates" || step === "driverPhone" || step === "vehicleReg"
      }
      title={deployOtpCode ? "Trip claim code" : "Driver & vehicle"}
      subtitle={stepSubtitle}
      onClose={() => (deployOtpCode ? backFromOtp() : handleClose())}
      onBack={showBack ? handleBack : undefined}
      showBack={showBack}
      progress={
        !deployOtpCode ? (
          <AddTripWizardProgress steps={flowSteps} currentStepId={step} />
        ) : null
      }
      footer={
        deployOtpCode ? undefined : (
          <AssignmentFlowFooter
            summary={footerSummary}
            primaryLabel={primaryLabel}
            onPrimaryPress={handlePrimary}
            primaryDisabled={primaryDisabled}
            loading={isDeploying}
          />
        )
      }
      submitting={isDeploying}
    >
      {deployOtpCode ? (
        <IndentDeployOtpPanel
          code={deployOtpCode}
          expiresAt={deployOtpExpiresAt}
          tripId={deployTripIdForOtp}
          onCodeChange={(code, expiresAt) => {
            set.deployOtpCode(code);
            set.deployOtpExpiresAt(expiresAt);
          }}
        />
      ) : (
        <>
          {showModeBar ? (
            <SupplyAllocationModeBar
              mode={useAdHocDriver ? "aggregate" : "asset"}
              assignLater={staffHandshakeAssignLater}
              onModeChange={(mode) => {
                const aggregate = mode === "aggregate";
                set.useAdHocDriver(aggregate);
                if (aggregate) {
                  set.assignDriverId(null);
                  set.assignVehicleId(undefined);
                } else {
                  set.aggregateDriverPhone("");
                  set.aggregateDriverTrackingName("");
                  set.subcontractSupplierId(null);
                  set.subcontractRate("");
                  set.assignVehicleRegistration("");
                  set.aggregateDriverNameManualRef.current = false;
                }
                goToModeFirstStep(aggregate, staffHandshakeAssignLater);
              }}
              onAssignLaterChange={(v) => {
                set.staffHandshakeAssignLater(v);
                if (v) {
                  set.assignDriverId(null);
                  set.assignVehicleId(undefined);
                  set.aggregateDriverPhone("");
                  set.aggregateDriverTrackingName("");
                  set.assignVehicleRegistration("");
                }
                goToModeFirstStep(useAdHocDriver, v);
              }}
            />
          ) : null}

          {staffHandshakeAssignLater && step === "commodity" ? (
            <Text style={styles.assignLaterHint}>
              {useAdHocDriver
                ? "Partner and rate are required now. Add driver and vehicle on the trip screen before the trip starts."
                : "Assign vehicle and driver on the trip screen before the trip starts."}
            </Text>
          ) : null}

          {useAdHocDriver &&
          step !== "commodity" &&
          (step === "partner" ||
            step === "rates" ||
            step === "driverName" ||
            step === "driverPhone" ||
            step === "vehicleReg") ? (
            <IndentAggregateAllocationStep
              step={step}
              suppliers={suppliers}
              state={state}
              set={set}
              onAddPartner={onAddPartner}
            />
          ) : null}

          {!useAdHocDriver && !staffHandshakeAssignLater && step === "commodity" ? (
            <IndentAllocationTripDetailsStep
              pickupDate={deployPickupDate}
              weightTons={deployWeightTons}
              vehicleType={deployVehicleType}
              loadType={deployLoadType}
              onPickupDateChange={set.deployPickupDate}
              onWeightTonsChange={set.deployWeightTons}
              onVehicleTypeChange={set.deployVehicleType}
              onLoadTypeChange={set.deployLoadType}
              pickupDateError={pickupDateError}
              weightError={weightError}
              vehicleTypeError={!deployVehicleType.trim()}
              loadTypeError={!deployLoadType.trim()}
              tonsError={weightError != null}
              indentVehicleType={currentLoad.vehicle_type}
              indentLoadType={currentLoad.load_type}
            />
          ) : null}

          {!useAdHocDriver && !staffHandshakeAssignLater && (step === "driver" || step === "vehicle") ? (
            <AssetRosterPickers
              isFlow
              assetFlowStep={step === "vehicle" ? "vehicle" : "driver"}
              width={0}
              orgId={orgId}
              activeDrivers={activeDrivers}
              vehicles={vehicles}
              assignDriverId={assignDriverId}
              assignVehicleId={assignVehicleId}
              set={set}
              onNavigateAddDriver={() => {
                router.push({
                  pathname: "/(modals)/add-driver",
                  params: { returnTo: ROUTES.indentAllocation(indentId) },
                });
              }}
              onNavigateAddVehicle={() => {
                router.push({
                  pathname: "/(modals)/add-vehicle",
                  params: { returnTo: ROUTES.indentAllocation(indentId) },
                });
              }}
            />
          ) : null}

          {(useAdHocDriver && step === "commodity") ||
          (staffHandshakeAssignLater && step === "commodity") ? (
            <IndentAllocationTripDetailsStep
              pickupDate={deployPickupDate}
              weightTons={deployWeightTons}
              vehicleType={deployVehicleType}
              loadType={deployLoadType}
              onPickupDateChange={set.deployPickupDate}
              onWeightTonsChange={set.deployWeightTons}
              onVehicleTypeChange={set.deployVehicleType}
              onLoadTypeChange={set.deployLoadType}
              pickupDateError={pickupDateError}
              weightError={weightError}
              vehicleTypeError={!deployVehicleType.trim()}
              loadTypeError={!deployLoadType.trim()}
              tonsError={weightError != null}
              indentVehicleType={currentLoad.vehicle_type}
              indentLoadType={currentLoad.load_type}
            />
          ) : null}
        </>
      )}
    </AssignmentFlowShell>
  );
}

const styles = StyleSheet.create({
  assignLaterHint: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 17,
    marginTop: 8,
    marginBottom: 12,
  },
});
