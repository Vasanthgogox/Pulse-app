import { useState, useCallback, useEffect } from "react";
import * as driverLocationService from "@/features/driver/services/driverLocation.service";
import { resolveMapLocationLabel } from "@/lib/mapLocationLabel.service";
import { TRIP_TRACKING_HISTORY_FETCH_LIMIT } from "@/lib/trackingLocation.constants";
import { supabase } from "@/lib/supabase";

export function useDriverLocation(tripId: string | undefined) {
  const [driverLocation, setDriverLocation] =
    useState<driverLocationService.DriverLocationRow | null>(null);
  const [driverLocationLoading, setDriverLocationLoading] = useState(false);
  const [tripLocationPoints, setTripLocationPoints] = useState<
    { latitude: number; longitude: number; recorded_at: string }[]
  >([]);
  const [driverLocationAddress, setDriverLocationAddress] = useState<
    string | null
  >(null);

  const fetchDriverLocationFromDb = useCallback(async () => {
    if (!tripId) return;
    setDriverLocationLoading(true);
    try {
      const [locRes, histRes] = await Promise.all([
        driverLocationService.getLatestDriverLocationForTrip(tripId),
        driverLocationService.getTripLocationHistory(
          tripId,
          TRIP_TRACKING_HISTORY_FETCH_LIMIT,
        ),
      ]);
      setDriverLocation(locRes.error ? null : locRes.location ?? null);
      setTripLocationPoints(histRes.error ? [] : histRes.points ?? []);
    } catch {
      setDriverLocation(null);
      setTripLocationPoints([]);
    } finally {
      setDriverLocationLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;

    // Initial fetch (location + history)
    fetchDriverLocationFromDb();

    // Realtime subscription for live location updates — replaces 30s polling
    const channel = supabase()
      .channel(`driver_location:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            setDriverLocation(payload.new as driverLocationService.DriverLocationRow);
          }
        },
      )
      .subscribe();

    return () => {
      supabase().removeChannel(channel);
    };
  }, [tripId, fetchDriverLocationFromDb]);

  useEffect(() => {
    if (!driverLocation) {
      setDriverLocationAddress(null);
      return;
    }
    let cancelled = false;
    void resolveMapLocationLabel(
      driverLocation.latitude,
      driverLocation.longitude,
      { mode: "full" },
    ).then((label) => {
      if (!cancelled) setDriverLocationAddress(label);
    });
    return () => {
      cancelled = true;
    };
  }, [driverLocation?.latitude, driverLocation?.longitude]);

  return {
    driverLocation,
    driverLocationLoading,
    tripLocationPoints,
    driverLocationAddress,
    fetchDriverLocationFromDb,
  };
}
