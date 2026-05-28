import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripOperationalCapabilities } from "./capabilityEngine";

export function selectOperationsHubSections(trip: TripRow): string[] {
  const capabilities = getTripOperationalCapabilities(trip);
  if (capabilities.isAssetTrip) {
    return [
      "Verification",
      "Fuel",
      "Toll",
      "Mileage",
      "Vehicle Economics",
      "Maintenance",
    ];
  }
  return [
    "Verification",
    "Toll",
    "Supplier Operations",
    "Trip Notes",
    "Coordination Costs",
  ];
}
