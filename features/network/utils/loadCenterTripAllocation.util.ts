import { formatIndianVehicleNumber } from "@/lib/format";
import type { TripRow } from "@/features/trips/services/trips.service";

export type LoadCenterDriverProfile = {
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
};

export type LoadCenterTripAllocation = {
  driver: string;
  vehicle: string;
  driverId?: string | null;
  driverAvatarUrl?: string | null;
  driverAvatarSeed?: string | null;
};

export type LoadCenterVehicleProfile = {
  vehicle_number?: string | null;
};

export type TripPartyLabelSource = {
  driver_id?: string | null;
  vehicle_id?: string | null;
};

type ResolvePartyOpts = {
  trip?: TripRow | null;
  quote?: TripPartyLabelSource | null;
  driverById?: ReadonlyMap<string, LoadCenterDriverProfile>;
  vehicleById?: ReadonlyMap<string, LoadCenterVehicleProfile>;
};

function resolveDriverVehicleStrings({
  trip,
  quote,
  driverById,
  vehicleById,
}: ResolvePartyOpts): {
  driver: string;
  vehicle: string;
  driverId: string | null;
  vehicleId: string | null;
  driverAvatarUrl: string | null;
  driverAvatarSeed: string | null;
} {
  const driverId =
    (trip?.driver_id ?? quote?.driver_id ?? "").trim() || null;
  const vehicleId =
    (trip?.vehicle_id ?? quote?.vehicle_id ?? "").trim() || null;
  const profile = driverId ? driverById?.get(driverId) : undefined;

  const driver =
    (trip?.driver_display_name ?? "").trim() ||
    (profile?.name ?? "").trim() ||
    "";

  let vehicle =
    formatIndianVehicleNumber(trip?.vehicle_display_number ?? "").trim() ||
    (trip?.vehicle_display_number ?? "").trim() ||
    "";

  if (!vehicle && vehicleId && vehicleById) {
    const row = vehicleById.get(vehicleId);
    vehicle =
      formatIndianVehicleNumber(row?.vehicle_number ?? "").trim() ||
      (row?.vehicle_number ?? "").trim() ||
      "";
  }

  return {
    driver,
    vehicle,
    driverId,
    vehicleId,
    driverAvatarUrl: (profile?.avatarUrl ?? "").trim() || null,
    driverAvatarSeed: (profile?.avatarSeed ?? "").trim() || null,
  };
}

/** Labels for trip summary cards (always returns driver/vehicle strings). */
export function resolveTripPartyLabels(
  trip: TripRow | null | undefined,
  opts?: {
    quote?: TripPartyLabelSource | null;
    driverById?: ReadonlyMap<string, LoadCenterDriverProfile>;
    vehicleById?: ReadonlyMap<string, LoadCenterVehicleProfile>;
  },
): {
  driver: string;
  vehicle: string;
  isAllocated: boolean;
} {
  const resolved = resolveDriverVehicleStrings({
    trip,
    quote: opts?.quote,
    driverById: opts?.driverById,
    vehicleById: opts?.vehicleById,
  });
  const isAllocated = Boolean(
    resolved.driver ||
      resolved.vehicle ||
      resolved.driverId ||
      resolved.vehicleId,
  );
  return {
    driver: resolved.driver || "Not assigned",
    vehicle: resolved.vehicle || "Not assigned",
    isAllocated,
  };
}

export function resolveTripAllocationDisplay(
  trip: TripRow | null | undefined,
  driverById?: ReadonlyMap<string, LoadCenterDriverProfile>,
  vehicleById?: ReadonlyMap<string, LoadCenterVehicleProfile>,
  quote?: TripPartyLabelSource | null,
): LoadCenterTripAllocation | null {
  if (!trip) return null;

  const resolved = resolveDriverVehicleStrings({
    trip,
    quote,
    driverById,
    vehicleById,
  });

  if (
    !resolved.driver &&
    !resolved.vehicle &&
    !resolved.driverId &&
    !resolved.vehicleId
  ) {
    return null;
  }

  return {
    driver: resolved.driver || "Unassigned",
    vehicle: resolved.vehicle || "Unassigned",
    driverId: resolved.driverId,
    driverAvatarUrl: resolved.driverAvatarUrl,
    driverAvatarSeed: resolved.driverAvatarSeed,
  };
}

/**
 * Done → Rejected bucket: terminal load that did not convert to our trip.
 * Pairs with {@link isDoneConvertedToTrip} so Rejected ∪ Converted = Done.
 */
export function isDoneRejectedOutcome(
  loadId: string,
  indentIdsWithTrip: ReadonlySet<string>,
  options?: DoneConvertedOptions,
): boolean {
  return !isDoneConvertedToTrip(loadId, indentIdsWithTrip, options);
}

export function isDoneRejectedQuote(
  loadId: string,
  myQuoteByIndentId: ReadonlyMap<string, { status?: string | null }>,
): boolean {
  const q = myQuoteByIndentId.get(loadId);
  return (q?.status ?? "").trim().toLowerCase() === "rejected";
}

export type DoneConvertedOptions = {
  /** Our org won this indent (accepted quote / assigned supplier). */
  awardedToMe?: boolean;
  indentStatus?: string | null;
  quoteStatus?: string | null;
};

/**
 * Converted to trips: linked trip, or we won and the indent is already completed
 * (trip row can lag behind indent completion in the client list).
 */
export function isDoneConvertedToTrip(
  loadId: string,
  indentIdsWithTrip: ReadonlySet<string>,
  options?: DoneConvertedOptions,
): boolean {
  if (indentIdsWithTrip.has(loadId)) return true;
  const st = (options?.indentStatus || "").trim().toLowerCase();
  const quote = (options?.quoteStatus || "").trim().toLowerCase();
  const wonByMe =
    options?.awardedToMe === true || quote === "accepted";
  if (wonByMe && (st === "completed" || st === "closed")) return true;
  return false;
}
