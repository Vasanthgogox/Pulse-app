import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import FontAwesomeIcon from "@expo/vector-icons/FontAwesome";
import Theme from "@/constants/Theme";
import { LeafletMap, type LeafletLatLng, type LeafletMarker } from "@/components/driver/LeafletMap.web";

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
  const center = useMemo<LeafletLatLng>(() => {
    if (latestLocation?.latitude != null && latestLocation?.longitude != null) {
      return { latitude: latestLocation.latitude, longitude: latestLocation.longitude };
    }
    if (originCoordinate?.latitude != null && originCoordinate?.longitude != null) {
      return { latitude: originCoordinate.latitude, longitude: originCoordinate.longitude };
    }
    return { latitude: 20.5937, longitude: 78.9629 };
  }, [latestLocation, originCoordinate]);

  const markers = useMemo<LeafletMarker[]>(() => {
    const next: LeafletMarker[] = [];
    if (originCoordinate?.latitude != null && originCoordinate?.longitude != null) {
      next.push({
        id: "origin",
        coordinate: originCoordinate,
        label: "Origin",
        color: "#ef4444",
      });
    }
    if (destinationCoordinate?.latitude != null && destinationCoordinate?.longitude != null) {
      next.push({
        id: "destination",
        coordinate: destinationCoordinate,
        label: "Destination",
        color: "#10b981",
      });
    }
    if (latestLocation?.latitude != null && latestLocation?.longitude != null) {
      next.push({
        id: "live",
        coordinate: latestLocation,
        label: "Live",
        color: Theme.primary,
      });
    }
    return next;
  }, [originCoordinate, destinationCoordinate, latestLocation]);

  const polyline = useMemo<LeafletLatLng[]>(() => {
    const points = tripLocationPoints
      .filter((p) => p?.latitude != null && p?.longitude != null)
      .map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    if (points.length >= 2) return points;
    if (
      originCoordinate?.latitude != null &&
      originCoordinate?.longitude != null &&
      destinationCoordinate?.latitude != null &&
      destinationCoordinate?.longitude != null
    ) {
      return [originCoordinate, destinationCoordinate];
    }
    return [];
  }, [tripLocationPoints, originCoordinate, destinationCoordinate]);

  return (
    <View style={[styles.trackingPageMapArea, { height: mapHeight }]}>
      <LeafletMap
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
