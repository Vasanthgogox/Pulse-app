/**
 * Add Trip — main modal: composes layout, form fields, and hooks.
 * Thin container; logic lives in useAddTripForm and useClientsForTrip.
 * Waits for onComplete (e.g. createTrip) to finish before closing so lists refetch with new data.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  View,
  useWindowDimensions,
} from "react-native";
import { showAppAlert } from "@/lib/appAlert";
import { AddTripFormFields } from "./AddTripFormFields";
import { AddTripModalLayout } from "./AddTripModalLayout";
import { AddTripWizardProgress } from "./AddTripWizardProgress";
import type {
  AddTripCompleteOptions,
  AddTripCompleteResult,
  AddTripFormState,
  AddTripModalProps,
  AddTripOtpScreenContext,
} from "./types";
import { buildAddTripPrefillFromIndent } from "./prefillFromIndent.util";
import { computeCommodityStepIssues, useAddTripForm } from "./useAddTripForm";
import { useClientsForTrip } from "./useClientsForTrip";
import {
  allocationSubStepFields,
  allocationSubStepLabel,
  getAllocationSubSteps,
  type AllocationSubStep,
} from "./allocationWizardSteps";
import { regenerateTripOtp } from "@/features/trips/services/tripOtp.service";
import { AddTripOtpSuccessBody } from "./AddTripOtpSuccessBody";

function buildOtpScreenContext(state: AddTripFormState): AddTripOtpScreenContext {
  const phoneResolved =
    state.driverPhoneConfirmed && state.driverPhoneName?.trim()
      ? state.driverPhoneName.trim()
      : "";
  const entered = state.aggregateDriverName.trim();
  const driverName = entered || phoneResolved || undefined;
  const routeLineParts: string[] = [];
  if (state.routeDistanceKm != null && Number.isFinite(state.routeDistanceKm)) {
    routeLineParts.push(`${state.routeDistanceKm} km`);
  }
  if (state.routeEtaLabel?.trim()) routeLineParts.push(state.routeEtaLabel.trim());
  const phoneDigits = state.driverPhone.replace(/\D/g, "").slice(-10);
  return {
    driverName,
    driverPhone: phoneDigits.length === 10 ? `+91 ${phoneDigits}` : undefined,
    vehicleNumber: state.aggregateVehicleText.trim() || undefined,
    pickupArea: state.pickupArea.trim(),
    dropLocation: state.dropLocation.trim(),
    clientName: state.clientName.trim() || undefined,
    tons: state.tons.trim() || undefined,
    supplierDisplayName: state.supplierDisplayName.trim() || undefined,
    routeLine: routeLineParts.length ? routeLineParts.join(" · ") : undefined,
  };
}

type WizardStep = "route" | "commodity" | "client" | "sale" | "allocation";

export function AddTripModal({
  organizationId,
  sourceIndent,
  onClose,
  onComplete,
}: AddTripModalProps) {
  const { width: winW } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const form = useAddTripForm();
  const [wizardStep, setWizardStep] = useState<WizardStep>("route");
  const [allocationSubStep, setAllocationSubStep] =
    useState<AllocationSubStep>("supply");
  /** Narrow viewport (native + web mobile): full step wizard. */
  const wizardEnabled = winW < 600;
  /**
   * Web tablet: all section cards visible, but aggregate driver/phone/vehicle
   * uses the same sub-step flow as mobile (phone → name → vehicle).
   */
  const webAllocSubSteps =
    isWeb &&
    winW >= 600 &&
    winW < 1080 &&
    form.state.supplySource === "aggregate";
  const allocationFlowActive =
    (wizardEnabled && wizardStep === "allocation") || webAllocSubSteps;
  /** Hide field errors until the user tries to continue / create (avoids red UI on empty open). */
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<AddTripCompleteResult | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const {
    clients,
    loading: clientsLoading,
    refetch: refetchClients,
  } = useClientsForTrip(organizationId);

  useEffect(() => {
    if (!wizardEnabled) return;
    setWizardStep("route");
    setAllocationSubStep("supply");
  }, [wizardEnabled, organizationId]);

  useEffect(() => {
    if (form.canSubmit) setSubmitError(null);
  }, [form.canSubmit]);

  useEffect(() => {
    if (!sourceIndent) return;
    form.setters.applyPrefill(buildAddTripPrefillFromIndent(sourceIndent));
  }, [sourceIndent?.id]);

  const allocationSteps = useMemo(
    () => getAllocationSubSteps(form.state),
    [form.state.supplySource, form.state.assignLater],
  );

  useEffect(() => {
    if (!allocationFlowActive) return;
    if (wizardEnabled && wizardStep !== "allocation") return;
    setAllocationSubStep((prev) =>
      allocationSteps.includes(prev) ? prev : allocationSteps[0] ?? "supply",
    );
  }, [allocationFlowActive, wizardEnabled, wizardStep, allocationSteps]);

  const stepFieldSet = useMemo(() => {
    if (wizardEnabled) {
      if (wizardStep === "route") {
        return new Set(["pickup", "drop", "tripDate"]);
      }
      if (wizardStep === "commodity") {
        return new Set(["vehicleType", "loadType", "tons"]);
      }
      if (wizardStep === "client") {
        return new Set(["client"]);
      }
      if (wizardStep === "sale") {
        return new Set(["clientPrice"]);
      }
      if (wizardStep === "allocation") {
        return allocationSubStepFields(allocationSubStep, form.state);
      }
      return null;
    }
    if (webAllocSubSteps) {
      return allocationSubStepFields(allocationSubStep, form.state);
    }
    return null;
  }, [
    wizardEnabled,
    webAllocSubSteps,
    wizardStep,
    allocationSubStep,
    form.state.supplySource,
    form.state.assignLater,
  ]);

  const stepIssues = useMemo(() => {
    if (!stepFieldSet) return form.validationIssues;
    if (wizardEnabled && wizardStep === "commodity") {
      return computeCommodityStepIssues(form.state);
    }
    return form.validationIssues.filter((i) => stepFieldSet.has(i.field));
  }, [wizardEnabled, stepFieldSet, wizardStep, form.state, form.validationIssues]);

  const visibleIssues = validationAttempted ? stepIssues : [];
  const visibleValidationMessage = validationAttempted
    ? (stepIssues[0]?.message ?? null)
    : null;

  const steppedFormActive = wizardEnabled || webAllocSubSteps;
  const stepCanAdvance = steppedFormActive
    ? stepIssues.length === 0
    : form.canSubmit;

  const allocationStepIndex = allocationSteps.indexOf(allocationSubStep);
  const isLastAllocationStep =
    allocationFlowActive &&
    allocationStepIndex >= 0 &&
    allocationStepIndex === allocationSteps.length - 1;

  const wizardSubmitLabel = steppedFormActive
    ? wizardEnabled && wizardStep !== "allocation"
      ? wizardStep === "route" ||
        wizardStep === "commodity" ||
        wizardStep === "client" ||
        wizardStep === "sale"
        ? "Continue"
        : "Create Trip"
      : isLastAllocationStep
        ? "Create Trip"
        : "Continue"
    : "Create Trip";

  const wizardStepMeta = useMemo(() => {
    if (!wizardEnabled) return null;
    const topSteps = [
      { id: "route", label: "Route" },
      { id: "commodity", label: "Commodity" },
      { id: "client", label: "Client" },
      { id: "sale", label: "Sale" },
      { id: "allocation", label: "Allocation" },
    ] as const;
    const topIndex = topSteps.findIndex((s) => s.id === wizardStep);
    if (wizardStep !== "allocation") {
      return {
        steps: topSteps,
        currentId: wizardStep,
        stepIndex: topIndex >= 0 ? topIndex + 1 : 1,
        stepTotal: topSteps.length,
        title: "Create Trip",
        subtitle:
          wizardStep === "route"
            ? "Enter pickup, drop and trip date."
            : wizardStep === "commodity"
              ? "Vehicle type, load and weight."
              : wizardStep === "client"
                ? "Select the billing client."
                : wizardStep === "sale"
                  ? "Enter the client sale value."
                  : "Assign supply for this trip.",
      };
    }
    const allocSteps = allocationSteps.map((id) => ({
      id,
      label: allocationSubStepLabel(id),
    }));
    const allocIndex = allocationSteps.indexOf(allocationSubStep);
    return {
      steps: allocSteps,
      currentId: allocationSubStep,
      stepIndex: allocIndex >= 0 ? allocIndex + 1 : 1,
      stepTotal: allocSteps.length,
      title: "Allocation",
      subtitle: `Assign supply · ${allocationSubStepLabel(allocationSubStep)}`,
    };
  }, [wizardEnabled, wizardStep, allocationSteps, allocationSubStep]);

  const allocationFillBody =
    allocationFlowActive &&
    (allocationSubStep === "rates" ||
      allocationSubStep === "driverPhone" ||
      allocationSubStep === "vehicle");

  const handleSubmit = async () => {
    setValidationAttempted(true);
    setSubmitError(null);
    if (submitting) return;
    if (!organizationId) {
      const msg =
        "Your workspace is still loading. Wait a moment and try again.";
      setSubmitError(msg);
      showAppAlert("Organization required", msg);
      return;
    }
    if (!form.canSubmit) {
      const validationErr = form.getValidationError();
      const msg =
        validationErr ?? "Please fill all required fields before creating the trip.";
      setSubmitError(msg);
      showAppAlert("Missing details", msg);
      return;
    }
    setSubmitting(true);
    try {
      const options: AddTripCompleteOptions = {
        supplySource: form.state.supplySource,
        driverPhone: form.state.driverPhone.trim() || undefined,
      };
      const result = await Promise.resolve(onComplete(form.buildPayload(), options));
      const typed = result as AddTripCompleteResult | undefined;
      if (typed?.trip && typed?.otp) {
        setCreatedResult({
          ...typed,
          otpScreenContext: buildOtpScreenContext(form.state),
        });
        return;
      }
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create trip.";
      setSubmitError(msg);
      showAppAlert("Could not create trip", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const advanceAllocationSubStep = () => {
    const allocIdx = allocationSteps.indexOf(allocationSubStep);
    if (allocIdx >= 0 && allocIdx < allocationSteps.length - 1) {
      setAllocationSubStep(allocationSteps[allocIdx + 1]!);
      return true;
    }
    return false;
  };

  const handleWizardPrimary = () => {
    setValidationAttempted(true);
    if (webAllocSubSteps && !wizardEnabled) {
      if (stepIssues.length > 0) {
        Alert.alert(
          "Missing details",
          stepIssues[0]?.message ?? "Fill required fields.",
        );
        return;
      }
      if (advanceAllocationSubStep()) return;
      void handleSubmit();
      return;
    }
    if (!wizardEnabled) {
      void handleSubmit();
      return;
    }
    if (wizardStep === "route") {
      if (stepIssues.length > 0) {
        const msg = stepIssues[0]?.message ?? "Fill required fields.";
        setSubmitError(msg);
        showAppAlert("Missing details", msg);
        return;
      }
      setWizardStep("commodity");
      return;
    }
    if (wizardStep === "commodity") {
      if (stepIssues.length > 0) {
        Alert.alert("Missing details", stepIssues[0]?.message ?? "Fill required fields.");
        return;
      }
      setWizardStep("client");
      return;
    }
    if (wizardStep === "client") {
      if (stepIssues.length > 0) {
        const msg = stepIssues[0]?.message ?? "Fill required fields.";
        setSubmitError(msg);
        showAppAlert("Missing details", msg);
        return;
      }
      setWizardStep("sale");
      return;
    }
    if (wizardStep === "sale") {
      if (stepIssues.length > 0) {
        const msg = stepIssues[0]?.message ?? "Fill required fields.";
        setSubmitError(msg);
        showAppAlert("Missing details", msg);
        return;
      }
      setAllocationSubStep(getAllocationSubSteps(form.state)[0] ?? "supply");
      setWizardStep("allocation");
      return;
    }
    if (advanceAllocationSubStep()) return;
    void handleSubmit();
  };

  const handleWizardBackOrClose = () => {
    if (webAllocSubSteps && !wizardEnabled) {
      const allocIdx = allocationSteps.indexOf(allocationSubStep);
      if (allocIdx > 0) {
        setAllocationSubStep(allocationSteps[allocIdx - 1]!);
        return;
      }
      onClose();
      return;
    }
    if (!wizardEnabled) {
      onClose();
      return;
    }
    if (wizardStep === "allocation") {
      const allocIdx = allocationSteps.indexOf(allocationSubStep);
      if (allocIdx > 0) {
        setAllocationSubStep(allocationSteps[allocIdx - 1]!);
        return;
      }
      setWizardStep("sale");
      return;
    }
    if (wizardStep === "sale") {
      setWizardStep("client");
      return;
    }
    if (wizardStep === "client") {
      setWizardStep("commodity");
      return;
    }
    if (wizardStep === "commodity") {
      setWizardStep("route");
      return;
    }
    if (wizardStep === "route") {
      onClose();
      return;
    }
    onClose();
  };

  const handleRegenerateOtp = async () => {
    if (!createdResult?.trip?.id || regenerating) return;
    setRegenerating(true);
    try {
      const { code, expires_at } = await regenerateTripOtp(createdResult.trip.id);
      if (code != null && expires_at != null)
        setCreatedResult({ ...createdResult, otp: { code, expires_at } });
    } finally {
      setRegenerating(false);
    }
  };

  const handleDone = () => {
    setCreatedResult(null);
    onClose();
  };

  if (createdResult?.trip && createdResult?.otp) {
    return (
      <AddTripModalLayout
        title="Trip created"
        subtitle="Share the code below — trip details stay on this screen for reference."
        submitLabel="Done"
        canSubmit={true}
        submitting={false}
        onClose={handleDone}
        onSubmit={handleDone}
      >
        <AddTripOtpSuccessBody
          createdResult={createdResult}
          regenerating={regenerating}
          onRegenerateOtp={handleRegenerateOtp}
        />
      </AddTripModalLayout>
    );
  }

  return (
    <AddTripModalLayout
      title={wizardStepMeta?.title ?? "Create Trip"}
      subtitle={
        wizardStepMeta?.subtitle ??
        (webAllocSubSteps
          ? `Allocation · ${allocationSubStepLabel(allocationSubStep)}`
          : "Route · commodity · client · allocation")
      }
      stepIndex={wizardStepMeta?.stepIndex}
      stepTotal={wizardStepMeta?.stepTotal}
      submitLabel={wizardSubmitLabel}
      canSubmit={stepCanAdvance}
      submitting={submitting}
      lockPrimaryUntilValid={steppedFormActive ? validationAttempted : true}
      validationMessage={visibleValidationMessage ?? submitError}
      onClose={handleWizardBackOrClose}
      onSubmit={handleWizardPrimary}
      fillBody={allocationFillBody}
      scrollBody={wizardEnabled && !allocationFillBody}
      progress={
        wizardEnabled && wizardStepMeta ? (
          <AddTripWizardProgress
            steps={wizardStepMeta.steps}
            currentStepId={wizardStepMeta.currentId}
          />
        ) : null
      }
    >
      <View style={{ flex: 1, minHeight: 0 }}>
      <AddTripFormFields
        state={form.state}
        setters={form.setters}
        clients={clients}
        clientsLoading={clientsLoading}
        organizationId={organizationId}
        refetchClients={refetchClients}
        onSubmit={handleWizardPrimary}
        canSubmit={stepCanAdvance}
        enablePrimaryWhenInvalid
        validationIssues={visibleIssues}
        validationMessage={visibleValidationMessage}
        wizardSection={wizardEnabled ? wizardStep : undefined}
        sourceIndent={sourceIndent ?? null}
        allocationSubStep={allocationFlowActive ? allocationSubStep : undefined}
        showInlineCta={false}
        submitting={submitting}
      />
      </View>
    </AddTripModalLayout>
  );
}
