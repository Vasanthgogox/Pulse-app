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
  ┌──────────┼─────────────┬──────────────┬──────────────┬──────────────┐
  │          │             │              │              │              │
Driver     Mission      Business       Live Tracking   Fleet          Map
Map        Card         Panel          (Business/      Operations     Camera
Guidance   (driver app)                 Client)        Dashboard      (policy)
```

Every box below "Alert Action Capabilities" is a presentation layer. None of them derive stage, timing, or alert logic themselves — with one deliberate exception, Map Camera, which is a UI policy (framing/padding/debounce) rather than a domain service; it still reads Stage Guidance for *what* to frame, it just also owns *how* the camera behaves, which isn't a trip-state question.

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
| Driver Mission Card | `features/driver/components/MissionCardLayout.tsx` (rendered by `DriverTripFlowCard.tsx`) | Stage Metadata, Stage Metrics, Journey Metrics, Operational Alerts — the last two only ever reach the driver as translated plain-language guidance (`features/driver/utils/driverAlertGuidance.util.ts`), never as raw health tiers or alert titles. Workflow handlers (accept/arrive/transit/complete) stay owned by `DriverTripFlowCard`; this component is presentation-only. |
| Business stepper | `features/trips/components/trip-detail/sections/TripStatusTimeline.tsx` | `deriveTripStage()`, `getStageMetadata()`, real `driver_accepted` event (heuristic removed) |
| Business Operations Panel | `features/trips/components/trip-detail/TripStageControlPanel.tsx` | Full stack through Alerts |
| Customer Track & Trace | `features/trips/screens/TripTrackTraceScreen.tsx` | Stage, Metadata, Timeline (reuses the existing client-org RLS model — no new access model) |
| Live Tracking (Business/Client) | `features/trips/components/trip-detail/modals/LiveTrackingModal.tsx`, `TripDetailTrackingHub.tsx` | Journey Metrics + canonical Stage Metadata via one shared model, `features/trips/utils/liveTrackingPresentation.util.ts` (built once in `TripDetailScreen.tsx`, both screens consume it — replaced a since-deleted independent status/step interpretation and a static distance/350-km-per-day planning util that had drifted into showing expired dates as live). ETA resolution goes through `liveTrackingEta.util.ts`'s future-checked priority chain, never a raw computed date. |
| Fleet Operations Dashboard | `features/trips/screens/FleetOperationsDashboardScreen.tsx` | Full stack, batch-fetched across all active trips in an org |
| Map Camera | `features/drivers/screens/DriverHomeScreen.tsx` (`fitMapToActiveContext`) | Stage Guidance, for goal-based framing — plus the Camera Policy below, which is UI behavior, not a domain service |

## The rule

**A new operational surface consumes these services. It does not derive its own interpretation of trip status, timing, or exceptions.**

Concretely: if a screen needs "what stage is this trip in", it calls `deriveTripStage()`. If it needs wording, it calls `getStageMetadata()`. If it needs "how long has this been going on", it reads `computeTripStageMetrics()`/`computeJourneyMetrics()`, not `Date.now() - trip.updated_at`. If it needs to flag a problem, it reads `evaluateOperationalAlerts()`, not a bespoke threshold check.

Four independent stage interpretations existed before this platform; three were consolidated at v1.0. The rule then caught a fifth — `LiveTrackingModal`'s own `trackingStepAndLabel()`/`trackingStatusHeadline()`, plus a separate static planning util (`manifestDeliveryPlan.util.ts`) that had drifted into acting as a live-tracking ETA source — both now deleted/scoped in favor of the shared `liveTrackingPresentation.util.ts`. `DriverTripFlowCard`'s local state machine remains the one deliberately-deferred exception (see below). Keep watching for the next one; that's the signal this rule is being skipped, not a normal architectural variation.

## Camera Policy (Map Camera)

Not a domain service — a UI policy for `DriverHomeScreen.tsx`'s map, worth documenting so it isn't rediscovered from code:

- **One debounced fit per meaningful context change.** Trip-key change, route-geometry finishing load, and a guidance-step change each used to schedule their own independent timer; they now share one debounce, so a burst of near-simultaneous triggers collapses into a single settled fit instead of visible camera jumps.
- **Manual pan/pinch suppresses auto-fit** until either a real context change (trip/stage/route) or the driver explicitly taps "Center" (the focus-and-follow button) — the app doesn't fight a driver who's deliberately exploring the map.
- **Goal-based framing by trip context**, not just current stage:
  - Assigned → driver + pickup
  - At Pickup → tight driver + pickup (not the whole trip corridor)
  - Transit → driver + remaining route + destination (the corridor belongs here, not at the endpoints)
  - At Drop → tight driver + drop
  - Completed → no automatic fitting at all; drivers routinely pan the completed trip and re-fitting would fight that
- Bottom/top camera padding are derived, not guessed: bottom from the mission sheet's real measured height (`onLayout`, not a screen-fraction constant), top from `mapControlsTopInset()` (the same offset the floating controls bar already uses).
- **Known gap:** this policy's interaction-suppression currently only wired on the native `MapView` path (`onPanDrag`). The Leaflet (web) wrapper has no equivalent drag/zoom-start callback yet, so web users' manual pans don't yet suppress auto-fit — tracked as separate follow-up work, not bundled into the native camera change.

## Delivered vs. deferred

What was postponed at v1.0 and has since shipped, alongside what's still deliberately not built:

| Item | Status | Why |
|---|---|---|
| Driver Mission UI | **Completed** | `MissionCardLayout` + translated guidance, built on the existing platform — see Consumers above. |
| Track & Trace / Live Tracking migration | **Completed** | `LiveTrackingModal`/`TripDetailTrackingHub` moved off the static planning util and their own status/step interpretation onto `liveTrackingPresentation.util.ts` — see Consumers above. |
| `DriverTripFlowCard` state-machine consolidation | Deferred | Its local state (optimistic transitions, a rank-based anti-regression guard, a check-constraint carve-out, non-optimistic completion) exists because of prior incidents, not because nobody simplified it. Needs its own instrumented investigation — trace render-stage / local-step / optimistic-mutation / server-update / prop-refresh / resync before removing anything — not a same-pass rewrite. |
| Leaflet interaction parity (web map camera) | Deferred | Native's camera policy suppresses auto-fit on manual pan via `onPanDrag`; the Leaflet wrapper has no equivalent drag/zoom-start callback yet. Separate, independently-testable follow-up — not bundled into the native camera change. |
| Analytics dashboards | Deferred | Which KPIs matter, which thresholds need tuning, and what "fleet health" means are better answered after dispatchers have used the alerts, not guessed up front. |
| Alert persistence | Deferred | `evaluateOperationalAlerts()` derives fresh every call; every alert returned is active by construction. Persist only if expensive reporting, SLA history, billing, or KPI snapshots make re-derivation impractical. |
| Notification delivery (push/email/Slack/webhooks) | Deferred | Decide which alerts deserve proactive delivery only after operators are actually using the dashboard — building this first risks infrastructure for alerts nobody acts on. |
| Scheduler / background processing | Deferred | The dashboard polls (30s) rather than holding a realtime channel per active trip. Revisit only if `driver_presence` is ever published to `supabase_realtime`. |
| Public tracking links (anonymous/token-based) | Deferred | Track & Trace deliberately reuses the existing client-organization RLS model instead of introducing a second, parallel authorization model. If a public link is ever needed, it's a new capability decision, not something to retrofit into this. |
| Dispatcher trip-specific chat deep-linking | Deferred | `ALERT_ACTION_CAPABILITIES.message` names exactly what's missing: `ChatRouteContent`/`ChatScreen` need to read and apply a `tripId` param the way the driver-side `/(driver)/chat?tripId=` already does. |

## Known, unrelated issues (not this platform's)

Both issues previously tracked here are resolved:
- `tripExecutionModel.test.ts`'s failing assertion was a real regression (commit `333decbd` had widened a `direct_quote` override too broadly, silently reclassifying supplier-linked subcontractor trips). Fixed by scoping the override to `trip.source === "direct_quote"`; a regression test for the direct-quote case was added alongside it.
- The duplicate `overflow` style in `tripAssignmentWorkspace.styles.ts:471` was dead code (both `Platform.select()` branches already set `overflow: "hidden"`) and has been removed.

One new, separately-tracked issue surfaced during the Live Tracking migration: `updateTripStatus.tripDelivered.test.ts` has 2 of 5 tests failing in complete isolation, unrelated to any file touched by this work — a Supabase mock-chain exhaustion issue in the test itself (`trips.service.ts`'s `.from("trips")` chain resolves to `undefined` partway through the suite). Not investigated further since it's outside this document's scope.
