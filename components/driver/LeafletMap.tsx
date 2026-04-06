import React, { useEffect, useMemo, useRef } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";

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
  /** Prefer compact tiles and lower motion for low-end devices. */
  lowPower?: boolean;
};

type LeafletModule = typeof import("leaflet");

function ensureLeafletCss() {
  if (typeof document === "undefined") return;
  const id = "leaflet-css";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
}

export function LeafletMap({
  style,
  center,
  zoom = 15,
  markers = [],
  polyline = [],
  lowPower = false,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const routeRef = useRef<import("leaflet").Polyline | null>(null);

  const state = useMemo(
    () => ({ center, zoom, markers, polyline, lowPower }),
    [center, zoom, markers, polyline, lowPower],
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;

    (async () => {
      ensureLeafletCss();
      const L = await import("leaflet");
      if (cancelled) return;
      leafletRef.current = L;

      const el = containerRef.current;
      if (!el) return;

      // Avoid creating multiple map instances on hot reloads.
      if (!mapRef.current) {
        const map = L.map(el, {
          zoomControl: false,
          attributionControl: false,
          inertia: !state.lowPower,
          zoomAnimation: !state.lowPower,
          fadeAnimation: !state.lowPower,
          markerZoomAnimation: !state.lowPower,
        });
        mapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);

        markerLayerRef.current = L.layerGroup().addTo(map);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const L = leafletRef.current;
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    if (!L || !map || !markerLayer) return;

    markerLayer.clearLayers();
    if (routeRef.current) {
      routeRef.current.remove();
      routeRef.current = null;
    }

    if (Array.isArray(state.polyline) && state.polyline.length >= 2) {
      const pts = state.polyline.map((p) => [p.latitude, p.longitude] as [number, number]);
      routeRef.current = L.polyline(pts, { color: "#3b82f6", weight: 4, opacity: 0.9 }).addTo(
        map,
      );
      try {
        map.fitBounds(routeRef.current.getBounds(), { padding: [24, 24] });
      } catch {
        // ignore
      }
    } else {
      try {
        map.setView([state.center.latitude, state.center.longitude], state.zoom);
      } catch {
        // ignore
      }
    }

    for (const m of state.markers) {
      if (!m?.coordinate) continue;
      const lat = m.coordinate.latitude;
      const lng = m.coordinate.longitude;
      const color = m.color || "#10b981";
      const icon = L.divIcon({
        className: "",
        html:
          `<div style="width:12px;height:12px;border-radius:12px;` +
          `background:${color};border:2px solid #ffffff;` +
          `box-shadow:0 4px 12px rgba(0,0,0,0.35)"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const marker = L.marker([lat, lng], { icon }).addTo(markerLayer);
      if (m.label) marker.bindTooltip(String(m.label), { permanent: false, direction: "top" });
    }
  }, [state]);

  return (
    <View style={style}>
      {/* react-native-web renders a div; ref points to HTMLElement */}
      <View
        ref={containerRef as unknown as React.RefObject<any>}
        style={{ width: "100%", height: "100%", minHeight: 160 }}
      />
    </View>
  );
}

