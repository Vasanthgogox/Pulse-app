import type { StyleProp, ViewStyle } from "react-native";

export type LeafletLatLng = { latitude: number; longitude: number };

export type LeafletMarker = {
  id: string;
  coordinate: LeafletLatLng;
  label?: string;
  color?: string;
};

export type LeafletMapProps = {
  style?: StyleProp<ViewStyle>;
  center: LeafletLatLng;
  zoom?: number;
  markers?: LeafletMarker[];
  polyline?: LeafletLatLng[];
  polylineColor?: string;
  /** Optional hard viewport constraint (used for India-focused tracking). */
  maxBounds?: {
    southWest: LeafletLatLng;
    northEast: LeafletLatLng;
  };
  /** Prefer compact tiles and lower motion for low-end devices. */
  lowPower?: boolean;
  /** When true, disable drag/zoom so the viewport stays locked while driver-tracking. */
  interactionLocked?: boolean;
};

export type LeafletMapRef = {
  focusCurrentLocation: (center: LeafletLatLng, zoom?: number) => void;
  fitBounds: (ne: LeafletLatLng, sw: LeafletLatLng, paddingPx?: number) => void;
};
