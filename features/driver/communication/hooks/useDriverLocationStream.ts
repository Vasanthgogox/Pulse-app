/**
 * Write-only GPS telemetry: debounced checkpoint insert + throttled broadcast.
 * No post-write DB reads (recent pins / presence / health on every tick).
 */
import { useCallback, useRef } from 'react';
import type { TripRow } from '@/features/trips/services/trips.service';
import * as driverLocationService from '@/features/driver/services/driverLocation.service';
import type { DriverLocationSource } from '@/features/driver/services/driverLocation.service';
import { useAdaptiveTripLocationPingLoop } from '@/features/driver/hooks/useAdaptiveTripLocationPingLoop';
import {
  useDriverTrackingSessionLifecycle,
  usePublishTrackingOnCheckpoint,
} from '@/features/tracking/hooks/useDriverTrackingPublisher';
import { isCompletedStatus } from '@/features/drivers/utils/driverUtils.util';

export type UseDriverLocationStreamArgs = {
  driver: { id: string; organization_id: string } | null;
  trip: TripRow | null;
  /** Master switch (trip eligible, driver online, etc.). */
  enabled: boolean;
  /** Foreground guard from DriverCommunicationProvider — pauses loop in background. */
  communicationActive: boolean;
  shouldPersistCheckpoint: boolean;
  minDisplacementM: number | null;
  source: DriverLocationSource;
  onLocationFix: (args: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    position: { coords: { latitude: number; longitude: number; heading?: number | null } };
  }) => void;
};

export function useDriverLocationStream({
  driver,
  trip,
  enabled,
  communicationActive,
  shouldPersistCheckpoint,
  minDisplacementM,
  source,
  onLocationFix,
}: UseDriverLocationStreamArgs): void {
  const publishTrackingOnCheckpoint = usePublishTrackingOnCheckpoint();
  const inFlightRef = useRef(false);

  const reportLocationFireAndForget = useCallback(
    async (
      tripId: string | null,
      lat: number,
      lng: number,
      accuracy: number | null,
      locSource: DriverLocationSource,
      extras?: { odometerKm?: number | null; recordedAt?: string },
    ): Promise<boolean> => {
      if (!driver?.organization_id || !driver.id) return false;
      if (inFlightRef.current) return true;

      const recordedAt = extras?.recordedAt ?? new Date().toISOString();
      inFlightRef.current = true;

      void driverLocationService
        .reportDriverLocation({
          driverId: driver.id,
          organizationId: driver.organization_id,
          tripId,
          latitude: lat,
          longitude: lng,
          accuracy,
          source: locSource,
          odometerKm: extras?.odometerKm ?? null,
          recordedAt,
        })
        .then(({ error }) => {
          inFlightRef.current = false;
          if (error || !tripId) return;
          void publishTrackingOnCheckpoint({
            latitude: lat,
            longitude: lng,
            accuracy,
            recordedAt,
          });
        })
        .catch(() => {
          inFlightRef.current = false;
        });

      return true;
    },
    [driver, publishTrackingOnCheckpoint],
  );

  const tripActive = Boolean(
    trip &&
      shouldPersistCheckpoint &&
      !isCompletedStatus(trip.status),
  );

  useDriverTrackingSessionLifecycle({
    tripId: trip?.id ?? null,
    driverId: driver?.id ?? null,
    orgId: driver?.organization_id ?? null,
    tripActive: tripActive && communicationActive,
  });

  useAdaptiveTripLocationPingLoop({
    driver,
    trip,
    enabled: enabled && communicationActive,
    shouldPersistCheckpoint,
    minDisplacementM,
    source,
    reportLocationToDb: reportLocationFireAndForget,
    onLocationFix,
    skipHealthFetchOnTick: true,
    reportFireAndForget: true,
  });
}
