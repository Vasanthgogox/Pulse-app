/**
 * Leaflet-shaped map for Expo Go using react-native-maps (MapLibre native is unavailable).
 */
import Theme from '@/constants/Theme';
import { DriverMapAvatarMarker } from '@/components/driver/DriverMapAvatarMarker';
import { LeafletMapZoomControls } from '@/components/driver/LeafletMapZoomControls';
import { tripMapMarkerRoleFromId } from '@/lib/mapMarkerIcons.util';
import React, { useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import type { LeafletLatLng, LeafletMapProps, LeafletMapRef } from './LeafletMap.types';

function zoomToRegionDeltas(zoom: number): { lat: number; lng: number } {
  const z = Math.max(2, Math.min(20, zoom));
  const d = 360 / Math.pow(2, z);
  const delta = Number.isFinite(d) ? Math.min(180, Math.max(0.0005, d)) : 0.05;
  return { lat: delta, lng: delta };
}

function MarkerContent({
  markerId,
  color,
  avatarUri,
  avatarSeed,
  isOnline,
}: {
  markerId: string;
  color?: string;
  avatarUri?: string | null;
  avatarSeed?: string | null;
  isOnline?: boolean;
}) {
  const role = tripMapMarkerRoleFromId(markerId);
  if (role === 'driver') {
    return (
      <DriverMapAvatarMarker
        avatarUri={avatarUri}
        avatarSeed={avatarSeed}
        isOnline={isOnline}
        size={48}
      />
    );
  }
  return (
    <View
      style={[styles.markerDot, { backgroundColor: color ?? Theme.driverEmerald }]}
    />
  );
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
      polylineColor = '#3b82f6',
      lowPower = false,
      interactionLocked = false,
      showZoomControls = true,
    },
    ref,
  ) => {
    const mapRef = useRef<MapView | null>(null);
    const zoomLevelRef = useRef(zoom);
    const centerRef = useRef(center);
    centerRef.current = center;

    const animateToZoom = useCallback(
      (next: number) => {
        const clamped = Math.max(3, Math.min(19, next));
        zoomLevelRef.current = clamped;
        const { lat, lng } = zoomToRegionDeltas(clamped);
        const duration = lowPower ? 0 : 280;
        const c = centerRef.current;
        mapRef.current?.animateToRegion(
          {
            latitude: c.latitude,
            longitude: c.longitude,
            latitudeDelta: lat,
            longitudeDelta: lng,
          },
          duration,
        );
      },
      [lowPower],
    );

    useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom = 15) => {
        const z = Math.max(3, Math.min(19, currentZoom));
        zoomLevelRef.current = z;
        const { lat, lng } = zoomToRegionDeltas(z);
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
      fitBounds: (_ne, _sw, _paddingPx) => {},
      zoomIn: () => animateToZoom(zoomLevelRef.current + 1),
      zoomOut: () => animateToZoom(zoomLevelRef.current - 1),
    }));

    const safePolyline = useMemo(
      () =>
        (polyline ?? []).filter(
          (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
        ),
      [polyline],
    );

    const { lat: initLatD, lng: initLngD } = zoomToRegionDeltas(zoom);
    const showZoom = showZoomControls && !interactionLocked;

    return (
      <View style={[style, styles.mapHost]}>
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
          scrollEnabled={!interactionLocked}
          zoomEnabled={!interactionLocked}
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

          {(markers ?? []).map((m) => {
            const isDriver = tripMapMarkerRoleFromId(m.id) === 'driver';
            return (
              <Marker
                key={m.id}
                coordinate={m.coordinate}
                anchor={isDriver ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 }}
              >
                <MarkerContent
                  markerId={m.id}
                  color={m.color}
                  avatarUri={m.avatarUri}
                  avatarSeed={m.avatarSeed}
                  isOnline={m.isOnline}
                />
              </Marker>
            );
          })}
        </MapView>
        {showZoom ? (
          <LeafletMapZoomControls
            onZoomIn={() => animateToZoom(zoomLevelRef.current + 1)}
            onZoomOut={() => animateToZoom(zoomLevelRef.current - 1)}
          />
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  mapHost: {
    position: 'relative',
    overflow: 'hidden',
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
