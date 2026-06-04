import type { AddTripFormState } from "./types";

export type AllocationSubStep =
  | "supply"
  | "partner"
  | "rates"
  | "driverName"
  | "driverPhone"
  | "vehicle"
  | "fleetDriver"
  | "fleetVehicle";

export function getAllocationSubSteps(
  state: Pick<AddTripFormState, "supplySource" | "assignLater">,
): AllocationSubStep[] {
  const steps: AllocationSubStep[] = ["supply"];
  if (state.supplySource === "aggregate") {
    steps.push("rates");
    if (!state.assignLater) {
      steps.push("driverPhone", "driverName", "vehicle");
    }
  } else if (state.supplySource === "asset" && !state.assignLater) {
    steps.push("fleetDriver", "fleetVehicle");
  }
  return steps;
}

export function allocationSubStepFields(
  step: AllocationSubStep,
  state?: Pick<AddTripFormState, "supplySource" | "assignLater">,
): Set<string> {
  switch (step) {
    case "supply":
      if (state?.supplySource === "aggregate") {
        return new Set(["partner"]);
      }
      return new Set();
    case "partner":
      return new Set(["partner"]);
    case "rates":
      return new Set(["partnerRate", "advancePaid"]);
    case "driverName":
      return new Set(["driverName"]);
    case "driverPhone":
      return new Set(["driverPhone", "driverConfirm"]);
    case "vehicle":
      return new Set(["vehicleNumber"]);
    case "fleetDriver":
      return new Set(["assetDriver"]);
    case "fleetVehicle":
      return new Set(["assetVehicle"]);
    default:
      return new Set();
  }
}

export function allocationSubStepLabel(step: AllocationSubStep): string {
  switch (step) {
    case "supply":
      return "Supply mode";
    case "partner":
      return "Transport partner";
    case "rates":
      return "Partner rate";
    case "driverName":
      return "Driver name";
    case "driverPhone":
      return "Driver phone";
    case "vehicle":
      return "Vehicle number";
    case "fleetDriver":
      return "Assign driver";
    case "fleetVehicle":
      return "Assign vehicle";
    default:
      return "Allocation";
  }
}
