import {
  isAggregateExecutionTrip,
  isAssetExecutionTrip,
} from "@/features/trips/domain/tripExecutionModel";
import { isActiveFleetRelationshipDriver } from "@/features/drivers/services/drivers.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { PulseDataset } from "@/features/business-pulse/types";
import { applyPulseFilters } from "@/features/business-pulse/selectors/pulseSelectors";

export type PulseScopedData = ReturnType<typeof applyPulseFilters>;

export function filterAssetTrips(trips: TripRow[]): TripRow[] {
  return trips.filter((trip) => isAssetExecutionTrip(trip));
}

/** Restrict an already-filtered scope to asset-execution trips and related rows. */
export function restrictToAssetExecution(scoped: PulseScopedData): PulseScopedData {
  const trips = filterAssetTrips(scoped.trips);
  const tripIds = new Set(trips.map((trip) => trip.id));
  const vehicleIds = new Set(
    trips.map((trip) => String(trip.vehicle_id ?? "")).filter(Boolean),
  );
  const driverIds = new Set(
    trips.map((trip) => String(trip.driver_id ?? "")).filter(Boolean),
  );
  const clientIds = new Set(
    trips.map((trip) => String(trip.client_id ?? "")).filter(Boolean),
  );
  const supplierIds = new Set(
    trips.map((trip) => String(trip.supplier_id ?? "")).filter(Boolean),
  );

  return {
    trips,
    clients: scoped.clients.filter((row) => clientIds.has(row.id)),
    suppliers: scoped.suppliers.filter((row) => supplierIds.has(row.id)),
    vehicles: scoped.vehicles.filter((row) => vehicleIds.has(row.id)),
    drivers: scoped.drivers.filter(
      (row) => driverIds.has(row.id) && isActiveFleetRelationshipDriver(row),
    ),
    vehicleLedger: scoped.vehicleLedger.filter(
      (row) =>
        (row.trip_id && tripIds.has(row.trip_id)) ||
        (row.vehicle_id && vehicleIds.has(String(row.vehicle_id))),
    ),
    fuelRows: scoped.fuelRows.filter((row) => tripIds.has(row.trip_id)),
    tollRows: scoped.tollRows.filter((row) => tripIds.has(row.trip_id)),
    maintenanceRows: scoped.maintenanceRows.filter((row) =>
      vehicleIds.has(String(row.vehicle_id)),
    ),
  };
}

export function applyPulseFiltersAssetOnly(
  dataset: PulseDataset,
  filters: Parameters<typeof applyPulseFilters>[1],
): PulseScopedData {
  return restrictToAssetExecution(applyPulseFilters(dataset, filters));
}

/** Supply / market lane — non–asset-execution trips only. */
export function restrictToAggregateExecution(scoped: PulseScopedData): PulseScopedData {
  const trips = scoped.trips.filter((trip) => isAggregateExecutionTrip(trip));
  const tripIds = new Set(trips.map((trip) => trip.id));
  const supplierIds = new Set(
    trips.map((trip) => String(trip.supplier_id ?? "")).filter(Boolean),
  );
  const clientIds = new Set(
    trips.map((trip) => String(trip.client_id ?? "")).filter(Boolean),
  );

  return {
    ...scoped,
    trips,
    clients: scoped.clients.filter((row) => clientIds.has(row.id)),
    suppliers: scoped.suppliers.filter((row) => supplierIds.has(row.id)),
    vehicles: scoped.vehicles.filter((row) =>
      trips.some((trip) => String(trip.vehicle_id ?? "") === row.id),
    ),
    drivers: scoped.drivers.filter((row) =>
      trips.some((trip) => String(trip.driver_id ?? "") === row.id),
    ),
    vehicleLedger: scoped.vehicleLedger.filter(
      (row) => row.trip_id && tripIds.has(row.trip_id),
    ),
    fuelRows: scoped.fuelRows.filter((row) => tripIds.has(row.trip_id)),
    tollRows: scoped.tollRows.filter((row) => tripIds.has(row.trip_id)),
    maintenanceRows: [],
  };
}
