import Theme from "@/constants/Theme";
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
  maxBounds?: {
    southWest: LeafletLatLng;
    northEast: LeafletLatLng;
  };
  lowPower?: boolean;
};

export type LeafletMapRef = {
  focusCurrentLocation: (center: LeafletLatLng, zoom?: number) => void;
};

// Inline OSM raster style avoids external style/sprite/glyph failures on web.
const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm-base",
      type: "raster",
      source: "osm",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
} as const;

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
    style: string | Record<string, unknown>;
    center: [number, number];
    zoom: number;
    dragRotate: boolean;
    pitchWithRotate: boolean;
    attributionControl: boolean;
    maxBounds?: [[number, number], [number, number]];
  }) => MapLibreMapLike;
  Marker: new (options: {
    element: HTMLDivElement;
    anchor: string;
  }) => MapLibreMarkerLike;
  Popup: new (options: { closeButton: boolean }) => {
    setText: (text: string) => unknown;
  };
};

function clampToBounds(
  point: LeafletLatLng,
  bounds?: { southWest: LeafletLatLng; northEast: LeafletLatLng },
): LeafletLatLng {
  if (!bounds) return point;
  return {
    latitude: Math.max(bounds.southWest.latitude, Math.min(bounds.northEast.latitude, point.latitude)),
    longitude: Math.max(bounds.southWest.longitude, Math.min(bounds.northEast.longitude, point.longitude)),
  };
}

export const LeafletMap = React.forwardRef<LeafletMapRef, LeafletMapProps>(
  (
    {
      style,
      center,
      zoom = 15,
      markers = [],
      polyline = [],
      polylineColor = "#3b82f6",
      maxBounds,
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
      if (typeof window === "undefined" || mapRef.current) {
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
      let rafId = 0;

      const mountMap = () => {
        if (cancelled || !isMountedRef.current || mapRef.current) return;
        if (!mapContainerRef.current) {
          rafId = requestAnimationFrame(mountMap);
          return;
        }

        import("maplibre-gl").then((MapLibreModule) => {
          if (cancelled || !isMountedRef.current || !mapContainerRef.current || mapRef.current)
            return;
          const maplibregl =
            ((MapLibreModule as unknown) as { default?: MapLibreModuleLike }).default ??
            (MapLibreModule as unknown as MapLibreModuleLike);

          const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style: MAP_STYLE,
            center: [center.longitude, center.latitude],
            zoom,
            dragRotate: !lowPower,
            pitchWithRotate: !lowPower,
            attributionControl: false,
            maxBounds: maxBounds
              ? [
                  [maxBounds.southWest.longitude, maxBounds.southWest.latitude],
                  [maxBounds.northEast.longitude, maxBounds.northEast.latitude],
                ]
              : undefined,
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
            try {
              map.resize();
            } catch {
              // ignore
            }
            setTimeout(() => {
              try {
                map.resize();
              } catch {
                // ignore
              }
            }, 120);
          });
        });
      };

      mountMap();

      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
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
          ((MapLibreModule as unknown) as { default?: MapLibreModuleLike }).default ??
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
        // India bounding box — fallback view when no route or markers
        const INDIA_BOUNDS: [[number, number], [number, number]] = [
          [68.1, 6.7],
          [97.4, 37.1],
        ];

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
                { padding: 80, duration: lowPower ? 0 : 600 },
              );
            } catch (e) {
              console.warn("[LeafletMap.web] Error fitting bounds:", e);
            }
          }
        } else {
          source?.setData?.({
            type: "Feature",
            geometry: { type: "LineString", coordinates: [] },
            properties: {},
          });

          const currentMarkersForBounds = Array.isArray(markers) ? markers.filter(m => m?.coordinate) : [];
          if (shouldFitBounds) {
            try {
              if (currentMarkersForBounds.length >= 2) {
                // Fit to all marker positions
                const mBounds = currentMarkersForBounds.reduce(
                  (acc, m) => {
                    acc.minLng = Math.min(acc.minLng, m.coordinate.longitude);
                    acc.maxLng = Math.max(acc.maxLng, m.coordinate.longitude);
                    acc.minLat = Math.min(acc.minLat, m.coordinate.latitude);
                    acc.maxLat = Math.max(acc.maxLat, m.coordinate.latitude);
                    return acc;
                  },
                  { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity },
                );
                mapInstance.fitBounds(
                  [[mBounds.minLng, mBounds.minLat], [mBounds.maxLng, mBounds.maxLat]],
                  { padding: 100, duration: lowPower ? 0 : 600 },
                );
              } else if (currentMarkersForBounds.length === 1) {
                // Single marker: center on it at city zoom
                const m = currentMarkersForBounds[0];
                mapInstance.easeTo({
                  center: [m.coordinate.longitude, m.coordinate.latitude],
                  zoom: 8,
                  duration: lowPower ? 0 : 500,
                });
              } else {
                // No coords: show all of India
                mapInstance.fitBounds(INDIA_BOUNDS, { padding: 40, duration: lowPower ? 0 : 600 });
              }
            } catch (e) {
              console.warn("[LeafletMap.web] Error setting view:", e);
            }
          }
        }

        const currentMarkers = Array.isArray(markers) ? markers : [];
        for (const m of currentMarkers) {
          if (!m || !m.coordinate) continue;
          const lat = m.coordinate.latitude;
          const lng = m.coordinate.longitude;
          const color = m.color || Theme.driverEmerald;

          // Pin-style marker: circle body + label chip
          const el = document.createElement("div");
          el.style.display = "flex";
          el.style.flexDirection = "column";
          el.style.alignItems = "center";
          el.style.gap = "3px";
          el.style.cursor = "pointer";

          const dot = document.createElement("div");
          dot.style.width = "16px";
          dot.style.height = "16px";
          dot.style.borderRadius = "50%";
          dot.style.background = color;
          dot.style.border = "3px solid #ffffff";
          dot.style.boxShadow = "0 2px 8px rgba(0,0,0,0.45)";
          el.appendChild(dot);

          if (m.label) {
            const chip = document.createElement("div");
            chip.textContent = m.label;
            chip.style.background = "#0f141a";
            chip.style.color = "#f1f5f9";
            chip.style.fontSize = "10px";
            chip.style.fontWeight = "700";
            chip.style.padding = "2px 7px";
            chip.style.borderRadius = "4px";
            chip.style.whiteSpace = "nowrap";
            chip.style.boxShadow = "0 1px 4px rgba(0,0,0,0.5)";
            chip.style.letterSpacing = "0.3px";
            el.appendChild(chip);
          }

          const marker = new maplibregl.Marker({
            element: el,
            anchor: "top",
          })
            .setLngLat([lng, lat])
            .addTo(mapInstance);
          markersRef.current.push(marker);
        }

        mapInstance.resize();
      });
      return () => {
        cancelled = true;
      };
    }, [center, zoom, markers, polyline, polylineColor, maxBounds, lowPower]);

    React.useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom = 15) => {
        const boundedCenter = clampToBounds(currentCenter, maxBounds);
        mapRef.current?.easeTo({
          center: [boundedCenter.longitude, boundedCenter.latitude],
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
