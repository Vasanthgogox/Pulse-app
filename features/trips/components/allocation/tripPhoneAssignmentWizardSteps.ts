import { isIndianVehiclePlateComplete } from "@/lib/indianVehicleInput.util";
import { validatePhone } from "@/lib/phoneValidation";
import type { ExistingDriverMatch } from "@/features/drivers/services/drivers.service";

export type TripPhoneWizardStep = "driverPhone" | "driverName" | "vehicle" | "review";

export type ReassignFocus = "driver" | "vehicle";

export const TRIP_PHONE_WIZARD_STEPS = [
  { id: "driverPhone" as const, label: "Phone" },
  { id: "driverName" as const, label: "Driver" },
  { id: "vehicle" as const, label: "Vehicle" },
  { id: "review" as const, label: "Confirm" },
];

export function getTripPhoneWizardSteps(opts: {
  isReassign: boolean;
  reassignFocus?: ReassignFocus;
  vehicleRequired: boolean;
}): ReadonlyArray<{ id: TripPhoneWizardStep; label: string }> {
  if (!opts.isReassign) return TRIP_PHONE_WIZARD_STEPS;

  if (opts.reassignFocus === "vehicle") {
    return [
      { id: "vehicle", label: "Vehicle" },
      { id: "review", label: "Confirm" },
    ];
  }

  if (!opts.vehicleRequired) {
    return [
      { id: "driverPhone", label: "Phone" },
      { id: "driverName", label: "Driver" },
      { id: "review", label: "Confirm" },
    ];
  }

  return TRIP_PHONE_WIZARD_STEPS;
}

export function tripPhoneWizardSubtitle(
  step: TripPhoneWizardStep,
  opts: {
    isReassign: boolean;
    reassignFocus?: ReassignFocus;
    stepIndex?: number;
    stepTotal?: number;
  },
): string {
  const stepPrefix =
    opts.stepIndex != null && opts.stepTotal != null && opts.stepTotal > 0
      ? `Step ${opts.stepIndex} of ${opts.stepTotal} · `
      : "";

  if (opts.isReassign && opts.reassignFocus === "vehicle") {
    switch (step) {
      case "vehicle":
        return `${stepPrefix}Update vehicle number — driver stays the same`;
      case "review":
        return `${stepPrefix}Review vehicle change — OTP verification applies`;
      default:
        return "Change vehicle on this trip";
    }
  }

  switch (step) {
    case "driverPhone":
      return `${stepPrefix}${
        opts.isReassign ? "Edit driver mobile" : "Driver mobile"
      } — change the number or Continue to fix the name`;
    case "driverName":
      return `${stepPrefix}${
        opts.isReassign
          ? "Edit driver’s real name (required)"
          : "Enter the driver's real name (not “Driver”)"
      }`;
    case "vehicle":
      return `${stepPrefix}${
        opts.isReassign
          ? "Edit vehicle number — or keep the current plate"
          : "Vehicle number (XX NN LL NNNN)"
      }`;
    case "review":
      return `${stepPrefix}Review ${
        opts.isReassign ? "reassignment" : "assignment"
      } — OTP verification applies`;
    default:
      return opts.isReassign ? "Reassign by phone" : "Assign by phone";
  }
}

export function isTripPhoneWizardStepComplete(
  step: TripPhoneWizardStep,
  state: {
    driverPhone: string;
    driverName: string;
    vehiclePlate: string;
    phoneComplete: boolean;
    phoneLookupLoading: boolean;
    phoneInTrip: boolean;
    phoneMatches: readonly ExistingDriverMatch[];
    selectedMatchUserId: string | null;
    vehicleRequired?: boolean;
    /** When reassigning, trip may already have a complete plate — empty input keeps it. */
    existingVehiclePlate?: string;
    /** When reassigning vehicle only, driver steps are skipped. */
    skipDriverSteps?: boolean;
  },
): boolean {
  const effectiveVehiclePlate =
    state.vehiclePlate.trim() ||
    state.existingVehiclePlate?.trim() ||
    "";

  switch (step) {
    case "driverPhone": {
      if (state.skipDriverSteps) return true;
      if (!state.phoneComplete) return false;
      if (state.phoneLookupLoading) return false;
      if (state.phoneInTrip) return false;
      if (state.phoneMatches.length > 1 && !state.selectedMatchUserId) return false;
      return !validatePhone(state.driverPhone.trim());
    }
    case "driverName":
      if (state.skipDriverSteps) return true;
      {
        const name = state.driverName.trim();
        if (name.length < 2) return false;
        if (/^driver$/i.test(name)) return false;
        return true;
      }
    case "vehicle": {
      if (!effectiveVehiclePlate) {
        return state.vehicleRequired === false;
      }
      return isIndianVehiclePlateComplete(effectiveVehiclePlate);
    }
    case "review":
      return (
        isTripPhoneWizardStepComplete("driverPhone", state) &&
        isTripPhoneWizardStepComplete("driverName", state) &&
        isTripPhoneWizardStepComplete("vehicle", state)
      );
    default:
      return false;
  }
}
