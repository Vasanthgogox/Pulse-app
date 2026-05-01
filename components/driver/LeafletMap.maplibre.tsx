import Theme from "@/constants/Theme";
import MapLibreGL from "@maplibre/maplibre-react-native";
import React, { useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";

import type { LeafletLatLng, LeafletMapProps, LeafletMapRef } from "./LeafletMap.types";

function toLngLat(c: LeafletLatLng): [number, number] {
  return [c.longitude, c.latitude];
}

// Free, reliable OSM-based vector style (works well for India coverage).
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

type CameraRefLike = {
  setCamera: (config: {
    centerCoordinate?: [number, number];
    zoomLevel?: number;
    animationDuration?: number;
  }) => void;
  fitBounds?: (
    ne: [number, number],
    sw: [number, number],
    padding?: number,
    animationDuration?: number,
  ) => void;
};

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
      polylineColor = "#3b82f6",
      lowPower = false,
    },
    ref,
  ) => {
    const cameraRef = useRef<CameraRefLike | null>(null);

    useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom = 15) => {
        cameraRef.current?.setCamera({
          centerCoordinate: toLngLat(currentCenter),
          zoomLevel: currentZoom,
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
    }));

    const safePolyline = useMemo(
      () =>
        (polyline ?? []).filter(
          (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
        ),
      [polyline],
    );

    return (
      <View style={style}>
        <MapLibreGL.MapView
          style={StyleSheet.absoluteFill}
          styleURL={MAP_STYLE}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
          scaleBarEnabled={false}
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
                type: "Feature",
                geometry: {
                  type: "LineString",
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
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {(markers ?? []).map((m) => (
            <MapLibreGL.PointAnnotation
              key={m.id}
              id={`leaflet-marker-${m.id}`}
              coordinate={toLngLat(m.coordinate)}
            >
              <View
                style={[
                  styles.markerDot,
                  { backgroundColor: m.color ?? Theme.driverEmerald },
                ]}
              />
            </MapLibreGL.PointAnnotation>
          ))}
        </MapLibreGL.MapView>
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
