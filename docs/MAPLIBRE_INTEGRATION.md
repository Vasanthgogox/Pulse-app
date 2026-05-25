# MapLibre Integration Notes

This project now uses MapLibre as the map rendering layer while preserving existing trip workflows and UI wiring.

## What changed

- Mobile map implementation now routes through `@maplibre/maplibre-react-native`.
- Web map implementation for the driver map wrapper now uses `maplibre-gl`.
- Existing calling code keeps the same interfaces:
  - `@/lib/reactNativeMapsCompat`
  - `@/components/driver/LeafletMap`

## Integration points

- Mobile adapter:
  - `lib/mapLibreCompat.native.tsx`
  - `lib/reactNativeMapsCompat.native.ts`
- Web adapter:
  - `components/driver/LeafletMap.web.tsx`
- Cross-platform wrapper:
  - `components/driver/LeafletMap.tsx`

## Why this is safe

- Trip assignment, OTP claim, live tracking logic, and service calls are unchanged.
- Existing screen-level map calls (fit, camera animate, markers, polylines) stay on the same component APIs.
- No backend API contracts or trip data structures were modified.

## Setup / build steps

1. Install dependencies (already added in this change):
   - `@maplibre/maplibre-react-native`
   - `maplibre-gl`
2. Rebuild native apps after dependency changes:
   - Android: `npm run android`
   - iOS: `npm run ios`
3. For web:
   - run `npm run web`
   - if cached bundles are stale, restart the dev server once.

## Notes

- Current style URL is `https://demotiles.maplibre.org/style.json`.
- If you need branded tiles/styles later, replace style source only in adapter files; screen logic can remain unchanged.

## Location labels (tracking UI)

Coordinates are for maps/routing only. Human-readable addresses use **`docs/FRONTEND_MAP_RENDERING_ARCHITECTURE.md`** and `@/lib/mapLocationLabel.service` (Mapbox → Nominatim reverse geocode).
