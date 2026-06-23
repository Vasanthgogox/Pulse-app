/**
 * Live tracking map rendered via shared LeafletMap wrapper:
 * MapLibre on web/native (with Expo Go fallback).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Theme from "@/constants/Theme";
import { getOptimalRoute, type RouteResult } from "@/lib/routingService";
import {
  MAP_LOCATION_LABEL_LOADING,
  MAP_LOCATION_LABEL_UNKNOWN,
} from "@/lib/mapLocationLabel.service";
import { LeafletMap, type LeafletMapRef } from "@/components/driver/LeafletMap";
import { boundsFromCoordinates } from "@/features/trips/utils/mapRouteViewport.util";

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type TrackingMarker = {
  id: string;
  coordinate: MapCoordinate;
  title: string;
};

const DEFAULT_MAP_REGION = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 8,
  longitudeDelta: 8,
};

const INDIA_MAP_BOUNDS = {
  southWest: { latitude: 6.5, longitude: 68.0 },
  northEast: { latitude: 37.6, longitude: 97.5 },
} as const;

const CARD_BG = Theme.cardWhite;

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidCoordinate(point: Partial<MapCoordinate> | null | undefined): point is MapCoordinate {
  return !!point && isFiniteCoordinate(point.latitude) && isFiniteCoordinate(point.longitude);
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

function selectHistoryWaypoint(points: MapCoordinate[], ratio: number) {
  if (points.length < 4) return null;
  const maxIndex = points.length - 1;
  const index = Math.min(Math.max(Math.round(maxIndex * ratio), 1), maxIndex - 1);
  return points[index] ?? null;
}

function isInsideIndiaBounds(point: MapCoordinate) {
  return (
    point.latitude >= INDIA_MAP_BOUNDS.southWest.latitude &&
    point.latitude <= INDIA_MAP_BOUNDS.northEast.latitude &&
    point.longitude >= INDIA_MAP_BOUNDS.southWest.longitude &&
    point.longitude <= INDIA_MAP_BOUNDS.northEast.longitude
  );
}

/**
 * Fix common lat/lng swap from upstream payloads:
 * if point is outside India but swapped point is inside India, use swapped.
 */
function normalizeCoordinateForIndia(point: MapCoordinate): MapCoordinate {
  if (isInsideIndiaBounds(point)) return point;
  const swapped = { latitude: point.longitude, longitude: point.latitude };
  if (isInsideIndiaBounds(swapped)) return swapped;
  return point;
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
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  trackingRouteHalo: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  trackingRouteHaloLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  trackingRouteHaloText: {
    marginTop: 4,
    fontSize: 12,
    color: Theme.textPrimary,
  },
  mapLoadingOverlay: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  mapEmptyState: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    inset: 0,
    paddingHorizontal: 32,
  },
  mapEmptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  mapEmptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: Theme.textMuted,
    textAlign: "center",
  },
  // Vehicle card (inline variant — used below map in TripDetailScreen)
  vehicleCardInline: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: CARD_BG,
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
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  trackingPageMapCardCenter: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingRight: 10,
    alignSelf: "stretch",
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
  // Driver variant: full width, dark surface, no horizontal margin
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

/** [origin, pastLocation1, pastLocation2, currentLive, destination] */
export type TrackingMapLocationLabels = [string, string, string, string, string];

export interface TrackingMapBlockProps {
  mapHeight: number;
  vehicleLabel: string | null;
  locationLabels?: TrackingMapLocationLabels;
  originCoordinate?: MapCoordinate | null;
  destinationCoordinate?: MapCoordinate | null;
  /** Latest GPS position. Only latitude/longitude are read internally. */
  latestLocation?: { latitude: number; longitude: number } | null;
  /** True while locating — shows spinner and suppresses empty state. */
  isLocating?: boolean;
  /** Trip location history points (pickup/drop proxy). */
  tripLocationPoints?: { latitude: number; longitude: number; recorded_at: string }[];
  /** Reverse-geocoded address for latest location. */
  locationAddress?: string | null;
  /** Extra bottom padding when fitting the full route (e.g. overlapping sheet). */
  fitPaddingBottom?: number;
}

const DEFAULT_LOCATION_LABELS: TrackingMapLocationLabels = [
  "Start",
  "Past location 1",
  "Past location 2",
  "Current",
  "Destination",
];

export function TrackingMapBlock({
  mapHeight,
  vehicleLabel,
  locationLabels = DEFAULT_LOCATION_LABELS,
  originCoordinate,
  destinationCoordinate,
  latestLocation,
  isLocating = false,
  tripLocationPoints = [],
  locationAddress,
  fitPaddingBottom = 56,
}: TrackingMapBlockProps) {
  const [origin, past1, past2, currentLabel, destination] = locationLabels;
  const mapRef = useRef<LeafletMapRef | null>(null);
  const [fallbackRoute, setFallbackRoute] = useState<RouteResult | null>(null);

  const historyCoordinates = useMemo(
    () =>
      dedupeCoordinates(
        tripLocationPoints
          .map((point) => ({ latitude: point.latitude, longitude: point.longitude }))
          .map(normalizeCoordinateForIndia)
          .filter(isValidCoordinate)
      ),
    [tripLocationPoints]
  );

  const latestCoordinate = useMemo<MapCoordinate | null>(() => {
    if (!latestLocation) return null;
    const point = {
      latitude: latestLocation.latitude,
      longitude: latestLocation.longitude,
    };
    if (!isValidCoordinate(point)) return null;
    return normalizeCoordinateForIndia(point);
  }, [latestLocation]);

  const normalizedOriginCoordinate = useMemo(
    () =>
      isValidCoordinate(originCoordinate)
        ? normalizeCoordinateForIndia(originCoordinate)
        : null,
    [originCoordinate]
  );

  const normalizedDestinationCoordinate = useMemo(
    () =>
      isValidCoordinate(destinationCoordinate)
        ? normalizeCoordinateForIndia(destinationCoordinate)
        : null,
    [destinationCoordinate]
  );

  useEffect(() => {
    if (!normalizedOriginCoordinate || !normalizedDestinationCoordinate) {
      setFallbackRoute(null);
      return;
    }
    let cancelled = false;
    getOptimalRoute(normalizedOriginCoordinate, normalizedDestinationCoordinate)
      .then((result) => {
        if (!cancelled) {
          setFallbackRoute(result ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFallbackRoute(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedDestinationCoordinate, normalizedOriginCoordinate]);

  const routeCoordinates = useMemo(() => {
    const points = [...historyCoordinates];
    if (latestCoordinate) {
      const lastPoint = points[points.length - 1];
      if (!lastPoint || !areCoordinatesClose(lastPoint, latestCoordinate)) {
        points.push(latestCoordinate);
      }
    }
    return dedupeCoordinates(points);
  }, [historyCoordinates, latestCoordinate]);

  const displayedRouteCoordinates = useMemo(() => {
    if (routeCoordinates.length > 1) return routeCoordinates;
    if (fallbackRoute?.coordinates?.length) {
      return dedupeCoordinates(
        fallbackRoute.coordinates
          .filter(isValidCoordinate)
          .map(normalizeCoordinateForIndia)
          .filter(isInsideIndiaBounds),
      );
    }
    if (normalizedOriginCoordinate && normalizedDestinationCoordinate) {
      return dedupeCoordinates([normalizedOriginCoordinate, normalizedDestinationCoordinate]);
    }
    return routeCoordinates;
  }, [
    fallbackRoute?.coordinates,
    normalizedDestinationCoordinate,
    normalizedOriginCoordinate,
    routeCoordinates,
  ]);

  const markers = useMemo(() => {
    const nextMarkers: TrackingMarker[] = [];

    const pushMarker = (marker: TrackingMarker | null) => {
      if (!marker) return;
      if (
        nextMarkers.some((existing) =>
          areCoordinatesClose(existing.coordinate, marker.coordinate)
        )
      ) {
        return;
      }
      nextMarkers.push(marker);
    };

    const originPoint = normalizedOriginCoordinate ?? historyCoordinates[0] ?? latestCoordinate;
    const destinationPoint =
      normalizedDestinationCoordinate ??
      (historyCoordinates.length > 1
        ? historyCoordinates[historyCoordinates.length - 1]
        : null);
    const pastOnePoint = selectHistoryWaypoint(historyCoordinates, 0.33);
    const pastTwoPoint = selectHistoryWaypoint(historyCoordinates, 0.66);

    pushMarker(
      originPoint
        ? {
            id: "origin",
            coordinate: originPoint,
            title: origin,
          }
        : null
    );
    pushMarker(
      pastOnePoint
        ? {
            id: "past-1",
            coordinate: pastOnePoint,
            title: past1,
          }
        : null
    );
    pushMarker(
      pastTwoPoint
        ? {
            id: "past-2",
            coordinate: pastTwoPoint,
            title: past2,
          }
        : null
    );
    pushMarker(
      destinationPoint
        ? {
            id: "destination",
            coordinate: destinationPoint,
            title: destination,
          }
        : null
    );

    // Always show a distinct live pointer when available.
    pushMarker(
      latestCoordinate
        ? {
            id: "live",
            coordinate: latestCoordinate,
            title: locationAddress?.trim() || currentLabel || "Current location",
          }
        : null
    );

    const recentPings = tripLocationPoints.slice(-5);
    recentPings.forEach((point, idx) => {
      const coord = normalizeCoordinateForIndia({
        latitude: point.latitude,
        longitude: point.longitude,
      });
      if (!isValidCoordinate(coord)) return;
      if (latestCoordinate && areCoordinatesClose(coord, latestCoordinate)) return;
      pushMarker({
        id: `ping-${idx}`,
        coordinate: coord,
        title: `GPS ping ${tripLocationPoints.length - recentPings.length + idx + 1}`,
      });
    });

    return nextMarkers;
  }, [
    currentLabel,
    destination,
    historyCoordinates,
    latestCoordinate,
    locationAddress,
    normalizedDestinationCoordinate,
    normalizedOriginCoordinate,
    origin,
    past1,
    past2,
    tripLocationPoints,
    vehicleLabel,
  ]);

  useEffect(() => {
    const viewportPoints = [
      ...displayedRouteCoordinates,
      normalizedOriginCoordinate,
      normalizedDestinationCoordinate,
      latestCoordinate,
    ];
    const bounds = boundsFromCoordinates(viewportPoints);
    if (!bounds) return;

    const hasRoutableSpan =
      displayedRouteCoordinates.length >= 2 ||
      (!!normalizedOriginCoordinate && !!normalizedDestinationCoordinate);

    const frame = requestAnimationFrame(() => {
      if (hasRoutableSpan) {
        mapRef.current?.fitBounds(bounds.ne, bounds.sw, fitPaddingBottom);
        return;
      }
      const focus =
        latestCoordinate ??
        normalizedOriginCoordinate ??
        normalizedDestinationCoordinate ??
        displayedRouteCoordinates[0];
      if (focus) {
        mapRef.current?.focusCurrentLocation(focus, 11);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    displayedRouteCoordinates,
    fitPaddingBottom,
    latestCoordinate,
    normalizedDestinationCoordinate,
    normalizedOriginCoordinate,
  ]);

  const statusLabel = isLocating
    ? "Syncing live location"
    : latestLocation
      ? "Live tracking active"
      : displayedRouteCoordinates.length > 1
        ? "Showing trip route"
        : routeCoordinates.length > 0
          ? "Showing recorded route"
          : "Waiting for driver location";

  const leafletMarkers = markers.map((m) => ({
    id: m.id,
    coordinate: normalizeCoordinateForIndia(m.coordinate),
    label: m.title,
    color:
      m.id === "origin"
        ? Theme.negative
        : m.id === "destination"
          ? Theme.positive
          : m.id === "live"
            ? Theme.primary
          : Theme.primaryLight,
  }));

  const mapCenter =
    latestCoordinate ??
    normalizedOriginCoordinate ??
    normalizedDestinationCoordinate ??
    DEFAULT_MAP_REGION;

  return (
    <View style={[styles.trackingPageMapArea, { height: mapHeight }]}>
      <LeafletMap
        ref={mapRef}
        style={styles.map}
        center={mapCenter}
        zoom={11}
        maxBounds={INDIA_MAP_BOUNDS}
        markers={leafletMarkers}
        polyline={displayedRouteCoordinates}
        polylineColor={Theme.primary}
      />

      <View style={styles.trackingRouteHalo} pointerEvents="none">
        <Text style={styles.trackingRouteHaloLabel}>{statusLabel}</Text>
        <Text style={styles.trackingRouteHaloText} numberOfLines={2}>
          {locationAddress?.trim() ||
            (isLocating
              ? MAP_LOCATION_LABEL_LOADING
              : latestLocation
                ? MAP_LOCATION_LABEL_UNKNOWN
                : vehicleLabel?.trim() || "Trip route and live driver movement appear here.")}
        </Text>
      </View>

      {isLocating ? (
        <View style={styles.mapLoadingOverlay} pointerEvents="none">
          <LoadingIndicator size="small" color={Theme.primary} />
        </View>
      ) : null}

      {!isLocating && displayedRouteCoordinates.length === 0 ? (
        <View style={styles.mapEmptyState} pointerEvents="none">
          <FontAwesome name="map-o" size={28} color={Theme.textMuted} />
          <Text style={styles.mapEmptyTitle}>No route points yet</Text>
          <Text style={styles.mapEmptySubtitle}>
            Driver location will appear here after the app starts sending trip updates.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Vehicle + location + speed card for use below the map (above Driver's Activity Timeline). */
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
  /** When provided (number), show speed; when null/undefined, hide speed to avoid showing fake data when no location. */
  speedKmh?: number | null;
  /** "driver" = dark surface, full width, driver theme colors; "default" = light card with margin. */
  variant?: "default" | "driver";
}) {
  const isDriver = variant === "driver";
  const showSpeed = speedKmh != null && !Number.isNaN(speedKmh);
  return (
    <View style={[styles.vehicleCardInline, isDriver && styles.vehicleCardDriver]}>
      <View style={styles.trackingPageMapCardLeft}>
        <View style={styles.trackingMapNodeIcon}>
          <FontAwesome name="truck" size={18} color="#ffffff" />
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
