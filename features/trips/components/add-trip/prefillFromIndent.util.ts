import {
  indentWeightKgToTonsInput,
  seedDeployPickupDateFromIndent,
} from "@/features/indents/utils/indentDeployTripDetails.util";
import type { AddTripFormState, AddTripSourceIndent } from "./types";

/** Map awarded/open indent into Add Trip form defaults. */
export function buildAddTripPrefillFromIndent(
  indent: AddTripSourceIndent,
): Partial<AddTripFormState> {
  return {
    pickupArea: (indent.pickup_area ?? "").trim(),
    dropLocation: (indent.drop_location ?? "").trim(),
    tripStartDate: seedDeployPickupDateFromIndent(indent),
    tons: indentWeightKgToTonsInput(indent.weight),
    vehicleType: (indent.vehicle_type ?? "").trim(),
    loadType: (indent.load_type ?? "").trim(),
    clientName: (indent.client_name ?? "").trim(),
    clientPrice:
      indent.client_price != null && Number(indent.client_price) > 0
        ? String(indent.client_price)
        : "",
  };
}
