import {
    LeafletMap,
    type LeafletLatLng,
    type LeafletMapRef,
    type LeafletMarker,
} from "@/components/driver/LeafletMap.web";
import Theme from "@/constants/Theme";
import { getOptimalRoute, type RouteResult } from "@/services/routingService";
import FontAwesomeIcon from "@expo/vector-icons/FontAwesome";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export type TrackingMapLocationLabels = [string, string, string, string, string];

export interface TrackingMapBlockProps {
  mapHeight: number;
  vehicleLabel: string | null;
  locationLabels?: TrackingMapLocationLabels;
  originCoordinate?: { latitude: number; longitude: number } | null;
  destinationCoordinate?: { latitude: number; longitude: number } | null;
  latestLocation?: { latitude: number; longitude: number } | null;
  driverLocationLoading?: boolean;
  tripLocationPoints?: { latitude: number; longitude: number }[];
  locationAddress?: string | null;
}

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

function isValidCoordinate(point: Partial<MapCoordinate> | null | undefined): point is MapCoordinate {
  return (
    !!point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude)
  );
}

function areCoordinatesClose(a: MapCoordinate, b: MapCoordinate) {
  return (
    Math.abs(a.latitude - b.latitude) < 0.0001 &&
    Math.abs(a.longitude - b.longitude) < 0.0001
  );
}

function dedupeCoordinates(points: MapCoordinate[]) {
  const unique: MapCoordinate[] = [];
  for (const point of points) {
    if (!unique.some((existing) => areCoordinatesClose(existing, point))) {
      unique.push(point);
    }
  }
  return unique;
}

function getDistanceMeters(a: MapCoordinate, b: MapCoordinate) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const styles = StyleSheet.create({
  trackingPageMapArea: {
    width: "100%",
    backgroundColor: Theme.surface,
    overflow: "hidden",
    position: "relative",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 14,
    color: Theme.textMuted,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  // Vehicle card styles (copied from native to keep UI consistent)
  vehicleCardInline: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.border,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  trackingPageMapCardLeft: {
    marginRight: 14,
    justifyContent: "center",
  },
  trackingMapNodeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  trackingPageMapCardCenter: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingRight: 10,
  },
  trackingMapNodeTitle: {
    fontSize: 13,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  trackingPageMapCardSyncing: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.driverEmerald,
    letterSpacing: 1.8,
    marginTop: 8,
    textTransform: "uppercase",
    fontStyle: "italic",
    lineHeight: 12,
  },
  trackingMapNodeVerified: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginTop: 10,
    letterSpacing: 0.6,
    lineHeight: 14,
  },
  trackingPageMapCardRight: {
    marginLeft: 14,
    minWidth: 72,
  },
  trackingMapNodeSpeed: {
    fontSize: 16,
    fontWeight: "900",
    color: Theme.primary,
    letterSpacing: 0.5,
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  // Driver variant
  vehicleCardDriver: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    borderRadius: 12,
    backgroundColor: Theme.driverSurfaceElevated,
    borderColor: Theme.driverBorder,
    borderWidth: 1,
    shadowOpacity: 0,
    elevation: 0,
  },
  trackingMapNodeTitleDriver: {
    color: Theme.textOnDark,
  },
  trackingPageMapCardSyncingDriver: {
    color: Theme.driverEmerald,
  },
  trackingMapNodeVerifiedDriver: {
    color: Theme.driverTextMuted,
  },
  trackingMapNodeSpeedDriver: {
    color: Theme.driverGold,
  },
});

export function TrackingMapBlock({
  mapHeight,
  originCoordinate,
  destinationCoordinate,
  latestLocation,
  tripLocationPoints = [],
}: TrackingMapBlockProps) {
  const mapRef = useRef<LeafletMapRef | null>(null);
  const [optimalRoute, setOptimalRoute] = useState<RouteResult | null>(null);
  const [routeFetchKey, setRouteFetchKey] = useState<string>("");
  const lastRouteStartRef = useRef<MapCoordinate | null>(null);

  const normalizedOrigin = useMemo(
    () => (isValidCoordinate(originCoordinate) ? originCoordinate : null),
    [originCoordinate],
  );
  const normalizedDestination = useMemo(
    () => (isValidCoordinate(destinationCoordinate) ? destinationCoordinate : null),
    [destinationCoordinate],
  );
  const latestCoordinate = useMemo(
    () => (isValidCoordinate(latestLocation ?? null) ? latestLocation : null),
    [latestLocation],
  );

  const center = useMemo<LeafletLatLng>(() => {
    if (latestCoordinate) return latestCoordinate;
    if (normalizedOrigin) return normalizedOrigin;
    return { latitude: 20.5937, longitude: 78.9629 };
  }, [latestCoordinate, normalizedOrigin]);

  const historyCoordinates = useMemo(
    () =>
      dedupeCoordinates(
        (tripLocationPoints ?? [])
          .map((p) => ({ latitude: p.latitude, longitude: p.longitude }))
          .filter(isValidCoordinate),
      ),
    [tripLocationPoints],
  );

  // Route fetch strategy matches driver behavior: from current (if available) to destination.
  // Recalculate only when the driver has moved enough or trip start/end changes.
  useEffect(() => {
    if (!normalizedDestination) {
      setOptimalRoute(null);
      setRouteFetchKey("");
      return;
    }

    const routeStart = latestCoordinate ?? normalizedOrigin;
    if (!routeStart) {
      setOptimalRoute(null);
      setRouteFetchKey("");
      return;
    }

    const lastStart = lastRouteStartRef.current;
    const movedEnough = !lastStart || getDistanceMeters(lastStart, routeStart) >= 80;
    const nextKey = `${routeStart.latitude.toFixed(5)},${routeStart.longitude.toFixed(5)}|${normalizedDestination.latitude.toFixed(5)},${normalizedDestination.longitude.toFixed(5)}`;
    if (!movedEnough && nextKey === routeFetchKey) return;
    lastRouteStartRef.current = routeStart;
    setRouteFetchKey(nextKey);

    let cancelled = false;
    getOptimalRoute(routeStart, normalizedDestination)
      .then((res) => {
        if (!cancelled) setOptimalRoute(res ?? null);
      })
      .catch(() => {
        if (!cancelled) setOptimalRoute(null);
      });
    return () => {
      cancelled = true;
    };
  }, [latestCoordinate, normalizedDestination, normalizedOrigin, routeFetchKey]);

  // Keep camera tracking smooth to follow real-time movement without jumps.
  useEffect(() => {
    if (!latestCoordinate) return;
    mapRef.current?.focusCurrentLocation(latestCoordinate, 13);
  }, [latestCoordinate?.latitude, latestCoordinate?.longitude]);

  const markers = useMemo<LeafletMarker[]>(() => {
    const next: LeafletMarker[] = [];
    if (normalizedOrigin) {
      next.push({
        id: "origin",
        coordinate: normalizedOrigin,
        label: "Origin",
        color: "#ef4444",
      });
    }
    if (normalizedDestination) {
      next.push({
        id: "destination",
        coordinate: normalizedDestination,
        label: "Destination",
        color: "#10b981",
      });
    }
    if (latestCoordinate) {
      next.push({
        id: "live",
        coordinate: latestCoordinate,
        label: "Driver live",
        color: Theme.primary,
      });
    }
    return next;
  }, [normalizedOrigin, normalizedDestination, latestCoordinate]);

  const polyline = useMemo<LeafletLatLng[]>(() => {
    // Priority:
    // 1) Recorded trip trace (+ latest live point) only when we have rich progress points
    // 2) Live optimal route from current/source to destination
    // 3) Direct fallback origin->destination
    const traced = [...historyCoordinates];
    if (latestCoordinate) {
      const last = traced[traced.length - 1];
      if (!last || !areCoordinatesClose(last, latestCoordinate)) traced.push(latestCoordinate);
    }

    const dedupedTrace = dedupeCoordinates(traced);
    // Two-point traces are usually just source+destination and render as straight lines.
    // Prefer road routing unless we have a meaningful sequence of path points.
    const hasRichTrace = dedupedTrace.length >= 4;
    if (hasRichTrace) return dedupedTrace;

    if (optimalRoute?.coordinates?.length) {
      const routeCoords = optimalRoute.coordinates.filter(isValidCoordinate);
      if (routeCoords.length > 1) return dedupeCoordinates(routeCoords);
    }

    if (normalizedOrigin && normalizedDestination) {
      return [normalizedOrigin, normalizedDestination];
    }
    return dedupedTrace;
  }, [
    historyCoordinates,
    latestCoordinate,
    optimalRoute?.coordinates,
    normalizedOrigin,
    normalizedDestination,
  ]);

  return (
    <View style={[styles.trackingPageMapArea, { height: mapHeight }]}>
      <LeafletMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        center={center}
        zoom={11}
        markers={markers}
        polyline={polyline}
        polylineColor={Theme.primary}
      />
    </View>
  );
}

export function VehicleTrackingCard({
  vehicleLabel,
  cardStatusText,
  cardSubtext,
  speedKmh,
  variant = "default",
}: {
  vehicleLabel: string | null;
  cardStatusText: string;
  cardSubtext: string;
  speedKmh?: number | null;
  variant?: "default" | "driver";
}) {
  const isDriver = variant === "driver";
  const showSpeed = speedKmh != null && !Number.isNaN(speedKmh);
  return (
    <View style={[styles.vehicleCardInline, isDriver && styles.vehicleCardDriver]}>
      <View style={styles.trackingPageMapCardLeft}>
        <View style={styles.trackingMapNodeIcon}>
          <FontAwesomeIcon name="truck" size={18} color="#ffffff" />
        </View>
      </View>
      <View style={styles.trackingPageMapCardCenter}>
        <Text
          style={[styles.trackingMapNodeTitle, isDriver && styles.trackingMapNodeTitleDriver]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {vehicleLabel?.trim() || "—"}
        </Text>
        <Text
          style={[styles.trackingPageMapCardSyncing, isDriver && styles.trackingPageMapCardSyncingDriver]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {cardStatusText}
        </Text>
        <Text
          style={[styles.trackingMapNodeVerified, isDriver && styles.trackingMapNodeVerifiedDriver]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {cardSubtext}
        </Text>
      </View>
      {showSpeed && (
        <View style={styles.trackingPageMapCardRight}>
          <Text style={[styles.trackingMapNodeSpeed, isDriver && styles.trackingMapNodeSpeedDriver]}>
            {Math.round(speedKmh)} KM/H
          </Text>
        </View>
      )}
    </View>
  );
}
