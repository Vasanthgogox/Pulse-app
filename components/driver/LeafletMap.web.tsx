// components/driver/LeafletMap.web.tsx
import React, { useEffect, useRef } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import "leaflet/dist/leaflet.css";

// Declare L as any global for now to avoid TS errors before dynamic import
declare const L: any;

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
    ref
  ) => {
    const mapRef = useRef<any>(null); // Use any for Leaflet.Map
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const markerLayerRef = useRef<any>(null); // Use any for L.LayerGroup
    const routeLineRef = useRef<any>(null); // Use any for L.Polyline
    const lastPolylineStrRef = useRef<string>("");

    // Initialize map once on mount
    useEffect(() => {
      if (typeof window === "undefined" || !mapContainerRef.current || mapRef.current) {
        return;
      }

      // Dynamically import Leaflet only in the browser
      import("leaflet").then((LModule) => {
        const L = LModule.default;

        // Fix for default marker icon in Webpack (Leaflet's default icons don't play well with Webpack)
        // @ts-ignore
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        });

        const map = L.map(mapContainerRef.current!, {
          zoomControl: false,
          attributionControl: false,
          inertia: !lowPower,
          zoomAnimation: !lowPower,
          fadeAnimation: !lowPower,
          markerZoomAnimation: !lowPower,
        }).setView([center.latitude, center.longitude], zoom);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);

        mapRef.current = map;
        markerLayerRef.current = L.layerGroup().addTo(map);
      });

      return () => {
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      };
    }, []); // Empty dependency array ensures this runs only once on mount

    // Update map state when relevant props change
    useEffect(() => {
      if (!mapRef.current || typeof window === "undefined") {
        return;
      }

      import("leaflet").then((LModule) => {
        const L = LModule.default;
        const mapInstance = mapRef.current;

        // Clear existing layers
        markerLayerRef.current?.clearLayers();
        if (routeLineRef.current) {
          mapInstance.removeLayer(routeLineRef.current);
          routeLineRef.current = null;
        }

        let shouldFitBounds = false;
        const currentPolylineStr = JSON.stringify(polyline || []);
        if (currentPolylineStr !== lastPolylineStrRef.current) {
          shouldFitBounds = true;
          lastPolylineStrRef.current = currentPolylineStr;
        }

        // Render polyline
        if (Array.isArray(polyline) && polyline.length >= 2) {
          const pts = polyline.map((p) => [p.latitude, p.longitude]);
          routeLineRef.current = L.polyline(pts as L.LatLngExpression[], {
            color: polylineColor,
            weight: 4,
            opacity: 0.9,
          }).addTo(mapInstance);
          if (shouldFitBounds) {
            try {
              mapInstance.fitBounds(routeLineRef.current.getBounds(), { padding: [24, 24] });
            } catch (e) {
              console.warn("[LeafletMap.web] Error fitting bounds:", e);
            }
          }
        } else if (center && typeof center.latitude === "number" && shouldFitBounds) {
          try {
            mapInstance.setView([center.latitude, center.longitude], zoom);
          } catch (e) {
            console.warn("[LeafletMap.web] Error setting view:", e);
          }
        }

        // Render markers
        const currentMarkers = Array.isArray(markers) ? markers : [];
        for (const m of currentMarkers) {
          if (!m || !m.coordinate) continue;
          const lat = m.coordinate.latitude;
          const lng = m.coordinate.longitude;
          const color = m.color || "#10b981";
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:12px;height:12px;border-radius:12px;background:${color};border:2px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.35)"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          });
          const marker = L.marker([lat, lng], { icon }).addTo(
            markerLayerRef.current!
          );
          if (m.label) {
            marker.bindTooltip(String(m.label), {
              permanent: false,
              direction: "top",
            });
          }
        }
      });
    }, [center, zoom, markers, polyline, polylineColor, lowPower]);

    React.useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom = 15) => {
        mapRef.current?.setView(
          [currentCenter.latitude, currentCenter.longitude],
          currentZoom
        );
      },
    }));

    return (
      <View style={style}>
        <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
      </View>
    );
  }
);

export function leafletPolylineFromLatLng(
  points: LeafletLatLng[]
):
  [number, number][] {
  return points.map((c) => [c.latitude, c.longitude]);
}
