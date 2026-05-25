# Tracking realtime subsystem (production)

Isolated subsystem for driver GPS, dispatcher fleet map, and trip live map. **Does not** use org-wide WAL subscriptions or `postgres_changes` for live movement.

## Non-negotiables

| Rule | Rationale |
|------|-----------|
| Live movement = **Supabase Broadcast only** | Avoid WAL fanout at 2k drivers |
| Persistence = **sparse checkpoints** | DB health; not every GPS fix |
| `driver_presence` UPSERT | Latest state without append-only spam |
| GPS **not** in React/Zustand per fix | MapLibre `source.setData` + RAF interpolation |
| No bootstrap GPS payloads | Bootstrap stays org/trips/finance caps |
| Tracking **decoupled** from chat | Chat rate-limit trigger stays on legacy `driver_locations` during migration |

## Channel namespace

```
tracking:trip:{tripId}     — trip detail / live modal subscribers
tracking:org:{orgId}:fleet — dispatcher fleet map (viewport-filtered client-side)
```

Broadcast events (typed in `features/tracking/types/broadcast.types.ts`):

- `position` — live movement (throttled publisher)
- `session_started` / `session_ended` — trip tracking lifecycle
- `checkpoint` — sparse DB checkpoint committed (optional UI refresh)
- `reseed` — reconnect snapshot hint (client should call seed RPC)

## Folder structure

```
features/tracking/
  constants.ts
  trackingFeatureFlags.ts
  types/
    broadcast.types.ts
    db.types.ts
  session/
    trackingMovementFilter.ts
    DriverTrackingSessionManager.ts
  broadcast/
    trackingBroadcastChannels.ts
    publishTrackingBroadcast.ts
    TrackingBroadcastSubscriptionManager.ts
  map/
    MarkerInterpolationEngine.ts
    TripTrackingMapStore.ts
    TripTrackingMapManager.ts
    FleetMapStore.ts
    FleetMapManager.ts
  hooks/
    useTrackingTripBroadcast.ts
    useDriverTrackingPublisher.ts
  services/
    trackingCheckpoint.service.ts
  index.ts

lib/
  mapLocationLabel.service.ts      # reverse geocode (checkpoints only)
  trackingLocation.constants.ts    # UI fetch caps
  mapMarkerIcons.util.ts

supabase/migrations/
  *_tracking_realtime_subsystem.sql

supabase/functions/tracking-checkpoint/
  index.ts                         # rate-limited validation (optional path)
```

## Data model

| Table | Role |
|-------|------|
| `driver_presence` | Latest lat/lng per driver (UPSERT) |
| `trip_location_checkpoints` | Sparse history (partitioned by `recorded_at`) |
| `trip_tracking_sessions` | Active session per driver/trip |
| `geofence_events` | Pickup/drop geofence (geocode on insert only) |

Legacy `driver_locations` remains during migration; new RPC can dual-write at checkpoint cadence only.

## Driver app lifecycle

1. Trip becomes active → `DriverTrackingSessionManager.start(tripId)`
2. Adaptive GPS loop (existing `useAdaptiveTripLocationPingLoop`) calls `onLocationFix` every read → **map only** (no React trip store)
3. On checkpoint cadence → `tracking_record_checkpoint` RPC + broadcast `position` (movement filter **50m OR 30s**)
4. Trip terminal → `stop()` + `session_ended` broadcast

## Dispatcher / trip detail

1. Mount → `useTrackingTripBroadcast` subscribes `tracking:trip:{id}`
2. Initial seed → existing `getTripLocationHistory` (capped) + latest RPC
3. Live updates → broadcast handler updates `TripTrackingMapStore` + minimal React snapshot for labels only
4. Reconnect → `reseed` event or visibility resume → re-fetch seed (no postgres_changes)

## Map rendering

See `docs/FRONTEND_MAP_RENDERING_ARCHITECTURE.md`.

- `TripTrackingMapManager` owns GeoJSON source + truck marker element
- `MarkerInterpolationEngine` RAF between last/target
- Stale: grey marker if no `position` for `STALE_MS`
- Fleet: `FleetMapManager` + clustering hook point (phase 2)

## Reverse geocode

- **Only** checkpoints, geofence rows, trip start/end, manual map tap
- `EXPO_PUBLIC_MAPBOX_TOKEN` primary; Nominatim fallback
- Rounded coord cache in `mapLocationLabel.service.ts`

## Feature flags

```bash
EXPO_PUBLIC_MAPBOX_TOKEN=...
EXPO_PUBLIC_TRACKING_BROADCAST_V1=1   # use broadcast for live movement (trip detail)
```

## Migration from current code

| Current | Target |
|---------|--------|
| `useRealtimeDriverLocations` (postgres_changes) | `useTrackingTripBroadcast` when flag on |
| Every adaptive ping → `driver_locations` INSERT | Checkpoint RPC + optional dual-write |
| `setDriverLocation` on each WAL event | Broadcast → store; React label refresh debounced |
| TripMap React props for truck | `TripTrackingMapManager.applyPosition` |

Rollout: flag off in prod until Realtime broadcast policies verified → enable per org → remove postgres_changes subscriber.

## Performance targets

- 2,000 active drivers, ~0.2–1 Hz broadcast per moving driver (after filter)
- &lt;30 checkpoint rows / trip / day typical
- &lt;6 Realtime channels per client (existing registry budget)

## Related

- `docs/FRONTEND_MAP_RENDERING_ARCHITECTURE.md`
- `docs/MAPLIBRE_INTEGRATION.md`
- `lib/globalSync/` — bootstrap; **no GPS** in bootstrap payload
