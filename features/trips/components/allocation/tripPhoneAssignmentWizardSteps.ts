import { isIndianVehiclePlateComplete } from "@/lib/indianVehicleInput.util";
import { validatePhone } from "@/lib/phoneValidation";
import type { ExistingDriverMatch } from "@/features/drivers/services/drivers.service";

export type TripPhoneWizardStep = "driverPhone" | "driverName" | "vehicle" | "review";

export const TRIP_PHONE_WIZARD_STEPS = [
  { id: "driverPhone" as const, label: "Phone" },
  { id: "driverName" as const, label: "Driver" },
  { id: "vehicle" as const, label: "Vehicle" },
  { id: "review" as const, label: "Confirm" },
];

export function tripPhoneWizardSubtitle(
  step: TripPhoneWizardStep,
  isReassign: boolean,
): string {
  switch (step) {
    case "driverPhone":
      return isReassign
        ? "Step 1 · New driver mobile — we'll suggest a name if they're on Pulse"
        : "Step 1 · Driver mobile — we'll suggest a name if they're on Pulse";
    case "driverName":
      return "Step 2 · Driver name for tracking";
    case "vehicle":
      return "Step 3 · Vehicle number (XX NN LL NNNN)";
    case "review":
      return isReassign
        ? "Step 4 · Review reassignment — OTP verification applies"
        : "Step 4 · Review assignment — OTP verification applies";
    default:
      return isReassign ? "Reassign by phone" : "Assign by phone";
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
  },
): boolean {
  const effectiveVehiclePlate =
    state.vehiclePlate.trim() ||
    state.existingVehiclePlate?.trim() ||
    "";

  switch (step) {
    case "driverPhone": {
      if (!state.phoneComplete) return false;
      if (state.phoneLookupLoading) return false;
      if (state.phoneInTrip) return false;
      if (state.phoneMatches.length > 1 && !state.selectedMatchUserId) return false;
      return !validatePhone(state.driverPhone.trim());
    }
    case "driverName":
      return state.driverName.trim().length >= 2;
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
