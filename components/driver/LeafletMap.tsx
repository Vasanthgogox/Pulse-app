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

    // Load EXACTLY ONE implementation — each crashes at import time in the
    // other environment, so neither may be required speculatively:
    //  - MapLibre in Expo Go   → native MLRNCameraModule missing, throws on import
    //  - rnmaps in standalone  → react-native-maps is undefined (GX-PULSE-J)
    // Requiring MapLibre before this branch is what broke the driver Dashboard
    // in Expo Go, so the environment check must come first.
    const NativeImpl: NativeLeafletCtor | undefined = isExpoGo()
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- MapLibre must not load in Expo Go
        require("@/components/driver/LeafletMap.rnmaps").LeafletMapRnMaps
      : // eslint-disable-next-line @typescript-eslint/no-require-imports -- rnmaps must not load in standalone builds
        require("@/components/driver/LeafletMap.maplibre").LeafletMapMapLibre;

    // A missing export must not take down the whole driver app with it — the
    // map is a preview, so render nothing rather than throwing.
    if (!NativeImpl) return null;

    return <NativeImpl ref={nativeRef} {...props} />;
  },
);

export function leafletPolylineFromLatLng(
  points: LeafletLatLng[],
): [number, number][] {
  return points.map((p) => [p.latitude, p.longitude]);
}
