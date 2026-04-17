import React, { useEffect, useRef } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

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
  lowPower?: boolean;
};

export type LeafletMapRef = {
  focusCurrentLocation: (center: LeafletLatLng, zoom?: number) => void;
};

// Neutral/light basemap to match production driver UI (avoid over-saturated demo tiles).
const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

type GeoJsonLine = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: number[][] };
  properties: Record<string, never>;
};

type MapLibreSourceLike = {
  setData?: (data: GeoJsonLine) => void;
};

type MapLibreMapLike = {
  on: (event: string, cb: () => void) => void;
  addSource: (id: string, source: unknown) => void;
  getSource: (id: string) => MapLibreSourceLike | undefined;
  addLayer: (layer: unknown) => void;
  getLayer: (id: string) => unknown;
  setPaintProperty: (
    layerId: string,
    name: string,
    value: string | number,
  ) => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    options?: { padding?: number; duration?: number },
  ) => void;
  easeTo: (options: {
    center: [number, number];
    zoom: number;
    duration?: number;
  }) => void;
  resize: () => void;
  remove?: () => void;
};

type MapLibreMarkerLike = {
  setLngLat: (coord: [number, number]) => MapLibreMarkerLike;
  addTo: (map: MapLibreMapLike) => MapLibreMarkerLike;
  setPopup: (popup: unknown) => void;
  remove?: () => void;
};

type MapLibreModuleLike = {
  Map: new (options: {
    container: HTMLDivElement;
    style: string;
    center: [number, number];
    zoom: number;
    dragRotate: boolean;
    pitchWithRotate: boolean;
    attributionControl: boolean;
  }) => MapLibreMapLike;
  Marker: new (options: {
    element: HTMLDivElement;
    anchor: "center";
  }) => MapLibreMarkerLike;
  Popup: new (options: { closeButton: boolean }) => {
    setText: (text: string) => unknown;
  };
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
    const mapRef = useRef<MapLibreMapLike | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const markersRef = useRef<MapLibreMarkerLike[]>([]);
    const lastPolylineStrRef = useRef<string>("");
    const isMountedRef = useRef(true);

    useEffect(() => {
      isMountedRef.current = true;
      if (
        typeof window === "undefined" ||
        !mapContainerRef.current ||
        mapRef.current
      ) {
        return;
      }

      if (!document.getElementById("maplibre-css")) {
        const link = document.createElement("link");
        link.id = "maplibre-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/maplibre-gl@5.11.0/dist/maplibre-gl.css";
        document.head.appendChild(link);
      }

      let cancelled = false;
      import("maplibre-gl").then((MapLibreModule) => {
        if (cancelled || !isMountedRef.current || !mapContainerRef.current)
          return;
        const maplibregl =
          (MapLibreModule as { default?: MapLibreModuleLike }).default ??
          (MapLibreModule as unknown as MapLibreModuleLike);

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: MAP_STYLE,
          center: [center.longitude, center.latitude],
          zoom,
          dragRotate: !lowPower,
          pitchWithRotate: !lowPower,
          attributionControl: false,
        });

        mapRef.current = map;

        map.on("load", () => {
          if (!map.getSource("route-src")) {
            map.addSource("route-src", {
              type: "geojson",
              data: {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: [],
                },
                properties: {},
              },
            });
          }
          if (!map.getLayer("route-outline")) {
            map.addLayer({
              id: "route-outline",
              type: "line",
              source: "route-src",
              paint: {
                "line-color": `${polylineColor}33`,
                "line-width": 8,
              },
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
            });
          }
          if (!map.getLayer("route-main")) {
            map.addLayer({
              id: "route-main",
              type: "line",
              source: "route-src",
              paint: {
                "line-color": polylineColor,
                "line-width": 4,
              },
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
            });
          }
        });
      });

      return () => {
        cancelled = true;
        isMountedRef.current = false;
        if (mapRef.current) {
          markersRef.current.forEach((m) => m.remove?.());
          markersRef.current = [];
          mapRef.current.remove?.();
          mapRef.current = null;
        }
      };
    }, []);

    useEffect(() => {
      if (!mapRef.current || typeof window === "undefined") {
        return;
      }

      let cancelled = false;
      import("maplibre-gl").then((MapLibreModule) => {
        if (cancelled || !isMountedRef.current) return;
        const maplibregl =
          (MapLibreModule as { default?: MapLibreModuleLike }).default ??
          (MapLibreModule as unknown as MapLibreModuleLike);
        const mapInstance = mapRef.current;
        if (!mapInstance) return;

        markersRef.current.forEach((m) => m.remove?.());
        markersRef.current = [];

        let shouldFitBounds = false;
        const currentPolylineStr = JSON.stringify(polyline || []);
        if (currentPolylineStr !== lastPolylineStrRef.current) {
          shouldFitBounds = true;
          lastPolylineStrRef.current = currentPolylineStr;
        }

        const source = mapInstance.getSource("route-src");
        if (Array.isArray(polyline) && polyline.length >= 2) {
          const pts = polyline.map((p) => [p.longitude, p.latitude]);
          source?.setData?.({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: pts,
            },
            properties: {},
          });
          if (mapInstance.getLayer("route-main")) {
            mapInstance.setPaintProperty(
              "route-main",
              "line-color",
              polylineColor,
            );
          }
          if (mapInstance.getLayer("route-outline")) {
            mapInstance.setPaintProperty(
              "route-outline",
              "line-color",
              `${polylineColor}33`,
            );
          }

          if (shouldFitBounds) {
            try {
              const bounds = pts.reduce(
                (acc, [lng, lat]) => {
                  acc.minLng = Math.min(acc.minLng, lng);
                  acc.maxLng = Math.max(acc.maxLng, lng);
                  acc.minLat = Math.min(acc.minLat, lat);
                  acc.maxLat = Math.max(acc.maxLat, lat);
                  return acc;
                },
                {
                  minLng: Infinity,
                  maxLng: -Infinity,
                  minLat: Infinity,
                  maxLat: -Infinity,
                },
              );
              mapInstance.fitBounds(
                [
                  [bounds.minLng, bounds.minLat],
                  [bounds.maxLng, bounds.maxLat],
                ],
                { padding: 24, duration: lowPower ? 0 : 450 },
              );
            } catch (e) {
              console.warn("[LeafletMap.web] Error fitting bounds:", e);
            }
          }
        } else if (
          center &&
          typeof center.latitude === "number" &&
          shouldFitBounds
        ) {
          source?.setData?.({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [],
            },
            properties: {},
          });
          try {
            mapInstance.easeTo({
              center: [center.longitude, center.latitude],
              zoom,
              duration: lowPower ? 0 : 400,
            });
          } catch (e) {
            console.warn("[LeafletMap.web] Error setting view:", e);
          }
        }

        const currentMarkers = Array.isArray(markers) ? markers : [];
        for (const m of currentMarkers) {
          if (!m || !m.coordinate) continue;
          const lat = m.coordinate.latitude;
          const lng = m.coordinate.longitude;
          const color = m.color || "#10b981";
          const el = document.createElement("div");
          el.style.width = "12px";
          el.style.height = "12px";
          el.style.borderRadius = "12px";
          el.style.background = color;
          el.style.border = "2px solid #ffffff";
          el.style.boxShadow = "0 4px 12px rgba(0,0,0,0.35)";
          const marker = new maplibregl.Marker({
            element: el,
            anchor: "center",
          })
            .setLngLat([lng, lat])
            .addTo(mapInstance);
          if (m.label) {
            marker.setPopup(
              new maplibregl.Popup({ closeButton: false }).setText(
                String(m.label),
              ),
            );
          }
          markersRef.current.push(marker);
        }

        mapInstance.resize();
      });
      return () => {
        cancelled = true;
      };
    }, [center, zoom, markers, polyline, polylineColor, lowPower]);

    React.useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom = 15) => {
        mapRef.current?.easeTo({
          center: [currentCenter.longitude, currentCenter.latitude],
          zoom: currentZoom,
          duration: lowPower ? 0 : 450,
        });
      },
    }));

    return (
      <View style={style}>
        <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
      </View>
    );
  },
);

export function leafletPolylineFromLatLng(
  points: LeafletLatLng[],
): [number, number][] {
  return points.map((c) => [c.latitude, c.longitude]);
}
