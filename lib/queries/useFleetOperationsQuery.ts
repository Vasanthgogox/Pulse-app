/**
 * Fleet-wide operations data for an org's active trips — the data layer
 * behind an Operations Dashboard. Pure fan-out over the existing platform
 * capabilities (deriveTripStage / computeTripStageMetrics /
 * evaluateOperationalAlerts); introduces no new business logic, only batch
 * data fetching (3 timeline queries + 1 presence query total, not
 * per-trip) so this scales with fleet size instead of query count.
 *
 * Deliberately polling (short staleTime + refetchInterval), not a realtime
 * subscription per trip — N active trips would mean N realtime channels,
 * which is exactly the kind of background-scheduler-shaped infrastructure
 * this stage of the platform doesn't need yet.
 */
import { useQuery } from '@tanstack/react-query';
import { getTripsForOrg, type TripRow } from '@/features/trips/services/trips.service';
import { getDriverPresenceForTrips } from '@/features/tracking/services/driverPresence.service';
import type { DriverPresenceRow } from '@/features/tracking/services/driverPresence.service';
import { getDriverPhonesByIds } from '@/features/drivers/services/drivers.service';
import { getCheckpointDistanceSumsForTrips } from '@/features/tracking/services/trackingCheckpoint.service';
import {
  deriveTripStage,
  computeTripStageMetrics,
  computeJourneyMetrics,
  evaluateOperationalAlerts,
  getTripTimelinesForTrips,
  type TripStage,
  type TripStageMetrics,
  type JourneyMetrics,
  type OperationalAlert,
} from '@/features/trips/domain';

const TERMINAL_STATUSES = new Set(['completed', 'delivered', 'done', 'cancelled']);

function isActiveTripStatus(status: string | null | undefined): boolean {
  return !TERMINAL_STATUSES.has(String(status ?? '').toLowerCase());
}

export interface FleetTripOperations {
  trip: TripRow;
  stage: TripStage;
  metrics: TripStageMetrics;
  /** Null when the trip has no planned distance yet or hasn't departed pickup — see computeJourneyMetrics. */
  journeyMetrics: JourneyMetrics | null;
  alerts: OperationalAlert[];
  presence: DriverPresenceRow | null;
  /** Null when no phone is on file — the "Call Driver" alert action is data-gated on this, not a capability gap. */
  driverPhone: string | null;
}

const POLL_MS = 30_000;

export function useFleetOperationsQuery(orgId: string | null): {
  trips: FleetTripOperations[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: ['q', 'trips', 'fleet-operations', orgId ?? ''],
    queryFn: async (): Promise<FleetTripOperations[]> => {
      const { trips, error: tripsError } = await getTripsForOrg(orgId!);
      if (tripsError) throw tripsError;

      const activeTrips = trips.filter((t) => isActiveTripStatus(t.status));
      if (activeTrips.length === 0) return [];

      const assignedAtByTripId = new Map<string, string | null>(
        activeTrips.map((t) => [t.id, t.created_at ?? null]),
      );
      const tripIds = activeTrips.map((t) => t.id);

      const driverIds = Array.from(
        new Set(activeTrips.map((t) => t.driver_id).filter((id): id is string => !!id)),
      );

      const [
        { timelinesByTripId, error: timelineError },
        { presenceByTripId, error: presenceError },
        { phoneByDriverId, error: phoneError },
        { distanceMByTripId, error: distanceError },
      ] = await Promise.all([
        getTripTimelinesForTrips({ assignedAtByTripId }),
        getDriverPresenceForTrips(tripIds),
        getDriverPhonesByIds(driverIds),
        getCheckpointDistanceSumsForTrips(tripIds),
      ]);
      if (timelineError) throw timelineError;
      if (presenceError) throw presenceError;
      if (phoneError) throw phoneError;
      if (distanceError) throw distanceError;

      const nowMs = Date.now();
      return activeTrips.map((trip): FleetTripOperations => {
        const events = timelinesByTripId.get(trip.id) ?? [];
        const presence = presenceByTripId.get(trip.id) ?? null;
        const metrics = computeTripStageMetrics(trip, events, nowMs);
        const journeyMetrics = computeJourneyMetrics(
          trip,
          distanceMByTripId.get(trip.id) ?? 0,
          metrics,
          nowMs,
        );
        return {
          trip,
          stage: deriveTripStage(trip),
          metrics,
          journeyMetrics,
          alerts: evaluateOperationalAlerts({ metrics, events, presence, journeyMetrics, nowMs }),
          presence,
          driverPhone: trip.driver_id ? (phoneByDriverId.get(trip.driver_id) ?? null) : null,
        };
      });
    },
    enabled: !!orgId,
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });

  return {
    trips: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    refetch: query.refetch,
  };
}
