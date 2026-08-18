# Performance — Phase 1 implementation map

**Status: planning only. No source file has been modified to produce this.**
Verified fresh against the actual committed state — `e70d339e` (date-range fix), `a7b2695e`
(Sales/Asset consolidation), `168bddb3` (`"performance"` route reservation) — not against the
earlier drafts in `docs/PERFORMANCE_MERGE_AUDIT_AND_PLAN.md`, which were written before the
Sales consolidation actually landed. Confirmed today, by direct `git status`, that every file
this plan depends on (`NetworkDesktopGoalsPanel.tsx`, `connectionGoalsAnalytics.util.ts`,
`networkGoalsStorage.service.ts`, `NetworkDesktopEntityGoalWizard.tsx`,
`connectionSalesAnalytics.util.ts`, `assetSalesAnalytics.util.ts`) is untouched and matches what
both prior docs describe. This map supersedes those docs' Phase 1 sections; their architectural
reasoning (§0-§31 of `PERFORMANCE_MERGE_AUDIT_AND_PLAN.md`) still holds and isn't repeated here
except where a concrete file/component decision is needed.

---

## 1. Existing component/function → Performance architecture map

| Performance concern | Existing source | Status |
|---|---|---|
| Target/actual/achievement | `connectionGoalsAnalytics.util.ts` (`computeGoalsActualsForRollup`, `buildGoalSummaryRows`, `goalStatus`) | Reuse unchanged, called with filtered inputs |
| Target storage (monthly/quarterly/yearly, per-client/vehicle/driver) | `networkGoalsStorage.service.ts` (`NetworkGoalsStore`) | Reuse unchanged, no schema change |
| KAM/Region assignment | `store.kamAssignments`, `store.clientRegions` | Reuse unchanged, client-id-keyed |
| Entity rows (client/vehicle/driver target+actual) | `buildEntityGoalRows` | Reuse unchanged |
| Receivable/Payable | `computePayableReceivableSnapshot` → `aggregateCustomers`/`aggregateSuppliers`/`aggregateDrivers` | Reuse unchanged; caller passes filtered `clients` (§4 for Payable's attribution limit) |
| Date-range "all" = 18 months | `monthsForRange()` in `connectionSalesAnalytics.util.ts` | **Already fixed and committed (`e70d339e`)** — both Sales utils now derive from this one function |
| Aggregate/Asset scope + capability gating | `NetworkDesktopSalesPanel.tsx` (`resolveSalesScope`, `canAccessClients`/`canAccessDrivers`) | Reuse gating logic wholesale; its two-way toggle becomes derived from the six-way Performance perspective (§6 below), not a second control |
| Connection-side diagnostics (lane mix, by-role, contribution, origins/destinations) | `NetworkDesktopConnectionSalesPanel.tsx` + `connectionSalesAnalytics.util.ts` | Reuse unchanged, fed `filteredTrips` |
| Asset-side diagnostics (fleet intelligence, driver/vehicle contribution, on-time%) | `NetworkDesktopAssetSalesPanel.tsx` + `assetSalesAnalytics.util.ts` | Reuse unchanged, fed `filteredTrips` |
| Supplier attribution | `trip.supplier_id`, `trip.supplier_rate` (direct trip fields) | Reuse directly, no join needed |
| Modal/detail-overlay pattern | `NetworkDesktopEntityGoalWizard.tsx` (`<Modal transparent animationType="fade">`) | Reuse this exact shell for Progress modals |
| Route/tab plumbing | `NetworkDesktopHub.tsx` (`"performance"` reserved, `168bddb3`) | Wire the real tab entry + render branch here (Commit 1 of this phase) |

## 2. Reusable unchanged — no source change at all

`connectionGoalsAnalytics.util.ts`, `connectionSalesAnalytics.util.ts`, `assetSalesAnalytics.util.ts`, `networkGoalsStorage.service.ts`, `NetworkDesktopConnectionSalesPanel.tsx`, `NetworkDesktopAssetSalesPanel.tsx`, `NetworkDesktopConnectionSalesTripsTable.tsx`, `NetworkDesktopSalesTableOverflow.tsx`, `NetworkDesktopEntityGoalWizard.tsx` (as a shell to extend, not fork). Every existing React Query hook (`useTripsQuery`, `useTransactionsQuery`, `useClientsQuery`, `useSuppliersQuery`, `useDriversQuery`, `useVehiclesQuery`, `useOrgMembersQuery`) — confirmed already `orgId`-scoped and fully cached, zero new queries anywhere in this plan.

## 3. Must be extracted/shared — new, small, pure functions only

All additive, in `connectionGoalsAnalytics.util.ts` unless noted (no existing exported signature changes except `goalStatus()` gaining one branch):

- `resolveClientIdsForFilter(crossFilter, clients, kamAssignments, clientRegions) → Set<string> | null`
- `filterTripsForCrossFilter(trips, crossFilter, clientIdSet) → TripRow[]` — adds direct `supplier_id`/`vehicle_id`/`driver_id` matching alongside the client-id-set matching
- `sumTargetsForIds(store, monthKeys, focus, ids) → EntityTargetMetrics` — thin wrapper around the already-exported `sumEntityTargetsForKeys`, for KAM/Region rollups
- `goalStatus()` extended with the locked `"exceeded"` branch (`actual > target`)
- `tripDayKey()` / `tripWeekKey()` — siblings of the existing `tripMonthKey()`, same fallback chain
- `targetToDate(periodTarget, periodStart, periodEnd, asOf)` — pure calendar math for Pacing %
- `groupTripsBySupplier`, `groupTripsByClientSupplier`, `groupTripsByAssetSupplier` — small `Map`-based groupers for the Supplier diagnostic views (§17/§25 of the merge-audit doc), same pattern as the existing `entityActualsForFocus`

No new file is required for these — they're additive exports in the existing util, consistent with "don't duplicate Sales analytics logic, don't create a third architecture."

## 4. Missing data attribution — restated once, precisely, so Phase 1 doesn't relitigate it

- KAM and Region are **client-id-keyed only** (`store.kamAssignments`, `store.clientRegions`) — no supplier/driver/asset equivalent. Confirmed, unchanged since the original investigation.
- **Payable has no KAM/Region attribution path.** Locked behavior: always show the real org-wide Payable figure; when a KAM/Region filter is active, show a visible "Not affected by [KAM/Region] filter" label next to it. Never compute a filtered Payable number.
- **No supplier target exists** (`GoalFocus` is `"client" | "vehicle" | "driver"` only). Supplier performance shows Actual/Previous/Growth/Trips/Cost/Margin with an explicit "No supplier target set" state — never fabricated or allocated from the aggregate target.
- KAM/Region targets are **always derived** (summed from `month.clients[id]` across the relevant client-id set) — never independently stored. Quarterly/yearly entity rollups already work today via `sumEntityTargetsForKeys` accepting any `monthKeys` array spanning a quarter or year — confirmed, no gap.

## 5. Smallest number of new files/components

Three, not more:

1. **`NetworkDesktopPerformancePanel.tsx`** — the new orchestrator. Inherits `NetworkDesktopGoalsPanel.tsx`'s state/hooks/derivations (copy-and-extend, not a from-scratch rewrite — see §8), adds `PerformanceCrossFilter`, renders the KPI/trend/breakdown layer, then renders `NetworkDesktopConnectionSalesPanel`/`NetworkDesktopAssetSalesPanel` underneath as the "Why?" section depending on active perspective.
2. **A Progress-modal component** (exact name TBD at Phase 2, e.g. `NetworkDesktopPerformanceProgressModal.tsx`) — reuses `NetworkDesktopEntityGoalWizard.tsx`'s `<Modal>` shell, handles the in-modal KAM→Client→Supplier→Asset navigation stack. **Not built in this Phase 1 commit sequence** (per the already-agreed Phase 1/Phase 2 split) — named here only so the file count is honest about total scope.
3. **A shared mini Trips evidence table** (exact name TBD, e.g. `NetworkDesktopPerformanceTripsEvidence.tsx`) — the 5/10-row table + View all + Download, reused by the main page and every Progress modal. **Also Phase 2/3**, not Phase 1.

**Phase 1 itself needs only file #1, new.** Everything else in Phase 1 is additive changes to existing files.

## 6. `PerformanceCrossFilter` state model

```ts
type PerformanceCrossFilter = {
  kamId: string | null;
  regionId: string | null;
  clientId: string | null;
  supplierId: string | null;      // direct trip.supplier_id match
  assetId: string | null;         // vehicle or driver id, per active perspective's asset kind
  performanceStatus: "behind" | "on_track" | "exceeded" | null;
  trendPointKey: string | null;   // day/week/month key selected on the trend chart
};
```

One `useState`, colocated in `NetworkDesktopPerformancePanel.tsx` — not a `useReducer` (fields have no derived transitions between them beyond the clearing rules already specified in the merge-audit doc §8), not a Context, not URL state. Same reasoning as already locked: single orchestrating component, no cross-component prop-drilling distance to justify either.

**Perspective** (`"aggregate" | "kam" | "client" | "region" | "supplier" | "asset"`) is a **separate** piece of state, not part of `PerformanceCrossFilter` — it's a view-mode selector (which breakdown table renders, which Sales panel renders underneath), not a filter dimension, exactly as `activeFocus`/`SalesScope` already work today.

## 7. Data pipeline

```
raw queries (existing hooks, orgId-scoped, cached — zero new queries)
  trips, transactions, clients, suppliers, drivers, vehicles, orgMembers, goalsStore
      ↓
clientIdSet = resolveClientIdsForFilter(crossFilter, clients, kamAssignments, clientRegions)
      ↓
FILTERED DATASET
  filteredTrips    = filterTripsForCrossFilter(trips, crossFilter, clientIdSet)
  filteredClients  = clientIdSet ? clients.filter(...) : clients
      ↓                                    ↓
TARGET LAYER                          ACTUAL LAYER
  goalsStore + sumTargetsForIds        computeGoalsActualsForRollup(filteredTrips, ...)
  (existing, per-entity or KAM/        buildBalanceTrendPoints(filteredTrips, ...)
   Region-summed)                      computePayableReceivableSnapshot(filteredClients, ...)
      ↓                                    ↓
      └──────────────┬─────────────────────┘
                      ↓
        target-to-date / pacing (new pure fn) + previous-period (shifted-window
        filterTripsForCrossFilter call, same helper, no new plumbing)
                      ↓
              VISUALIZATIONS
   KPI strip · trend chart · perspective breakdown table
                      ↓
         "WHY?" LAYER (existing Sales/Asset panels, unchanged,
          fed filteredTrips instead of raw trips; their own local
          SalesCrossFilters/AssetSalesCrossFilters apply on top)
                      ↓
       DRILL-DOWN EVIDENCE (Phase 2/3 — Progress modals + mini trip table,
        reading the same filteredTrips subset scoped to whichever entity
        was drilled into)
```

**LOCKED (refined per review):** there is exactly one filtering predicate/context —
`PerformanceCrossFilter` — feeding Target, Actual, and Previous-period layers in parallel, then
one shared visual layer, then the existing Sales/Asset analytics, then (Phase 2/3) the Progress
modal and trip evidence. `SalesCrossFilters`/`AssetSalesCrossFilters` remain as local analytical
sub-filters *within* the Why-layer — they must never become a second global filter system, and
nothing in this plan promotes them to the top-level chip bar.

## 8b. Locked UX hierarchy (one page, six perspectives — not six pages)

```
1. Perspective        — Aggregate · KAM · Client · Region · Supplier · Asset
2. Cross-filter chips  — "KAM: Bhujesh × Client: ABC Logistics × Region: South · Clear all"
3. Performance headline — Target | Actual | Previous | Variance | Achievement | Pacing
4. Trend               — Daily/Weekly/Monthly, target + actual + previous-period
5. Breakdown           — the active perspective's table (per §8's per-perspective shape)
6. Why? layer          — existing Sales/Asset analytics, unchanged
```

**Explicitly prohibited:** six separate layouts/mini-products behind the perspective selector.
Changing perspective changes the *analytical context* of this one page — the same headline,
trend, and Why-layer components stay mounted, only their inputs and the breakdown table's shape
change. `KAM → Bhujesh` does not navigate to a "KAM screen"; it re-scopes the same page exactly
the way clicking a cross-filter chip does. This is the same principle already locked for
Client/Supplier Progress (§9/§10 of `PERFORMANCE_MERGE_AUDIT_AND_PLAN.md`) — no target ever gets
fabricated for Supplier, and no perspective ever gets its own bespoke page.

## 8. Component hierarchy

```
NetworkDesktopHub.tsx
  tab === "performance"  →  NetworkDesktopPerformancePanel
                              ├─ Header: period + granularity + perspective selector + chip bar
                              ├─ KPI strip (Sales/Trips/Margin/Receivable/Payable)
                              ├─ Trend chart (Daily/Weekly/Monthly, target-to-date + previous period)
                              ├─ Perspective breakdown table (shape depends on active perspective —
                              │   Aggregate: KAM/Client/Supplier/Asset summary rows;
                              │   KAM: Clients→Suppliers→Assets; etc., per the locked table
                              │   in PERFORMANCE_MERGE_AUDIT_AND_PLAN.md's "Final locked
                              │   product constraints" section)
                              ├─ "Why?" section:
                              │    perspective === "asset" ? <NetworkDesktopAssetSalesPanel filteredTrips=.../>
                              │                             : <NetworkDesktopConnectionSalesPanel filteredTrips=.../>
                              └─ (Phase 2/3) Progress modal + mini trip evidence table
```

## 9. Exact files to modify — Phase 1 only

| File | Change |
|---|---|
| `NetworkDesktopHub.tsx` | Wire the reserved `"performance"` tab: add to `TABS`, add its render branch → `NetworkDesktopPerformancePanel`. **This is the only edit to this file in Phase 1.** Still needs the same isolation technique as Commits 1-2, since unrelated concurrent work is still sitting on it. |
| `NetworkDesktopPerformancePanel.tsx` (new) | New orchestrator per §5/§8 |
| `connectionGoalsAnalytics.util.ts` | Additive exports per §3 |
| `NetworkDesktopSalesPanel.tsx` | `SalesScope` becomes a derived value from the Performance perspective rather than independently chosen (only relevant once `NetworkDesktopPerformancePanel` renders it — small prop-plumbing change) |

Explicitly **not touched in Phase 1**: `NetworkDesktopConnectionSalesPanel.tsx`, `NetworkDesktopAssetSalesPanel.tsx` (they gain a `filteredTrips`-accepting prop only in the commit that actually wires cross-filtering through to them — see sequence below), `networkGoalsStorage.service.ts`, any Supabase schema/RPC, `NetworkDesktopGoalsPanel.tsx` (kept alive and reachable at its own `"goals"` tab id throughout Phase 1 — not deleted, not redirected, per the standing "don't reopen Goals" rule).

## 10. Commit-by-commit sequence — Phase 1

Same discipline as Commits 1-2: each commit isolated, verified, reported before staging, `NetworkDesktopHub.tsx` edits reconstructed against committed HEAD to avoid absorbing unrelated concurrent work.

1. **Wire the `"performance"` tab** — `NetworkDesktopHub.tsx` (`TABS` entry + render branch to a placeholder `NetworkDesktopPerformancePanel` that, for this one commit, renders literally nothing beyond a shell/loading state — proves routing works before any real content exists). Small, isolated, same reconstruction technique as before.
2. **`PerformanceCrossFilter` state + perspective state** in `NetworkDesktopPerformancePanel.tsx` — no visible behavior yet, just the state shapes from §6.
3. **Pure helpers** (§3) in `connectionGoalsAnalytics.util.ts`, unit-tested in isolation, not wired in yet.
4. **KPI strip + trend, unfiltered** — port `NetworkDesktopGoalsPanel.tsx`'s existing KPI-card and trend-chart rendering into the new panel, reading the existing (unfiltered) `actuals`/`balanceTrend` — proves the new panel can reproduce what Goals already shows, before any filtering logic is added.
5. **Wire `filteredTrips`/`filteredClients` into the KPI/trend/Receivable-Payable layer** — the core cross-filter propagation, same as already proven correct in the Goals-only plan. KAM/Region pills added here.
6. **Perspective selector + breakdown table** — the six-way `[Aggregate|KAM|Client|Region|Supplier|Asset]` selector, `SalesScope` derived from it, the breakdown table shape switching per the locked per-perspective table.
7. **Thread `filteredTrips` into the Why-layer** — `NetworkDesktopConnectionSalesPanel`/`NetworkDesktopAssetSalesPanel` accept and use it; confirm their own local filters still work unchanged on top.
8. **Client/Supplier/Asset filter dimensions + per-chip clear/Clear all** — extends the chip bar to all six dimensions.
9. **Time intelligence** — day/week bucketing, trend-point cross-filter, target-to-date/Pacing %, the locked `>100%` Exceeded threshold.
10. **Visual polish** — selection highlight/recede, empty states, transitions.

**Not in this sequence, confirmed deliberately deferred:** Progress modals, the mini trip evidence table, Download/export, contextual target editing, Exceptions/"Needs attention" — Phase 2/3/4 per the already-agreed phase structure in `PERFORMANCE_MERGE_AUDIT_AND_PLAN.md` §31.

---

No source file has been modified. Awaiting your review of this map before Commit 1 of Phase 1 begins.
