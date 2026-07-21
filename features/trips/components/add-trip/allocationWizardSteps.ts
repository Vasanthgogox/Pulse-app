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

/**
 * Allocation sub-steps after the top-level Source step.
 * Source already captured mode + (aggregate) partner/rate.
 */
export function getAllocationSubSteps(
  state: Pick<AddTripFormState, "supplySource" | "assignLater">,
): AllocationSubStep[] {
  if (state.assignLater) {
    // One screen to confirm assign-later (toggle already available).
    return ["supply"];
  }
  if (state.supplySource === "aggregate") {
    return ["driverPhone", "driverName", "vehicle"];
  }
  // Asset: driver + vehicle on one screen (reuse supply id for progress).
  return ["supply"];
}

export function allocationSubStepFields(
  step: AllocationSubStep,
  state?: Pick<AddTripFormState, "supplySource" | "assignLater">,
): Set<string> {
  switch (step) {
    case "supply":
      if (state?.assignLater) return new Set();
      if (state?.supplySource === "asset") {
        return new Set(["assetDriver", "assetVehicle"]);
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

/**
 * Desktop allocation — fleet assignment only (source already validated).
 */
export function desktopAllocationStepFields(
  state: Pick<AddTripFormState, "supplySource" | "assignLater">,
): Set<string> {
  if (state.assignLater) return new Set();
  if (state.supplySource === "asset") {
    return new Set(["assetDriver", "assetVehicle"]);
  }
  return new Set([
    "driverPhone",
    "driverConfirm",
    "driverName",
    "vehicleNumber",
  ]);
}

export function allocationSubStepLabel(step: AllocationSubStep): string {
  switch (step) {
    case "supply":
      return "Assign fleet";
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
