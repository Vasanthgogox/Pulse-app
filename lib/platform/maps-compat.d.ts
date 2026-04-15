declare module '@/lib/platform/maps-compat' {
  import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
  export { Callout, Marker, Polyline, PROVIDER_GOOGLE };
  export default MapView;
}

declare module '*/lib/platform/maps-compat' {
  import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
  export { Callout, Marker, Polyline, PROVIDER_GOOGLE };
  export default MapView;
}
