import type { TripRow } from "@/features/trips/services/trips.service";
import {
  getAccountingMode,
  getOperationalOwner,
  isAggregationTrip,
  isAssetTrip,
} from "./operationalModels";

export interface TripOperationalCapabilities {
  isAssetTrip: boolean;
  isAggregationTrip: boolean;
  canTrackFuel: boolean;
  canTrackToll: boolean;
  canTrackMileage: boolean;
  canTrackMaintenance: boolean;
  canTrackVehicleEconomics: boolean;
  canTrackVerification: boolean;
  requiresBusinessApproval: boolean;
  operationalOwner: "organization_vehicle" | "supplier_vehicle";
  accountingMode: "vehicle_economics" | "supplier_operations";
}

export function getTripOperationalCapabilities(
  trip: TripRow,
): TripOperationalCapabilities {
  const assetTrip = isAssetTrip(trip);
  const aggregationTrip = isAggregationTrip(trip);
  return {
    isAssetTrip: assetTrip,
    isAggregationTrip: aggregationTrip,
    canTrackFuel: assetTrip,
    canTrackToll: true,
    canTrackMileage: assetTrip,
    canTrackMaintenance: assetTrip,
    canTrackVehicleEconomics: assetTrip,
    canTrackVerification: true,
    requiresBusinessApproval: true,
    operationalOwner: getOperationalOwner(trip),
    accountingMode: getAccountingMode(trip),
  };
}
