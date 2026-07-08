/**
 * Full-screen indent deploy — asset and aggregate allocation wizards.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";

import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import {
  fullPageWizardStyles,
  WizardPartyContextRow,
  WizardPriorSelections,
  type WizardPriorSelectionItem,
} from "@/components/full-page-wizard";
import { useOrganization } from "@/contexts/OrganizationContext";
import { IndentAggregateAllocationStep } from "@/features/indents/components/IndentAggregateAllocationStep";
import { IndentAllocationTripDetailsStep } from "@/features/indents/components/IndentAllocationTripDetailsStep";
import { IndentDeployOtpPanel } from "@/features/indents/components/IndentDeployOtpPanel";
import {
  AssignmentFlowFooter,
  AssignmentFlowShell,
  AddTripWizardProgress,
  SupplyAllocationModeBar,
  getIndentAllocationWizardSteps,
  indentAllocationStepSubtitle,
  isIndentAllocationStepComplete,
  type IndentAllocationStepId,
} from "@/features/allocation";
import { AssetRosterPickers } from "@/features/network/components/StaffHandshakeModal";
import { useStaffHandshake } from "@/features/network/hooks/useStaffHandshake";
import { formatIsoDateForDisplay, isValidIsoDateString } from "@/lib/dateIso.util";
import { resolveMarketIndentShipperLabel } from "@/features/indents/utils/indentPartyDisplay.util";
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
  const { width: windowWidth } = useWindowDimensions();
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

  const openedIndentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!indent) return;
    const openKey = `${indent.id}:${initialFocus}`;
    if (openedIndentKeyRef.current === openKey) return;
    openedIndentKeyRef.current = openKey;
    open(indent);
    setStep(initialFocus === "vehicle" ? "vehicle" : "driver");
  }, [indent, open, initialFocus]);

  useEffect(() => {
    return () => {
      openedIndentKeyRef.current = null;
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

  const shipperLabel = currentLoad
    ? resolveMarketIndentShipperLabel(currentLoad)
    : "Shipper";
  const loadRouteSubtitle = currentLoad
    ? `${currentLoad.pickup_area || "—"} → ${currentLoad.drop_location || "—"}`
    : null;

  const priorSelections = useMemo((): WizardPriorSelectionItem[] => {
    if (!currentLoad || deployOtpCode) return [];
    const items: WizardPriorSelectionItem[] = [];

    if (useAdHocDriver) {
      const rateSteps = new Set([
        "driverPhone",
        "driverName",
        "vehicleReg",
        "commodity",
      ]);
      const rateRaw = subcontractRate.trim();
      if (rateSteps.has(step) && rateRaw) {
        items.push({
          id: "rate",
          label: "Partner rate",
          name: `₹${Number(rateRaw).toLocaleString("en-IN")}`,
          subtitle: state.aggregateAdvancePaid.trim()
            ? `Advance ₹${Number(state.aggregateAdvancePaid.trim()).toLocaleString("en-IN")}`
            : null,
          onPress: () => setStep("rates"),
        });
      }

      const phoneSteps = new Set(["driverName", "vehicleReg", "commodity"]);
      if (phoneSteps.has(step) && aggregateDriverPhone.trim()) {
        items.push({
          id: "phone",
          label: "Driver phone",
          name: aggregateDriverPhone.trim(),
          onPress: () => setStep("driverPhone"),
        });
      }

      const nameSteps = new Set(["vehicleReg", "commodity"]);
      if (nameSteps.has(step) && aggregateDriverTrackingName.trim()) {
        items.push({
          id: "name",
          label: "Driver name",
          name: aggregateDriverTrackingName.trim(),
          onPress: () => setStep("driverName"),
        });
      }

      if (step === "commodity" && assignVehicleRegistration.trim()) {
        items.push({
          id: "vehicleReg",
          label: "Vehicle",
          name: assignVehicleRegistration.trim(),
          onPress: () => setStep("vehicleReg"),
        });
      }
    } else if (!staffHandshakeAssignLater) {
      if (step === "commodity" && typeof assignVehicleId === "string" && selectedVehicle) {
        items.push({
          id: "vehicle",
          label: "Vehicle",
          name: vehicleLabel,
          subtitle: [
            selectedVehicle.vehicle_body_type || selectedVehicle.vehicle_type,
            selectedVehicle.vehicle_size,
          ]
            .filter(Boolean)
            .join(" · "),
          entityType: "driver",
          onPress: () => setStep("vehicle"),
        });
      }
    }

    return items;
  }, [
    currentLoad,
    deployOtpCode,
    useAdHocDriver,
    staffHandshakeAssignLater,
    step,
    shipperLabel,
    loadRouteSubtitle,
    subcontractSupplierId,
    selectedPartner,
    partnerLabel,
    subcontractRate,
    state.aggregateAdvancePaid,
    aggregateDriverPhone,
    aggregateDriverTrackingName,
    assignVehicleRegistration,
    assignDriverId,
    selectedDriver,
    driverLabel,
    assignVehicleId,
    selectedVehicle,
    vehicleLabel,
  ]);

  const allocationContextRow = useMemo(() => {
    if (deployOtpCode || !currentLoad) return null;

    const left = {
      label: "Shipper",
      name: shipperLabel,
      subtitle: loadRouteSubtitle,
      entityType: "client" as const,
    };

    if (useAdHocDriver) {
      const driverSteps = new Set<IndentAllocationStepId>([
        "driverName",
        "vehicleReg",
        "commodity",
      ]);
      if (driverSteps.has(step)) {
        const driverName =
          aggregateDriverTrackingName.trim() ||
          aggregateDriverPhone.trim() ||
          "Select driver";
        return {
          left,
          right: {
            label: "Driver",
            name: driverName,
            subtitle:
              aggregateDriverTrackingName.trim() && aggregateDriverPhone.trim()
                ? aggregateDriverPhone.trim()
                : null,
            entityType: "driver" as const,
            onPress:
              step !== "driverPhone" ? () => setStep("driverPhone") : undefined,
          },
        };
      }

      const partnerSteps = new Set<IndentAllocationStepId>([
        "partner",
        "rates",
        "driverPhone",
      ]);
      if (partnerSteps.has(step)) {
        return {
          left,
          right: {
            label: "Partner",
            name:
              selectedPartner && subcontractSupplierId
                ? partnerLabel
                : step === "partner"
                  ? "Select partner"
                  : "—",
            subtitle: selectedPartner
              ? [selectedPartner.supplier_type, selectedPartner.phone]
                  .filter(Boolean)
                  .join(" · ")
              : null,
            entityType: "supplier" as const,
            avatarUrl:
              (selectedPartner as { avatar_url?: string | null })?.avatar_url ??
              null,
            avatarSeed:
              (selectedPartner as { avatar_seed?: string | null })?.avatar_seed ??
              null,
            onPress:
              step !== "partner" && selectedPartner
                ? () => setStep("partner")
                : undefined,
          },
        };
      }

      return { left, right: null };
    }

    if (staffHandshakeAssignLater && step === "commodity") {
      return { left, right: null };
    }

    const assetSteps = new Set<IndentAllocationStepId>([
      "driver",
      "vehicle",
      "commodity",
    ]);
    if (assetSteps.has(step)) {
      return {
        left,
        right: {
          label: "Driver",
          name:
            assignDriverId && selectedDriver
              ? driverLabel
              : step === "driver"
                ? "Select driver"
                : "—",
          subtitle: selectedDriver
            ? [selectedDriver.phone, selectedDriver.email]
                .filter(Boolean)
                .join(" · ")
            : null,
          entityType: "driver" as const,
          avatarUrl:
            (selectedDriver as { avatar_url?: string | null })?.avatar_url ??
            null,
          avatarSeed:
            (selectedDriver as { avatar_seed?: string | null })?.avatar_seed ??
            null,
          onPress:
            step !== "driver" && assignDriverId
              ? () => setStep("driver")
              : undefined,
        },
      };
    }

    return { left, right: null };
  }, [
    deployOtpCode,
    currentLoad,
    shipperLabel,
    loadRouteSubtitle,
    useAdHocDriver,
    staffHandshakeAssignLater,
    step,
    aggregateDriverTrackingName,
    aggregateDriverPhone,
    selectedPartner,
    subcontractSupplierId,
    partnerLabel,
    assignDriverId,
    selectedDriver,
    driverLabel,
  ]);

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
      step === "vehicle" ||
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

  const fillBodyStep =
    step === "rates" || step === "driverPhone" || step === "vehicleReg";

  if (!currentLoad) {
    return <CenteredLoadingView message="Loading allocation…" />;
  }

  return (
    <AssignmentFlowShell
      fullScreen
      fillBody={fillBodyStep}
      scrollBody={!fillBodyStep && !deployOtpCode}
      title={deployOtpCode ? "Trip claim code" : "Deploy load"}
      subtitle={
        deployOtpCode
          ? "Share this code with the driver to claim the trip."
          : stepSubtitle
      }
      stepIndex={deployOtpCode ? undefined : stepIndex + 1}
      stepTotal={deployOtpCode ? undefined : flowSteps.length}
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
            secondaryLabel={showBack ? "Back" : undefined}
            onSecondaryPress={showBack ? handleBack : undefined}
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
        <View style={[styles.flowBody, fullPageWizardStyles.wizardStepBody]}>
          {allocationContextRow ? (
            <WizardPartyContextRow
              left={allocationContextRow.left}
              right={allocationContextRow.right}
            />
          ) : null}

          {!deployOtpCode && priorSelections.length > 0 ? (
            <WizardPriorSelections items={priorSelections} />
          ) : null}

          {showModeBar ? (
            <SupplyAllocationModeBar
              variant="wizard"
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
            <View style={fullPageWizardStyles.shipperWarningCard}>
              <Text style={fullPageWizardStyles.shipperWarningText}>
                {useAdHocDriver
                  ? "Partner and rate are required now. Add driver and vehicle on the trip screen before the trip starts."
                  : "Assign vehicle and driver on the trip screen before the trip starts."}
              </Text>
            </View>
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
              width={windowWidth}
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
        </View>
      )}
    </AssignmentFlowShell>
  );
}

const styles = StyleSheet.create({
  flowBody: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
    flexGrow: 1,
  },
});
