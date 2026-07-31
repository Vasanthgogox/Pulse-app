# Trip Operations Platform

**v1.0 — Canonical Trip Execution Model · Architecture Complete · July 2026**

*Before this, trip progress was independently interpreted in at least four places: the driver app's map guidance, `DriverTripFlowCard`'s own step machine, the business `TripStatusTimeline` stepper (with a heuristic guess at driver acceptance), and an inferred "mission log" built from `trips.created_at/started_at/updated_at/completed_at`. This document describes the replacement: one canonical interpretation of trip state, consumed — not reimplemented — by every surface that displays it.*

**This document's ownership:** the layered domain architecture and the rule that governs extending it. Implementation detail lives in the source files referenced below; this is the map, not the territory.

## The layered architecture

```
Trips
  │
  ▼
Trip Stage Engine        deriveTripStage()              "Where is the trip in its workflow?"
  │
  ▼
Stage Metadata            getStageMetadata()             Presentation: title / color / icon / target / next-expected
  │
  ▼
Trip Timeline              getTripTimeline()              Real recorded events, sorted — not inferred from timestamps
  │
  ▼
Stage Metrics               computeTripStageMetrics()      Durations per workflow stage, works for active trips (running)
  │
  ▼
Journey Metrics              computeJourneyMetrics()        Distance/pace progress — "is it fast enough?", long-haul focused
  │
  ▼
Operational Alerts           evaluateOperationalAlerts()    Rules over Stage + Journey Metrics -> exceptions worth surfacing
  │
  ▼
Alert Action Capabilities     getAlertActions() / ALERT_ACTION_CAPABILITIES    What an operator can do, and what's real today
  │
  ┌──────────┼───────────┬──────────────────┐
  │          │           │                  │
Driver App  Business   Customer Track      Fleet Operations
            Panel      & Trace             Dashboard
```

Every box below "Alert Action Capabilities" is a presentation layer. None of them derive stage, timing, or alert logic themselves.

## Canonical domain modules

All under `features/trips/domain/` (barrel: `features/trips/domain/index.ts`) unless noted. Pure functions — no React, no queries, no screens.

| Module | Responsibility |
|---|---|
| `tripStage.ts` | `deriveTripStage(trip)` — the one status→stage mapping. `getTripStopCoordinate()`, `getTripStageTarget()`. |
| `tripStageGuidance.ts` | `getTripStageGuidance()` — driver-app CTA copy (title/subtitle/toast) per stage. |
| `tripStageMetadata.ts` | `getStageMetadata()` — shared presentation metadata (title/color/icon/target/next-expected) consumed by every surface. |
| `tripStageEta.ts` | Geo/distance/ETA formatting helpers (haversine distance, bearing, formatters). |
| `tripTimeline.ts` | `getTripTimeline()` / `getTripTimelinesForTrips()` — collects real events (geofence, driver acceptance, workflow) into one normalized, sorted stream. Batch variants exist for fleet-wide views. |
| `tripStageMetrics.ts` | `computeTripStageMetrics()` — per-stage durations (`DurationMetric { ms, isRunning }`) derived from the timeline; works for in-progress trips. |
| `tripJourneyMetrics.ts` | `computeJourneyMetrics()` — distance/pace progress for long-haul trips: covered/remaining distance (from summed real GPS checkpoint deltas, not straight-line), expected vs. actual pace, predicted arrival, health tier. |
| `tripOperationalAlerts.ts` | `evaluateOperationalAlerts()` — rules over Stage + Journey Metrics, timeline, and driver presence. Configurable thresholds (`DEFAULT_ALERT_THRESHOLDS`). |
| `tripAlertActions.ts` | `getAlertActions()` + `ALERT_ACTION_CAPABILITIES` — recommended actions per alert, and the single source of truth for which action kinds are actually wired vs. `requires_capability`. |

Supporting batch data functions live alongside the services they extend (`trips.service.ts`, `tripWorkflow.service.ts`, `driverPresence.service.ts`, `trackingCheckpoint.service.ts`, `drivers.service.ts`) — one query for N trips, not N queries, everywhere a fleet-wide consumer needs them.

## Consumers

| Surface | File | Consumes |
|---|---|---|
| Driver App map guidance | `features/drivers/screens/DriverHomeScreen.tsx` | `tripStage.ts`, `tripStageGuidance.ts`, `tripStageEta.ts` |
| Driver Flow Card | `features/driver/components/DriverTripFlowCard.tsx` | `tripStageMetadata.ts` for wording only — **its state machine is not yet consolidated, see Deferred below** |
| Business stepper | `features/trips/components/trip-detail/sections/TripStatusTimeline.tsx` | `deriveTripStage()`, `getStageMetadata()`, real `driver_accepted` event (heuristic removed) |
| Business Operations Panel | `features/trips/components/trip-detail/TripStageControlPanel.tsx` | Full stack through Alerts |
| Customer Track & Trace | `features/trips/screens/TripTrackTraceScreen.tsx` | Stage, Metadata, Timeline (reuses the existing client-org RLS model — no new access model) |
| Fleet Operations Dashboard | `features/trips/screens/FleetOperationsDashboardScreen.tsx` | Full stack, batch-fetched across all active trips in an org |

## The rule

**A new operational surface consumes these services. It does not derive its own interpretation of trip status, timing, or exceptions.**

Concretely: if a screen needs "what stage is this trip in", it calls `deriveTripStage()`. If it needs wording, it calls `getStageMetadata()`. If it needs "how long has this been going on", it reads `computeTripStageMetrics()`/`computeJourneyMetrics()`, not `Date.now() - trip.updated_at`. If it needs to flag a problem, it reads `evaluateOperationalAlerts()`, not a bespoke threshold check.

Four independent stage interpretations existed before this platform; three are now consolidated. Watch for a fifth appearing anywhere a new screen touches trip progress — that's the signal this rule is being skipped, not a normal architectural variation.

## Deferred by design

Not gaps discovered late — each was evaluated and explicitly postponed, usually because real usage evidence should shape it rather than a guess:

| Deferred | Why |
|---|---|
| `DriverTripFlowCard` state-machine consolidation | Its local state (optimistic transitions, a rank-based anti-regression guard, a check-constraint carve-out, non-optimistic completion) exists because of prior incidents, not because nobody simplified it. Needs its own instrumented investigation — trace render-stage / local-step / optimistic-mutation / server-update / prop-refresh / resync before removing anything — not a same-pass rewrite. |
| Analytics dashboards | Which KPIs matter, which thresholds need tuning, and what "fleet health" means are better answered after dispatchers have used the alerts, not guessed up front. |
| Alert persistence | `evaluateOperationalAlerts()` derives fresh every call; every alert returned is active by construction. Persist only if expensive reporting, SLA history, billing, or KPI snapshots make re-derivation impractical. |
| Notification delivery (push/email/Slack/webhooks) | Decide which alerts deserve proactive delivery only after operators are actually using the dashboard — building this first risks infrastructure for alerts nobody acts on. |
| Scheduler / background processing | The dashboard polls (30s) rather than holding a realtime channel per active trip. Revisit only if `driver_presence` is ever published to `supabase_realtime`. |
| Public tracking links (anonymous/token-based) | Track & Trace deliberately reuses the existing client-organization RLS model instead of introducing a second, parallel authorization model. If a public link is ever needed, it's a new capability decision, not something to retrofit into this. |
| Dispatcher trip-specific chat deep-linking | `ALERT_ACTION_CAPABILITIES.message` names exactly what's missing: `ChatRouteContent`/`ChatScreen` need to read and apply a `tripId` param the way the driver-side `/(driver)/chat?tripId=` already does. |

## Known, unrelated issues (not this platform's)

- `features/trips/domain/tripExecutionModel.test.ts` has one pre-existing failing assertion (`getTripExecutionModel` returns `"asset"` where the test expects `"aggregate"`), reproducible on a clean checkout before any of this work. Investigate separately: has `getTripExecutionModel()` changed, does the test fixture reflect current business rules, or is the test's expectation stale.
- `features/trips/components/assignment/tripAssignmentWorkspace.styles.ts:471` has a duplicate `overflow` style property (`TS2783`) — a styling cleanup, unrelated to this architecture.
