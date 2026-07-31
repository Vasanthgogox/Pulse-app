import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripStage, TripStageTarget } from "./tripStage";

export type TripStageGuidance = {
  title: string;
  subtitle: string;
  toastMessage: string;
  target: TripStageTarget;
  icon: "location-arrow" | "map-marker" | "check-circle";
};

/**
 * Moved verbatim from `getDriverGuidanceConfig` in DriverHomeScreen.tsx.
 * `'lr'` is excluded: deriveTripStage() never produces it (see tripStage.ts),
 * it is a DriverTripFlowCard-local sub-step with its own copy.
 */
export function getTripStageGuidance(
  stage: Exclude<TripStage, "lr">,
  trip: TripRow,
): TripStageGuidance {
  if (stage === "accepted") {
    return {
      title: "Proceed to pickup",
      subtitle: trip.pickup_area?.trim() || "Head to the pickup location",
      toastMessage: "Trip accepted. Proceed to pickup.",
      target: "pickup",
      icon: "location-arrow",
    };
  }
  if (stage === "pickup") {
    return {
      title: "Confirm pickup",
      subtitle: trip.pickup_area?.trim() || "You are at the pickup point",
      toastMessage: "You reached pickup. Confirm pickup to continue.",
      target: "pickup",
      icon: "map-marker",
    };
  }
  if (stage === "transit") {
    return {
      title: "Proceed to drop-off",
      subtitle: trip.drop_location?.trim() || "Head to the drop-off location",
      toastMessage: "Pickup confirmed. Proceed to drop-off.",
      target: "drop",
      icon: "location-arrow",
    };
  }
  if (stage === "reached") {
    return {
      title: "Upload POD",
      subtitle: "At drop-off. Upload POD and complete the trip.",
      toastMessage: "You reached drop-off. Upload POD to complete the trip.",
      target: "drop",
      icon: "check-circle",
    };
  }
  return {
    title: "Trip completed",
    subtitle: "All steps finished.",
    toastMessage: "Trip completed.",
    // Keep map routing/highlight active even after server marks completed.
    target: "drop",
    icon: "check-circle",
  };
}
