import Theme from '@/constants/Theme';
import { DriverMapAvatarMarker } from '@/components/driver/DriverMapAvatarMarker';
import { LeafletMapZoomControls } from '@/components/driver/LeafletMapZoomControls';
import { tripMapMarkerRoleFromId } from '@/lib/mapMarkerIcons.util';
import MapLibreGL, { type CameraRef } from '@maplibre/maplibre-react-native';
import React, { useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { LeafletLatLng, LeafletMapProps, LeafletMapRef } from './LeafletMap.types';

function toLngLat(c: LeafletLatLng): [number, number] {
  return [c.longitude, c.latitude];
}

// Free, reliable OSM-based vector style (works well for India coverage).
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

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
      style={[
        styles.markerDot,
        { backgroundColor: color ?? Theme.driverEmerald },
      ]}
    />
  );
}

export const LeafletMapMapLibre = React.forwardRef<
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
    const cameraRef = useRef<CameraRef | null>(null);
    const zoomLevelRef = useRef(zoom);

    const setCameraZoom = useCallback(
      (next: number, animationDuration = lowPower ? 0 : 280) => {
        const clamped = Math.max(3, Math.min(19, next));
        zoomLevelRef.current = clamped;
        cameraRef.current?.setCamera({
          zoomLevel: clamped,
          animationDuration,
        });
      },
      [lowPower],
    );

    useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom = 15) => {
        const z = Math.max(3, Math.min(19, currentZoom));
        zoomLevelRef.current = z;
        cameraRef.current?.setCamera({
          centerCoordinate: toLngLat(currentCenter),
          zoomLevel: z,
          animationDuration: lowPower ? 0 : 450,
        });
      },
      fitBounds: (ne, sw, paddingPx = 80) => {
        cameraRef.current?.fitBounds?.(
          [ne.longitude, ne.latitude],
          [sw.longitude, sw.latitude],
          paddingPx,
          lowPower ? 0 : 600,
        );
      },
      zoomIn: () => setCameraZoom(zoomLevelRef.current + 1),
      zoomOut: () => setCameraZoom(zoomLevelRef.current - 1),
    }));

    const safePolyline = useMemo(
      () =>
        (polyline ?? []).filter(
          (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
        ),
      [polyline],
    );

    const showZoom = showZoomControls && !interactionLocked;

    return (
      <View style={[style, styles.mapHost]}>
        <MapLibreGL.MapView
          style={StyleSheet.absoluteFill}
          mapStyle={MAP_STYLE}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
          scrollEnabled={!interactionLocked}
          zoomEnabled={!interactionLocked}
        >
          <MapLibreGL.Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: toLngLat(center),
              zoomLevel: zoom,
            }}
          />

          {safePolyline.length >= 2 ? (
            <MapLibreGL.ShapeSource
              id="leaflet-polyline-source"
              shape={{
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: safePolyline.map(toLngLat),
                },
                properties: {},
              }}
            >
              <MapLibreGL.LineLayer
                id="leaflet-polyline-layer"
                style={{
                  lineColor: polylineColor,
                  lineWidth: 4,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {(markers ?? []).map((m) => (
            <MapLibreGL.PointAnnotation
              key={m.id}
              id={`leaflet-marker-${m.id}`}
              coordinate={toLngLat(m.coordinate)}
              anchor={
                tripMapMarkerRoleFromId(m.id) === 'driver' ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 }
              }
            >
              <MarkerContent
                markerId={m.id}
                color={m.color}
                avatarUri={m.avatarUri}
                avatarSeed={m.avatarSeed}
                isOnline={m.isOnline}
              />
            </MapLibreGL.PointAnnotation>
          ))}
        </MapLibreGL.MapView>
        {showZoom ? (
          <LeafletMapZoomControls
            onZoomIn={() => setCameraZoom(zoomLevelRef.current + 1)}
            onZoomOut={() => setCameraZoom(zoomLevelRef.current - 1)}
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
