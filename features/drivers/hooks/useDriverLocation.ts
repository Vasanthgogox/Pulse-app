import { useState, useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as driverLocationService from "@/features/driver/services/driverLocation.service";
import { supabase } from "@/lib/supabase";
import type * as ExpoLocationTypes from "expo-location";

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

  const expoLocationModuleRef = useRef<typeof ExpoLocationTypes | null>(null);

  const safeReverseGeocode = useCallback(
    async (
      latitude: number,
      longitude: number,
    ): Promise<ExpoLocationTypes.LocationGeocodedAddress[]> => {
      if (Platform.OS === "web") return [];
      try {
        if (!expoLocationModuleRef.current) {
          expoLocationModuleRef.current = await import("expo-location");
        }
        return await expoLocationModuleRef.current.reverseGeocodeAsync({
          latitude,
          longitude,
        });
      } catch {
        return [];
      }
    },
    [],
  );

  const fetchDriverLocationFromDb = useCallback(async () => {
    if (!tripId) return;
    setDriverLocationLoading(true);
    try {
      const [locRes, histRes] = await Promise.all([
        driverLocationService.getLatestDriverLocationForTrip(tripId),
        driverLocationService.getTripLocationHistory(tripId, 50),
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
    safeReverseGeocode(driverLocation.latitude, driverLocation.longitude)
      .then((results) => {
        if (cancelled) return;
        const addr = results[0];
        if (addr && (addr.city || addr.street || addr.name)) {
          const label = [addr.name, addr.street, addr.city, addr.region]
            .filter(Boolean)
            .join(", ");
          setDriverLocationAddress(label || null);
        } else {
          setDriverLocationAddress(null);
        }
      })
      .catch(() => {
        if (!cancelled) setDriverLocationAddress(null);
      });
    return () => {
      cancelled = true;
    };
  }, [driverLocation?.latitude, driverLocation?.longitude, safeReverseGeocode]);

  return {
    driverLocation,
    driverLocationLoading,
    tripLocationPoints,
    driverLocationAddress,
    fetchDriverLocationFromDb,
  };
}
