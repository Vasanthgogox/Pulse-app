import type { DriverRow } from "./services/drivers.service";

/**
 * In-memory first-paint seed for Driver Detail (not TanStack Query).
 *
 * Used by Finance's Drivers list (`FinanceScreen.handleEntityRowSelect`)
 * to stash the already-loaded DriverRow before navigating.
 *
 * DriverRow is a partial seed only. `getDriverDetailBundle` remains the
 * authoritative hydration source — never write this seed into that cache.
 * Mirrors `features/clients/initialClientForDetail.ts` / `features/trips/initialTripForDetail.ts`.
 */
let initialDriverById: Record<string, DriverRow> = {};

export function setInitialDriverForDetail(driver: DriverRow): void {
  if (driver?.id) initialDriverById[driver.id] = driver;
}

export function getInitialDriverForDetail(driverId: string): DriverRow | null {
  const d = initialDriverById[driverId] ?? null;
  return d?.id === driverId ? d : null;
}

export function clearInitialDriverForDetail(driverId: string): void {
  delete initialDriverById[driverId];
}
