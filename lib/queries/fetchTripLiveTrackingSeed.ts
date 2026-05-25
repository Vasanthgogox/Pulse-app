import {
  getDriverPresenceByDriverId,
  getDriverPresenceForTrip,
  type DriverPresenceRow,
} from '@/features/tracking/services/driverPresence.service';
import {
  getRecentTripCheckpoints,
  type TripCheckpointRow,
} from '@/features/tracking/services/tripCheckpoints.service';
import { CHECKPOINT_FETCH_LIMIT } from '@/features/trips/utils/tripTrackingStatus.util';

export type TripLiveTrackingSeed = {
  presence: DriverPresenceRow | null;
  checkpoints: TripCheckpointRow[];
};

/**
 * Single batched read for trip detail live map (presence + frozen trail).
 * Used exclusively through TanStack Query — never call in a render loop.
 */
export async function fetchTripLiveTrackingSeed(
  tripId: string,
  driverId: string | null,
): Promise<TripLiveTrackingSeed> {
  let presence: DriverPresenceRow | null = null;

  const byTrip = await getDriverPresenceForTrip(tripId);
  if (!byTrip.error && byTrip.presence) {
    presence = byTrip.presence;
  } else if (driverId) {
    const byDriver = await getDriverPresenceByDriverId(driverId);
    if (!byDriver.error && byDriver.presence) {
      presence = byDriver.presence;
    }
  }

  const { checkpoints } = await getRecentTripCheckpoints(tripId, CHECKPOINT_FETCH_LIMIT);

  return { presence, checkpoints };
}
