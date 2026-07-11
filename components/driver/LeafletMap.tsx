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
      focusCurrentLocation: (currentCenter, currentZoom = 15) => {
        if (Platform.OS === "web") {
          webRef.current?.focusCurrentLocation(currentCenter, currentZoom);
        } else {
          nativeRef.current?.focusCurrentLocation(currentCenter, currentZoom);
        }
      },
      fitBounds: (ne, sw, paddingPx) => {
        if (Platform.OS === "web") {
          webRef.current?.fitBounds(ne, sw, paddingPx);
        } else {
          nativeRef.current?.fitBounds(ne, sw, paddingPx);
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

    let NativeImpl: NativeLeafletCtor;
    if (isExpoGo()) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- MapLibre must not load in Expo Go
      NativeImpl = require("@/components/driver/LeafletMap.rnmaps").LeafletMapRnMaps;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      NativeImpl = require("@/components/driver/LeafletMap.maplibre").LeafletMapMapLibre;
    }

    return <NativeImpl ref={nativeRef} {...props} />;
  },
);

export function leafletPolylineFromLatLng(
  points: LeafletLatLng[],
): [number, number][] {
  return points.map((p) => [p.latitude, p.longitude]);
}
