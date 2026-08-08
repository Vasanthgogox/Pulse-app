/**
 * Expo Go cannot reliably render react-native-maps tiles on some iPhones.
 * Use a WebView + Leaflet OSM basemap (same tile network path that works on web).
 */
import { isExpoGo } from "@/lib/expoGoMaps";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type {
  LeafletLatLng,
  LeafletMapProps,
  LeafletMapRef,
  LeafletPolylineLayer,
} from "./LeafletMap.types";

function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildHtml(payload: {
  center: LeafletLatLng;
  zoom: number;
  markers: LeafletMapProps["markers"];
  polylines: LeafletPolylineLayer[];
  polylineColor: string;
}): string {
  const boot = escapeJsonForScript(payload);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { margin:0; padding:0; width:100%; height:100%; background:#e2e8f0; }
    .leaflet-control-attribution { font-size:9px !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const boot = ${boot};
    const map = L.map('map', { zoomControl: false, attributionControl: true })
      .setView([boot.center.latitude, boot.center.longitude], boot.zoom || 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OSM &copy; CARTO'
    }).addTo(map);

    const markerLayer = L.layerGroup().addTo(map);
    const lineLayer = L.layerGroup().addTo(map);

    function paint(data) {
      markerLayer.clearLayers();
      lineLayer.clearLayers();
      (data.polylines || []).forEach((layer) => {
        const latlngs = (layer.coordinates || []).map((c) => [c.latitude, c.longitude]);
        if (latlngs.length < 2) return;
        L.polyline(latlngs, {
          color: layer.color || data.polylineColor || '#059669',
          weight: layer.width || 5,
          opacity: 0.9,
        }).addTo(lineLayer);
      });
      (data.markers || []).forEach((m) => {
        if (!m || !m.coordinate) return;
        const color = m.color || '#059669';
        const circle = L.circleMarker([m.coordinate.latitude, m.coordinate.longitude], {
          radius: m.id === 'you' || m.id === 'driver' ? 8 : 7,
          color: '#fff',
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
        });
        if (m.label) circle.bindTooltip(String(m.label), { permanent: false, direction: 'top' });
        circle.addTo(markerLayer);
      });
    }

    paint(boot);
    setTimeout(() => map.invalidateSize(), 80);
    setTimeout(() => map.invalidateSize(), 320);

    window.__pulseMap = {
      focus: (lat, lng, zoom) => {
        map.setView([lat, lng], zoom != null ? zoom : map.getZoom(), { animate: true });
      },
      zoomBy: (delta) => {
        map.setZoom(Math.max(3, Math.min(18, map.getZoom() + delta)), { animate: true });
      },
      fit: (neLat, neLng, swLat, swLng, pad) => {
        map.fitBounds([[swLat, swLng], [neLat, neLng]], { padding: [pad || 48, pad || 48], maxZoom: 14, animate: true });
      },
      paint: (data) => paint(data),
      resize: () => map.invalidateSize(),
    };

    document.addEventListener('message', onMsg);
    window.addEventListener('message', onMsg);
    function onMsg(event) {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!msg || !window.__pulseMap) return;
        if (msg.type === 'focus') window.__pulseMap.focus(msg.lat, msg.lng, msg.zoom);
        if (msg.type === 'zoomBy') window.__pulseMap.zoomBy(msg.delta || 0);
        if (msg.type === 'fit') window.__pulseMap.fit(msg.neLat, msg.neLng, msg.swLat, msg.swLng, msg.pad);
        if (msg.type === 'paint') window.__pulseMap.paint(msg.data);
        if (msg.type === 'resize') window.__pulseMap.resize();
      } catch (e) {}
    }
  </script>
</body>
</html>`;
}

export const ExpoGoWebLeafletMap = forwardRef<LeafletMapRef, LeafletMapProps>(
  function ExpoGoWebLeafletMap(
    {
      style,
      center,
      zoom = 12,
      markers = [],
      polylines,
      polyline = [],
      polylineColor = "#059669",
    },
    ref,
  ) {
    const webRef = useRef<WebView>(null);

    const layers: LeafletPolylineLayer[] = useMemo(() => {
      if (polylines?.length) return polylines.filter((l) => (l.coordinates?.length ?? 0) >= 2);
      if (polyline.length >= 2) {
        return [{ id: "main", coordinates: polyline, color: polylineColor }];
      }
      return [];
    }, [polylines, polyline, polylineColor]);

    const html = useMemo(
      () =>
        buildHtml({
          center,
          zoom,
          markers,
          polylines: layers,
          polylineColor,
        }),
      // Initial document only — updates go through postMessage paint.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const run = (js: string) => {
      webRef.current?.injectJavaScript(`${js}; true;`);
    };

    useEffect(() => {
      run(
        `window.__pulseMap && window.__pulseMap.paint(${escapeJsonForScript({
          markers,
          polylines: layers,
          polylineColor,
        })})`,
      );
    }, [markers, layers, polylineColor]);

    useEffect(() => {
      run(`window.__pulseMap && window.__pulseMap.resize()`);
    }, [style]);

    useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom) => {
        run(
          `window.__pulseMap && window.__pulseMap.focus(${currentCenter.latitude},${currentCenter.longitude},${
            currentZoom ?? "null"
          })`,
        );
      },
      setMarkerCoordinate: () => {
        // Full paint covers marker moves on the next markers prop sync.
      },
      fitBounds: (ne, sw, paddingPx = 80) => {
        run(
          `window.__pulseMap && window.__pulseMap.fit(${ne.latitude},${ne.longitude},${sw.latitude},${sw.longitude},${paddingPx})`,
        );
      },
      zoomIn: () => run(`window.__pulseMap && window.__pulseMap.zoomBy(1)`),
      zoomOut: () => run(`window.__pulseMap && window.__pulseMap.zoomBy(-1)`),
    }));

    const onMessage = (_event: WebViewMessageEvent) => {
      // Reserved for future map → RN events.
    };

    return (
      <View style={[style, styles.host]}>
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html }}
          style={StyleSheet.absoluteFill}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          onLoadEnd={() => {
            run(`window.__pulseMap && window.__pulseMap.resize()`);
            run(
              `window.__pulseMap && window.__pulseMap.paint(${escapeJsonForScript({
                markers,
                polylines: layers,
                polylineColor,
              })})`,
            );
          }}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  host: {
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
  },
});

export function shouldUseExpoGoWebMap(): boolean {
  return isExpoGo();
}
