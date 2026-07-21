import type { AddTripFormState } from "./types";
import {
  computeCommodityStepIssues,
  type AddTripValidationIssue,
} from "./useAddTripForm";

/**
 * Create Trip wizard — client-first grouping.
 * 1. Client + sale → 2. Route (warehouse recommendations) → 3. Commodity → Source → Assign.
 */
export type AddTripWizardStep =
  | "client"
  | "route"
  | "commodity"
  | "source"
  | "allocation";

export const ADD_TRIP_WIZARD_STEPS: AddTripWizardStep[] = [
  "client",
  "route",
  "commodity",
  "source",
  "allocation",
];

export function addTripWizardStepLabel(step: AddTripWizardStep): string {
  switch (step) {
    case "client":
      return "Client";
    case "route":
      return "Route";
    case "commodity":
      return "Commodity";
    case "source":
      return "Source";
    case "allocation":
      return "Allocation";
    default:
      return "Trip";
  }
}

/** Compact labels for mobile stepper (readable at narrow widths). */
export function addTripWizardStepShortLabel(step: AddTripWizardStep): string {
  switch (step) {
    case "client":
      return "Client";
    case "route":
      return "Route";
    case "commodity":
      return "Load";
    case "source":
      return "Source";
    case "allocation":
      return "Assign";
    default:
      return "Trip";
  }
}

export function addTripWizardStepSubtitle(step: AddTripWizardStep): string {
  switch (step) {
    case "client":
      return "Select billing client and sale value.";
    case "route":
      return "Enter pickup, drop and trip date.";
    case "commodity":
      return "Vehicle type, load type and tonnage.";
    case "source":
      return "Choose asset or aggregate supply. For aggregate, pick partner and cost.";
    case "allocation":
      return "Assign vehicle and driver, or choose Assign later.";
    default:
      return "Create trip";
  }
}

export function addTripWizardStepFields(
  step: AddTripWizardStep,
): Set<string> | null {
  switch (step) {
    case "client":
      return new Set(["client", "clientPrice"]);
    case "route":
      return new Set(["pickup", "drop", "tripDate"]);
    case "commodity":
      return new Set(["vehicleType", "loadType", "tons"]);
    case "source":
      return null; // use desktopSourceStepFields / sourceStepFields with state
    case "allocation":
      return null;
    default:
      return null;
  }
}

/** Source step — mode always set; aggregate requires partner + rate. */
export function sourceStepFields(
  state: Pick<AddTripFormState, "supplySource">,
): Set<string> {
  if (state.supplySource === "aggregate") {
    return new Set(["partner", "partnerRate", "advancePaid"]);
  }
  return new Set();
}

export function computeClientStepIssues(
  validationIssues: readonly AddTripValidationIssue[],
): AddTripValidationIssue[] {
  return validationIssues.filter(
    (i) => i.field === "client" || i.field === "clientPrice",
  );
}

/** @deprecated Prefer computeClientStepIssues + computeCommodityStepIssues */
export function computeCommodityClientStepIssues(
  state: AddTripFormState,
  validationIssues: readonly AddTripValidationIssue[],
): AddTripValidationIssue[] {
  const commodity = computeCommodityStepIssues(state);
  return [...computeClientStepIssues(validationIssues), ...commodity];
}
