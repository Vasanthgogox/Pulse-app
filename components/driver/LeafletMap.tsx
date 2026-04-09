import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";

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

function toLeafletPoint(c: LeafletLatLng): [number, number] {
  return [c.latitude, c.longitude];
}

function buildHtml(initial: {
  center: LeafletLatLng;
  zoom: number;
  markers: LeafletMarker[];
  polyline: LeafletLatLng[];
  polylineColor: string;
  lowPower: boolean;
}) {
  const payload = {
    center: initial.center,
    zoom: initial.zoom,
    markers: initial.markers,
    polyline: initial.polyline,
    polylineColor: initial.polylineColor,
    lowPower: initial.lowPower,
  };

  // Note: This uses Leaflet via CDN (debug fallback). If you need offline or locked-down networks,
  // bundle Leaflet assets locally and load them from app assets instead.
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <style>
      html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #0b1220; }
      .leaflet-control-attribution { display: none; }
    </style>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const INITIAL = ${JSON.stringify(payload)};
      const map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        inertia: !INITIAL.lowPower,
        zoomAnimation: !INITIAL.lowPower,
        fadeAnimation: !INITIAL.lowPower,
        markerZoomAnimation: !INITIAL.lowPower,
      }).setView([INITIAL.center.latitude, INITIAL.center.longitude], INITIAL.zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

      const markerLayer = L.layerGroup().addTo(map);
      let routeLine = null;

      function clearLayer() {
        markerLayer.clearLayers();
        if (routeLine) {
          map.removeLayer(routeLine);
          routeLine = null;
        }
      }

      let lastPolylineStr = '';

      function renderState(state) {
        if (!state) return;
        clearLayer();

        let shouldFitBounds = false;
        const currentPolylineStr = JSON.stringify(state.polyline || []);
        if (currentPolylineStr !== lastPolylineStr) {
          shouldFitBounds = true;
          lastPolylineStr = currentPolylineStr;
        }

        if (Array.isArray(state.polyline) && state.polyline.length >= 2) {
          const pts = state.polyline.map(p => [p.latitude, p.longitude]);
          routeLine = L.polyline(pts, { color: state.polylineColor || '#3b82f6', weight: 4, opacity: 0.9 }).addTo(map);
          if (shouldFitBounds) {
            try { map.fitBounds(routeLine.getBounds(), { padding: [24, 24] }); } catch {}
          }
        } else if (state.center && typeof state.center.latitude === 'number' && shouldFitBounds) {
          try { map.setView([state.center.latitude, state.center.longitude], state.zoom || 15); } catch {}
        }

        const markers = Array.isArray(state.markers) ? state.markers : [];
        for (const m of markers) {
          if (!m || !m.coordinate) continue;
          const lat = m.coordinate.latitude, lng = m.coordinate.longitude;
          const color = m.color || '#10b981';
          const icon = L.divIcon({
            className: '',
            html: '<div style="width:12px;height:12px;border-radius:12px;background:'+color+';border:2px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.35)"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });
          const marker = L.marker([lat, lng], { icon }).addTo(markerLayer);
          if (m.label) marker.bindTooltip(String(m.label), { permanent: false, direction: 'top' });
        }
      }

      renderState(INITIAL);

      function post(type, data) {
        try {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...data }));
        } catch {}
      }

      post('ready', {});

      function onMessage(e) {
        try {
          const msg = JSON.parse(e.data);
          if (msg && msg.type === 'state') {
            renderState(msg.state);
          } else if (msg && msg.type === 'focus') {
            if (msg.center && typeof msg.center.latitude === 'number') {
              try { map.setView([msg.center.latitude, msg.center.longitude], msg.zoom || 15); } catch {}
            }
          }
        } catch {}
      }

      document.addEventListener('message', onMessage);
      window.addEventListener('message', onMessage);
    </script>
  </body>
</html>`;
}

export type LeafletMapRef = {
  focusCurrentLocation: (center: LeafletLatLng, zoom?: number) => void;
};

export const LeafletMap = React.forwardRef<LeafletMapRef, LeafletMapProps>(({
  style,
  center,
  zoom = 15,
  markers = [],
  polyline = [],
  polylineColor = '#3b82f6',
  lowPower = false,
}, ref) => {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  React.useImperativeHandle(ref, () => ({
    focusCurrentLocation: (currentCenter, currentZoom = 15) => {
      webRef.current?.postMessage(JSON.stringify({ type: "focus", center: currentCenter, zoom: currentZoom }));
    }
  }));

  const html = useMemo(() => buildHtml({ center, zoom, markers, polyline, polylineColor, lowPower }), []);

  const statePayload = useMemo(
    () => ({ center, zoom, markers, polyline, polylineColor, lowPower }),
    [center, zoom, markers, polyline, polylineColor, lowPower],
  );

  useEffect(() => {
    if (!ready) return;
    webRef.current?.postMessage(JSON.stringify({ type: "state", state: statePayload }));
  }, [ready, statePayload]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg?.type === "ready") setReady(true);
    } catch {
      // ignore
    }
  };

  return (
    <View style={style}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        mixedContentMode={Platform.OS === "android" ? "always" : "never"}
        onError={(e) => {
          // eslint-disable-next-line no-console
          console.warn("[LeafletMap] WebView error:", e.nativeEvent);
        }}
        onHttpError={(e) => {
          // eslint-disable-next-line no-console
          console.warn("[LeafletMap] WebView HTTP error:", e.nativeEvent);
        }}
        // Avoid white flash on Android
        style={{ backgroundColor: "transparent" }}
        // iOS/Android defaults are fine for this debug fallback.
      />
    </View>
  );
});

export function leafletPolylineFromLatLng(points: LeafletLatLng[]): [number, number][] {
  return points.map(toLeafletPoint);
}
