# Pulse Scalability & Reliability Platform

**v0.2 — Living architecture · System health & scalability · August 2026**

*Trip Operations gave Pulse one operational truth. Marketplace gave Pulse one commercial truth. This platform gives Pulse one performance and synchronization truth: every user action should produce the minimum possible work across client, realtime, cache, and database — while remaining observable and measurable as concurrency grows from dozens to thousands.*

**This document's ownership:** platform boundaries, principles, budgets, roadmap, and release gates. Implementation detail lives in the modules referenced below. **This is a living document:** charter sections (vision, principles, rules, budgets) change rarely; **Evidence** and **P0 snapshot** sections are updated as instrumentation lands and hotspots are measured.

**Companion docs:**

| Doc | Owns |
|-----|------|
| This file | Scalability & Reliability Platform — system truth |
| `docs/TRIP_OPERATIONS_PLATFORM.md` | Operational truth |
| `docs/MARKETPLACE_DOMAIN.md` | Commercial truth |
| `docs/PLATFORM_CONSUMER_RULE.md` | UI must consume platforms, not invent policy |
| `docs/PRODUCT_STRATEGY.md` | Product north star (UX after platforms are healthy) |
| `docs/REALTIME_MESSAGING_ARCHITECTURE_REVIEW.md` | Chat write-path amplification (evidence) |
| `docs/performance.md` / `docs/PERFORMANCE_AUDIT.md` | Historical performance notes |

**Out of scope (deliberate):** Analytics, AI, ranking, recommendations, and business insights belong to a future **Product Intelligence Platform**. Do not fold Intelligence into this platform.

---

## Four long-term platform pillars

| Platform | Responsibility | Status |
|----------|----------------|--------|
| **Trip Operations Platform** | Operational truth | ✅ Stable |
| **Marketplace Platform** | Commercial truth | ✅ Stable |
| **Scalability & Reliability Platform** | System health & scalability | 🟡 Active |
| **Product Intelligence Platform** | Analytics, AI, recommendations, insights | 🔵 Future |

Infrastructure sits **under** business platforms, not beside them:

```
                    Pulse Platform

 ┌─────────────────────────────────────────────┐
 │     Scalability & Reliability Platform      │
 └─────────────────────────────────────────────┘
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
 Trip Ops     Marketplace     Intelligence
 Platform      Platform         (future)
     │              │
     └──────────────┼──────────────┘
                    ▼
             Driver / Dispatcher / Finance / Network UX
```

---

## Vision

Every user action should result in the **minimum possible work** across:

- Client (renders, mounts, subscriptions)
- Realtime infrastructure (channels, deliveries, RLS)
- Cache layer (patches vs invalidations)
- Database (writes, triggers, pool, locks)

…while remaining **observable, measurable, and scalable**.

This initiative is not about fixing one database incident. It is about predictable performance as Pulse grows.

---

## Platform architecture

```
                 Pulse Scalability & Reliability Platform
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
Realtime Engine        Query & Cache Engine     Database Engine
        │                      │                      │
Subscription Registry  Cache Merge Rules       SQL Performance
Broadcast              Query Strategy          Indexes
Presence               Optimistic Updates      RLS
Transport              Hydration              Triggers
                        Offline Cache          Pool
                               │
                               ▼
                 Observability & Health Monitor
```

Unlike Trip Operations or Marketplace, this platform is **not business-facing**. Every feature consumes it indirectly.

**Current code entrypoints (evolve, do not fork):**

| Concern | Module |
|---------|--------|
| Shared realtime channels | `lib/realtimeRegistry.ts` |
| Query client + storm detector | `lib/queryClient.ts` |
| Platform health snapshot | `lib/platform/scalability/` |
| Engineering health UI | `app/platform-health/` |

---

## Principles

### 1. One user action → one transaction

```
User Action
      │
      ▼
Single Write
      │
      ▼
Single Event
      │
      ▼
Targeted Cache Patch
      │
      ▼
Minimal UI Updates
```

Avoid cascades: multiple writes → many subscriptions → many refetches.

### 2. Features consume the platform

Chat, Marketplace, Tracking, Dispatcher, Finance **must not** own transport, retry, polling, or cache policy. They consume Scalability Platform APIs.

### 3. Measure before optimizing

No assumptions. No “probably.” Every hotspot has **before/after metrics**.

### 4. One performance owner

No feature may introduce:

- raw Supabase / websocket channel usage outside the registry
- custom retry / polling / throttling for sync
- custom cache invalidation policy
- custom realtime transport selection

Those belong exclusively to this platform.

---

## Platform rules (law)

### Realtime

1. No feature opens raw realtime channels directly.
2. All subscriptions go through the shared registry (`lib/realtimeRegistry.ts` → future Realtime Engine API).
3. Prefer conversation-scoped (or otherwise narrow) subscriptions.
4. High-frequency / high fan-out → Broadcast.
5. Hidden / background UI unsubscribes or pauses.

### Cache

6. Patch (`setQueryData`) before invalidating.
7. Refresh only when correctness requires it.
8. Never invalidate an entire feature from one unrelated event.

### Database

9. Minimize trigger chains on hot write paths.
10. Optimize expensive RLS on realtime paths.
11. Keep write transactions focused and predictable.

### UI

12. Hidden screens should not consume realtime resources.
13. Features render state; they do not implement synchronization policy.
14. Screens that exceed **Performance Budgets** fail review.

---

## Performance budgets (first-class law)

Not recommendations. **Budgets.** Exceeding them fails design review unless the PR extends the budget with measured justification in this doc’s Evidence section.

### Subscription budget (active channels while screen focused)

| Surface | Max shared-registry channels |
|---------|------------------------------|
| Home | ≤ 5 |
| Trip Detail | ≤ 8 |
| Chat | ≤ 4 |
| Marketplace / Load Center | ≤ 6 |
| Finance | ≤ 4 |
| Fleet / Tracking map | ≤ 6 |

### Database budget (per user action)

| Action | Writes | Triggers (hot path) | Realtime events | Invalidations | Extra queries |
|--------|--------|---------------------|-----------------|---------------|---------------|
| Place Bid | ≤ 2 | ≤ 2 | ≤ 2 | ≤ 2 | ≤ 3 |
| Send Chat Message | ≤ 2 | ≤ 2 | ≤ 2 | ≤ 2 | ≤ 2 |
| Trip Status Update | ≤ 2 | ≤ 3 | ≤ 2 | ≤ 2 | ≤ 3 |
| Driver GPS ping | 0–1 (presence upsert optional) | ≤ 1 | Broadcast only | 0 | 0 |

### Rendering budget

| Event | Max renders |
|-------|-------------|
| Realtime message | ≤ 3 |
| Trip status update | ≤ 2 |
| Location update | ≤ 1 / sec |

### Network budget (one focused screen)

| Metric | Budget |
|--------|--------|
| Websocket / shared channels | per subscription budget above |
| Messages / sec (steady) | ≤ 10 (non-GPS); GPS via Broadcast separately |
| Sustained KB / sec | record in P0; set numeric cap after baseline |

### Success metrics (release targets)

| Category | Target |
|----------|--------|
| DB CPU (50 concurrent users) | &lt; 70% |
| Connection pool utilization | &lt; 70% |
| Realtime callbacks per event | ≤ 5 |
| Cache invalidations per event | ≤ 2 |
| UI renders per event | ≤ 5 |
| Chat p95 latency | &lt; 300 ms |
| Bid p95 latency | &lt; 500 ms |
| Failed realtime deliveries | 0 |
| Hidden-screen subscriptions | 0 |
| Critical DB incidents | 0 |

---

## Roadmap (P0–P6)

| Phase | Name | Goal | Gate |
|-------|------|------|------|
| **P0** | Observability & Health | Cost visible before users feel pain | Health dashboard operational |
| **P0.5** | Observe | Live with metrics until understood — **no optimization** | Evidence log has real session notes |
| **P1** | Realtime Engine | Inventory + standardize transport (evidence-driven) | Inventory complete; registry-only |
| **P2** | Database Engine | Cut write amplification / RLS cost | Hotspots measured + optimized |
| **P3** | Query & Cache Engine | Merge ≫ invalidate | Cache strategy standardized |
| **P4** | Lifecycle Management | Hidden UI ≈ 0 cost | Tablet/tab lifecycle validated |
| **P5** | Event Platform | Typed business events | After P0–P4 healthy |
| **P6** | Scalability Regression Suite | Stress gates in release | Automated suite enforced |

**Sequencing:**

```
P0 Instrument
  → P0.5 Observe (2–3 days with /platform-health open — do not fix yet)
  → P1 Inventory (driven by evidence, not theory)
  → P2 Database
  → P3 Cache
  → P4 Lifecycle
  → Marketplace M2 / Driver UX may resume
  → P5 Events (can overlap)
  → P6 Regression (release gate)
```

**Hard rule:** Marketplace M2, Driver UX, and other major feature work **do not proceed** until **P0–P4** are complete and gated. P5–P6 may continue in parallel once health signals are green.

---

## Workstream detail

### P0 — Observability & Health

Minimum engineering homepage (not Grafana/Prometheus required for v0):

- Realtime: active channels, opens/closes, broadcast deliveries, postgres_changes deliveries, cap utilization
- Cache: `setQueryData` count, `invalidateQueries` count, invalidation storms
- Application: subscription registry size, memory (where available)
- Database: link to Supabase advisors / slow query logs (external until instrumented)

**UI:** `app/platform-health/` (engineering / `__DEV__` + org admin) — open daily, not only when debugging.

### P0.5 — Observe (mandatory pause)

Use Pulse for 2–3 days with `/platform-health` open beside:

Marketplace · Finance · Driver · Chat · Dispatcher

Intentionally:

- Open five browser tabs
- Send high chat volume
- Place bids from multiple accounts
- Switch screens rapidly
- Leave tabs idle (~1 hour)
- Complete trips / upload PODs

**Do not fix anything in P0.5.** Record Area / Cost / Priority in the Evidence log. Premature optimization wastes the instrumentation.

### P1 — Realtime Engine

Inventory every subscription: feature, frequency, scope, mount, transport, consumer, fan-out. Classify transport centrally. Hidden screens unsubscribe. Priority order comes from P0.5 evidence, not speculation.

### P2 — Database Engine

Audit hot write paths (Chat, Bid, Award, Trip Status, GPS, Finance, Notifications): writes, triggers, RLS, subscriptions, invalidations. Target one write → one transaction → minimal trigger chain.

### P3 — Query & Cache Engine

Classify every `invalidateQueries` / `refetchQueries` / `resetQueries`. Prefer `setQueryData`. Patch / Refresh / Rebuild taxonomy.

### P4 — Lifecycle Management

Audit tabs, drawers, split panes, modals. Visible → subscribed; Hidden → paused; Unmounted → disposed.

### P5 — Event Platform

Typed events (`BidPlaced`, `MessageReceived`, `DriverLocationUpdated`, …). Features subscribe to business events, not raw tables.

### P6 — Scalability Regression Suite

10 / 25 / 50 / 100 concurrent users across Chat, Marketplace, Tracking, Notifications, Finance. Fail release if CPU, pool, locks, p95, or subscription counts exceed budgets.

---

## Ownership

| Role | Responsibility |
|------|----------------|
| Scalability Platform | Transport, registry, cache policy, budgets, health dashboard, regression gates |
| Feature teams | Consume platform APIs; never invent sync infrastructure |
| Product | M2+ UX only after P0–P4 gates |

---

## Evidence log (living)

Update this section as measurements land. Do not delete historical rows.

| Date | Finding | Metric (before) | Metric (after) | Source |
|------|---------|-----------------|----------------|--------|
| 2026-08 | Chat dual-write cascade (trip_messages + chat_messages + triggers) | ~5 writes / message | TBD | `docs/REALTIME_MESSAGING_ARCHITECTURE_REVIEW.md` |
| 2026-08 | Shared registry exists; not all features equal | Cap 50; grace teardown | — | `lib/realtimeRegistry.ts` |
| 2026-08 | Trip UPDATE merges list/detail cache | partial | — | `lib/queries/useRealtimeInvalidation.ts` |
| 2026-08 | Broad invalidations still present (Finance, posts, ops) | TBD count | TBD | repo `invalidateQueries` audit (P3) |
| 2026-08 | P0 health snapshot + budgets module landed | — | counters live in-app | `lib/platform/scalability/` · `/platform-health` |
| 2026-08 | **P0.5 Observe started** — no code fixes until evidence matrix filled | — | pending sessions | Use Pulse with `/platform-health` open |

---

## Engineering principle

> **Business platforms define what the application does.  
> Scalability & Reliability Platform defines how it operates efficiently under load.**

Once this platform is complete, new features should primarily consume Trip Ops, Marketplace, and Scalability platforms — not introduce new infrastructure patterns.
