import { isExpoGo } from "@/lib/expoGoMaps";

/** Only one implementation is required at runtime so MapLibre is not loaded in Expo Go. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let impl: any;
if (isExpoGo()) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo Go has no MapLibre native module
  impl = require("@/lib/mapLibreCompat.rnmapsImpl");
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  impl = require("@/lib/mapLibreCompat.maplibreImpl");
}

export const Marker = impl.Marker;
export const Polyline = impl.Polyline;
export const Callout = impl.Callout;
export const PROVIDER_GOOGLE = impl.PROVIDER_GOOGLE;
export type { CompatMapRef } from "@/lib/mapLibreCompat.maplibreImpl";
export default impl.default;
