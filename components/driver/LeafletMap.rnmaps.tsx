/**
 * Leaflet-shaped map for Expo Go using react-native-maps (MapLibre native is unavailable).
 */
import Theme from "@/constants/Theme";
import React, { useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

import type { LeafletMapProps, LeafletMapRef } from "./LeafletMap.types";

function zoomToRegionDeltas(zoom: number): { lat: number; lng: number } {
  const z = Math.max(2, Math.min(20, zoom));
  const d = 360 / Math.pow(2, z);
  const delta = Number.isFinite(d) ? Math.min(180, Math.max(0.0005, d)) : 0.05;
  return { lat: delta, lng: delta };
}

export const LeafletMapRnMaps = React.forwardRef<
  LeafletMapRef,
  LeafletMapProps
>(
  (
    {
      style,
      center,
      zoom = 15,
      markers = [],
      polyline = [],
      polylineColor = "#3b82f6",
      lowPower = false,
    },
    ref,
  ) => {
    const mapRef = useRef<MapView | null>(null);

    useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom = 15) => {
        const { lat, lng } = zoomToRegionDeltas(currentZoom);
        const duration = lowPower ? 0 : 450;
        mapRef.current?.animateToRegion(
          {
            latitude: currentCenter.latitude,
            longitude: currentCenter.longitude,
            latitudeDelta: lat,
            longitudeDelta: lng,
          },
          duration,
        );
      },
    }));

    const safePolyline = useMemo(
      () =>
        (polyline ?? []).filter(
          (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
        ),
      [polyline],
    );

    const { lat: initLatD, lng: initLngD } = zoomToRegionDeltas(zoom);

    return (
      <View style={style}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: center.latitude,
            longitude: center.longitude,
            latitudeDelta: initLatD,
            longitudeDelta: initLngD,
          }}
          rotateEnabled={false}
          pitchEnabled={false}
        >
          {safePolyline.length >= 2 ? (
            <Polyline
              coordinates={safePolyline}
              strokeColor={polylineColor}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}

          {(markers ?? []).map((m) => (
            <Marker key={m.id} coordinate={m.coordinate}>
              <View
                style={[
                  styles.markerDot,
                  { backgroundColor: m.color ?? Theme.driverEmerald },
                ]}
              />
            </Marker>
          ))}
        </MapView>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ffffff",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
