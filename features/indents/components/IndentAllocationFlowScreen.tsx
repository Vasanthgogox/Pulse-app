/**
 * Full-screen indent deploy — same allocation wizard as trip assignment / create-trip.
 * Replaces the Supply & Allocation handshake modal for awarded-quote suppliers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { AssetRosterPickers } from "@/features/network/components/StaffHandshakeModal";
import { useStaffHandshake } from "@/features/network/hooks/useStaffHandshake";
import { AddTripWizardProgress } from "@/features/trips/components/add-trip/AddTripWizardProgress";
import { AssignmentFlowFooter } from "@/features/trips/components/assignment/assignmentFlowFooter";
import { AssignmentFlowShell } from "@/features/trips/components/assignment/AssignmentFlowShell";
import { SupplyAllocationModeBar } from "@/features/trips/components/SupplyAllocationModeBar";
import { assignmentShellStyles } from "@/features/trips/styles/assignmentShellShared";
import {
  useDriversQuery,
  useInvalidateIndents,
  useMyDirectQuotesQuery,
  useVisibleIndentQuery,
  useVehiclesQuery,
} from "@/lib/queries";
import { useRouter } from "expo-router";
import { Platform } from "react-native";

const FLOW_STEPS = [
  { id: "driver", label: "Driver" },
  { id: "vehicle", label: "Vehicle" },
] as const;

type FlowStep = (typeof FLOW_STEPS)[number]["id"];

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
  } = state;

  const openedIndentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!indent) return;
    if (openedIndentIdRef.current === indent.id) return;
    openedIndentIdRef.current = indent.id;
    open(indent);
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

  const stepSubtitle = deployOtpCode
    ? "Share this code with the driver to claim the trip"
    : useAdHocDriver
      ? "Switch to Asset on the step above, or use Load Center for aggregate deploy"
      : step === "driver"
        ? "Step 1 · Choose from your fleet"
        : "Step 2 · Choose fleet vehicle";

  const handlePrimary = useCallback(() => {
    if (deployOtpCode) {
      handleClose();
      return;
    }
    if (useAdHocDriver) {
      return;
    }
    if (staffHandshakeAssignLater) {
      void deployRoster();
      return;
    }
    if (step === "driver") {
      if (assignDriverId) setStep("vehicle");
      return;
    }
    if (rosterReady) void deployRoster();
  }, [
    assignDriverId,
    deployOtpCode,
    deployRoster,
    handleClose,
    rosterReady,
    staffHandshakeAssignLater,
    step,
    useAdHocDriver,
  ]);

  const primaryDisabled = useAdHocDriver
    ? true
    : staffHandshakeAssignLater
      ? isDeploying
      : step === "driver"
        ? !assignDriverId
        : !rosterReady || isDeploying;

  const primaryLabel = deployOtpCode
    ? "Done"
    : staffHandshakeAssignLater
      ? "Authorize & deploy voyage"
      : step === "driver"
        ? "Continue"
        : "Authorize & deploy voyage";

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
      onClose={() =>
        deployOtpCode ? backFromOtp() : handleClose()
      }
      onBack={!deployOtpCode && step === "vehicle" ? () => setStep("driver") : undefined}
      showBack={!deployOtpCode && step === "vehicle"}
      progress={
        !deployOtpCode ? (
          <AddTripWizardProgress steps={FLOW_STEPS} currentStepId={step} />
        ) : null
      }
      footer={
        deployOtpCode ? undefined : (
          <AssignmentFlowFooter
            summary={`${driverLabel} · ${vehicleLabel}`}
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
          {(step === "driver" || staffHandshakeAssignLater) ? (
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
                }
              }}
            />
          ) : null}

          {staffHandshakeAssignLater ? (
            <Text style={styles.assignLaterHint}>
              Assign vehicle and driver on the trip screen before the trip starts.
            </Text>
          ) : (
            <AssetRosterPickers
              isFlow
              assetFlowStep={step}
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
  },
});
