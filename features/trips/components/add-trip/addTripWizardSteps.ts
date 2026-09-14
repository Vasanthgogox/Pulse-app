import type { AddTripFormState, MarketFulfillment, SupplySource } from "./types";
import {
  computeCommodityStepIssues,
  type AddTripValidationIssue,
} from "./useAddTripForm";

/**
 * Unified Create wizard — client-first grouping, then source fulfilment.
 * 1. Client + sale → 2. Route → 3. Commodity → Source → Asset or Market branches.
 */
export type AddTripWizardStep =
  | "client"
  | "route"
  | "commodity"
  | "source"
  | "market_fulfillment"
  | "market_partner"
  | "share_destination"
  | "share_target"
  | "allocation";

export const ADD_TRIP_WIZARD_STEPS: AddTripWizardStep[] = [
  "client",
  "route",
  "commodity",
  "source",
  "allocation",
];

export type UnifiedCreatePermissions = {
  canAsset: boolean;
  canAggregate: boolean;
  canIndent: boolean;
};

export function resolveUnifiedCreateSteps(
  state: Pick<AddTripFormState, "supplySource" | "marketFulfillment">,
  permissions: UnifiedCreatePermissions,
): AddTripWizardStep[] {
  const steps: AddTripWizardStep[] = ["client", "route", "commodity", "source"];
  if (state.supplySource === "asset") {
    steps.push("allocation");
    return steps;
  }

  const showChoice = permissions.canAggregate && permissions.canIndent;
  if (showChoice) {
    steps.push("market_fulfillment");
    if (state.marketFulfillment === "supplier") {
      steps.push("market_partner", "allocation");
    } else if (state.marketFulfillment === "bid") {
      steps.push("share_destination", "share_target");
    }
    return steps;
  }

  if (permissions.canAggregate) {
    steps.push("market_partner", "allocation");
    return steps;
  }

  if (permissions.canIndent) {
    steps.push("share_destination", "share_target");
  }
  return steps;
}

export function wizardStepAfter(
  steps: readonly AddTripWizardStep[],
  current: AddTripWizardStep,
): AddTripWizardStep | null {
  const idx = steps.indexOf(current);
  if (idx < 0 || idx >= steps.length - 1) return null;
  return steps[idx + 1] ?? null;
}

export function wizardStepBefore(
  steps: readonly AddTripWizardStep[],
  current: AddTripWizardStep,
): AddTripWizardStep | null {
  const idx = steps.indexOf(current);
  if (idx <= 0) return null;
  return steps[idx - 1] ?? null;
}

export function isIndentShareStep(step: AddTripWizardStep): boolean {
  return step === "share_destination" || step === "share_target";
}

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
    case "market_fulfillment":
      return "Market";
    case "market_partner":
      return "Supplier";
    case "share_destination":
      return "Share";
    case "share_target":
      return "Target rate";
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
    case "market_fulfillment":
      return "Market";
    case "market_partner":
      return "Partner";
    case "share_destination":
      return "Share";
    case "share_target":
      return "Target";
    case "allocation":
      return "Assign";
    default:
      return "Trip";
  }
}

export function addTripWizardStepSubtitle(
  step: AddTripWizardStep,
  opts?: { contractRouteLocked?: boolean },
): string {
  switch (step) {
    case "client":
      return "Select billing client, then contract lane or adhoc, and sale value.";
    case "route":
      return opts?.contractRouteLocked
        ? "Confirm the contract corridor and set the trip date."
        : "Enter pickup, drop and trip date.";
    case "commodity":
      return "Vehicle type, load type and tonnage.";
    case "source":
      return "Choose asset (own fleet) or market fulfilment.";
    case "market_fulfillment":
      return "Assign an existing supplier, or share for bidding.";
    case "market_partner":
      return "Select transport partner and supplier rate.";
    case "share_destination":
      return "Network, Marketplace, or both.";
    case "share_target":
      return "Supplier target rate for bidding — not the customer sale value.";
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
      return new Set();
    case "market_fulfillment":
      return new Set(["marketFulfillment"]);
    case "market_partner":
      return null;
    case "share_destination":
      return new Set(["circulation"]);
    case "share_target":
      return new Set(["supplierTarget", "vehicleType", "loadType", "tons"]);
    case "allocation":
      return null;
    default:
      return null;
  }
}

/** Source step — mode only. Partner + rate live on market_partner. */
export function sourceStepFields(
  _state: Pick<AddTripFormState, "supplySource">,
): Set<string> {
  return new Set();
}

export function marketPartnerStepFields(
  state: Pick<AddTripFormState, "supplySource" | "marketFulfillment">,
): Set<string> {
  if (
    state.supplySource === "aggregate" &&
    state.marketFulfillment !== "bid"
  ) {
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

export function inferredMarketFulfillment(
  permissions: UnifiedCreatePermissions,
  supplySource: SupplySource,
): MarketFulfillment | null {
  if (supplySource !== "aggregate") return null;
  if (permissions.canAggregate && permissions.canIndent) return null;
  if (permissions.canAggregate) return "supplier";
  if (permissions.canIndent) return "bid";
  return null;
}
