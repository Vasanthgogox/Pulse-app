import type { VehicleRow } from "./services/vehicles.service";

/**
 * In-memory first-paint seed for Vehicle Detail (not TanStack Query).
 *
 * Used by Finance's Garage list (`FinanceScreen.handleEntityRowSelect`)
 * to stash the already-loaded VehicleRow before navigating.
 *
 * VehicleRow is a partial seed only. `getVehicleById` remains the
 * authoritative hydration source — never write this seed into that cache.
 * Mirrors `features/clients/initialClientForDetail.ts` / `features/trips/initialTripForDetail.ts`.
 */
let initialVehicleById: Record<string, VehicleRow> = {};

export function setInitialVehicleForDetail(vehicle: VehicleRow): void {
  if (vehicle?.id) initialVehicleById[vehicle.id] = vehicle;
}

export function getInitialVehicleForDetail(vehicleId: string): VehicleRow | null {
  const v = initialVehicleById[vehicleId] ?? null;
  return v?.id === vehicleId ? v : null;
}

export function clearInitialVehicleForDetail(vehicleId: string): void {
  delete initialVehicleById[vehicleId];
}
