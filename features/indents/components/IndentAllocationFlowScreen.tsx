/**
 * Full-screen indent deploy — same allocation wizard as trip assignment / create-trip.
 * Replaces the Supply & Allocation handshake modal for awarded-quote suppliers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { IndentAllocationTripDetailsStep } from "@/features/indents/components/IndentAllocationTripDetailsStep";
import { AssetRosterPickers } from "@/features/network/components/StaffHandshakeModal";
import { useStaffHandshake } from "@/features/network/hooks/useStaffHandshake";
import { AddTripWizardProgress } from "@/features/trips/components/add-trip/AddTripWizardProgress";
import { AssignmentFlowFooter } from "@/features/trips/components/assignment/assignmentFlowFooter";
import { AssignmentFlowShell } from "@/features/trips/components/assignment/AssignmentFlowShell";
import { SupplyAllocationModeBar } from "@/features/trips/components/SupplyAllocationModeBar";
import { formatIsoDateForDisplay, isValidIsoDateString } from "@/lib/dateIso.util";
import {
  useDriversQuery,
  useInvalidateIndents,
  useMyDirectQuotesQuery,
  useVisibleIndentQuery,
  useVehiclesQuery,
} from "@/lib/queries";
import { useRouter } from "expo-router";
import { Platform } from "react-native";

const ROSTER_FLOW_STEPS = [
  { id: "driver", label: "Driver" },
  { id: "vehicle", label: "Vehicle" },
  { id: "commodity", label: "Commodity" },
] as const;

const ASSIGN_LATER_STEPS = [{ id: "commodity", label: "Commodity" }] as const;

type FlowStep = (typeof ROSTER_FLOW_STEPS)[number]["id"];

export interface IndentAllocationFlowScreenProps {
  indentId: string;
  onBack: () => void;
}

export function IndentAllocationFlowScreen({
  indentId,
  onBack,
}: IndentAllocationFlowScreenProps) {
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const invalidateIndents = useInvalidateIndents();
  const [step, setStep] = useState<FlowStep>("driver");

  const {
    data: indent,
    isPending: indentPending,
    isError: indentError,
  } = useVisibleIndentQuery(orgId, indentId);

  const { data: myQuotes = [] } = useMyDirectQuotesQuery(orgId);
  const { data: drivers = [] } = useDriversQuery(orgId);
  const { data: vehicles = [] } = useVehiclesQuery(orgId);

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

  const { open, close, state, set, deployRoster, backFromOtp } = handshake;
  const {
    currentLoad,
    isDeploying,
    useAdHocDriver,
    assignDriverId,
    assignVehicleId,
    staffHandshakeAssignLater,
    rosterReady,
    deployOtpCode,
    deployPickupDate,
    deployWeightTons,
    deployVehicleType,
    deployLoadType,
    tripDetailsReady,
  } = state;

  const flowSteps = useMemo(
    () =>
      staffHandshakeAssignLater
        ? [...ASSIGN_LATER_STEPS]
        : [...ROSTER_FLOW_STEPS],
    [staffHandshakeAssignLater],
  );

  const openedIndentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!indent) return;
    if (openedIndentIdRef.current === indent.id) return;
    openedIndentIdRef.current = indent.id;
    open(indent);
    setStep("driver");
  }, [indent, open]);

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
    if (staffHandshakeAssignLater) {
      setStep("commodity");
    } else if (step === "commodity" && !staffHandshakeAssignLater) {
      setStep("driver");
    }
  }, [staffHandshakeAssignLater, step]);

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

  const tripDateLabel = deployPickupDate
    ? formatIsoDateForDisplay(deployPickupDate)
    : "—";
  const tripWeightLabel = deployWeightTons.trim()
    ? `${deployWeightTons.trim()} t`
    : "—";

  const stepSubtitle = deployOtpCode
    ? "Share this code with the driver to claim the trip"
    : useAdHocDriver
      ? "Switch to Asset on the step above, or use Load Center for aggregate deploy"
      : step === "driver"
        ? "Step 1 · Choose from your fleet"
        : step === "vehicle"
          ? "Step 2 · Choose fleet vehicle"
          : "Step 3 · Commodity, vehicle type, and tons";

  const footerSummary =
    step === "commodity" || staffHandshakeAssignLater
      ? `${tripDateLabel} · ${tripWeightLabel}`
      : step === "vehicle"
        ? `${driverLabel} · ${vehicleLabel}`
        : driverLabel;

  const handlePrimary = useCallback(() => {
    if (deployOtpCode) {
      handleClose();
      return;
    }
    if (useAdHocDriver) {
      return;
    }
    if (staffHandshakeAssignLater) {
      if (tripDetailsReady) void deployRoster();
      return;
    }
    if (step === "driver") {
      if (assignDriverId) setStep("vehicle");
      return;
    }
    if (step === "vehicle") {
      if (typeof assignVehicleId === "string") setStep("commodity");
      return;
    }
    if (tripDetailsReady) void deployRoster();
  }, [
    assignDriverId,
    assignVehicleId,
    deployOtpCode,
    deployRoster,
    handleClose,
    staffHandshakeAssignLater,
    step,
    tripDetailsReady,
    useAdHocDriver,
  ]);

  const primaryDisabled = useAdHocDriver
    ? true
    : staffHandshakeAssignLater
      ? !tripDetailsReady || isDeploying
      : step === "driver"
        ? !assignDriverId
        : step === "vehicle"
          ? typeof assignVehicleId !== "string"
          : !tripDetailsReady || isDeploying;

  const primaryLabel = deployOtpCode
    ? "Done"
    : step === "commodity" || staffHandshakeAssignLater
      ? "Authorize & deploy voyage"
      : "Continue";

  const showBack =
    !deployOtpCode &&
    (step === "vehicle" || step === "commodity") &&
    !staffHandshakeAssignLater;

  const handleBack = useCallback(() => {
    if (step === "commodity") setStep("vehicle");
    else if (step === "vehicle") setStep("driver");
  }, [step]);

  const pickupDateError =
    deployPickupDate && !isValidIsoDateString(deployPickupDate)
      ? "Use a valid date (YYYY-MM-DD)."
      : null;
  const weightError =
    deployWeightTons.trim() && !tripDetailsReady && step === "commodity"
      ? "Enter weight in tons (greater than 0)."
      : null;

  if (!currentLoad) {
    return <CenteredLoadingView message="Loading allocation…" />;
  }

  if (useAdHocDriver) {
    return (
      <AssignmentFlowShell
        variant="slate"
        fullScreen
        title="Driver & vehicle"
        subtitle={stepSubtitle}
        onClose={handleClose}
      >
        <Text style={styles.aggregateHint}>
          Aggregate deploy with partner and tracking is available from Load Center.
          Switch to Asset above to assign from your fleet here.
        </Text>
        <SupplyAllocationModeBar
          mode="aggregate"
          assignLater={staffHandshakeAssignLater}
          onModeChange={(mode) => {
            if (mode === "asset") {
              set.useAdHocDriver(false);
              setStep("driver");
            }
          }}
          onAssignLaterChange={set.staffHandshakeAssignLater}
        />
      </AssignmentFlowShell>
    );
  }

  return (
    <AssignmentFlowShell
      variant="slate"
      fullScreen
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
      {!deployOtpCode ? (
        <>
          {(step === "driver" || staffHandshakeAssignLater) &&
          !staffHandshakeAssignLater ? (
            <SupplyAllocationModeBar
              mode="asset"
              assignLater={staffHandshakeAssignLater}
              onModeChange={(mode) => {
                if (mode === "aggregate") set.useAdHocDriver(true);
              }}
              onAssignLaterChange={(v) => {
                set.staffHandshakeAssignLater(v);
                if (v) {
                  set.assignDriverId(null);
                  set.assignVehicleId(undefined);
                  setStep("commodity");
                } else {
                  setStep("driver");
                }
              }}
            />
          ) : null}

          {staffHandshakeAssignLater ? (
            <>
              <SupplyAllocationModeBar
                mode="asset"
                assignLater
                onModeChange={(mode) => {
                  if (mode === "aggregate") set.useAdHocDriver(true);
                }}
                onAssignLaterChange={(v) => {
                  set.staffHandshakeAssignLater(v);
                  if (!v) setStep("driver");
                }}
              />
              <Text style={styles.assignLaterHint}>
                Assign vehicle and driver on the trip screen before the trip starts.
              </Text>
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
            </>
          ) : step === "commodity" ? (
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
          ) : (
            <AssetRosterPickers
              isFlow
              assetFlowStep={step === "vehicle" ? "vehicle" : "driver"}
              width={0}
              activeDrivers={activeDrivers}
              vehicles={vehicles}
              assignDriverId={assignDriverId}
              assignVehicleId={assignVehicleId}
              set={set}
              onNavigateAddDriver={() => {
                handleClose();
                setTimeout(
                  () => {
                    router.push("/(modals)/add-driver" as import("expo-router").Href);
                  },
                  Platform.OS === "ios" ? 100 : 0,
                );
              }}
              onNavigateAddVehicle={() => {
                handleClose();
                setTimeout(
                  () => {
                    router.push("/(modals)/add-vehicle" as import("expo-router").Href);
                  },
                  Platform.OS === "ios" ? 100 : 0,
                );
              }}
            />
          )}
        </>
      ) : (
        <Text style={styles.assignLaterHint}>
          OTP step — use back to return to assignment.
        </Text>
      )}
    </AssignmentFlowShell>
  );
}

const styles = StyleSheet.create({
  aggregateHint: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textRouteCard,
    lineHeight: 18,
    marginBottom: 16,
  },
  assignLaterHint: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 17,
    marginTop: 8,
    marginBottom: 12,
  },
});
