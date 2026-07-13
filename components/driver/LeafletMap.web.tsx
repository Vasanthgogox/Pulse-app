import Theme from "@/constants/Theme";
import { LeafletMapZoomControls } from "@/components/driver/LeafletMapZoomControls";
import {
  createRouteDistanceLabelElement,
  createTripMapMarkerElement,
  tripMapMarkerRoleFromId,
} from "@/lib/mapMarkerIcons.util";
import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import type {
  LeafletLatLng,
  LeafletMapProps,
  LeafletMapRef,
  LeafletPolylineLayer,
} from "./LeafletMap.types";

export type { LeafletLatLng, LeafletMapRef, LeafletMarker } from "./LeafletMap.types";

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
  off?: (event: string, cb: () => void) => void;
  isStyleLoaded?: () => boolean;
  addSource: (id: string, source: unknown) => void;
  getSource: (id: string) => MapLibreSourceLike | undefined;
  addLayer: (layer: unknown) => void;
  getLayer: (id: string) => unknown;
  setPaintProperty: (
    layerId: string,
    name: string,
    value: string | number | number[],
  ) => void;
  removeLayer?: (id: string) => void;
  removeSource?: (id: string) => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    options?: { padding?: number; duration?: number },
  ) => void;
  easeTo: (options: {
    center: [number, number];
    zoom: number;
    duration?: number;
  }) => void;
  getZoom?: () => number;
  getCenter?: () => { lng: number; lat: number };
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

function resolvePolylineLayers(
  polylines: LeafletPolylineLayer[] | undefined,
  polyline: LeafletLatLng[],
  polylineColor: string,
): LeafletPolylineLayer[] {
  if (polylines?.length) {
    return polylines.filter((layer) => layer.coordinates?.length >= 2);
  }
  if (polyline.length >= 2) {
    return [
      {
        id: "main",
        coordinates: polyline,
        color: polylineColor,
      },
    ];
  }
  return [];
}

function isMapStyleReady(map: MapLibreMapLike | null | undefined): boolean {
  if (!map) return false;
  if (typeof map.isStyleLoaded === "function") {
    return map.isStyleLoaded();
  }
  return false;
}

function upsertRouteLayer(
  map: MapLibreMapLike,
  layer: LeafletPolylineLayer,
): void {
  if (!isMapStyleReady(map)) return;

  try {
  const sourceId = `route-src-${layer.id}`;
  const outlineId = `route-outline-${layer.id}`;
  const mainId = `route-main-${layer.id}`;
  const color = layer.color ?? Theme.driverPrimary;
  const mainWidth = layer.width ?? 5;
  const glowWidth = layer.glowWidth ?? mainWidth + 5;
  const pts = layer.coordinates.map((p) => [p.longitude, p.latitude]);

  const source = map.getSource(sourceId);
  const data: GeoJsonLine = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: pts },
    properties: {},
  };
  if (source?.setData) {
    source.setData(data);
  } else {
    map.addSource(sourceId, { type: "geojson", data });
  }

  if (!map.getLayer(outlineId)) {
    map.addLayer({
      id: outlineId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": `${color}40`,
        "line-width": glowWidth,
        "line-blur": layer.dashed ? 0 : 1.5,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
  } else {
    map.setPaintProperty(outlineId, "line-color", `${color}40`);
    map.setPaintProperty(outlineId, "line-width", glowWidth);
  }

  if (!map.getLayer(mainId)) {
    map.addLayer({
      id: mainId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": color,
        "line-width": mainWidth,
        ...(layer.dashed ? { "line-dasharray": [2, 2.5] } : {}),
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
  } else {
    map.setPaintProperty(mainId, "line-color", color);
    map.setPaintProperty(mainId, "line-width", mainWidth);
    if (layer.dashed) {
      map.setPaintProperty(mainId, "line-dasharray", [2, 2.5]);
    } else {
      map.setPaintProperty(mainId, "line-dasharray", [1, 0]);
    }
  }
  } catch (e) {
    console.warn("[LeafletMap.web] upsertRouteLayer:", e);
  }
}

function removeRouteLayer(map: MapLibreMapLike, layerId: string): void {
  if (!isMapStyleReady(map)) return;

  const outlineId = `route-outline-${layerId}`;
  const mainId = `route-main-${layerId}`;
  const sourceId = `route-src-${layerId}`;
  try {
    if (map.getLayer(mainId)) map.removeLayer?.(mainId);
    if (map.getLayer(outlineId)) map.removeLayer?.(outlineId);
    if (map.getSource(sourceId)) map.removeSource?.(sourceId);
  } catch {
    /* map may be tearing down */
  }
}

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

function applyMapInteractionLock(map: unknown, locked: boolean): void {
  if (!map) return;
  const m = map as Record<
    string,
    { disable?: () => void; enable?: () => void } | undefined
  >;
  const names = [
    "dragPan",
    "scrollZoom",
    "boxZoom",
    "keyboard",
    "doubleClickZoom",
    "touchZoomRotate",
  ];
  try {
    names.forEach((key) => {
      const h = m[key];
      if (!h || typeof h.disable !== "function") return;
      if (locked) h.disable();
      else if (typeof h.enable === "function") h.enable();
    });
  } catch {
    /* noop */
  }
}

export const LeafletMap = React.forwardRef<LeafletMapRef, LeafletMapProps>(
  (
    {
      style,
      center,
      zoom = 15,
      markers = [],
      polylines,
      routeLabels = [],
      polyline = [],
      polylineColor = "#3b82f6",
      maxBounds,
      lowPower = false,
      interactionLocked = false,
      showZoomControls = true,
    },
    ref,
  ) => {
    const mapRef = useRef<MapLibreMapLike | null>(null);
    const zoomLevelRef = useRef(zoom);
    zoomLevelRef.current = zoom;
    const interactionLockedRef = useRef(interactionLocked);
    interactionLockedRef.current = interactionLocked;
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const markersRef = useRef<MapLibreMarkerLike[]>([]);
    const routeLayerIdsRef = useRef<string[]>([]);
    const lastPolylineStrRef = useRef<string>("");
    const mapStyleLoadedRef = useRef(false);
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

          const handleMapLoad = () => {
            mapStyleLoadedRef.current = true;
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
            applyMapInteractionLock(map, interactionLockedRef.current);
          };

          if (isMapStyleReady(map)) {
            handleMapLoad();
          } else {
            map.on("load", handleMapLoad);
          }
        });
      };

      mountMap();

      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
        isMountedRef.current = false;
        mapStyleLoadedRef.current = false;
        if (mapRef.current) {
          markersRef.current.forEach((m) => m.remove?.());
          markersRef.current = [];
          mapRef.current.remove?.();
          mapRef.current = null;
        }
      };
    }, []);

    useEffect(() => {
      applyMapInteractionLock(mapRef.current, interactionLocked);
    }, [interactionLocked]);

    useEffect(() => {
      if (!mapRef.current || typeof window === "undefined") {
        return;
      }

      let cancelled = false;
      let loadListener: (() => void) | null = null;

      const syncMapOverlays = (maplibregl: MapLibreModuleLike) => {
        if (cancelled || !isMountedRef.current) return;
        const mapInstance = mapRef.current;
        if (!mapInstance || !isMapStyleReady(mapInstance)) return;

        try {
          markersRef.current.forEach((m) => m.remove?.());
          markersRef.current = [];

          let shouldFitBounds = false;
          const activeLayers = resolvePolylineLayers(polylines, polyline, polylineColor);
          const currentPolylineStr = JSON.stringify(activeLayers);
          if (currentPolylineStr !== lastPolylineStrRef.current) {
            shouldFitBounds = true;
            lastPolylineStrRef.current = currentPolylineStr;
          }

          const activeIds = activeLayers.map((layer) => layer.id);
          for (const staleId of routeLayerIdsRef.current) {
            if (!activeIds.includes(staleId)) {
              removeRouteLayer(mapInstance, staleId);
            }
          }
          routeLayerIdsRef.current = activeIds;

          // India bounding box — fallback view when no route or markers
          const INDIA_BOUNDS: [[number, number], [number, number]] = [
            [68.1, 6.7],
            [97.4, 37.1],
          ];

          const allRoutePts: number[][] = [];
          for (const layer of activeLayers) {
            upsertRouteLayer(mapInstance, layer);
            layer.coordinates.forEach((p) => {
              allRoutePts.push([p.longitude, p.latitude]);
            });
          }

          if (shouldFitBounds) {
            try {
              if (allRoutePts.length >= 2) {
                const bounds = allRoutePts.reduce(
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
              } else {
                const currentMarkersForBounds = Array.isArray(markers)
                  ? markers.filter((m) => m?.coordinate)
                  : [];
                if (currentMarkersForBounds.length >= 2) {
                  const mBounds = currentMarkersForBounds.reduce(
                    (acc, m) => {
                      acc.minLng = Math.min(acc.minLng, m.coordinate.longitude);
                      acc.maxLng = Math.max(acc.maxLng, m.coordinate.longitude);
                      acc.minLat = Math.min(acc.minLat, m.coordinate.latitude);
                      acc.maxLat = Math.max(acc.maxLat, m.coordinate.latitude);
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
                      [mBounds.minLng, mBounds.minLat],
                      [mBounds.maxLng, mBounds.maxLat],
                    ],
                    { padding: 100, duration: lowPower ? 0 : 600 },
                  );
                } else if (currentMarkersForBounds.length === 1) {
                  const m = currentMarkersForBounds[0];
                  mapInstance.easeTo({
                    center: [m.coordinate.longitude, m.coordinate.latitude],
                    zoom: 8,
                    duration: lowPower ? 0 : 500,
                  });
                } else {
                  mapInstance.fitBounds(INDIA_BOUNDS, {
                    padding: 40,
                    duration: lowPower ? 0 : 600,
                  });
                }
              }
            } catch (e) {
              console.warn("[LeafletMap.web] Error fitting bounds:", e);
            }
          }

          const currentMarkers = Array.isArray(markers) ? markers : [];
          for (const m of currentMarkers) {
            if (!m || !m.coordinate) continue;
            const lat = m.coordinate.latitude;
            const lng = m.coordinate.longitude;
            const color = m.color || Theme.driverEmerald;
            const role = tripMapMarkerRoleFromId(m.id);
            const el = createTripMapMarkerElement(role, m.label, color, {
              avatarUri: m.avatarUri,
              avatarSeed: m.avatarSeed,
              isOnline: m.isOnline,
              highlighted: m.highlighted,
            });
            if (m.onPress) {
              el.style.cursor = "pointer";
              el.style.pointerEvents = "auto";
              el.setAttribute("role", "button");
              el.setAttribute(
                "aria-label",
                m.label?.trim() || (role === "driver" ? "View location" : "Map marker"),
              );
              el.addEventListener("click", (event) => {
                event.stopPropagation();
                m.onPress?.();
              });
            }
            const anchor =
              role === "origin" || role === "destination" || role === "driver"
                ? "bottom"
                : "center";

            const marker = new maplibregl.Marker({
              element: el,
              anchor,
            })
              .setLngLat([lng, lat])
              .addTo(mapInstance);
            markersRef.current.push(marker);
          }

          for (const label of routeLabels ?? []) {
            if (!label?.coordinate || !label.text?.trim()) continue;
            const el = createRouteDistanceLabelElement(label.text);
            const labelMarker = new maplibregl.Marker({
              element: el,
              anchor: "center",
            })
              .setLngLat([label.coordinate.longitude, label.coordinate.latitude])
              .addTo(mapInstance);
            markersRef.current.push(labelMarker);
          }

          mapInstance.resize();
        } catch (e) {
          console.warn("[LeafletMap.web] Error syncing overlays:", e);
        }
      };

      const mapInstance = mapRef.current;
      const scheduleSync = (maplibregl: MapLibreModuleLike) => {
        if (isMapStyleReady(mapInstance)) {
          syncMapOverlays(maplibregl);
          return;
        }
        loadListener = () => {
          mapStyleLoadedRef.current = true;
          syncMapOverlays(maplibregl);
        };
        mapInstance.on("load", loadListener);
      };

      import("maplibre-gl").then((MapLibreModule) => {
        if (cancelled || !isMountedRef.current) return;
        const maplibregl =
          ((MapLibreModule as unknown) as { default?: MapLibreModuleLike }).default ??
          (MapLibreModule as unknown as MapLibreModuleLike);
        scheduleSync(maplibregl);
      });

      return () => {
        cancelled = true;
        if (loadListener && mapRef.current?.off) {
          mapRef.current.off("load", loadListener);
        }
      };
    }, [center, zoom, markers, polylines, routeLabels, polyline, polylineColor, maxBounds, lowPower]);

    const adjustZoom = useCallback(
      (delta: number) => {
        const map = mapRef.current;
        if (!map || interactionLockedRef.current) return;
        const current =
          typeof map.getZoom === "function" ? map.getZoom() : zoomLevelRef.current;
        const next = Math.max(3, Math.min(19, current + delta));
        zoomLevelRef.current = next;
        const mapCenter = map.getCenter?.();
        const lng = mapCenter?.lng ?? center.longitude;
        const lat = mapCenter?.lat ?? center.latitude;
        try {
          map.easeTo({
            center: [lng, lat],
            zoom: next,
            duration: lowPower ? 0 : 280,
          });
        } catch {
          // Map may not be ready
        }
      },
      [center.latitude, center.longitude, lowPower],
    );

    React.useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom = 15) => {
        const boundedCenter = clampToBounds(currentCenter, maxBounds);
        zoomLevelRef.current = currentZoom;
        mapRef.current?.easeTo({
          center: [boundedCenter.longitude, boundedCenter.latitude],
          zoom: currentZoom,
          duration: lowPower ? 0 : 450,
        });
      },
      fitBounds: (ne, sw, paddingPx = 80) => {
        if (!mapRef.current) return;
        try {
          mapRef.current.fitBounds(
            [
              [Math.min(sw.longitude, ne.longitude), Math.min(sw.latitude, ne.latitude)],
              [Math.max(sw.longitude, ne.longitude), Math.max(sw.latitude, ne.latitude)],
            ],
            { padding: paddingPx, duration: lowPower ? 0 : 600 },
          );
        } catch {
          // Map may not be ready
        }
      },
      zoomIn: () => adjustZoom(1),
      zoomOut: () => adjustZoom(-1),
    }));

    const showZoom = showZoomControls && !interactionLocked;

    return (
      <View style={[style, styles.mapHost]}>
        <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
        {showZoom ? (
          <LeafletMapZoomControls
            onZoomIn={() => adjustZoom(1)}
            onZoomOut={() => adjustZoom(-1)}
          />
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  mapHost: {
    overflow: "hidden",
  },
});

export function leafletPolylineFromLatLng(
  points: LeafletLatLng[],
): [number, number][] {
  return points.map((c) => [c.latitude, c.longitude]);
}
