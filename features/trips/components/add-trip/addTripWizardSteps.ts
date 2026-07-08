import type { AddTripFormState } from "./types";
import {
  computeCommodityStepIssues,
  type AddTripValidationIssue,
} from "./useAddTripForm";

/**
 * Create Trip wizard — indent-style grouping.
 * Commodity + client merged (indent load flow: sections 2 & 3 combined).
 */
export type AddTripWizardStep =
  | "route"
  | "commodityClient"
  | "sale"
  | "allocation";

export const ADD_TRIP_WIZARD_STEPS: AddTripWizardStep[] = [
  "route",
  "commodityClient",
  "sale",
  "allocation",
];

export function addTripWizardStepLabel(step: AddTripWizardStep): string {
  switch (step) {
    case "route":
      return "Route";
    case "commodityClient":
      return "Commodity & Client";
    case "sale":
      return "Sale";
    case "allocation":
      return "Allocation";
    default:
      return "Trip";
  }
}

export function addTripWizardStepSubtitle(step: AddTripWizardStep): string {
  switch (step) {
    case "route":
      return "Enter pickup, drop and trip date.";
    case "commodityClient":
      return "Vehicle, load, weight and billing client.";
    case "sale":
      return "Enter the client sale value.";
    case "allocation":
      return "Assign supply for this trip.";
    default:
      return "Create trip";
  }
}

export function addTripWizardStepFields(
  step: AddTripWizardStep,
): Set<string> | null {
  switch (step) {
    case "route":
      return new Set(["pickup", "drop", "tripDate"]);
    case "commodityClient":
      return new Set(["vehicleType", "loadType", "tons", "client"]);
    case "sale":
      return new Set(["clientPrice"]);
    case "allocation":
      return null;
    default:
      return null;
  }
}

export function computeCommodityClientStepIssues(
  state: AddTripFormState,
  validationIssues: readonly AddTripValidationIssue[],
): AddTripValidationIssue[] {
  const commodity = computeCommodityStepIssues(state);
  const client = validationIssues.filter((i) => i.field === "client");
  return [...commodity, ...client];
}
