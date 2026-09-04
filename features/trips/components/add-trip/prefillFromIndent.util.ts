import {
  indentWeightKgToTonsInput,
  seedDeployPickupDateFromIndent,
} from "@/features/indents/utils/indentDeployTripDetails.util";
import type { AddTripFormState, AddTripSourceIndent } from "./types";

/** Map awarded/open indent into Add Trip form defaults. */
export function buildAddTripPrefillFromIndent(
  indent: AddTripSourceIndent,
): Partial<AddTripFormState> {
  const basis =
    indent.sale_rate_basis === "per_mt" || indent.sale_rate_basis === "per_trip"
      ? indent.sale_rate_basis
      : "per_trip";
  const unit =
    indent.sale_unit_rate != null && Number(indent.sale_unit_rate) > 0
      ? String(indent.sale_unit_rate)
      : "";
  return {
    pickupArea: (indent.pickup_area ?? "").trim(),
    dropLocation: (indent.drop_location ?? "").trim(),
    tripStartDate: seedDeployPickupDateFromIndent(indent),
    tons: indentWeightKgToTonsInput(indent.weight),
    vehicleType: (indent.vehicle_type ?? "").trim(),
    loadType: (indent.load_type ?? "").trim(),
    clientName: (indent.client_name ?? "").trim(),
    clientId: indent.client_id ?? null,
    clientPrice:
      indent.client_price != null && Number(indent.client_price) > 0
        ? String(indent.client_price)
        : "",
    saleRateBasis: basis,
    saleUnitRate: unit,
    laneId: indent.lane_id ?? null,
  };
}
