# Tracking Phase 0 — GitHub implementation plan

**Audience:** Staff engineers, reviewers, release managers.  
**Goal:** Safe rollout to ~2k drivers — zero DB regression, zero realtime saturation, zero frontend memory leak.  
**Companion:** [`TRACKING_PHASE0_HARDENING_PLAN.md`](./TRACKING_PHASE0_HARDENING_PLAN.md)

**Branch naming:** `tracking/p0-pr-NN-short-name`  
**Base:** `main` (rebase per PR; no stacked merge without prior PR landed)

---

## Merge order (strict)

```
PR-1 → PR-2 → PR-3 → PR-4 → PR-5 → PR-6 → PR-7 → PR-8 → PR-9 → PR-10 → [STAGING SOAK] → PR-11 → [STAGING SOAK] → PR-12
```

| Rule | PRs |
|------|-----|
| **NEVER merge before PR-1** | PR-10, PR-11, PR-12 (any client RPC / write cutover) |
| **NEVER merge before PR-2** | PR-5, PR-10, PR-11 (behavior gated by flags) |
| **NEVER merge before PR-3** | PR-4 (trail util must exist) |
| **NEVER merge before PR-4** | PR-8 CI rules (will fail CI until trail/geocode fixed) |
| **NEVER merge before PR-6** | PR-10 at scale (channel leaks compound with driver publish) |
| **NEVER merge PR-11 before PR-10** | RPC-primary without dual-write validation |
| **NEVER enable prod flags before PR-9** | Observability blind |
| **PR-8 can merge after PR-4+PR-7** | Guards enforce steady state |

**Parallel allowed (same release train, after deps):** PR-5 ∥ PR-6 after PR-2; PR-7 after PR-4.

---

## Danger PRs (staging soak mandatory)

| PR | Soak | Why |
|----|------|-----|
| **PR-1** | 24h staging DB | RPC behavior + RLS; wrong policy blocks drivers or opens writes |
| **PR-10** | 72h internal org | Dual-write changes hot path; INSERT rate must be measured |
| **PR-11** | 72h canary 10% | Disabling `driver_locations` live path — history/ops tooling risk |
| **PR-12** | 48h before 50% rollout | Org allowlist mistakes affect all dispatchers in org |

**Non-danger (prod merge OK with flags OFF):** PR-2, PR-3, PR-4, PR-5, PR-6, PR-7, PR-8, PR-9.

---

## PR summary table

| PR | Title | Risk | Flags default prod |
|----|-------|------|-------------------|
| PR-1 | RPC hardening + seed read RPC | Medium | N/A (server) |
| PR-2 | Tracking feature flags split | Low | All `0` |
| PR-3 | Trail ring buffer util + tests | Low | N/A |
| PR-4 | `useTripDetail` memory + geocode containment | Medium | N/A (always safer) |
| PR-5 | Fleet publish kill gate | Low | `FLEET=0` |
| PR-6 | Tracking channel registry + logout teardown | Medium | N/A |
| PR-7 | Dispatcher poll off + reseed single-flight | Low | `BROADCAST=0` |
| PR-8 | CI / ESLint tracking guards | Low | N/A |
| PR-9 | Tracking telemetry counters | Low | N/A |
| PR-10 | Driver dual-write RPC + broadcast-after-RPC | **High** | `RPC=0`, `DUAL_WRITE=0` |
| PR-11 | RPC-primary (disable live INSERT) + displacement 50m | **High** | `RPC=0` |
| PR-12 | Org allowlist + rollout runbook | Low | allowlist empty |

---

# PR-1 — Database: RPC hardening + seed RPC + geofence RLS

**Branch:** `tracking/p0-pr-01-rpc-hardening`

### Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260802140000_tracking_rpc_hardening.sql` | **NEW** |
| `supabase/migrations/20260802141000_geofence_events_rls.sql` | **NEW** (policies or revoke) |
| `docs/architecture/TRACKING_REALTIME_SUBSYSTEM.md` | RPC contract section |

### Diff-level

- **Add** `tracking_record_checkpoint`: verify `trips.driver_id = p_driver_id` (or assignment), `trips.organization_id = p_org_id`, status in trackable set, reject spoofed `p_driver_id` vs `auth.uid()`.
- **Fix** `p_session_id`: `text` + upsert `trip_tracking_sessions` row, or stop FK until client sends UUID.
- **Add** `get_trip_tracking_seed(p_trip_id uuid, p_limit int)` — `SECURITY DEFINER`, returns UNION last N from `trip_location_checkpoints` + `driver_locations`, ordered by `recorded_at`.
- **Geofence:** enable SELECT policies via `can_access_trip_location(trip_id)` OR `REVOKE ALL ON geofence_events FROM authenticated`.

### Tests required

- [ ] `supabase db reset` local — migration applies clean
- [ ] Staging: `supabase db push` then manual SQL:
  - driver on assigned trip → RPC success
  - wrong `p_org_id` → fail
  - unassigned driver → fail
  - `get_trip_tracking_seed` returns rows when legacy data exists
- [ ] No app change required for CI green

### Risk: **Medium**

### Rollback

- **App:** none
- **DB:** forward-only; emergency = disable client flags (PR-10+). Do not `repair` migration without eng lead.

### Validation metrics (staging, 24h)

- RPC error rate < 0.1% on test calls
- No increase in `driver_locations` INSERT rate (no client change yet)

### Release checklist

- [ ] `supabase migration list --linked` shows new versions pending
- [ ] `db push` to staging only
- [ ] RPC manual test matrix signed off
- [ ] **Do not** enable `TRACKING_RPC_CHECKPOINT` in prod

---

# PR-2 — Feature flags (no behavior change)

**Branch:** `tracking/p0-pr-02-feature-flags`

**Depends on:** none (merge after PR-1 recommended for doc accuracy, not blocking)

### Files changed

| File | Change |
|------|--------|
| `features/tracking/trackingFeatureFlags.ts` | **Add** 4 flag readers + `isTrackingEnabledForOrg(orgId)` stub |
| `features/tracking/trackingOrgAllowlist.ts` | **NEW** parse `EXPO_PUBLIC_TRACKING_ORG_ALLOWLIST` |
| `.env.example` | Document flags |
| `app.config.js` | Pass env if missing |
| `docs/architecture/TRACKING_REALTIME_SUBSYSTEM.md` | Flag matrix |

### Diff-level

- **Add** functions (all default false):
  - `isTrackingBroadcastV1Enabled()` (existing)
  - `isTrackingPublishV1Enabled()`
  - `isTrackingRpcCheckpointEnabled()`
  - `isTrackingRpcDualWriteEnabled()`
  - `isTrackingFleetPublishEnabled()`
- **No** call-site switches yet except import re-exports.

### Tests required

- [ ] **NEW** `features/tracking/__tests__/trackingFeatureFlags.test.ts` — each flag `0`/`1`/`undefined`
- [ ] `npm test -- --testPathPattern=trackingFeatureFlags`

### Risk: **Low**

### Rollback

- Revert PR; no runtime effect (all call sites still use old single flag until PR-5+).

### Validation metrics

- None (no production behavior change)

### Release checklist

- [ ] All prod envs: flags unset or `0`
- [ ] CI unit tests pass

---

# PR-3 — Trail ring buffer utility

**Branch:** `tracking/p0-pr-03-trail-buffer-util`

**Depends on:** none

### Files changed

| File | Change |
|------|--------|
| `features/trips/utils/tripLocationTrailBuffer.util.ts` | **NEW** |
| `features/trips/utils/__tests__/tripLocationTrailBuffer.util.test.ts` | **NEW** |
| `lib/trackingLocation.constants.ts` | **Add** `REACT_TRAIL_RING_BUFFER_MAX = 32` |

### Diff-level

- **Add** `appendTrailPoint(prev, next, maxLen)` — dedupe same `recorded_at`+coords; drop oldest when `length > maxLen`.
- **Add** `trailFingerprint(points)` for geocode effect deps.

### Tests required

- [ ] Unit: empty → one point
- [ ] Unit: 100 appends → length 32
- [ ] Unit: duplicate `recorded_at` no growth
- [ ] Unit: ordering preserved (newest at end)

### Risk: **Low**

### Rollback

- Revert PR; no wiring yet.

### Validation metrics

- N/A until PR-4

### Release checklist

- [ ] Jest green
- [ ] No imports from `useTripDetail` yet (optional re-export only)

---

# PR-4 — Trip detail: bounded trail + geocode containment

**Branch:** `tracking/p0-pr-04-trip-detail-memory`

**Depends on:** PR-3

### Files changed

| File | Change |
|------|--------|
| `features/trips/components/trip-detail/hooks/useTripDetail.ts` | **Major** |
| `lib/trackingLocation.constants.ts` | `GEOCODE_DEBOUNCE_MS` |
| `lib/hooks/useDebouncedValue.ts` | **NEW** or use existing debounce util |
| `features/trips/components/trip-detail/ManifestDriverPingList.tsx` | Slice display to manifest max |

### Diff-level (`useTripDetail.ts`)

- **Remove** (~2040–2058): `return [...prev, point]` unbounded spread in `onLivePosition`.
- **Add:** `appendTrailPoint(prev, point, REACT_TRAIL_RING_BUFFER_MAX)` in broadcast + WAL handlers.
- **Remove** (~2229–2250): `useEffect` deps `[tripLocationPoints]` full-array batch geocode.
- **Add:** effect deps `[trailFingerprint(tripLocationPoints)]` + geocode only indices missing `locationName` in last `TRACKING_LOCATION_GEOCODE_MAX`.
- **Remove** (~2195): immediate `resolveMapLocationLabel` on every `driverLocation` change.
- **Add:** debounced coords (2s) → single geocode for header label.
- **Remove** geocode calls inside `onLivePosition` / broadcast callback (if any).

### Tests required

- [ ] **NEW** `useTripDetail.trail.test.ts` (pure extract): simulate 500 appends → length ≤ 32
- [ ] Manual: open trip detail 30 min, React DevTools / log `tripLocationPoints.length` ≤ 32
- [ ] Manual: network tab Mapbox/Nominatim calls ≤ 1 per 2s on live movement

### Risk: **Medium** (UX: manifest shows fewer pings — intentional)

### Rollback

- Revert PR; restores unbounded trail (not recommended for prod).

### Validation metrics (after deploy, flags any)

| Metric | Target |
|--------|--------|
| `tripLocationPoints.length` p95 (client sample) | ≤ 32 |
| Geocode requests / trip-hour | −60% vs prior week |
| Trip detail web heap (8h sim) | flat ±10% |

### Release checklist

- [ ] PR-3 merged
- [ ] No geocode in `onLivePosition` (grep)
- [ ] Manifest still shows last 8 named pings
- [ ] Legacy WAL path also bounded (same handlers)

---

# PR-5 — Fleet publish default OFF

**Branch:** `tracking/p0-pr-05-fleet-publish-gate`

**Depends on:** PR-2

### Files changed

| File | Change |
|------|--------|
| `features/tracking/broadcast/publishTrackingBroadcast.ts` | Guard fleet `send` |
| `features/tracking/__tests__/publishTrackingBroadcast.test.ts` | **NEW** mock channel |

### Diff-level

- **Wrap** lines ~45–50: `if (isTrackingFleetPublishEnabled()) { fleetCh.send(...) }`
- **No** change to trip channel publish.

### Tests required

- [ ] Unit: fleet flag off → `getOrCreateFleetChannel` never called (mock spy)
- [ ] Unit: fleet flag on → fleet send once

### Risk: **Low**

### Rollback

- Revert or set `EXPO_PUBLIC_TRACKING_FLEET_PUBLISH=1` (keep `0` in prod Phase 0).

### Validation metrics

- Fleet channel subscriptions = 0 in diagnostics

### Release checklist

- [ ] PR-2 merged
- [ ] Prod `TRACKING_FLEET_PUBLISH` unset

---

# PR-6 — Tracking channel registry + sign-out teardown

**Branch:** `tracking/p0-pr-06-channel-registry`

**Depends on:** PR-2 (optional)

### Files changed

| File | Change |
|------|--------|
| `features/tracking/broadcast/trackingChannelRegistry.ts` | **NEW** |
| `features/tracking/broadcast/publishTrackingBroadcast.ts` | Use registry |
| `features/tracking/broadcast/TrackingBroadcastSubscriptionManager.ts` | Teardown on `handlers.size === 0` |
| `lib/realtimeRegistry.ts` | `clearAllRealtimeChannels` calls `teardownAllTrackingChannels()` |
| `contexts/AuthContext.tsx` | Verify signOut path (already calls `clearAllRealtimeChannels`) |
| `features/tracking/index.ts` | Export diagnostics |

### Diff-level

- **Move** `tripChannels`/`fleetChannels` maps into registry with ref-count.
- **Remove** teardown guard that requires zero refs when handlers empty (if present).
- **Add** `getTrackingChannelDiagnostics(): { tripPublish, tripSubscribe, fleet }`.

### Tests required

- [ ] **NEW** `trackingChannelRegistry.test.ts`: acquire 3x → ref 3; release 3x → channel removed
- [ ] Manual: open trip → leave → `getTrackingChannelDiagnostics().tripSubscribe === 0`
- [ ] Manual: sign out → all tracking channels 0

### Risk: **Medium** (reconnect edge cases)

### Rollback

- Revert PR; falls back to ad-hoc maps (pre-PR-6).

### Validation metrics

| Metric | Target |
|--------|--------|
| `realtime.channels.active` after 10 trip open/close | returns to baseline |
| Channels per user (internal sample) | ≤ 22 (20 legacy + 2 tracking) |

### Release checklist

- [ ] Sign-out E2E smoke
- [ ] No duplicate `channel().subscribe()` per tripId without release

---

# PR-7 — Dispatcher: disable poll extension + reseed single-flight

**Branch:** `tracking/p0-pr-07-dispatcher-realtime`

**Depends on:** PR-4

### Files changed

| File | Change |
|------|--------|
| `features/trips/components/trip-detail/hooks/useTripDetail.ts` | Poll guard |
| `features/tracking/hooks/useTrackingTripBroadcast.ts` | `reseedInFlightRef` |

### Diff-level

- **Add** (~2101): `if (trackingBroadcastEnabled) return;` early in poll `useEffect` OR poll updates `setDriverLocation` only (no `setTripLocationPoints`).
- **Add** in `onReseed`: 5s single-flight; replace trail via seed fetch not append.
- **Wire** (optional this PR): call `get_trip_tracking_seed` when RPC exists (PR-1); else keep `fetchDriverLocationFromDb` without trail extend.

### Tests required

- [ ] Unit: reseed called twice in 1s → one in-flight
- [ ] Manual flag on: no 60s interval network calls to `getLatestDriverLocation` (or only latest, no history mutation)

### Risk: **Low**

### Rollback

- `TRACKING_BROADCAST_V1=0` restores poll + WAL path.

### Validation metrics

| Metric | Target |
|--------|--------|
| Trip detail DB reads/hour (broadcast on) | −50% vs flag off |
| `tracking.reseed.count` | < 6/min/trip |

### Release checklist

- [ ] PR-4 merged
- [ ] Flag off: legacy poll still works

---

# PR-8 — CI: tracking safety guards

**Branch:** `tracking/p0-pr-08-ci-tracking-guards`

**Depends on:** PR-4, PR-7

### Files changed

| File | Change |
|------|--------|
| `eslint.config.cjs` | Custom rules / overrides |
| `scripts/ci/check-tracking-safety.sh` | **NEW** |
| `.github/workflows/tracking-safety.yml` | **NEW** |
| `package.json` | `"ci:tracking-safety": "bash scripts/ci/check-tracking-safety.sh"` |

### CI checks (exact)

1. **No postgres_changes on tracking movement tables** in `features/tracking/**` and `useTripDetail.ts`:
   - Fail if `.on('postgres_changes'` AND table ∈ `driver_locations`, `trip_location_checkpoints`, `driver_presence`.
   - Allowlist: `useRealtimeTrips.ts` when `tripId === null` pattern documented.

2. **No unbounded trail growth:**
   - Fail `useTripDetail.ts` if regex `\[\.\.\.prev` or `prev,\s*` append to `setTripLocationPoints` without `appendTrailPoint`.

3. **No geocode in broadcast handlers:**
   - Fail if `onLivePosition` / `useTrackingTripBroadcast` body contains `resolveMapLocationLabel` or `geocode`.

4. **No channel subscribe in render:**
   - Fail `features/tracking/**` if `channel(` appears inside return of non-hook component without `useEffect`/`useMemo` guard (heuristic: `subscribe()` not in `.ts` hook file → warn; stricter: no `void ch.subscribe()` outside registry/publish module).

### Tests required

- [ ] CI job passes on `main` after PR-4/7
- [ ] Introduce deliberate violation in branch → job fails

### Risk: **Low**

### Rollback

- Disable workflow file (emergency only).

### Release checklist

- [ ] Required check on PRs touching `features/tracking/**` or `useTripDetail.ts`

---

# PR-9 — Observability: client tracking metrics

**Branch:** `tracking/p0-pr-09-telemetry`

**Depends on:** PR-6 (diagnostics), PR-2

### Files changed

| File | Change |
|------|--------|
| `features/tracking/telemetry/trackingMetrics.ts` | **NEW** |
| `features/tracking/hooks/useTrackingTripBroadcast.ts` | increment receive/reseed/latency |
| `features/tracking/broadcast/publishTrackingBroadcast.ts` | increment publish |
| `features/tracking/services/trackingCheckpoint.service.ts` | increment rpc ok/err |
| `lib/mapLocationLabel.service.ts` | increment geocode |
| `lib/realtimeRegistry.ts` | merge channel counts in `getRealtimeDiagnostics` |

### Diff-level

- **Add** in-memory counters + `__DEV__` console + optional Sentry breadcrumb (no PII coords).
- **No** behavior change.

### Tests required

- [ ] Unit: counter increment idempotent
- [ ] Manual: dev menu or log dump shows metrics after 5 min trip view

### Risk: **Low**

### Rollback

- Revert PR.

### Validation metrics

- Dashboards wired (Grafana/Datadog/SQL) — see hardening plan §7

### Release checklist

- [ ] Staging dashboard receives `tracking.broadcast.receive.count`
- [ ] **Gate:** PR-10 prod flag only after PR-9 deployed 24h

---

# PR-10 — Driver: RPC dual-write + broadcast after RPC ⚠️ DANGER

**Branch:** `tracking/p0-pr-10-driver-dual-write`

**Depends on:** PR-1, PR-2, PR-6, PR-9

**NEVER merge before:** PR-1, PR-2, PR-6

### Files changed

| File | Change |
|------|--------|
| `app/(driver)/index.tsx` | Branch `reportLocationToDb` |
| `features/driver/services/driverLocation.service.ts` | Wrapper for RPC |
| `features/tracking/services/trackingCheckpoint.service.ts` | Error handling + metrics |
| `features/tracking/session/DriverTrackingSessionManager.ts` | Publish only when `PUBLISH` + after checkpoint |
| `docs/architecture/TRACKING_PHASE0_HARDENING_PLAN.md` | Dual-write table |

### Diff-level (`app/(driver)/index.tsx`)

- **When** `isTrackingRpcCheckpointEnabled()`:
  - Call `recordTrackingCheckpoint(...)` first.
  - **If** `isTrackingRpcDualWriteEnabled()`: still `reportDriverLocation` (INSERT).
  - **Else:** skip INSERT for `source: 'live'|'background'`.
  - **When** checkpoint ok + `isTrackingPublishV1Enabled()`: `publishTrackingOnCheckpoint` (not on INSERT success alone).
- **Default prod:** all flags `0` → unchanged legacy INSERT path.

### Tests required

- [ ] Integration (staging): flag on internal org — checkpoint row + optional driver_locations row
- [ ] Integration: flag off — identical INSERT count to baseline
- [ ] Unit: mock RPC failure → no broadcast publish
- [ ] Manual 2h drive sim: checkpoint ratio > 0.7

### Risk: **HIGH**

### Rollback

1. `EXPO_PUBLIC_TRACKING_RPC_CHECKPOINT=0`
2. `EXPO_PUBLIC_TRACKING_RPC_DUAL_WRITE=0`
3. `EXPO_PUBLIC_TRACKING_PUBLISH_V1=0`
4. Redeploy client (no DB rollback)

### Validation metrics (72h internal org)

| Metric | Target |
|--------|--------|
| `checkpoint_insert_ratio` | ≥ 0.7 |
| `driver_locations` INSERT/min | ≤ 0.5× baseline (dual-write on) |
| RPC error rate | < 0.5% |
| Broadcast publish only after RPC ok | 100% sample |

### Release checklist

- [ ] PR-1 on staging/prod DB
- [ ] PR-9 dashboards live
- [ ] **72h staging soak** signed off
- [ ] Internal org only: `RPC_CHECKPOINT=1`, `DUAL_WRITE=1`, `PUBLISH=1`
- [ ] On-call briefed

---

# PR-11 — Driver: RPC-primary + 50m client gate ⚠️ DANGER

**Branch:** `tracking/p0-pr-11-rpc-primary`

**Depends on:** PR-10 + 72h dual-write green

**NEVER merge before:** PR-10 production-validated

### Files changed

| File | Change |
|------|--------|
| `app/(driver)/index.tsx` | `minDisplacementM: 50` when RPC on |
| `features/driver/hooks/useAdaptiveTripLocationPingLoop.ts` | Pass through displacement |
| `app/(driver)/index.tsx` | Default `DUAL_WRITE=0` path |
| `features/trips/components/trip-detail/hooks/useTripDetail.ts` | Seed from `get_trip_tracking_seed` |
| `features/driver/services/driverLocation.service.ts` | Read helper for seed RPC |

### Diff-level

- **Remove** live `reportDriverLocation` for adaptive loop when `RPC_CHECKPOINT=1` && `DUAL_WRITE=0`.
- **Keep** manual/tap INSERT if product requires.
- **Add** seed fetch on trip detail mount / reseed using PR-1 RPC.

### Tests required

- [ ] Staging: 24h no driver_locations live INSERTs for test fleet
- [ ] Trip detail history matches pre-cutover (UNION seed)
- [ ] Ops/reporting queries still see data via checkpoints + legacy rows

### Risk: **HIGH**

### Rollback

- `TRACKING_RPC_DUAL_WRITE=1` (re-enable INSERT) — instant without redeploy if env-only; else redeploy PR-10 config.

### Validation metrics (72h canary 10%)

| Metric | Target |
|--------|--------|
| `driver_locations` INSERT/min | −80% vs baseline |
| Checkpoint ratio | ≥ 0.85 |
| Support tickets “missing GPS” | 0 P0 |

### Release checklist

- [ ] PR-10 metrics 7 days green
- [ ] `get_trip_tracking_seed` verified
- [ ] Canary org allowlist (PR-12) applied
- [ ] **Stop** if checkpoint ratio < 0.5 for 6h

---

# PR-12 — Org allowlist + rollout runbook

**Branch:** `tracking/p0-pr-12-rollout-config`

**Depends on:** PR-2, PR-11 ready (not necessarily merged)

### Files changed

| File | Change |
|------|--------|
| `features/tracking/trackingOrgAllowlist.ts` | Implement `isTrackingEnabledForOrg` |
| `features/tracking/trackingFeatureFlags.ts` | Combine flag && allowlist |
| `useTripDetail.ts` | `enabled: trackingBroadcastEnabled && orgAllowed` |
| `app/(driver)/index.tsx` | Same for driver flags |
| `docs/architecture/TRACKING_PHASE0_ROLLOUT_RUNBOOK.md` | **NEW** |

### Diff-level

- **Add** env `EXPO_PUBLIC_TRACKING_ORG_ALLOWLIST=uuid1,uuid2`
- **Gate** all tracking flags behind allowlist for prod builds.

### Tests required

- [ ] Unit: org in list → enabled; not in list → disabled even if flag 1

### Risk: **Low** (misconfiguration blocks rollout — safe)

### Rollback

- Clear allowlist env → all orgs flag-off behavior

### Validation metrics

- Rollout stage counters per org

### Release checklist

- [ ] Runbook reviewed by on-call
- [ ] Kill switch drill: all flags 0 in < 5 min
- [ ] 2k driver ramp: 10% → 50% → 100% with KPI gates from hardening plan

---

## Production flag matrix (post all PRs merged)

| Env var | S0 prod | S1 internal | S3 canary 10% | S5 GA |
|---------|---------|-------------|---------------|-------|
| `TRACKING_BROADCAST_V1` | 0 | 1 | 1 | 1 |
| `TRACKING_PUBLISH_V1` | 0 | 1 | 1 | 1 |
| `TRACKING_RPC_CHECKPOINT` | 0 | 1 | 1 | 1 |
| `TRACKING_RPC_DUAL_WRITE` | 0 | 1 | 0 | 0 |
| `TRACKING_FLEET_PUBLISH` | 0 | 0 | 0 | 0 |
| `TRACKING_ORG_ALLOWLIST` | empty | internal UUID | canary UUIDs | phased |

---

## 2k driver rollout gates

| Gate | Threshold |
|------|-----------|
| DB INSERT reduction | −50% before 50% drivers; −80% before 100% |
| Realtime channels/user | p95 ≤ 22 |
| Geocode 429 | 0 sustained spikes |
| Trip detail memory | 8h soak flat |
| Stale driver % | < 15% |
| P0 incidents | 0 |

---

## Suggested GitHub labels

- `tracking-phase-0`
- `danger-staging-soak` (PR-1, PR-10, PR-11)
- `rollback-safe`
- `feature-flagged`

---

## PR template snippet (paste into each PR)

```markdown
## Phase 0 tracking — PR-NN

**Depends on:** #___
**Danger soak:** yes/no
**Flags (default prod):** …

### Files
- …

### Rollback
- …

### Validation (post-deploy)
- [ ] metric …

### Checklist
- [ ] ci:tracking-safety
- [ ] unit tests
- [ ] staging soak (if danger)
```
