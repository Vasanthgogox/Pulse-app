import Theme from "@/constants/Theme";
import MapLibreGL from "@maplibre/maplibre-react-native";
import React, { useImperativeHandle, useMemo, useRef } from "react";
import {
    Platform,
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from "react-native";
import { LeafletMap as LeafletMapWeb } from "./LeafletMap.web";

export type LeafletLatLng = { latitude: number; longitude: number };

export type LeafletMarker = {
  id: string;
  coordinate: LeafletLatLng;
  label?: string;
  color?: string;
};

type LeafletMapProps = {
  style?: StyleProp<ViewStyle>;
  center: LeafletLatLng;
  zoom?: number;
  markers?: LeafletMarker[];
  polyline?: LeafletLatLng[];
  polylineColor?: string;
  /** Prefer compact tiles and lower motion for low-end devices. */
  lowPower?: boolean;
};

function toLngLat(c: LeafletLatLng): [number, number] {
  return [c.longitude, c.latitude];
}

export type LeafletMapRef = {
  focusCurrentLocation: (center: LeafletLatLng, zoom?: number) => void;
};

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

type CameraRefLike = {
  setCamera: (config: {
    centerCoordinate?: [number, number];
    zoomLevel?: number;
    animationDuration?: number;
  }) => void;
};

export const LeafletMap = React.forwardRef<LeafletMapRef, LeafletMapProps>(
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
    const webRef = useRef<LeafletMapRef>(null);
    useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom = 15) => {
        if (Platform.OS === "web") {
          webRef.current?.focusCurrentLocation(currentCenter, currentZoom);
        } else {
          cameraRef.current?.setCamera({
            centerCoordinate: toLngLat(currentCenter),
            zoomLevel: currentZoom,
            animationDuration: lowPower ? 0 : 450,
          });
        }
      },
    }));

    if (Platform.OS === "web") {
      return (
        <LeafletMapWeb
          style={style}
          center={center}
          zoom={zoom}
          markers={markers}
          polyline={polyline}
          polylineColor={polylineColor}
          lowPower={lowPower}
          ref={webRef}
        />
      );
    }

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

export function leafletPolylineFromLatLng(
  points: LeafletLatLng[],
): [number, number][] {
  return points.map((p) => [p.latitude, p.longitude]);
}

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
