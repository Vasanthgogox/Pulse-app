import { useEffect, useState } from 'react';
import { fetchDriverTripStopOrders } from '@/features/driver/commerce-mission/fetchDriverTripStopOrders';
import { emptyDriverTripStopOrderMission } from '@/features/driver/commerce-mission/normalizeDriverTripStopOrders';
import type { DriverTripStopOrderMission } from '@/features/driver/commerce-mission/driverTripStopOrders.types';

export type DriverCommerceMissionState =
  | { status: 'loading'; mission: DriverTripStopOrderMission }
  | { status: 'error'; mission: DriverTripStopOrderMission; error: Error }
  | { status: 'ready'; mission: DriverTripStopOrderMission };

/**
 * Thin read-only wrapper around fetchDriverTripStopOrders (Primitive A).
 * No mutation, no polling — a single fetch per tripId, matching the
 * read-only scope of this UI slice.
 */
export function useDriverCommerceMission(tripId: string | null): DriverCommerceMissionState {
  const [state, setState] = useState<DriverCommerceMissionState>(() => ({
    status: 'loading',
    mission: emptyDriverTripStopOrderMission(tripId ?? ''),
  }));

  useEffect(() => {
    if (!tripId) {
      setState({ status: 'ready', mission: emptyDriverTripStopOrderMission('') });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading', mission: emptyDriverTripStopOrderMission(tripId) });

    fetchDriverTripStopOrders(tripId).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: 'ready', mission: result.mission }
          : { status: 'error', mission: result.mission, error: result.error },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return state;
}
