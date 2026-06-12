import { isIndianVehiclePlateComplete } from "@/lib/indianVehicleInput.util";

export type IndentAssetStep = "driver" | "vehicle" | "commodity";

export type IndentAggregateStep =
  | "partner"
  | "rates"
  | "driverName"
  | "driverPhone"
  | "vehicleReg"
  | "commodity";

export type IndentAllocationStepId = IndentAssetStep | IndentAggregateStep;

export type IndentWizardStep = { id: IndentAllocationStepId; label: string };

export function getIndentAllocationWizardSteps(opts: {
  aggregate: boolean;
  assignLater: boolean;
}): IndentWizardStep[] {
  if (opts.aggregate) {
    const steps: IndentWizardStep[] = [
      { id: "partner", label: "Partner" },
      { id: "rates", label: "Rates" },
    ];
    if (!opts.assignLater) {
      steps.push(
        { id: "driverPhone", label: "Phone" },
        { id: "driverName", label: "Driver" },
        { id: "vehicleReg", label: "Vehicle" },
      );
    }
    steps.push({ id: "commodity", label: "Load" });
    return steps;
  }
  if (opts.assignLater) {
    return [{ id: "commodity", label: "Load" }];
  }
  return [
    { id: "driver", label: "Driver" },
    { id: "vehicle", label: "Vehicle" },
    { id: "commodity", label: "Load" },
  ];
}

export function indentAllocationStepSubtitle(
  step: IndentAllocationStepId,
  aggregate: boolean,
): string {
  if (aggregate) {
    switch (step) {
      case "partner":
        return "Step 1 · Select transport partner (supplier)";
      case "rates":
        return "Step 2 · Partner rate and advance";
      case "driverPhone":
        return "Step 3 · Driver mobile — we’ll suggest a name if they’re on Pulse";
      case "driverName":
        return "Step 4 · Driver name for tracking";
      case "vehicleReg":
        return "Step 5 · Vehicle number (XX NN LL NNNN)";
      case "commodity":
        return "Final · Trip date, commodity, and weight";
      default:
        return "Aggregate deploy";
    }
  }
  switch (step) {
    case "driver":
      return "Step 1 · Choose from your fleet";
    case "vehicle":
      return "Step 2 · Choose fleet vehicle";
    case "commodity":
      return "Final · Trip date, commodity, and weight";
    default:
      return "Asset deploy";
  }
}

export function isIndentAllocationStepComplete(
  step: IndentAllocationStepId,
  state: {
    assignDriverId: string | null;
    assignVehicleId: string | null | undefined;
    subcontractSupplierId: string | null;
    subcontractRate: string;
    aggregateDriverTrackingName: string;
    aggregateDriverPhone: string;
    assignVehicleRegistration: string;
    tripDetailsReady: boolean;
    aggregatePhoneInTrip: boolean;
    aggregatePhoneLookupLoading: boolean;
    aggregatePhoneMatches: readonly { user_id: string }[];
    aggregatePhoneSelectedUserId: string | null;
    staffHandshakeAssignLater: boolean;
  },
): boolean {
  switch (step) {
    case "driver":
      return !!state.assignDriverId;
    case "vehicle":
      return typeof state.assignVehicleId === "string";
    case "partner": {
      const sid = (state.subcontractSupplierId ?? "").trim();
      return sid.length > 0;
    }
    case "rates": {
      const rateRaw = state.subcontractRate.trim();
      const rateNum = Number(rateRaw);
      return rateRaw.length > 0 && Number.isFinite(rateNum) && rateNum >= 0;
    }
    case "driverName":
      return state.aggregateDriverTrackingName.trim().length > 0;
    case "driverPhone": {
      const last10 = state.aggregateDriverPhone.replace(/\D/g, "").slice(-10);
      if (last10.length < 10) return false;
      if (state.aggregatePhoneLookupLoading) return false;
      if (state.aggregatePhoneInTrip) return false;
      if (
        state.aggregatePhoneMatches.length > 1 &&
        !state.aggregatePhoneSelectedUserId
      ) {
        return false;
      }
      return true;
    }
    case "vehicleReg":
      return isIndianVehiclePlateComplete(state.assignVehicleRegistration);
    case "commodity":
      return state.tripDetailsReady;
    default:
      return false;
  }
}
