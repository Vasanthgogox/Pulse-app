# Phase 0 — Tracking subsystem hardening execution plan

**Goal:** Move from architecture-complete (4.5/10) → operationally safe staged rollout (8/10).

**Non-goals:** Architecture redesign, fleet map v1, full MapLibre imperative migration (Phase 2).

**Reference audit:** Production readiness review (2026-05-19 conversation).

---

## 1. Critical fix execution order

| Step | Workstream | Blocks if skipped |
|------|------------|-------------------|
| **P0-1** | RPC + RLS hardening migration | All DB cutover unsafe |
| **P0-2** | Feature flags split (subscribe / publish / RPC / fleet) | Cannot roll back granularly |
| **P0-3** | React memory + geocode containment | Prod web OOM / Mapbox bill on day 1 |
| **P0-4** | Disable redundant poll + WAL subscriber when broadcast on | False “WAL eliminated” claim |
| **P0-5** | Fleet publish gated off | Org-wide fanout incident when fleet UI ships |
| **P0-6** | Channel registry + sign-out teardown | WS leak past channel cap 20 |
| **P0-7** | Write-path consolidation (dual-write → RPC-primary) | DB/WAL unchanged |
| **P0-8** | Driver displacement aligned with server gate | INSERT flood continues |
| **P0-9** | Observability hooks + dashboards | Blind rollout |
| **P0-10** | Staged rollout + rollback drill | No production safety |

### Per-step rationale

**P0-1 first** — Without `tracking_record_checkpoint` validating `trip_id` + assignment + org, any write cutover is a security and data-integrity incident. Nothing else reduces real DB load safely.

**P0-2 second** — Flags must exist before changing behavior so every step is revertible without redeploying unrelated code.

**P0-3 third** — Can ship before DB cutover; immediate user-visible stability (8h trip). Protects against memory/geocode regression independent of broadcast.

**P0-4 fourth** — Low risk, proves dispatcher path clean while driver still on legacy INSERT.

**P0-5 fifth** — One-line fleet publish gate prevents latent Critical fanout.

**P0-6 sixth** — Tracking channels must respect global teardown before scaling concurrent users.

**P0-7 seventh** — Dual-write only after RPC is correct and metrics exist.

**P0-8 eighth** — Client `minDisplacementM` must match server 50m/30s or dual-write still floods.

**P0-9 ninth** — Instrument before canary, not after.

**P0-10 last** — Human process + kill switches validated in staging.

---

## 2. File-level implementation plan

### P0-1 — RPC authorization (migration)

| File | Action |
|------|--------|
| `supabase/migrations/20260802130000_tracking_realtime_subsystem.sql` | **New** `20260802140000_tracking_rpc_hardening.sql`: assignment check, org match, `can_access_trip_location(trip_id)` for reads; fix `p_session_id` → `text` or create session row in RPC |
| `supabase/migrations/*_geofence_rls.sql` (new) | Policies for `geofence_events` OR revoke GRANT until Phase 2 |

**Add logic:** Verify driver assigned to `p_trip_id`, `p_org_id` matches trip org, trip status allows tracking.

**Flags:** None (server always on).

**Migration risk:** Low if additive only; test RPC on staging before client calls.

---

### P0-2 — Feature flags

| File | Action |
|------|--------|
| `features/tracking/trackingFeatureFlags.ts` | Add `isTrackingPublishV1Enabled`, `isTrackingRpcCheckpointEnabled`, `isTrackingFleetPublishEnabled` |
| `.env.example` | Document all four flags |
| `app.config.js` | Pass through env if required for Expo |

**Default:** All `0` in production until stage gates pass.

---

### P0-3 — React + geocode containment

| File | Action |
|------|--------|
| `lib/trackingLocation.constants.ts` | Add `REACT_TRAIL_RING_BUFFER_MAX = 32`, `GEOCODE_DEBOUNCE_MS = 2000` |
| `features/trips/utils/tripLocationTrailBuffer.util.ts` | **New** `appendTrailPoint(prev, point, max)` dedupe by `recorded_at` |
| `features/trips/components/trip-detail/hooks/useTripDetail.ts` | **Remove** unbounded `setTripLocationPoints` append on broadcast; use ring buffer; separate `latestDriverLocation` vs `trailForDisplay` |
| `features/trips/components/trip-detail/hooks/useTripDetail.ts` | **Change** geocode effect: depend on `latestCheckpointKey` not full array; batch only last `TRACKING_LOCATION_GEOCODE_MAX` |
| `features/trips/components/trip-detail/hooks/useTripDetail.ts` | **Debounce** `driverLocation` → `driverLocationAddress` geocode (2s) |
| `features/trips/components/trip-detail/ManifestDriverPingList.tsx` | Read from bounded `locationTrailWithNames` only |

**Flags:** `EXPO_PUBLIC_TRACKING_BROADCAST_V1` (subscribe path).

---

### P0-4 — Dispatcher realtime regression elimination

| File | Action |
|------|--------|
| `features/trips/components/trip-detail/hooks/useTripDetail.ts` | When `trackingBroadcastEnabled`: skip 60s `setInterval` poll OR poll latest-only without history extend |
| `features/trips/hooks/useRealtimeTrips.ts` | No change if tripId null already disables WAL |
| `features/tracking/hooks/useTrackingTripBroadcast.ts` | Add `onReseed` single-flight guard (`reseedInFlightRef`) |

---

### P0-5 — Fleet publish isolation

| File | Action |
|------|--------|
| `features/tracking/broadcast/publishTrackingBroadcast.ts` | Wrap fleet `send` in `isTrackingFleetPublishEnabled()` — **default false** |
| `features/tracking/session/DriverTrackingSessionManager.ts` | No fleet side effect until flag on |

---

### P0-6 — Channel lifecycle

| File | Action |
|------|--------|
| `features/tracking/broadcast/trackingChannelRegistry.ts` | **New** ref-count + register with `lib/realtimeRegistry` pattern OR extend registry with `subscribeTrackingChannel` |
| `features/tracking/broadcast/publishTrackingBroadcast.ts` | Use registry factory; teardown on `clearAllRealtimeChannels` |
| `features/tracking/broadcast/TrackingBroadcastSubscriptionManager.ts` | Teardown when `handlers.size === 0` (drop refs-only check) |
| `lib/realtimeRegistry.ts` | Export `registerTrackingChannel` / include in `clearAllRealtimeChannels` |
| `app/_layout.tsx` or auth sign-out | Call `teardownAllTrackingChannels()` on logout |

**Budget:** Max 2 tracking channels per client (trip subscribe + optional publish).

---

### P0-7 — Write-path consolidation

| File | Action |
|------|--------|
| `features/tracking/services/trackingCheckpoint.service.ts` | Already exists — wire as primary when flag on |
| `features/driver/services/driverLocation.service.ts` | Add `reportCheckpointViaRpc()` wrapper |
| `app/(driver)/index.tsx` | Branch `reportLocationToDb`: RPC path vs legacy INSERT |
| `features/driver/hooks/useAdaptiveTripLocationPingLoop.ts` | No change to GPS tick; only persistence callback changes |
| `supabase/migrations/...` | Optional: reduce `driver_locations` trigger work in Phase 0b (read-only compat) |

**Flags:** `EXPO_PUBLIC_TRACKING_RPC_CHECKPOINT=1`, `EXPO_PUBLIC_TRACKING_PUBLISH_V1=1`.

---

### P0-8 — Driver displacement alignment

| File | Action |
|------|--------|
| `app/(driver)/index.tsx` | Set `minDisplacementM: 50` when RPC flag on (match server) |
| `features/tracking/constants.ts` | Export shared `TRACKING_PERSIST_MIN_*` same as broadcast |

**Publish:** Only after successful RPC/checkpoint (not after legacy INSERT unless dual-write).

---

### P0-9 — Observability

| File | Action |
|------|--------|
| `features/tracking/telemetry/trackingMetrics.ts` | **New** counters + dev console + optional Sentry breadcrumbs |
| `lib/realtimeRegistry.ts` | Merge tracking channel count into diagnostics |

---

### P0-10 — Map (minimal Phase 0)

| File | Action |
|------|--------|
| `features/tracking/map/TripTrackingMapStore.ts` | Wire subscribe from `useTrackingTripBroadcast` only (already partial) |
| `features/trips/components/trip-detail/TripMap.web.tsx` | **Phase 0:** optional `useEffect` subscribe store → `setTruckPosition` local ref, not full page state — **defer full TripTrackingMapManager to Phase 1** |

---

## 3. Write-path consolidation plan

### Target end state

```
GPS tick → onLocationFix (map UI only, no DB)
       → adaptive timer
       → movement gate (50m OR 30s)
       → tracking_record_checkpoint RPC
            → driver_presence UPSERT
            → trip_location_checkpoints INSERT (sparse)
            → trips.last_location_at (throttled in RPC patch)
       → optional legacy driver_locations INSERT (compat only)
       → publish position broadcast (TRACKING_PUBLISH_V1, same gate)
```

### Phase 0a — Dual-write (compat, no data loss)

**Duration:** 1–2 weeks staging.

| Path | When |
|------|------|
| RPC checkpoint | `TRACKING_RPC_CHECKPOINT=1` |
| `driver_locations` INSERT | Still on if `TRACKING_RPC_DUAL_WRITE=1` (new flag) OR always for 2 weeks |
| Broadcast | After RPC success (not INSERT success) |

**Validation:** Row counts: `checkpoints / driver_locations` ratio → target ≥0.8 within 2 weeks.

**Rollback:** `TRACKING_RPC_CHECKPOINT=0` → legacy INSERT only.

### Phase 0b — RPC-primary

| Path | When |
|------|------|
| RPC | On |
| `driver_locations` | **Off** for `source IN ('live','background')` OR INSERT only on manual `tap` |
| Read path | `getTripLocationHistory` reads **both** tables UNION (new RPC `get_trip_tracking_seed`) |

**No data loss:** Historical data remains in `driver_locations`; new data in checkpoints; seed RPC returns merged timeline.

### Phase 0c — WAL reduction proof

| Metric | Baseline | Gate |
|--------|----------|------|
| `driver_locations` INSERT/min (active drivers) | X | −50% Phase 0b, −80% Phase 0c |
| Chat location system_log rate | unchanged | Still 30 min (trigger on legacy INSERT only — decouple in Phase 2) |

### Cutover checklist

1. Migration applied + RPC hardened  
2. Seed RPC deployed (`get_trip_tracking_seed(trip_id, limit)`)  
3. Dual-write metrics 7 days green  
4. Disable dual-write flag  
5. Monitor 72h  
6. Enable `TRACKING_BROADCAST_V1` canary orgs  

---

## 4. React + map memory hardening

### Bounded trail state

```ts
// Conceptual — implement in tripLocationTrailBuffer.util.ts
type TrailPoint = { latitude; longitude; recorded_at; locationName?: string | null };
function appendTrailRing(prev: TrailPoint[], next: TrailPoint, max = 32): TrailPoint[]
```

- **Live position:** single `driverLocation` state (1 object).  
- **Manifest / log UI:** max 8 display (`MANIFEST_PULSE_PING_DISPLAY_MAX`).  
- **Map trail:** max 32 for polyline; downsample for render if >100 in DB seed.

### Geocode debounce

| Trigger | Geocode? |
|---------|----------|
| Broadcast position | No — update map coords only |
| New checkpoint `recorded_at` | Yes — one Mapbox call |
| Trail batch | Only uncached indices in last 10 |
| `driverLocation` lat/lon | Debounce 2s leading edge |

### Reconnect reseed

- `reseedInFlightRef` — ignore duplicate within 5s  
- Seed fetch: latest + last 30 checkpoints via **one RPC**, not `getTripLocationHistory` + full geocode  
- Do not extend React array on reseed — replace ring from server

### 8+ hour trip

- Memory O(32) trail in React regardless of hours  
- Map polyline: use store or downsampled seed, not per-broadcast React append  

### Rerender storm prevention

- `useMemo` for manifest pings from bounded trail  
- `React.memo` on `TripMap` wrapper with stable callback refs  
- Broadcast → update store first; `setDriverLocation` max 1 per 30s  

---

## 5. Realtime channel hardening

### Lifecycle

1. **Subscribe:** `trackingChannelRegistry.acquire(tripId)` → ref++  
2. **Publish:** `acquirePublish(tripId)` only while `DriverTrackingSessionManager.active`  
3. **Release:** ref-- → at 0 `removeChannel` within 5s grace (match `realtimeRegistry`)  
4. **Sign-out:** `clearAllTrackingChannels()` in auth logout  
5. **Foreground:** `pruneStaleTrackingChannels()` on AppState active  

### Duplicate subscription prevention

- Single `useTrackingTripBroadcast` per trip screen (already one hook)  
- Handler object stable via refs inside hook (already)  
- Fix teardown: `handlers.size === 0` sufficient  

### Budget

| Channel type | Max |
|--------------|-----|
| Trip tracking subscribe | 1 |
| Trip tracking publish (driver) | 1 |
| Fleet | 0 until Phase 2 flag |

### Monitoring

- `getTrackingChannelDiagnostics()` → `{ tripPublish, tripSubscribe, fleet }`  
- Alert if `activeSupabaseChannels > 25` per session sample  

---

## 6. Security hardening

### RPC `tracking_record_checkpoint`

```sql
-- Required checks (add in hardening migration)
-- 1. auth.uid() → drivers.id = p_driver_id
-- 2. trip exists, trip.organization_id = p_org_id (or party access)
-- 3. driver assigned: trips.driver_id = p_driver_id OR assignment audit
-- 4. trip status IN trackable statuses
-- 5. rate limit: same 50m/30s (existing)
```

### Dispatcher subscribe (Phase 0 minimum)

- Document: security = trip UUID secrecy + anon key (interim)  
- **Phase 1:** Supabase Realtime private channel + RLS on `realtime.messages`  
- **Interim:** Server-side `reseed` only via authenticated RPC; broadcast payload has no PII beyond coords  

### Driver publish spoofing

- Broadcast alone is not authoritative for billing  
- UI treats broadcast as display-only until checkpoint RPC confirms  
- Phase 1: signed payload via Edge issuing short-lived `tracking_publish_token` per session  

### Org isolation

- RPC checks org on trip row  
- `driver_presence` SELECT already org-scoped  
- Fleet subscribe deferred  

---

## 7. Observability implementation

### Metrics (client sample + server)

| Metric | Source |
|--------|--------|
| `tracking.driver_locations.insert.count` | DB / Supabase metrics |
| `tracking.checkpoint.insert.count` | DB |
| `tracking.checkpoint_insert_ratio` | checkpoint / (checkpoint + driver_loc) |
| `tracking.broadcast.publish.count` | client counter |
| `tracking.broadcast.receive.count` | client counter |
| `tracking.broadcast.handler_latency_ms` | p50/p95 |
| `tracking.geocode.requests.count` | client |
| `tracking.reseed.count` | client |
| `tracking.trail.react_length` | client gauge (sample) |
| `realtime.channels.active` | registry + tracking |
| `tracking.stale_driver_pct` | no broadcast 5m while trip active |

### Dashboard panels

1. Write path (INSERT vs checkpoint)  
2. Realtime (channels, publish rate)  
3. Client health (geocode 429, trail length)  
4. Rollout (orgs on flag, error rate)  

### Alert thresholds

| Alert | Threshold |
|-------|-----------|
| INSERT rate | >2× 7-day baseline for 1h |
| Geocode 429 | >10/min project-wide |
| Channels/user | >25 sampled |
| Checkpoint ratio | <0.5 for 24h (RPC broken) |
| Reseed | >12/min/trip sustained |

### Rollout KPIs

| Stage | KPI |
|-------|-----|
| Internal | 0 critical alerts 72h; memory flat 8h sim |
| 10% orgs | INSERT −50%; geocode <20/trip/day |
| 100% | INSERT −80%; WAL trip subscriptions −100% |

---

## 8. Safe rollout plan

| Stage | Flags | Audience |
|-------|-------|----------|
| **S0** | All off | Staging only — hardening code deployed |
| **S1** | `RPC_CHECKPOINT=1`, `DUAL_WRITE=1`, `PUBLISH=1` | Internal org |
| **S2** | + `BROADCAST_V1=1` subscribe | Internal dispatchers |
| **S3** | S1–S2 | 10% prod orgs (allowlist) |
| **S4** | `DUAL_WRITE=0` | Same 10% |
| **S5** | All above | 50% → 100% |

### Stop triggers

- Checkpoint ratio < 0.3 for 6h  
- Any Critical security finding  
- Mapbox 429 sustained  
- Memory crash reports on trip detail  
- Realtime connection limit errors spike  

### Rollback

1. Org allowlist → empty  
2. `BROADCAST_V1=0` (restores postgres_changes)  
3. `RPC_CHECKPOINT=0`, `DUAL_WRITE=0` (legacy INSERT)  
4. `clearAllTrackingChannels()`  

No migration rollback required.

---

## 9. Production readiness target

| Score | Requires |
|-------|----------|
| **4.5 → 6** | P0-1–P0-6 complete |
| **6 → 7.5** | P0-7 dual-write + metrics 7 days |
| **7.5 → 8** | RPC-primary + canary 10% 72h green |

### Acceptable debt (Phase 2)

- Full `TripTrackingMapManager` on TripMap.web  
- Fleet map + viewport channels  
- Realtime private channels  
- Chat decoupled from `driver_locations`  
- Monthly checkpoint partitions + retention  

### Must not defer

- RPC auth  
- Bounded React trail  
- Fleet publish off  
- Channel teardown  

---

## 10. Two-week execution focus (summary)

**Week 1:** P0-1 RPC hardening, P0-2 flags, P0-3 React/geocode, P0-5 fleet gate, P0-6 channels, seed RPC.  
**Week 2:** P0-7 dual-write staging, P0-8 displacement, P0-9 dashboards, S1–S2 internal rollout, 8h soak test.

**Biggest implementation risk:** Write-path cutover without seed RPC → UI gaps on history.  
**Hidden regression:** Geocode effect still tied to `tripLocationPoints` length.  
**Highest ROI:** Bounded trail + disable unbounded append (immediate stability).  
**Rollout confidence after Phase 0:** **7/10** for canary; **8/10** after 72h canary metrics.
