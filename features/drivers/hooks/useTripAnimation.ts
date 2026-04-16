import { useEffect, useState } from 'react';
import * as routingService from '@/services/routingService';
import * as tripsService from '@/services/tripsService';
import { getTripStopCoordinate } from '@/features/drivers/utils/driverGuidanceUtils';
import { DriverGuidanceStep } from '@/types/driver';

/**
 * Fetches road geometry for the status-aware leg:
 * - accepted / pickup: current driver location -> pickup
 * - transit / reached / completed: current driver location -> drop
 * - fallback (no driver fix or no step): pickup -> drop
 */
export function useTripAnimation(opts: {
  activeTrip: tripsService.TripRow | null;
  activeStep: DriverGuidanceStep | null;
  driverLocation: { latitude: number; longitude: number } | null;
}) {
  const [route, setRoute] = useState<routingService.RouteResult | null>(null);

  useEffect(() => {
    const trip = opts.activeTrip;
    if (!trip) {
      setRoute(null);
      return;
    }
    const pickup = getTripStopCoordinate(trip, 'pickup');
    const drop = getTripStopCoordinate(trip, 'drop');
    if (!pickup || !drop) {
      setRoute(null);
      return;
    }
    const step = opts.activeStep;
    const driverFix = opts.driverLocation;
    let from: { latitude: number; longitude: number } = pickup;
    let to: { latitude: number; longitude: number } = drop;

    if (step === 'accepted' || step === 'pickup') {
      from = driverFix ?? pickup;
      to = pickup;
    } else if (step === 'transit' || step === 'reached' || step === 'completed') {
      from = driverFix ?? pickup;
      to = drop;
    }

    let cancelled = false;
    (async () => {
      const res = await routingService.getOptimalRoute(from, to);
      if (!cancelled) setRoute(res ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    opts.activeTrip?.id,
    (opts.activeTrip as { pickup_lat?: unknown } | null)?.pickup_lat,
    (opts.activeTrip as { pickup_lon?: unknown } | null)?.pickup_lon,
    (opts.activeTrip as { drop_lat?: unknown } | null)?.drop_lat,
    (opts.activeTrip as { drop_lon?: unknown } | null)?.drop_lon,
    opts.activeStep,
    opts.driverLocation?.latitude,
    opts.driverLocation?.longitude,
  ]);

  return { truckPosition: null as { latitude: number; longitude: number } | null, route };
}
