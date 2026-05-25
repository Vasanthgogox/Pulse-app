# Frontend map rendering architecture

Maps and tracking UI split **coordinates** (rendering/routing) from **place labels** (human-readable copy). Raw latitude/longitude must not appear in user-facing text.

## Layers

| Layer | Responsibility | Examples |
|-------|----------------|----------|
| **1. Coordinates** | Map camera, markers, polylines, routing, DB pings | `TrackingMapBlock`, `TripMap`, `getOptimalRoute` |
| **2. Location labels** | Reverse geocode via HTTP APIs + cache | `@/lib/mapLocationLabel.service` |
| **3. Presentation** | Cards, timelines, modals — labels only | `VehicleTrackingCard`, journey log, location log |

## Label service (`mapLocationLabel.service.ts`)

- **Primary:** Mapbox Geocoding reverse (`EXPO_PUBLIC_MAPBOX_TOKEN`)
- **Fallback:** Nominatim reverse (1 req/s cooldown, India-biased)
- **Native optional:** `expo-location` reverse geocode when API keys are missing (see `reverseGeocodePlace.util.ts`)
- **Cache:** In-memory TTL (~10 min), keyed by rounded lat/lon + mode
- **Modes:** `full` (street + city + state), `city` (city + state only)

```ts
import { resolveMapLocationLabel } from '@/lib/mapLocationLabel.service';

const label = await resolveMapLocationLabel(lat, lon, { mode: 'city' });
```

For React screens:

```ts
import { useMapLocationLabel } from '@/lib/hooks/useMapLocationLabel';

const { label, loading } = useMapLocationLabel(driverLocation?.latitude, driverLocation?.longitude);
```

## Rules for new UI

1. Pass coordinates only to map/routing components.
2. Resolve labels through `resolveMapLocationLabel` or `useMapLocationLabel`.
3. While loading, show `"Resolving location…"` or `"Current location"` — never `12.9716, 77.5946`.
4. Batch trail pings with `resolveMapLocationLabelsBatch` (throttled) — see `useTripDetail`.

## DB health (tracking)

- Fetch cap: `TRIP_TRACKING_HISTORY_FETCH_LIMIT` (30) on `getTripLocationHistory`
- Manifest log display: `MANIFEST_PULSE_PING_DISPLAY_MAX` (8 newest pings)
- Geocode batch: `TRACKING_LOCATION_GEOCODE_MAX` (10) per trip load

Constants live in `lib/trackingLocation.constants.ts` (same spirit as global bootstrap caps in `lib/globalSync/registryFeed.constants.ts`).

## Realtime movement (broadcast)

Live GPS does **not** update React state per fix on map surfaces. See `docs/architecture/TRACKING_REALTIME_SUBSYSTEM.md` and `TripTrackingMapStore` / `TripTrackingMapManager`.

Enable: `EXPO_PUBLIC_TRACKING_BROADCAST_V1=1`

## Related docs

- Realtime tracking: `docs/architecture/TRACKING_REALTIME_SUBSYSTEM.md`
- Map engine: `docs/MAPLIBRE_INTEGRATION.md`
- Forward place search: `lib/placesService.ts`
- Driver HUD labels: `lib/reverseGeocodePlace.util.ts` (wraps label service)
- Shared marker HTML: `lib/mapMarkerIcons.util.ts`
