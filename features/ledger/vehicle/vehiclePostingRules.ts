import type { TripRow } from "@/features/trips/services/trips.service";
import type { FuelPostingCandidate } from "./postingSelectors";
import { isDcoOperatingTrip } from "@/features/trips/domain/tripDcoOperating";
import { getTripOperationalCapabilities } from "@/features/trips/capabilities";

export type VehiclePostingDecision =
  | "post_vehicle_expense"
  | "create_driver_reimbursement"
  | "supplier_operational_adjustment"
  | "skip";

export function decideFuelPostingRule(params: {
  trip: TripRow;
  candidate: FuelPostingCandidate;
}): VehiclePostingDecision {
  const capabilities = getTripOperationalCapabilities(params.trip);
  const c = params.candidate;
  if (isDcoOperatingTrip(params.trip)) return "skip";
  if (!capabilities.isAssetTrip) return "supplier_operational_adjustment";
  if (c.approvalState !== "approved") return "skip";
  if (c.ledgerState === "posted") return "skip";
  if (c.paymentOwner === "organization") return "post_vehicle_expense";
  if (c.paymentOwner === "driver") return "post_vehicle_expense";
  if (c.paymentOwner === "supplier") return "post_vehicle_expense";
  return "skip";
}
