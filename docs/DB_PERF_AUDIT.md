# Pulse (q-web) — Full Performance Audit

**Date:** 2026-07-13
**Scope:** Database, backend services, frontend, realtime, network, architecture.
**Constraint:** No hardware/compute upgrade. Software optimizations only.
**Method:** Live DB measurement (Supabase MCP) + full codebase sweep (2 parallel search agents).

---

## 0. Executive Summary — Read This First

**The recent outage was NOT caused by any item in this report.** Live diagnostics proved it
was a Supabase platform incident + a manual DB restart (SQLSTATE `57P01 admin shutdown`,
`57P05/57P03 in recovery`, Cloudflare `521`). A 56 MB idle database with healthy replication
slots and 20/60 connections does not crash from application load.

**Current data scale (measured live):**

| Metric | Value |
|---|---|
| Total DB size | **56 MB** |
| Largest business table | **13 rows** (`chat_messages`) |
| `trips`, `drivers`, `clients`, `transactions` | **0 rows** |
| Only table > 200 rows | `cron.job_run_details` (4,845 rows, engine-internal) |
| Connections | 20 / 60 |
| Replication slots | healthy, 56 bytes retained |

**Consequence for prioritisation:** at this scale the Postgres planner **seq-scans every
business table regardless of indexes** (correct behaviour under ~200 rows). Therefore the
advisor's "131 unindexed FKs" and "368 unused indexes" produce **zero measurable change today**.
They are *future-scale* hygiene. This report ranks by **real ROI at production scale**, and
flags which items are safe to apply now vs. must wait for verification.

**What is genuinely worth doing (and safe):**
1. Consolidate the 3 true duplicate indexes (verified — write overhead, no read cost).
2. Route the ~8 realtime `.channel()` bypass sites through the existing registry (connection churn — the one thing that *can* pressure the 60-conn cap under real traffic).
3. Cap/parallelise the ledger-reconciliation N+1 (worst code offender: 30 trips × N candidates, fully sequential).
4. Tighten `.select('*')` on wide financial tables and a few aggressive polls.

**What must NOT be done blindly (especially pre-demo):**
- Dropping the "368 unused" or most "duplicate" indexes — most flagged pairs differ by sort
  order or partial predicate and serve distinct queries (see §DB-2).
- Merging the "153 multiple permissive RLS policies" — they encode *distinct access paths*
  (driver vs org-member vs linked-supplier); a wrong merge silently widens access = security bug.

---

## Top 20 Opportunities, Ranked by ROI (gain ÷ effort ÷ risk)

Legend — **When:** `now` = safe additive, apply anytime · `post-demo` = behavioural, verify first · `scale` = only matters at >10k rows.

| # | Opportunity | Impact | Complexity | Risk | When |
|---|---|---|---|---|---|
| 1 | Route realtime `.channel()` bypass sites through registry | High (conns) | Med | Low | post-demo |
| 2 | Cap + parallelise ledger reconciliation N+1 | High (CPU/latency) | Med | Med | post-demo |
| 3 | Consolidate 3 verified duplicate indexes | Low now / Med scale | Low | Low | now |
| 4 | Batch `ClientDetailScreen` per-org N+1 (batch API exists) | Med | Low | Low | post-demo |
| 5 | Fix module-level channel cache leak (`publishTrackingBroadcast`) | Med (conns) | Low | Low | post-demo |
| 6 | Replace `.select('*')` on wide ledger tables w/ column lists | Med (payload) | Med | Low | post-demo |
| 7 | Lower OCR poll 2s → adaptive / realtime | Med (req count) | Low | Low | post-demo |
| 8 | Batch driver/vehicle name-map fan-out (`.in()`) | Med | Low | Low | post-demo |
| 9 | Add FK indexes (only on tables projected to grow) | High at scale | Low | Low | scale |
| 10 | Merge duplicate-fetch org member lists (`useIdentityQuery`) | Low | Low | Low | post-demo |
| 11 | Parallelise independent sequential awaits (assignment bridge) | Low | Low | Low | post-demo |
| 12 | Raise staleTime on 20s reconciliation/observability queries | Med (req count) | Low | Low | post-demo |
| 13 | `useStoryViewsQuery` refetchOnWindowFocus:true → false | Low | Low | Low | post-demo |
| 14 | Driver-home poll: 2 backend calls/tick → 1 combined | Low | Med | Low | post-demo |
| 15 | Move heavy per-trip reconciliation into a single SQL RPC | High at scale | High | Med | scale |
| 16 | `EXPLAIN ANALYZE` + optimise `get_pending_otp_trips()` | Med | Low | Low | post-demo |
| 17 | Drop genuinely-unused indexes (after pg_stat verification at scale) | Low | Low | Med | scale |
| 18 | Merge multiple permissive RLS policies (carefully, per table) | Low now / Med scale | High | High | scale |
| 19 | Materialised views for analytics/observability | Med at scale | High | Med | scale |
| 20 | Cursor pagination on message/trip lists | Med at scale | Med | Low | scale |

---

## Database Findings

### DB-1 — Duplicate indexes (VERIFIED, item #3, safe now)
**Root cause:** overlapping index definitions accumulated across migrations.
**Only 3 pairs are true duplicates** (identical columns AND sort AND predicate), where the
plain index duplicates a constraint-backed unique index and can be dropped safely:

| Table | Drop (redundant plain) | Keep (constraint-backed) |
|---|---|---|
| `organization_members` | `idx_org_members_org_user` | `organization_members_organization_id_user_id_key` |
| `trip_conversations` | `idx_trip_conversations_trip_party` | `trip_conversations_trip_id_party_type_key` |
| `trip_otps` | `idx_trip_otps_trip_id` | `trip_otps_trip_id_key` |

**NOT duplicates (do NOT drop):**
- `trip_messages`: `idx_tm_conv_time` (ASC), `idx_trip_messages_conv_created` (DESC),
  `idx_trip_messages_unread_conv` (partial `WHERE is_read=false`) — three *different* access patterns.
- `trips`: `idx_trips_indent_id` (full) vs `trips_one_per_indent` (partial unique `indent_id IS NOT NULL`) — the full index still serves `indent_id IS NULL` scans.
- `indents`: `idx_indents_organization_id` (full) vs `idx_indents_deleted_at` (partial `deleted_at IS NULL`) — partial is a legit optimisation.

**Impact:** each redundant index adds write amplification (every insert/update maintains it) and
WAL. At 0–13 rows this is negligible; at scale it's a real per-write cost. **Estimated:** ~3
fewer index maintenances per write on those 3 hot tables.
**Implementation (new migration):**
```sql
-- supabase/migrations/<ts>_drop_duplicate_indexes.sql
DROP INDEX IF EXISTS public.idx_org_members_org_user;
DROP INDEX IF EXISTS public.idx_trip_conversations_trip_party;
DROP INDEX IF EXISTS public.idx_trip_otps_trip_id;
```
**Risk:** Low — the kept unique indexes cover identical column sets.

### DB-2 — "Unindexed FKs" (131) & "unused indexes" (368) — item #9, #17 (scale only)
**Root cause:** advisor heuristics assume production-scale tables.
**Impact today:** none — planner seq-scans <200-row tables. **Do not add or drop based on the
linter now.** At scale, add FK indexes on high-cardinality join columns *actually used in WHERE/
JOIN* (`trips.driver_id`, `trips.indent_id`, `transactions.organization_id`, etc.), and drop
unused ones only after `pg_stat_user_indexes.idx_scan = 0` over a real traffic window.

### DB-3 — Multiple permissive RLS policies (153) — item #18 (scale, HIGH risk)
**Root cause:** distinct access paths written as separate policies (driver, org-member,
linked-supplier, linked-client). Measured examples: `trip_messages` (3 INSERT + 3 SELECT),
`trip_conversations` (3 SELECT), `driver_locations` (3 SELECT), `trips` (2 SELECT + 2 UPDATE).
**Impact:** Postgres evaluates every permissive policy per row (OR'd). At scale this is per-row
CPU. **Merging is possible but HIGH risk** — combining into one `USING (a OR b OR c)` must exactly
reproduce the union or it widens/narrows access (security regression). Per project policy, RLS
changes require explicit approval and per-table verification. **Not a pre-demo task.**

### DB-4 — `get_pending_otp_trips()` — item #16
Slowest *business* RPC in `pg_stat_statements` (mean inflated by the restart window; needs a
clean-state `EXPLAIN ANALYZE`). Polled every 30s (pending) / 120s (idle), foreground only,
deduped across its 2 consumers via shared query key. Definition: `features/trips/services/tripOtp.service.ts:135`.

---

## Realtime Findings

### RT-1 — Registry bypass sites (item #1, highest realtime ROI)
**Root cause:** ~8 call sites create `.channel()` directly instead of using the existing
ref-counted registry (`lib/realtimeRegistry.ts`), so each opens its own server channel outside
the cap/grace/prune logic. Under real multi-user traffic this is the main driver of connection
churn against the 60-connection cap.
**Bypass sites:**
- `features/drivers/screens/DriverProfileScreen.tsx:214` — unfiltered whole-`trips`-table channel
- `features/drivers/screens/DriverLevelProgressionScreen.tsx:93` — same unfiltered pattern
- `features/trips/hooks/useFleetMarkers.ts:79`
- `features/trips/hooks/useLiveDriverMarker.ts:105`
- `features/drivers/hooks/useDriverLocation.ts:47`
- `features/organization/services/members.service.ts:76`
- `features/organization/services/verificationTier.service.ts:105`
- `features/chat/hooks/useChatTypingPresence.ts:48` (presence)
**Impact:** consolidating N per-screen channels into shared keyed channels →
**est. 30–60% fewer realtime connections** under concurrent users.
**Implementation:** replace each `supabase().channel(...).on('postgres_changes',...).subscribe()`
with `subscribeSharedPostgresChanges(key, specs, listener)` from `lib/realtimeRegistry.ts:259`.
Use a stable `key` per logical stream (e.g. `trips:driver:${driverId}`). Tighten the two
unfiltered whole-`trips` subscriptions with a `filter`.
**Risk:** Low–Med — behavioural; verify each screen still receives updates. **Post-demo.**

### RT-2 — Module-level channel cache leak (item #5)
**Root cause:** `features/tracking/broadcast/publishTrackingBroadcast.ts:18,29` stores channels in
module-level `Map`s with no ref-counting or grace teardown; only cleared if
`teardownTrackingPublishChannels()` (line 87) is explicitly called. Missed teardown → channels
persist for the session.
**Fix:** route through `subscribeSharedBroadcast` (registry, `:312`) or add ref-counting +
teardown-on-idle. **Post-demo, Low risk.**

### RT-3 — Registry is healthy (no action)
`lib/realtimeRegistry.ts` already implements ref-counting, 15s grace teardown, 50-channel cap,
10-min stale sweep, foreground pruning, sign-out clear. 20+ importers. This is good architecture —
the work is finishing adoption (RT-1), not building it.

---

## Backend / Query Findings

### BE-1 — Ledger reconciliation compound N+1 (item #2, worst code offender)
**Root cause:** `features/ledger/reconciliation/useLedgerReconciliation.ts:133-151` loops up to 30
trips **sequentially**, each calling `reconcileVehicleLedgerState`, which itself
(`reconciliation.service.ts:99-106`) loops candidates **sequentially**, each a Supabase query.
Compound sequential N+1: 30 × N round trips.
**Impact:** at real trip volume this is the single largest latency + connection-hold source in the
app. **Est.:** 30×N sequential round trips → `Promise.all` with a concurrency cap of ~5 cuts
wall-clock ~5–10×; a single SQL RPC (item #15) collapses it to 1 round trip.
**Implementation (incremental, low risk):** wrap the inner candidate loop and the outer trip loop
in `Promise.all` with a small concurrency limiter (respect write-ordering where posting mutates).
**Implementation (ideal, item #15):** move the reconciliation logic into a Postgres function
returning the final state set; call once. **Post-demo, Med risk.**

### BE-2 — `ClientDetailScreen` per-org N+1 (item #4)
**Root cause:** `features/clients/components/ClientDetailScreen.tsx:643-646` calls
`getLinkedOrgProfile(oid)` per org, while a batch `getLinkedOrgProfilesBatch(orgIds[])` already
exists (used at `features/chat/services/chat.service.ts:1304`).
**Fix:** replace the loop with one batched call. **Est.:** N queries → 1. **Post-demo, Low risk.**

### BE-3 — Chat assignment/ledger bridge per-conversation loops
`features/chat/services/chatAssignmentBridge.service.ts:167,251` and
`chatLedgerBridge.service.ts:112` run SELECT + RPC per conversation. Batch the SELECTs via `.in()`;
the RPC sends are inherently per-message. **Post-demo, Low risk.**

### BE-4 — Name-map fan-out (item #8)
`useAssignmentAuditNameMaps.ts:67,81` and `chatAssignmentBridge.service.ts:36,50` fetch
driver/vehicle one id at a time (parallel, but 1 query/id). Replace with `getDriverById`→`.in(ids)`
batch (2 queries total). **Post-demo, Low risk.**

### BE-5 — Over-fetching `.select('*')` (item #6)
Widespread on wide financial tables: `features/trips/operations/{fuel,toll,other,vehicle,
reimbursement,maintenance}.service.ts`, `documents.service.ts`, `ocrJob.service.ts` (8 sites,
large payloads), `ratings.service.ts` (8 sites). Replace `*` with explicit column lists the UI
uses. **Est.:** smaller payloads + less WAL/decode on realtime-published tables. **Post-demo, Low
risk (per-query).**

### BE-6 — Org lookups (item #10)
`OrganizationContext` is well-guarded (single-fetch). Minor: `useIdentityQuery.ts:36,83` fetches
the same org member list under two query keys — unify the key. **Post-demo, Low risk.**

---

## Frontend / React Query Findings

### FE-1 — Aggressive polls (items #7, #12, #14)
- `features/ocr/hooks/useOcrJobPoll.ts:43` — **2s** `setInterval`. Make adaptive (backoff) or
  realtime. #7.
- `lib/queries/useDriverHomeDriversQuery.ts:48` — 120s tick runs **two** backend calls
  (`sync...` then `getLinked...`). Combine. #14.
- 20s-staleTime queries: `useLedgerReconciliation.ts:155`, `usePostingReconciliation.ts:21`,
  `useOperationalObservability.ts:19`, `useOperationalHealthSnapshot.ts:24`,
  `useOperationsControlCenter.ts:30`. Raise where data isn't second-critical. #12.

### FE-2 — `refetchOnWindowFocus` override (item #13)
`lib/queries/useStoryViewsQuery.ts:16` sets `true`, overriding the global `false`. Extra refetch on
every focus. Set to `false` unless intentional. **Post-demo, Low risk.**

### FE-3 — Query config is otherwise sound (no action)
Global defaults (`lib/queryClient.ts`): staleTime 10min, refetchOnWindowFocus false,
`refetchOnMountIfEntityListEmpty` guard on entity lists. No missing-staleTime queries found.

---

## Estimated Reductions (at production scale, after items #1–#8, #12)

| Dimension | Estimated reduction | Driver |
|---|---|---|
| Realtime connections | **30–60%** | RT-1 registry adoption, RT-2 leak fix |
| Reconciliation latency | **5–10×** | BE-1 parallelise / RPC |
| Network requests | **20–40%** | polls (FE-1), batching (BE-2/3/4) |
| Payload size (financial screens) | **variable, meaningful** | BE-5 column lists |
| WAL generation | **small** | DB-1 dup indexes, BE-5 fewer wide realtime rows |
| CPU | **moderate** | fewer policy evals at scale (DB-3, deferred), fewer round trips |
| Page load | **moderate on ledger/finance** | BE-1, BE-5 |

*All estimates are at production scale. At the current 56 MB / <13-row scale, measured impact of
every item is effectively zero — which is why none of this is demo-critical.*

---

## Hardware Verdict

**No upgrade is justified.** The database is idle (56 MB, 20/60 conns, no bloat, no lock waits,
healthy replication). There is no sustained CPU saturation, connection exhaustion, or query
latency attributable to load — the only pressure event was an infrastructure incident + manual
restart. Software items #1–#8 remove the real inefficiencies that *would* matter as data grows.
Re-measure CPU / connections / p95 latency **after** those land and **after** real data volume
exists; only then reconsider compute — and current evidence predicts it still won't be needed.
