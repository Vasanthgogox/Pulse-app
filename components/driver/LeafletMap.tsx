import { isExpoGo } from "@/lib/expoGoMaps";
import React, { useImperativeHandle, useRef } from "react";
import { Platform } from "react-native";

import { LeafletMap as LeafletMapWeb } from "./LeafletMap.web";
import type { LeafletLatLng, LeafletMapProps, LeafletMapRef } from "./LeafletMap.types";

export type { LeafletLatLng, LeafletMapRef, LeafletMarker, LeafletPolylineLayer, LeafletRouteLabel } from "./LeafletMap.types";

type NativeLeafletCtor = React.ForwardRefExoticComponent<
  LeafletMapProps & React.RefAttributes<LeafletMapRef>
>;

export const LeafletMap = React.forwardRef<LeafletMapRef, LeafletMapProps>(
  function LeafletMap(props, ref) {
    const webRef = useRef<LeafletMapRef>(null);
    const nativeRef = useRef<LeafletMapRef>(null);

    useImperativeHandle(ref, () => ({
      focusCurrentLocation: (currentCenter, currentZoom) => {
        if (Platform.OS === "web") {
          webRef.current?.focusCurrentLocation(currentCenter, currentZoom);
        } else {
          nativeRef.current?.focusCurrentLocation(currentCenter, currentZoom);
        }
      },
      setMarkerCoordinate: (id, coordinate) => {
        if (Platform.OS === "web") {
          webRef.current?.setMarkerCoordinate(id, coordinate);
        } else {
          nativeRef.current?.setMarkerCoordinate(id, coordinate);
        }
      },
      fitBounds: (ne, sw, paddingPx, maxZoom) => {
        if (Platform.OS === "web") {
          webRef.current?.fitBounds(ne, sw, paddingPx, maxZoom);
        } else {
          nativeRef.current?.fitBounds(ne, sw, paddingPx, maxZoom);
        }
      },
      zoomIn: () => {
        if (Platform.OS === "web") {
          webRef.current?.zoomIn();
        } else {
          nativeRef.current?.zoomIn();
        }
      },
      zoomOut: () => {
        if (Platform.OS === "web") {
          webRef.current?.zoomOut();
        } else {
          nativeRef.current?.zoomOut();
        }
      },
    }));

    if (Platform.OS === "web") {
      return <LeafletMapWeb ref={webRef} {...props} />;
    }

    // Load the MapLibre implementation (standalone builds). Only fall back to
    // the react-native-maps path when actually running in Expo Go — where
    // MapLibre's native module is unavailable. Loading rnmaps in a standalone
    // build resolves react-native-maps to undefined and crashes on render with
    // "Cannot read property 'MapView' of undefined" (GX-PULSE-J).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const MapLibreImpl: NativeLeafletCtor = require("@/components/driver/LeafletMap.maplibre").LeafletMapMapLibre;

    let NativeImpl: NativeLeafletCtor = MapLibreImpl;
    if (isExpoGo()) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- MapLibre must not load in Expo Go
      NativeImpl = require("@/components/driver/LeafletMap.rnmaps").LeafletMapRnMaps ?? MapLibreImpl;
    }

    return <NativeImpl ref={nativeRef} {...props} />;
  },
);

export function leafletPolylineFromLatLng(
  points: LeafletLatLng[],
): [number, number][] {
  return points.map((p) => [p.latitude, p.longitude]);
}
