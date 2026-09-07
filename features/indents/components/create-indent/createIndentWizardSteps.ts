import {
  isValidIndentVehicleCount,
  type FormState,
  type IndentDistributionChoice,
} from "./createIndentForm.types";

export type IndentWizardStep =
  | "route"
  | "client"
  | "prices"
  | "share"
  | "vehicle"
  | "loadType"
  | "weight";

export const INDENT_WIZARD_STEPS: IndentWizardStep[] = [
  "client",
  "route",
  "vehicle",
  "prices",
  "share",
];

/** Stepper chips — share is a follow-on page of Target, not its own step. */
export const INDENT_WIZARD_PROGRESS_STEPS: IndentWizardStep[] =
  INDENT_WIZARD_STEPS.filter((id) => id !== "share");

export function indentShareSubmitLabel(
  choice: IndentDistributionChoice,
): string {
  switch (choice) {
    case "marketplace":
      return "Share it to marketplace";
    case "both":
      return "Share it to both (network and market)";
    default:
      return "Share it to network";
  }
}

export function indentWizardStepLabel(step: IndentWizardStep): string {
  switch (step) {
    case "route":
      return "Route";
    case "client":
      return "Client";
    case "prices":
    case "share":
      return "Target";
    case "vehicle":
      return "Load";
    case "loadType":
      return "Product type";
    case "weight":
      return "Weight";
    default:
      return "Load";
  }
}

export function indentStepCanAdvance(
  step: IndentWizardStep,
  form: FormState,
): boolean {
  const t = (s: string | null | undefined) => (s ?? "").trim();
  switch (step) {
    case "route":
      return Boolean(
        t(form.pickup_area) && t(form.drop_location) && t(form.pickup_date),
      );
    case "client":
      return Boolean(
        form.client_id?.trim() &&
          t(form.client_name) &&
          Number.isFinite(
            parseFloat(String(form.client_price ?? "").replace(/,/g, "")),
          ) &&
          parseFloat(String(form.client_price ?? "").replace(/,/g, "")) > 0,
      );
    case "prices": {
      const st = parseFloat(
        String(form.supplier_target ?? "").replace(/,/g, ""),
      );
      return (
        Boolean(t(form.supplier_target)) &&
        Number.isFinite(st) &&
        st > 0
      );
    }
    case "share":
      return (
        form.circulation_target === "integrated_supplier" ||
        form.circulation_target === "marketplace" ||
        form.circulation_target === "both"
      );
    case "vehicle":
      return Boolean(
        t(form.vehicle_type) &&
          t(form.load_type) &&
          t(form.weight) &&
          Number.isFinite(
            parseFloat(String(form.weight ?? "").replace(/,/g, "")),
          ) &&
          parseFloat(String(form.weight ?? "").replace(/,/g, "")) > 0 &&
          isValidIndentVehicleCount(form.vehicle_count),
      );
    case "loadType":
      return Boolean(t(form.load_type));
    case "weight": {
      const w = parseFloat(String(form.weight ?? "").replace(/,/g, ""));
      return Boolean(t(form.weight) && Number.isFinite(w) && w > 0);
    }
    default:
      return false;
  }
}

/** Legacy 3-step grouping for non-wizard visibility (unused on mobile). */
export type IndentWizardGroup = "route" | "commercial" | "load";

export function indentStepToGroup(step: IndentWizardStep): IndentWizardGroup {
  if (step === "route") return "route";
  if (step === "client" || step === "prices" || step === "share")
    return "commercial";
  return "load";
}
