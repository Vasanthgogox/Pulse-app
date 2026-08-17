# Goals & Performance Center — implementation-ready plan

**Status: planning only. Nothing in this document has been implemented.**
No code, migration, RPC, or schema has been touched to produce this. Scope is exclusively
`Analytics → Goals` (the "Goals" tab inside the Network Org Hub — `Details · Team · My
Profile · Connection sales · Goals · Asset sales · Network · Chat`). This is **not** the
separate `analytics/` Vite admin console. Not touched: KYC, Organization, Fleet Owner,
Marketplace, 3B.2, Driver app.

---

## 1. Executive summary

The Goals tab already has the right bones for a Power BI-style cross-filtering + drill-down
experience: one orchestration component, cached React Query data, and a partial cross-filter
(`selectedKamFilter`/`selectedRegionFilter`) that already proves the pattern works. The gap is
narrow and specific: that filter only reaches the entity table, not the KPI cards / trend /
targets above it, and there's no drill-down (detail drawer) at all yet.

This plan extends the existing architecture in place. It adds three new cross-filter
dimensions (Client, Asset, Performance status, Time point), makes every visual read from one
shared filtered dataset instead of raw data, and adds three "Progress" modals (KAM / Client /
Asset) reusing the existing `NetworkDesktopEntityGoalWizard` modal pattern. No new Supabase
query, no new global store, no schema change — confirmed against the actual code, not assumed.

The one real product decision this plan can't make for you: what Payable shows under a
KAM/Region filter, since neither has supplier/driver attribution. Recommendation is stated in
§18, decision is yours.

## 2. Existing Goals architecture

- **File:** `features/network/components/desktop/NetworkDesktopGoalsPanel.tsx` (1849 lines) —
  the sole orchestration point. Every visual on the page (KPI cards, balance widgets, trend
  chart, entity table, target hierarchy) is rendered directly by this one component. There is
  no cross-component state-fragmentation problem to solve — this is already true single-source
  architecture.
- **Entry:** `NetworkDesktopHub.tsx:387` — `if (tab === "goals") return <NetworkDesktopGoalsPanel orgId={orgId} />`. No permission gate on the tab itself (`NetworkDesktopHub.tsx` TABS array has no `canSurface` check for `"goals"` — confirmed by grep, zero hits). See §22.
- **Existing partial cross-filter** (`:769-771,885-921,1457-1477`): `selectedKamFilter`,
  `selectedRegionFilter`, a derived `entityRows` (`allEntityRows` filtered by both), unique-value
  discovery (`activeKams`, `activeRegions`), a combined `hasActiveFilters` flag, and a
  filter-context bar with one shared clear button. This is the pattern being extended, not replaced.
- **Existing modal pattern:** `NetworkDesktopEntityGoalWizard.tsx:215` — `<Modal visible transparent animationType="fade">` with a `Pressable` backdrop, centered card. This is the established "detail/edit overlay" design system for this specific tab (distinct from the workspace flex-card's right-side drawer, which belongs to a different part of the app). The three new Progress drill-downs (§11-13) should reuse this exact pattern, not invent a right-side drawer that has no precedent here.
- **Existing view-mode switch:** `activeFocus: GoalFocus = "client" | "vehicle" | "driver"` (three-way tab, `FOCUS_TABS` at `:93-97`). This maps directly onto the requested `[Aggregate Performance | Asset Performance]` two-mode toggle — see §7.

## 3. Existing Goals data flow

```
useTripsQuery / useTransactionsQuery / useClientsQuery / useSuppliersQuery /
useDriversQuery / useVehiclesQuery / useOrgMembersQuery   (all orgId-scoped, React Query cached)
      ↓
raw arrays: trips, transactions, clients, suppliers, drivers, vehicles
      ↓
pure useMemo derivations in NetworkDesktopGoalsPanel.tsx, calling exported
functions in connectionGoalsAnalytics.util.ts:
  computeGoalsActualsForRollup(trips, ...)        → actuals (revenue/trips/margin)
  buildBalanceTrendPoints(trips, ...)              → balanceTrend
  computePayableReceivableSnapshot(clients, suppliers, drivers, trips, transactions, ...)
                                                    → balanceSnapshot (Receivable/Payable)
  buildGoalSummaryRows(goalsStore, actuals, ...)    → summaryRows (KPI cards, target half from goalsStore)
  buildEntityGoalRows(focus, goalsStore, clients, drivers, vehicles, trips, ...)
                                                    → allEntityRows → entityRows (already filtered)
      ↓
JSX renders each derived value directly
```

`NetworkGoalsStore` (targets, KAM assignments, regions) is loaded once per org via
`loadNetworkGoalsStore(orgId)` from `AsyncStorage` — device-local, not Supabase.

## 4. Confirmed data relationships

Verified directly in code this session — not assumed:

| Relationship | Valid via | Evidence |
|---|---|---|
| Trip → Client | `trip.client_id` | `trips.service.ts:73`, used directly `connectionGoalsAnalytics.util.ts:398` |
| Trip → Vehicle | `trip.vehicle_id` | `trips.service.ts:81`, used at `:410` (gated by `isAssetExecutionTrip`) |
| Trip → Driver | `trip.driver_id` | `trips.service.ts:80`, used at `:422` (gated by `isAssetExecutionTrip`) |
| Client → KAM | `store.kamAssignments[clientId] → userId` | `networkGoalsStorage.service.ts:37`, on-device only |
| Client → Region | `store.clientRegions[clientId] → region` | `:39`, on-device only |
| Trip → KAM | **Not valid.** No `trip.kam_id`. Only reachable by joining Trip→Client→KAM. | Confirmed: zero "kam" hits anywhere in `TripRow`/`ClientRow` |
| Supplier → KAM/Region | **Not valid. Does not exist.** | `kamAssignments`/`clientRegions` are keyed by client id only; no supplier/driver equivalent anywhere in `NetworkGoalsStore` |
| Driver → KAM/Region | **Not valid. Does not exist.** | Same as above |
| Vehicle → KAM/Region | **Not valid directly** — only reachable by Vehicle→Trip→Client→KAM, and only for trips where that vehicle actually carried that client's freight | Derivable, not stored |

**This is acceptable for V1 and is not being redesigned.** The dashboard's hierarchy is
therefore: `Business → KAM → Client → Asset(via shared trips) → Trip`, with the KAM and
Asset hops both being *derived joins through Client*, not stored foreign keys.

## 5. Metric availability matrix

✅ Directly supported · ⚠️ Derivable (new but small logic, existing data) · ❌ Not currently supported

| Metric | Aggregate | KAM | Client | Vehicle | Driver | Source |
|---|---|---|---|---|---|---|
| Sales revenue (actual) | ✅ | ⚠️ | ✅ | ✅ | ✅ | `computeTripMetrics` / `entityActualsForFocus` — raw `trip.client_price` |
| Trip count (actual) | ✅ | ⚠️ | ✅ | ✅ | ✅ | same, per-trip count |
| Margin % (actual) | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | derivable from revenue − `trip.supplier_rate`; not currently computed per-entity (only aggregate `computeTripMetrics`), needs the same formula applied per filtered set |
| Sales/trip target | ✅ (`month.aggregate`) | ⚠️ (sum `month.clients[id]` for KAM's clients) | ✅ (`month.clients[id]`) | ✅ (`month.vehicles[id]`) | ✅ (`month.drivers[id]`) | `NetworkGoalsStore` |
| Achievement % | ✅ | ⚠️ | ✅ | ✅ | ✅ | `progressPct(actual, target)` — already exists, reusable as-is |
| Receivable | ✅ | ⚠️ (filter `clients` array by KAM's client set, re-run `aggregateCustomers`) | ⚠️ (same, one client) | ❌ n/a (receivable is a client concept) | ❌ n/a | `aggregateCustomers` |
| Payable (supplier+driver) | ✅ | ❌ **no attribution — see §18** | ❌ n/a | ❌ n/a | ⚠️ driver-level payable *is* derivable (driver is the entity itself) | `aggregateSuppliers`/`aggregateDrivers` |
| Revenue per trip | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | `revenue / trips`, trivial arithmetic, not currently a stored field anywhere |
| Utilisation / active-idle days | ❌ | ❌ | ❌ | ❌ | ❌ | No such field on `VehicleRow`/`DriverRow` — checked directly, only a generic `status: string` exists. **Do not fabricate. Mark as future scope.** |
| Cost (beyond `supplier_rate`) | ❌ | ❌ | ❌ | ❌ | ❌ | Not modeled beyond what margin already uses |
| Daily / weekly trend | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | `trip.pickup_date`/`completed_at`/`created_at` all exist — needs a day/week bucketing function alongside the existing month bucketing (`tripMonthKey`) |
| Target-to-date / pacing | ❌ | ❌ | ❌ | ❌ | ❌ | Not computed anywhere today — pure new calendar-math derivation, see §16 |
| Exceeded status tier | ❌ | ❌ | ❌ | ❌ | ❌ | `goalStatus()` only returns `"on_track" \| "behind" \| "unset"` today — needs one new threshold branch, see §20 |

## 6. Target model

Confirmed structure (`networkGoalsStorage.service.ts:26-45`):

```
NetworkGoalsStore
├── months: Record<"YYYY-MM", {
│     aggregate: { revenueInr, tripCount, marginPct }
│     clients:   Record<clientId,  { revenueInr, tripCount }>
│     vehicles:  Record<vehicleId, { revenueInr, tripCount }>
│     drivers:   Record<driverId,  { revenueInr, tripCount }>
│   }>
├── yearlyTargets:    Record<"YYYY",    { revenueInr, tripCount, marginPct }>   — aggregate only, independently editable
└── quarterlyTargets: Record<"YYYY-QN", { revenueInr, tripCount, marginPct }>   — aggregate only, independently editable
```

Two facts worth stating precisely:

1. **Entity-level (client/vehicle/driver) quarterly/annual figures already work today** —
   `sumEntityTargetsForKeys(store, monthKeys, focus, id)` (`:232-253`) sums the relevant
   entity's monthly target across whatever `monthKeys` you pass, including a full quarter or
   year. No gap here — quarterly/annual entity targets are already a derived sum of months,
   nothing new needed.
2. **There is no stored KAM target or Region target, at any granularity.** A KAM/Region
   target must always be *derived* by summing `month.clients[id]` (or the quarterly/annual
   equivalent via the same `monthKeys` mechanism) across every client id currently assigned to
   that KAM/Region. **This is confirmed sufficient — do not create a KAM target storage
   structure.** The derivation is a pure sum over already-loaded data.

## 7. Proposed Goals information architecture

```
HEADER
  Goals & Performance Center
  [ Aug '26 ▼ ]  [ Monthly ▼ ]  [ Compare: Off ▼ ]   [ Aggregate Performance | Asset Performance ]
  Showing: Bhujesh ×  Tata Motors ×  Behind target ×          [ Clear all ]

KPI / GOAL SUMMARY ROW
  Sales revenue · Trips · Margin % · Receivable · (Payable, aggregate mode only)

TARGET VS ACTUAL TREND
  [ Daily | Weekly | Monthly ]  — click a point to cross-filter (§10)

PERFORMANCE BREAKDOWN (mode-dependent)
  Aggregate mode → KAM performance table + Client performance table
  Asset mode     → Vehicle performance table + Driver performance table

TARGET MANAGEMENT
  existing GoalTargetCard editing UI (Sales / Trips / Margin), unchanged mechanism

DETAILED PERFORMANCE TABLE (existing entityRows table, now page-wide-filtered)
  row click → cross-filter · "View progress" → drill-down modal (§11-13)
```

`[Aggregate Performance | Asset Performance]` is **not a new concept** — it's `activeFocus`
relabeled and regrouped: `"client"` → Aggregate Performance (the business-wide view, KAM/Client
tables); `"vehicle"`/`"driver"` → Asset Performance (with a small internal Vehicles/Drivers
sub-toggle, since they're still two distinct entity kinds). This is a UI regrouping of an
existing state value, not a new state field.

## 8. Aggregate Performance UX

Answers "How is the business performing against its goals?" KPIs, each with Target / Actual /
Target-to-date / Achievement % / Remaining / Previous period where supported (§5 matrix
governs what's real per KPI): Sales revenue, Trips, Margin %, Receivable, Payable
(unaffected-by-KAM-filter caveat, §18), Active clients (`entityRows.length`, already
computed). Revenue per trip is ⚠️ derivable arithmetic, safe to add. Forecast is **not**
listed — no existing forecasting logic anywhere in this file or its utils; do not add it
speculatively.

## 9. Asset Performance UX

Answers "How are our assets commercially performing?" Supported: Revenue, Target, Achievement
%, Trips, Revenue per trip (⚠️ derivable), Margin (⚠️ derivable per-entity, see §5). **Not
supported, mark explicitly as future scope, do not fabricate:** Utilisation, Active/idle days,
Costs beyond `supplier_rate`. Asset mode inherits compatible cross-filters — if `kamId` is set,
the vehicle/driver tables show only assets that appear in at least one trip whose `client_id`
belongs to that KAM's client set (derived join, §4); if no such trips exist for an asset, it
simply doesn't appear rather than showing a fabricated zero-attribution row.

## 10. Cross-filtering model

**Global (top bar, stays a small control):** Period, Granularity (Daily/Weekly/Monthly),
Comparison period, Aggregate/Asset mode. These are context, not filters — they don't get a
chip.

**Cross-filter dimensions (chips, direct-manipulation, not dropdowns):** KAM, Region, Client,
Asset, Performance status, Time point (trend chart click), Goal category (Sales/Trips/Margin
— maps onto the existing three `GoalTargetRow` metrics, clicking one scopes the diagnostic
view to that metric).

**State — one object, still local `useState`, still colocated in `NetworkDesktopGoalsPanel`:**

```ts
type GoalsCrossFilter = {
  kamId: string | null;
  regionId: string | null;
  clientId: string | null;
  assetId: string | null;            // vehicle or driver id, meaning follows activeFocus's asset sub-type
  performanceStatus: "behind" | "on_track" | "exceeded" | null;
  trendPointKey: string | null;      // day/week/month key selected on the trend chart
  goalCategory: "revenue" | "trips" | "margin" | null;
};
```

No Context, no external store, no URL state — same reasoning as before: one component owns
every visual, there is no cross-component boundary to justify one, and no existing convention
in this app uses router/URL state for transient analytical filters.

**Propagation — one predicate, every derivation reads it:**

```
crossFilter (useState)
      ↓
clientIdSet = resolveClientIds(crossFilter, clients, kamAssignments, clientRegions)  // new, small
      ↓
filteredTrips    = trips.filter(t => matchesCrossFilter(t, crossFilter, clientIdSet))
filteredClients  = clients.filter(c => clientIdSet === null || clientIdSet.has(c.id))
      ↓
computeGoalsActualsForRollup(filteredTrips, ...)
buildBalanceTrendPoints(filteredTrips, ...)
computePayableReceivableSnapshot(filteredClients, suppliers, drivers, filteredTrips, transactions, ...)  // clients filtered, NOT transactions — see §19
buildEntityGoalRows(..., filteredClients or filteredTrips, ...)
      ↓
every KPI card / trend / target / table reads the *filtered* result instead of the raw one
```

This directly closes the gap named in §1 — the same filter now reaches every visual, not just
the entity table.

## 11. KAM Progress drill-down

Modal (reusing `NetworkDesktopEntityGoalWizard`'s pattern), triggered by "View progress" on a
KAM row — separate from clicking the row itself (which cross-filters, §14). Content, each
item's support level per §5:

- Sales: Target ✅ (summed), Actual ✅ (summed over that KAM's client trips), Achievement % ✅
- Trips: same, ✅
- Margin %: ⚠️ derivable (revenue − cost over the same filtered trip set)
- Receivable: ⚠️ derivable (`aggregateCustomers` over the KAM's filtered client list)
- Active clients: ✅ (count of clients with `kamAssignments[id] === kamId`)
- Assets: ⚠️ derivable (count of distinct `vehicle_id`/`driver_id` across the KAM's client trips)
- Performance status: ⚠️ derivable via `goalStatus()`, extended with the Exceeded tier (§20)
- Trend (Daily/Weekly/Monthly, target vs actual): ⚠️ derivable, same filtered-trips input as §10, new bucketing function
- Client contribution list (e.g. "Tata Motors 92%"): ✅ — this is just `entityRows` scoped to that KAM's clients, already computed, sorted by achievement %
- Top performing / needing attention: ✅ — same list, sorted/split by `progressPct` or `status`

## 12. Client Progress drill-down

Same modal pattern, triggered per client row. Content: Client name/KAM/Region ✅ (already on
`EntityGoalRow`/`kamAssignments`/`clientRegions`), Sales/Trip target+actual+achievement ✅
(already on `EntityGoalRow`), Margin ⚠️ (derivable per-client the same way as §11), Receivable
⚠️ (single-client `aggregateCustomers` call), Associated assets ⚠️ (distinct
`vehicle_id`/`driver_id` among that client's trips), Daily/weekly/monthly trend ⚠️ (same
bucketing function as §11, scoped to `trip.client_id === thisClient`), Target trajectory /
pacing — see §16, Top/bottom assets ⚠️ (same list, sorted).

## 13. Asset Performance drill-down

Same modal pattern, triggered per vehicle/driver row. Asset identifier ✅, Client ⚠️ (most
common/most recent `client_id` among that asset's trips — note an asset can theoretically
serve multiple clients; pick the dominant one and say so, don't imply exclusivity), KAM ⚠️
(derived from that dominant client's KAM assignment, one hop further — explicitly label this
as *inferred*, not authoritative, since it's two joins removed from stored data), Sales
contribution / Target vs actual / Achievement % / Trips ✅/⚠️ (same as vehicle/driver
`EntityGoalRow`), Revenue per trip ⚠️, Margin ⚠️. **Explicitly future scope, not built:**
Utilisation, Cost breakdown, Idle days — none of this data exists (§5, §9).

## 14. Cross-filter vs drill-down interaction rules

- **Cross-filter** = click the row/pill/point itself → the whole Goals page recomputes to that
  slice, chip appears, everything else stays on the Goals page.
- **Drill-down** = click an explicit "View progress" / "View performance" affordance → modal
  opens over the current (already-filtered) state, does not change `crossFilter`, does not
  navigate away.
- Closing the modal returns exactly to the underlying `crossFilter` state — trivial, since the
  modal never touched it in the first place (it's a read-only view over the current filtered
  data plus the specific entity being inspected).
- **LOCKED:** clicking a client-contribution row (§11) or a top-asset row (§12) **navigates the
  same modal's internal focus** (KAM Progress → click "Tata Motors" → the same modal now shows
  Client Progress → click "TN XX 1234" → the same modal now shows Asset Performance), forming a
  KAM → Client → Asset chain entirely inside the one open modal. This does **not** touch the
  parent page's `crossFilter` — the page underneath keeps whatever selection was active when
  the modal was opened. Closing the modal at any depth of that in-modal chain returns the page
  to exactly that pre-modal state, not to whatever the user last navigated to inside the modal.
  The modal needs its own small internal stack (`["kam:Bhujesh", "client:tata-motors", "asset:tn-xx-1234"]`
  or equivalent) purely to support a back arrow inside the modal — this stack is local to the
  modal component and is discarded on close, never merged into the page's `crossFilter`.

## 15. Time trend model

Daily/Weekly/Monthly are all ⚠️ derivable from the same trip date fields already used by the
existing `tripMonthKey()` (`trip.pickup_date ?? trip.completed_at ?? trip.created_at`) — a
sibling `tripDayKey()`/`tripWeekKey()` needs the same fallback chain, nothing new is fetched.
Per point: actual, target (pro-rated across the bucket — see §16), variance, achievement %,
previous-period comparison (⚠️ derivable — same query shifted back one period, e.g. compare
Aug actual-to-date vs Jul actual-to-date-at-the-same-day-of-month), cumulative target vs
cumulative actual (⚠️ running sum over the bucket sequence — straightforward). Clicking a
point sets `trendPointKey` in `crossFilter` (§10).

## 16. Target pacing / on-track logic

**Not computed anywhere today — new, pure, small.** Explicit terminology, since the prompt
specifically warned against conflating these:

- **Period Target** — the full target for the whole period (e.g. August's ₹30L), exactly what's
  stored today.
- **Target-to-date** — `Period Target × (elapsedDaysInPeriod / totalDaysInPeriod)`. Pure
  calendar math, needs "today" and the period's calendar bounds — no new data source.
- **Period Achievement %** — `actual / Period Target` (this is what's shown today, and it's
  correctly labeled as such — the existing UI does not currently call this "on track", it just
  shows a raw percentage, so nothing is being corrected here, just formalized).
- **Pacing % (Target-to-date Achievement %)** — `actual / Target-to-date`. **This is the number
  that should drive an "on track" / "behind" / "exceeded" label**, not Period Achievement %, per
  your explicit instruction not to call 43%-of-month "on track" at the mid-month mark. Example
  from the prompt: Aug 15, monthly target ₹30L → Target-to-date ₹15L, actual ₹13L → Period
  Achievement 43%, Pacing 87% (behind, but much closer than 43% suggests). Both numbers should
  be visible together, not one replacing the other — otherwise the Period Achievement % context
  is lost.

## 17. Target-setting UX

Existing mechanism (`editingMetric`/`draftTarget` state, `GoalTargetCard` edit mode,
`NetworkDesktopEntityGoalWizard` modal) already is lightweight — a single numeric field per
metric, not a spreadsheet. Not being redesigned. Confirmed: **the current model has no concept
of "allocating" a business target down to KAMs/clients/assets** — aggregate and entity targets
are set **independently** (setting the August aggregate target does not touch any client's
target, and vice versa; confirmed by `patchAggregateTarget` and `patchEntityTarget` being
separate, uncoupled functions with no cross-write between them).

**LOCKED: allocation is deferred.** Phase 1 ships Annual → Quarterly → Monthly target
*setting/viewing* using the existing independent-target mechanism as-is (§6 already confirmed
quarterly/annual entity rollups work via `sumEntityTargetsForKeys` across month keys — no new
storage needed there either). No "allocate the business target across KAMs" workflow is built
in Phase 1. If wanted later, that's a distinct new feature (a real allocation UI + reconciliation
arithmetic), not an extension of what exists.

## 18. Payable behavior under KAM/Region filters

Confirmed: `kamAssignments`/`clientRegions` are keyed by client id only; there is no supplier or
driver equivalent anywhere in `NetworkGoalsStore` (§4). A KAM/Region filter therefore has **no
valid interpretation** for Payable (which is supplier + driver dues).

**LOCKED: keep Payable visible, always showing the org-wide figure, with a small contextual
label — "Not affected by KAM filter" (or equivalent) — whenever a KAM/Region filter is
active.** Do not hide or dim it (it's real, correct data, just not a sub-slice of the current
selection), and do not fabricate a "Bhujesh's payable" number by, say, attributing suppliers to
whichever KAM happens to serve the same trips — that would imply a relationship that doesn't
exist in the data model. Client and Asset filters have the same constraint for the
supplier/driver half of Payable, for the same reason.

## 19. Shared filter-state architecture

One `useState<GoalsCrossFilter>` in `NetworkDesktopGoalsPanel`, extending — not replacing — the
existing `selectedKamFilter`/`selectedRegionFilter` pair (folded into the new object's
`kamId`/`regionId` fields, same values, same source of truth, just grouped). No `useReducer` —
the fields don't have derived transitions between them (§8 of the earlier investigation doc
already covered this reasoning; unchanged here). No Context, no external store, no URL state —
same justification as before: single component, no prop-drilling distance, no existing
URL-state convention in this app for analytical filters (confirmed: Expo Router params here
are used for screen/panel identity only, e.g. `app/workspace.tsx`'s `?panel=&section=`, never
for transient filter state).

## 20. Required utility/helper changes

All in `connectionGoalsAnalytics.util.ts` (or a small new sibling file if that one is judged
too large to keep extending — a call to make at implementation time, not now):

- `resolveClientIdsForFilter(crossFilter, clients, kamAssignments, clientRegions) → Set<string> | null` — the one join point for KAM/Region/Client → client id set. Returns `null` (meaning "no restriction") when no KAM/Region/Client filter is active.
- `filterTripsForCrossFilter(trips, crossFilter, clientIdSet) → TripRow[]` — applies clientIdSet (for KAM/Region/Client) and direct `vehicle_id`/`driver_id` match (for Asset).
- `sumTargetsForIds(store, monthKeys, focus, ids) → EntityTargetMetrics` — thin wrapper summing `sumEntityTargetsForKeys` (already exported, unchanged) across a set of ids, for KAM/Region target rollups.
- `goalStatus()` extended with a fourth branch: **LOCKED threshold — `"exceeded"` when `actual > target` (i.e. achievement % > 100%)** — the only change to an *existing* function; everything else above is additive.
- `tripDayKey()` / `tripWeekKey()` — siblings of the existing `tripMonthKey()`, same fallback chain (`pickup_date ?? completed_at ?? created_at`), for §15.
- `targetToDate(periodTarget, periodStart, periodEnd, asOf)` — pure calendar-math function for §16, no data dependency beyond the target number and two dates.

No renames to existing exported functions, no signature changes beyond `goalStatus()` gaining
a threshold branch (its signature is unchanged, only its return value gains a new possible
string).

## 21. Query/data changes — expected to be zero

Confirmed, not assumed: all seven data hooks (`useTripsQuery`, `useTransactionsQuery`,
`useClientsQuery`, `useSuppliersQuery`, `useDriversQuery`, `useVehiclesQuery`,
`useOrgMembersQuery`) are already `orgId`-scoped and return everything needed. Every
cross-filter dimension in §10 is answerable by filtering these already-cached arrays in
memory. **If, during implementation, a specific metric turns out to need data not present in
these seven queries, stop and report it — do not add a query speculatively.** No candidate for
a new query was found in this investigation.

## 22. Permissions

Confirmed: the Goals tab itself has **no permission gate today** — any org member who can open
the Network Org Hub sees it (no `canSurface` check in `NetworkDesktopHub.tsx`'s tab list, unlike
`workspace.kyc`/`workspace.settings` elsewhere in the app). Target-editing actions
(`editingMetric`, `patchAggregateTarget`, etc.) also have **no role/capability check** —
confirmed by grep, zero hits for `canManage`/`role ===`/`useCapabilities`/`useMemberAccess`
anywhere in `NetworkDesktopGoalsPanel.tsx`. **LOCKED: Phase 1 introduces no new permission
model.** Viewing and cross-filtering stay exactly as open as viewing already is today, and
target-editing keeps its current (also ungated) behavior unchanged. Whether target-*editing*
should be owner/admin-gated (consistent with how Settings/KYC are gated elsewhere) is a
pre-existing gap, not introduced by this plan — tracked as a separate, later decision, not
bundled into this feature.

## 23. Responsive UX

Existing mechanism: `useProfileHubCompactLayout()` → `layout.compact` boolean, already used
throughout this file and `NetworkDesktopHub.tsx` to switch between desktop and mobile
presentations (e.g. `mobile.pageChrome` vs `NetworkDesktopHubHero`). Reuse it, don't invent a
second responsive mechanism. On mobile (`compact === true`): KPI row becomes horizontal-scroll
(same treatment the hub stats row already uses at `NetworkDesktopHub.tsx:660-676`), filter
chips scroll horizontally (same `ScrollView horizontal` pattern already used for the KAM/region
pill rows at `:1105-1257`), and the three Progress modals become full-screen on mobile instead
of centered cards — `NetworkDesktopEntityGoalWizard`'s `<Modal>` can already do this with a
`compact`-conditional style, no new component needed. Target editing stays modal-based on both
form factors (already true today).

## 24. Performance considerations

Every cross-filter operation is a `.filter()` over already-cached arrays plus the existing
`useMemo` dependency chains — the same cost the current KAM/region filter already pays. No new
Supabase round-trip per click (§21), no N+1 pattern (there was none to begin with — one
`orgId`-scoped fetch per data type, already true today), no full-page reload. No memoization
beyond what already exists (`useMemo` throughout) is being added speculatively — if a specific
derivation proves slow during implementation, that's the point to add targeted memoization,
with evidence, not before.

## 25. Edge cases / data quality

- Client with no KAM assigned (`kamAssignments[id]` absent) — already handled today (`kamUserId: null`); such clients simply don't appear under any KAM filter and do appear under "no filter." No new handling needed.
- Client with no region — same pattern, already handled.
- Vehicle/driver with zero trips in the selected period — already produces a zero-actual row today (`buildEntityGoalRows` seeds every known entity even with zero actuals, `:454-483`); the "Behind target"/"Exceeded" status for a zero-actual, zero-target row should resolve to `"unset"` (already the existing `goalStatus()` behavior for `target <= 0`), not "behind."
- Asset appearing in trips for more than one client — real, not an edge case to "fix," just something §13's Client/KAM inference must state as inferred/dominant rather than exclusive (already called out there).
- KAM filter active, then switching to Asset Performance mode where the KAM has zero attributable assets — table renders empty with a clear "No assets found for Bhujesh's client portfolio" message, not a spinner or a silent zero — matching the existing empty-state pattern already used for `entityRows.length === 0` (`:1521-1526`).

## 26. Implementation phases

Unchanged from the sequencing already agreed:

1. **Shared filtering** — existing KAM/Region filter propagates to every visual, not just the entity table (closes the core gap named in §1).
2. **Client** — client selection propagates the same way.
3. **Asset** — vehicle/driver selection, to whatever metrics support it per §5.
4. **Performance status** — On track / Behind / Exceeded (needs `goalStatus()`'s new branch, §20) as a diagnostic filter.
5. **Time** — day/week trend + time-point cross-filter (§15) + target-to-date pacing (§16), which is the most self-contained new *logic* (no filter-plumbing dependency on 1-4).
6. **Polish** — chips, per-chip clear, selection highlighting/recede (not full hide), transitions, empty states.
7. **Drill-downs** — KAM/Client/Asset Progress modals (§11-13), built last since they read the same filtered/derived data the earlier phases already produce; building them first would mean building against a moving target.

## 27. Test plan

Extends the matrix from the earlier investigation doc with drill-down and pacing cases:

| # | Action | Expected |
|---|---|---|
| 1 | Click KAM pill | KPI cards + trend + targets + tables all recompute (not just the entity table) |
| 2 | Click client row | Same, scoped to one client |
| 3 | Click asset row | Same, scoped to one asset, only for metrics §5 marks ✅/⚠️ |
| 4 | Click trend point | Page scopes to that period without moving the global Period control |
| 5 | Click "Behind target" | Only behind-target rows/metrics show |
| 6 | Remove one chip | Only that field clears |
| 7 | Clear all | Full reset, global controls untouched |
| 8 | Switch Aggregate → Asset with KAM active | KAM chip persists; assets shown are those in the KAM's client trips only |
| 9 | KAM filter active, view Payable | Shows org-wide figure + "Not affected by KAM filter" label, never a fabricated number |
| 10 | Open KAM Progress modal, close it | Returns to identical prior `crossFilter` state |
| 11 | Mid-month, 43%-of-target actual | UI shows both Period Achievement 43% and Pacing % (§16) — never labels 43% "on track" on its own |
| 12 | Vehicle/driver serving 2 clients, open Asset Progress | Client field shows dominant client, explicitly labeled inferred |
| 13 | Refresh page | Cross-filters reset (§19), matching existing pre-filter behavior — not a regression |

## 28. Product decisions — LOCKED

All five closed. Nothing below is open anymore; each links to where it's applied:

1. **Payable display** (§18) — keep visible, org-wide figure, "Not affected by KAM filter" label when a KAM/Region filter is active. Never fabricate a filtered Payable number.
2. **Modal-internal navigation** (§14) — KAM → Client → Asset navigation happens inside the same modal via a small modal-local stack; the parent page's `crossFilter` is never touched by it and is restored exactly on close.
3. **Target-editing permissions** (§22) — no new permission model in Phase 1; existing (currently ungated) behavior is unchanged; the pre-existing gap is tracked separately, not bundled in.
4. **"Exceeded" threshold** (§20) — `actual > target` (achievement % > 100%).
5. **Target allocation** (§17) — deferred; Phase 1 ships independent Annual/Quarterly/Monthly target setting and viewing only, no allocation workflow.

## 29. Final recommended state

One Goals page, two view modes (Aggregate/Asset — a relabeling of the existing `activeFocus`,
not a new concept), one shared `GoalsCrossFilter` object extending the existing
`selectedKamFilter`/`selectedRegionFilter` pattern, one filtering predicate every visual reads
from, three Progress modals reusing the existing `NetworkDesktopEntityGoalWizard` design
language, zero new Supabase queries, zero new global state, and every fabricated-data risk
(utilisation, cost, supplier/driver KAM attribution, "on track" mislabeling) explicitly named
and fenced off rather than quietly implemented. Ready for Phase 1 on your go-ahead.
