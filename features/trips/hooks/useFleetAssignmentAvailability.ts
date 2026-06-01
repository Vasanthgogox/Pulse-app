import { useEffect, useMemo, useRef } from "react";

import { busyFleetIdsFromTrips } from "@/features/trips/utils/fleetAssignmentAvailability.util";
import { useTripsQuery } from "@/lib/queries";

export function useFleetAssignmentAvailability(
  orgId: string | null,
  opts?: {
    excludeTripId?: string | null;
    /** Clear these selections when they become busy (ids as strings). */
    selectedDriverId?: string | null;
    selectedVehicleId?: string | null | undefined;
    onClearDriver?: () => void;
    onClearVehicle?: () => void;
  },
) {
  const { data: trips = [], isPending, isFetching } = useTripsQuery(orgId);

  const { driverIdsOnActiveTrip, vehicleIdsOnActiveTrip } = useMemo(
    () =>
      busyFleetIdsFromTrips(trips, {
        excludeTripId: opts?.excludeTripId,
      }),
    [trips, opts?.excludeTripId],
  );

  const driverBusySet = useMemo(
    () => new Set(driverIdsOnActiveTrip),
    [driverIdsOnActiveTrip],
  );
  const vehicleBusySet = useMemo(
    () => new Set(vehicleIdsOnActiveTrip),
    [vehicleIdsOnActiveTrip],
  );

  const onClearDriverRef = useRef(opts?.onClearDriver);
  const onClearVehicleRef = useRef(opts?.onClearVehicle);
  onClearDriverRef.current = opts?.onClearDriver;
  onClearVehicleRef.current = opts?.onClearVehicle;

  const busyDriversKey = driverIdsOnActiveTrip.join(",");
  const busyVehiclesKey = vehicleIdsOnActiveTrip.join(",");

  useEffect(() => {
    const driverId = opts?.selectedDriverId;
    if (!driverId || !driverBusySet.has(driverId)) return;
    onClearDriverRef.current?.();
  }, [opts?.selectedDriverId, busyDriversKey, driverBusySet]);

  useEffect(() => {
    const vehicleId =
      typeof opts?.selectedVehicleId === "string"
        ? opts.selectedVehicleId
        : null;
    if (!vehicleId || !vehicleBusySet.has(vehicleId)) return;
    onClearVehicleRef.current?.();
  }, [opts?.selectedVehicleId, busyVehiclesKey, vehicleBusySet]);

  return {
    driverIdsOnActiveTrip,
    vehicleIdsOnActiveTrip,
    driverBusySet,
    vehicleBusySet,
    isLoading: isPending || isFetching,
    isDriverBusy: (driverId: string) => driverBusySet.has(driverId),
    isVehicleBusy: (vehicleId: string) => vehicleBusySet.has(vehicleId),
  };
}
