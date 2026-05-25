# Tracking frontend product fix — implementation spec

**Type:** Product bug fix (not architecture redesign).  
**Root cause summary:** Backend (`driver_presence`, broadcast, sparse checkpoints) exists; UI still reads `driver_locations`, pushes unbounded React trail, and **rebuilds Leaflet map** on every GPS prop change. `TripTrackingMapManager` (MapLibre + RAF) is **not wired** to `TripMap.web`.

---

## 1. Exact frontend files to modify

| Priority | File | Change |
|----------|------|--------|
| P0 | `features/tracking/services/driverPresence.service.ts` | **NEW** — read `driver_presence` by `trip_id` / `driver_id` |
| P0 | `features/tracking/services/tripCheckpoints.service.ts` | **NEW** — `SELECT` last 12 from `trip_location_checkpoints` |
| P0 | `features/trips/utils/tripTrackingStatus.util.ts` | **NEW** — `isTripTrackingActive(status)` |
| P0 | `features/trips/hooks/useTripLiveTracking.ts` | **NEW** — orchestrates presence → store → broadcast → UI snapshot |
| P0 | `features/trips/components/trip-detail/hooks/useTripDetail.ts` | Replace tracking block: stop unbounded trail, stop 60s poll when active, wire hook |
| P0 | `features/trips/components/trip-detail/TripMap.web.tsx` | Imperative truck layer + store subscribe; **remove** `truckLocation` from full map re-init deps |
| P0 | `features/trips/components/trip-detail/TripDetailScreen.tsx` | Pass `tripId`, `trackingEnabled`; show timestamp chip from hook |
| P1 | `features/trips/components/trip-detail/TripMap.tsx` | Accept `tripId` + subscribe store (native map when available) |
| P1 | `features/trips/components/trip-detail/TrackingMapBlock.web.tsx` | Live marker via store, not `tripLocationPoints` prop churn |
| P1 | `features/trips/components/trip-detail/modals/LiveTrackingModal.tsx` | Shared `formatLastSeen` + presence timestamp |
| P1 | `features/trips/components/trip-detail/ManifestDriverPingList.tsx` | Render from 12-checkpoint fetch (read-only), not broadcast append |
| P1 | `lib/trackingLocation.constants.ts` | `TRACKING_CHECKPOINT_TRAIL_LIMIT = 12`, `TRACKING_STALE_MS = 90_000` |
| P1 | `features/tracking/constants.ts` | Align `TRACKING_POSITION_STALE_MS` to 90s (product req) |
| P2 | `features/tracking/map/TripTrackingMapManager.ts` | Export factory used by TripMap.web (Leaflet adapter) |
| P2 | `features/tracking/map/LeafletLiveTruckLayer.ts` | **NEW** — RAF `setLatLng` for Leaflet marker |
| P2 | `features/tracking/hooks/useTrackingTripBroadcast.ts` | Remove `onLivePosition` array pushes; store-only default |
| P2 | `features/trips/components/trip-detail/sections/TripStatusTimeline.tsx` | Manifest step uses checkpoint list + last seen |

**Do not change (preserve):** `publishTrackingBroadcast.ts`, `tracking_record_checkpoint` RPC, `DriverTrackingSessionManager`, broadcast channel names.

---

## 2. Data flow diagram (text)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TRIP DETAIL MOUNT                                │
│  isTripTrackingActive(trip.status)? ──no──► no subscribe, static map    │
│         │ yes                                                            │
│         ▼                                                                │
│  1) driverPresence.service.getForTrip(tripId, driverId)                  │
│         │ recorded_at, lat/lng ──► TripTrackingMapStore.applySeed()      │
│         │                      └──► trackingUiSnapshot (React: 1 row)    │
│         ▼                                                                │
│  2) tripCheckpoints.service.getLast12(tripId)  [ON DEMAND, once/reseed] │
│         │ 12 points ──► trailGeoJson ref (imperative / props freeze)     │
│         │           └──► ManifestDriverPingList (read-only)              │
│         ▼                                                                │
│  3) useTrackingTripBroadcast (if BROADCAST_V1)                           │
│         │ position event ──► TripTrackingMapStore.applyBroadcast()       │
│         │                └──► trackingUiSnapshot.recordedAt only         │
│         │ reseed ──► repeat (1) + (2)  [no postgres_changes]           │
│         ▼                                                                │
│  4) TripMap.web / LeafletLiveTruckLayer                                  │
│         store.subscribe ──► RAF interpolate ──► marker.setLatLng()       │
│         stale if now - recordedAt > 90s                                  │
└─────────────────────────────────────────────────────────────────────────┘

FORBIDDEN PATHS (remove):
  broadcast → setTripLocationPoints([...prev, x])
  broadcast → resolveMapLocationLabel
  60s poll → append history
  truckLocation prop change → initializeMap() full rebuild
```

---

## 3. Map pin movement — implementation strategy

### Problem today

`TripMap.web.tsx` `useEffect` depends on `truckLocation?.latitude/longitude` → calls `initializeMap()` → **destroys and recreates** map + truck marker (no smooth move).

`TripTrackingMapManager` + `MarkerInterpolationEngine` exist but are unused by trip detail.

### Fix (web — Leaflet, production path)

1. **One-time** `initializeMap()` for route polyline, source/dest pins, **static** trail from 12 checkpoints (GeoJSON or circle markers).
2. **Live truck:** `LeafletLiveTruckLayer.attach(map, tripId)`:
   - Subscribes `getTripTrackingMapStore(tripId)`
   - Keeps single `L.Marker` ref
   - `MarkerInterpolationEngine` → `marker.setLatLng([lat, lng])` each frame
3. **React props:** pass `tripId` + `trackingEnabled` only — **not** per-tick lat/lng.

### Fix (MapLibre — shared engine)

Reuse `TripTrackingMapManager` when trip map migrates to MapLibre; same store subscription, `marker.setLngLat` in RAF callback.

### Animation

- Broadcast: interpolate over **800ms** (`MarkerInterpolationEngine` default).
- Presence seed / reseed: **immediate** first pin (`immediate = true`).
- Skip interpolation if distance &lt; 5m (jitter).

---

## 4. Status gating

### Canonical set (normalize `trip.status` to lowercase)

```ts
export const TRIP_TRACKING_ACTIVE_STATUSES = new Set([
  'in_transit',
  'going_to_pickup',
  'moving',
  // DB aliases used today — keep until backend normalizes
  'in_progress',
  'picked_up',
  'transit',
  'on_route',
  'at_pickup',
  'loading',
]);

export const TRIP_TRACKING_STOP_STATUSES = new Set([
  'completed', 'delivered', 'done', 'cancelled', 'cancelled',
  'idle', 'assigned', // assigned = not moving yet unless going_to_pickup
]);
```

### Rules

| Gate | Behavior |
|------|----------|
| `isTripTrackingActive(status) && !trip.completed_at` | Enable presence fetch, broadcast subscribe, live layer |
| Otherwise | Teardown channels, `store.clear()`, hide live truck, trail = historical 12 only |
| `tripCompleted` (existing) | Same as stop — keep `isTripCompleted()` as hard off |

### Enforcement points

- `useTripLiveTracking.ts` — `enabled` computed once from status
- `useTripDetail.ts` — pass `trackingBroadcastEnabled = flag && isTripTrackingActive(...)`
- Driver app — already uses `ACTIVE_MOVEMENT_STATUSES_FOR_PING`; align naming in shared util (optional re-export)

---

## 5. Twelve-ping checkpoint fetch (on-demand only)

### Source

`trip_location_checkpoints` — not `driver_locations` history.

### API (no new RPC required)

```ts
// tripCheckpoints.service.ts
.from('trip_location_checkpoints')
.select('latitude, longitude, recorded_at, id')
.eq('trip_id', tripId)
.order('recorded_at', { ascending: false })
.limit(12)
```

### When to fetch

| Event | Fetch? |
|-------|--------|
| Trip detail mount + tracking active | Yes, once |
| Broadcast `reseed` / channel reconnect | Yes, debounced 2s |
| Each broadcast position | **No** |
| 60s poll | **Remove** for tracking-active trips |

### UI usage

- **Trail polyline:** 12 points reversed chronological (oldest → newest).
- **Manifest ping list:** same array, geocode **once per checkpoint id** (cache by id).
- **Never** `setState` append on broadcast.

### Optional backend (Phase 0 hardening, not blocking)

`get_trip_tracking_seed(trip_id, 12)` — only if client SELECT too slow; prefer direct SELECT first.

---

## 6. Timestamp + location UI

### Single source for “last updated”

Priority:

1. `driver_presence.recorded_at` (presence row for trip/driver)
2. Else `TripTrackingMapStore.latest.recordedAt` (last broadcast)
3. Never “now()” on GPS callback

### React snapshot (minimal)

```ts
type TrackingUiSnapshot = {
  recordedAt: string | null;
  stale: boolean;
  lastSeenSeconds: number; // derived, tick 1s
  locationLabel: string | null; // geocode on checkpoint/presence change only
};
```

### Display

- Trip radar card: `Last seen 42s ago · 19 May, 3:45 PM IST`
- Truck popup: `formatLastSeen(seconds)` + absolute time
- Manifest pings: per-checkpoint `recorded_at` formatted (no raw lat/lon)

### Shared util

Move `formatLocationUpdatedAt` from `LiveTrackingModal.tsx` → `features/trips/utils/formatTrackingTimestamp.util.ts` + add `formatLastSeenSeconds(seconds)`.

### Geocode rule

- Geocode **presence seed** + **12 checkpoints** on fetch complete.
- **Do not** geocode on broadcast (only update coords on map).

---

## 7. MapLibre / imperative integration pattern

```ts
// Pattern (already in repo — wire it)
const store = getTripTrackingMapStore(tripId);
const manager = new TripTrackingMapManager(tripId, () => ({ map, maplibregl }));

useEffect(() => {
  if (!trackingEnabled) return;
  manager.attach();
  return () => manager.detach();
}, [tripId, trackingEnabled]);

// Leaflet equivalent
const liveLayer = new LeafletLiveTruckLayer(tripId, () => mapInstanceRef.current);
```

**Store is source of truth for marker position.**  
**React only holds `TrackingUiSnapshot` for labels/timestamps.**

---

## 8. Performance safety constraints

| Constraint | Enforcement |
|------------|-------------|
| No React array growth per GPS | ESLint/grep; `appendTrailPoint` max 12 for display copy only |
| No geocode in broadcast handler | CI script (Phase 0 PR-8) |
| No full map re-init on live move | `truckLocation` removed from `initializeMap` deps |
| One marker per driver/trip | Single marker ref in live layer |
| Stale &gt; 90s | `TRACKING_STALE_MS = 90_000`; grey opacity 0.55 |
| Channel budget | Subscribe only if `trackingEnabled` |
| Reseed | Single-flight 2s debounce (existing) |
| Memory | Store = 1 point; trail = frozen 12 array until reseed |

---

## 9. Migration notes

| Area | Note |
|------|------|
| Backend | **No change required** if client reads `driver_presence` + `trip_location_checkpoints` via RLS. |
| Optional RPC | `get_trip_tracking_seed` from hardening plan — performance only. |
| Feature flags | Keep `EXPO_PUBLIC_TRACKING_BROADCAST_V1`; tracking UI fixes apply even when flag off (presence + checkpoints still improve map). |
| Legacy `driver_locations` | Fallback read **only** if presence null AND checkpoints empty (one-time seed), then stop polling. |
| `TRACKING_POSITION_STALE_MS` | Change 5m → 90s in constants (product alignment). |
| Native | `TripMap.tsx` placeholder — P2; web first. |

---

## Suggested PR slice (product fix, 3 PRs)

1. **PR-A:** Services + status util + `useTripLiveTracking` + `useTripDetail` wiring (no map yet)  
2. **PR-B:** `TripMap.web` live layer + timestamp UI  
3. **PR-C:** TrackingMapBlock + Manifest + LiveTrackingModal parity  

Each PR: flags unchanged, rollback = revert PR.
