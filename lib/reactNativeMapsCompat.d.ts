declare module '@/lib/reactNativeMapsCompat' {
  import type React from "react";
  import type { ViewProps } from "react-native";
  type Coordinate = { latitude: number; longitude: number };
  type Region = Coordinate & { latitudeDelta?: number; longitudeDelta?: number };
  type EdgePadding = { top?: number; right?: number; bottom?: number; left?: number };
  type FitOptions = { edgePadding?: EdgePadding; animated?: boolean };
  type CameraOptions = { duration?: number };
  type Camera = { center?: Coordinate; heading?: number; pitch?: number; zoom?: number };
  export interface MapViewRef {
    fitToCoordinates: (coords: Coordinate[], options?: FitOptions) => void;
    animateCamera: (camera: Camera, options?: CameraOptions) => void;
    animateToRegion: (region: Region, duration?: number) => void;
  }
  export const Callout: React.ComponentType<unknown>;
  export const Marker: React.ComponentType<unknown>;
  export const Polyline: React.ComponentType<unknown>;
  export const PROVIDER_GOOGLE: string;
  const MapView: React.ForwardRefExoticComponent<ViewProps & Record<string, unknown>>;
  export default MapView;
}

declare module "*/lib/reactNativeMapsCompat" {
  import type React from "react";
  import type { ViewProps } from "react-native";
  type Coordinate = { latitude: number; longitude: number };
  type Region = Coordinate & { latitudeDelta?: number; longitudeDelta?: number };
  type EdgePadding = { top?: number; right?: number; bottom?: number; left?: number };
  type FitOptions = { edgePadding?: EdgePadding; animated?: boolean };
  type CameraOptions = { duration?: number };
  type Camera = { center?: Coordinate; heading?: number; pitch?: number; zoom?: number };
  export interface MapViewRef {
    fitToCoordinates: (coords: Coordinate[], options?: FitOptions) => void;
    animateCamera: (camera: Camera, options?: CameraOptions) => void;
    animateToRegion: (region: Region, duration?: number) => void;
  }
  export const Callout: React.ComponentType<unknown>;
  export const Marker: React.ComponentType<unknown>;
  export const Polyline: React.ComponentType<unknown>;
  export const PROVIDER_GOOGLE: string;
  const MapView: React.ForwardRefExoticComponent<ViewProps & Record<string, unknown>>;
  export default MapView;
}
