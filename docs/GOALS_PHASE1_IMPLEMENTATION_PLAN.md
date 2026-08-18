# Goals — Phase 1 implementation plan (commit-by-commit)

**Status: planning only. `NetworkDesktopGoalsPanel.tsx` has not been touched.**

This is the commit-level breakdown of Phase 1, built on top of
`docs/GOALS_CROSS_FILTERING_MODEL.md` (the architecture/UX contract — read that first; this
doc doesn't repeat its reasoning, only its conclusions where a commit needs one). All five
product decisions there are now locked (§28 of that doc) and are treated as final here.

## Guardrail (repeated on purpose)

**This is an extension of the existing page, not a rewrite.** Every commit below either adds a
new small function/field or widens what an existing function is called with. None of them
replace `NetworkDesktopGoalsPanel.tsx`, `connectionGoalsAnalytics.util.ts`, or
`NetworkGoalsStore`. If any commit in implementation turns out to require touching more than
the files listed for it, that's a signal to stop and re-scope that commit — not to fold more
into it.

**Definition of done, every commit:** `tsc --noEmit` clean · existing KAM/Region filter
behavior is unchanged (regression, not just "still compiles") · zero new Supabase
queries/RPCs introduced · no file outside the listed set touched.

**Recommended review stop-points:** after Commit 4 (the core cross-filter propagation gap is
closed — worth confirming behavior in the browser before building anything else on top of it)
and after Commit 12 (all three drill-down modals exist — worth a full walkthrough before
moving to time intelligence and visual polish).

---

## Group A — Shared cross-filter engine

*(Contract doc §10, §19, §20)*

### Commit 1 — `GoalsCrossFilter` state, no behavior change yet
- **Files:** `NetworkDesktopGoalsPanel.tsx`
- **What:** Introduce `type GoalsCrossFilter = { kamId, regionId, clientId, assetId, performanceStatus, trendPointKey, goalCategory }` and one `useState<GoalsCrossFilter>`. Fold the existing `selectedKamFilter`/`selectedRegionFilter` values into `crossFilter.kamId`/`crossFilter.regionId` — remove the two standalone `useState` calls, update their read/write sites to the new object. Every other field starts `null` and is unused until later commits.
- **Test:** Existing KAM/Region filter behaves identically to today (same pill click, same entity-table filtering, same combined clear button) — this commit is a pure refactor, verify no visible change at all.

### Commit 2 — Pure filter helpers, unit-tested in isolation
- **Files:** `connectionGoalsAnalytics.util.ts` (new exports), a new test file if one doesn't already exist for this util
- **What:** Add `resolveClientIdsForFilter(crossFilter, clients, kamAssignments, clientRegions) → Set<string> | null` and `filterTripsForCrossFilter(trips, crossFilter, clientIdSet) → TripRow[]`. Not wired into the panel yet.
- **Test:** Unit tests with fixture clients/trips: KAM with 2 clients → correct id set; client with no KAM → excluded correctly; no filter active → returns `null`/unfiltered.

### Commit 3 — Wire filtered trips into KPI actuals + trend (closes the core gap)
- **Files:** `NetworkDesktopGoalsPanel.tsx`
- **What:** `const filteredTrips = useMemo(() => filterTripsForCrossFilter(trips, crossFilter, clientIdSet), [...])`. Pass `filteredTrips` instead of `trips` into `computeGoalsActualsForRollup` and `buildBalanceTrendPoints`. No changes to those two functions themselves.
- **Test:** Select the existing KAM pill → Sales revenue / Trip count / Margin % KPI cards and the balance trend now visibly change (they didn't before this commit). This is the single most important behavioral test in Phase 1 — it's the exact gap named in the contract doc's executive summary.

### Commit 4 — Receivable/Payable propagation + Payable label
- **Files:** `NetworkDesktopGoalsPanel.tsx`
- **What:** `const filteredClients = useMemo(() => clientIdSet ? clients.filter(c => clientIdSet.has(c.id)) : clients, [...])`. Pass `filteredClients` (not filtered trips/transactions — per the contract doc's explicit correction) into `computePayableReceivableSnapshot`. Add the "Not affected by KAM filter" label on the Payable widget, shown whenever `crossFilter.kamId || crossFilter.regionId` is set.
- **Test:** KAM filter active → Receivable changes, Payable stays at the org-wide number and shows the label. KAM filter cleared → label disappears, both numbers back to org-wide.

**→ Stop-point 1: confirm Commits 1-4 in the browser before continuing.**

---

## Group B — Aggregate Performance: Business → KAM → Client

*(Contract doc §7, §8)*

### Commit 5 — Client cross-filter dimension
- **Files:** `NetworkDesktopGoalsPanel.tsx`
- **What:** Entity-table row click (when `activeFocus === "client"`) sets `crossFilter.clientId` to that row's id (toggle-off if already selected, matching the existing KAM pill's toggle behavior). Extend `resolveClientIdsForFilter` call site to intersect with an explicit `clientId` when set (single-id set).
- **Test:** Click a client row → same page-wide propagation as Commits 3-4, scoped to one client.

### Commit 6 — Per-chip clear, replacing the combined clear button
- **Files:** `NetworkDesktopGoalsPanel.tsx`
- **What:** Replace the single "clear KAM+Region" button in the filter-context bar with one chip per active field (`kamId`, `regionId`, `clientId` at this point), each with its own `×`. "Clear all" resets the whole `crossFilter` object.
- **Test:** KAM + Client both active → remove Client chip only → KAM stays active. Clear all → both gone.

---

## Group C — Asset Performance

*(Contract doc §7, §9)*

### Commit 7 — Asset cross-filter dimension
- **Files:** `NetworkDesktopGoalsPanel.tsx`
- **What:** Entity-table row click (when `activeFocus` is `"vehicle"`/`"driver"`) sets `crossFilter.assetId`, matched directly against `trip.vehicle_id`/`trip.driver_id` in `filterTripsForCrossFilter` (no client-id join needed for this one — it's a direct trip-level match, per the contract doc §4).
- **Test:** Click a vehicle row → KPI cards/trend scope to that vehicle's trips only.

### Commit 8 — Aggregate/Asset mode toggle (UI regrouping, not new state)
- **Files:** `NetworkDesktopGoalsPanel.tsx`
- **What:** Relabel the top-level `activeFocus` control as `[ Aggregate Performance | Asset Performance ]`; `"client"` maps to Aggregate, `"vehicle"`/`"driver"` map to Asset Performance with a small internal Vehicles/Drivers sub-toggle shown only in Asset mode. `activeFocus` itself is unchanged as a state value — this is a rendering change only.
- **Test:** Switching modes with `kamId` active: KAM chip persists; Asset Performance shows only vehicles/drivers appearing in that KAM's client trips (per §9's derived-join rule); switching back to Aggregate drops `assetId` if it was set (per contract doc §8's clearing rule table).

---

## Group D — Progress modals

*(Contract doc §11-14, §28.2)*

### Commit 9 — KAM Progress modal shell
- **Files:** `NetworkDesktopGoalsPanel.tsx` (trigger + data assembly), new `NetworkDesktopKamProgressModal.tsx` (or similar — mirroring `NetworkDesktopEntityGoalWizard.tsx`'s existing `<Modal transparent animationType="fade">` shell exactly, not inventing a new modal chrome)
- **What:** "View progress" affordance on a KAM row opens the modal with: Sales/Trips target+actual+achievement (reusing existing computed values), Receivable (single-KAM `aggregateCustomers` call), Active clients count, client-contribution list (`entityRows` scoped to that KAM's clients, sorted by achievement %). No trend yet (Group E adds it). Modal reads the current `crossFilter`/data as of open time; does not mutate it.
- **Test:** Numbers in the modal match what the page already shows when that KAM is cross-filtered on the page (cross-check, since both read the same underlying filtered computation).

### Commit 10 — Client Progress modal + KAM→Client in-modal navigation
- **Files:** same modal component (extended) or a sibling `NetworkDesktopClientProgressModal.tsx` rendered by the same shell
- **What:** Clicking a client row inside the KAM modal navigates the same modal to Client Progress (small internal stack, per contract doc §14/§28.2 — `["kam:id", "client:id"]`), showing Target/Actual/Pacing-placeholder/Trips/Receivable/associated assets. A back arrow inside the modal pops the stack. The parent page's `crossFilter` is untouched throughout.
- **Test:** Open KAM modal → click a client → Client Progress shows → back arrow → returns to KAM Progress (not to the page) → close modal entirely → page's `crossFilter` is exactly what it was before the modal opened (not the client that was viewed inside).

### Commit 11 — Asset Performance modal + Client→Asset in-modal navigation
- **Files:** same modal component, extended
- **What:** Same in-modal stack extended one level (`["kam:id", "client:id", "asset:id"]`). Asset Performance view: identifier, dominant client (explicitly labeled inferred, per contract doc §13), Sales contribution/Target/Achievement/Trips.
- **Test:** Full KAM → Client → Asset chain inside one modal open/close cycle, parent page unaffected at every step.

**→ Stop-point 2: full walkthrough of all three modals before continuing to time intelligence/polish.**

---

## Group E — Time intelligence

*(Contract doc §15, §16, §20)*

### Commit 12 — Day/week bucketing + Daily/Weekly/Monthly trend toggle
- **Files:** `connectionGoalsAnalytics.util.ts` (new `tripDayKey`/`tripWeekKey`, siblings of existing `tripMonthKey`), `NetworkDesktopGoalsPanel.tsx` (granularity control + trend rebuild)
- **Test:** Switching granularity on the trend chart re-buckets the same underlying filtered trips correctly (spot check one day's total by hand against a known trip).

### Commit 13 — Trend-point cross-filter
- **Files:** `NetworkDesktopGoalsPanel.tsx`
- **What:** Clicking a trend point sets `crossFilter.trendPointKey`, propagates through the same `filterTripsForCrossFilter` path (add a day/week/month match branch). Does **not** move the global Period control (contract doc §10).
- **Test:** Click a point → KPI cards scope to that point's period; global month selector unchanged.

### Commit 14 — Target-to-date, Pacing %, Exceeded threshold
- **Files:** `connectionGoalsAnalytics.util.ts` (`targetToDate()`, `goalStatus()`'s new `"exceeded"` branch at `actual > target`, per locked decision), `NetworkDesktopGoalsPanel.tsx` (display both Period Achievement % and Pacing % side by side, per contract doc §16), add per-entity status to `EntityGoalRow` so the "Behind target / Exceeded" segments (Commit 15 below) have something to filter on.
- **Test:** Mid-month scenario from the contract doc (₹30L monthly target, Aug 15, ₹15L target-to-date, ₹13L actual) → Period Achievement 43%, Pacing 87%, both shown, neither one alone labeled "on track."

### Commit 15 — Performance-status cross-filter
- **Files:** `NetworkDesktopGoalsPanel.tsx`
- **What:** Clickable "On track / Behind target / Exceeded" segments (using the per-entity status from Commit 14) set `crossFilter.performanceStatus`, filtering the entity table and (where §5's matrix marks it supported) the KPI cards to that status only.
- **Test:** Click "Behind target" → only behind-target rows/metrics show; click again → clears.

---

## Group F — Target setting

*(Contract doc §6, §17, §28.5)*

### Commit 16 — Annual/Quarterly/Monthly target setting, verified against the new filtering
- **Files:** likely none, or minor UI polish in `NetworkDesktopGoalsPanel.tsx` only
- **What:** The existing mechanism (`patchAggregateTarget`, `patchEntityTarget`, `patchQuarterlyTarget`, `NetworkDesktopEntityGoalWizard`) already supports this — per the locked decision, **no allocation workflow is built**. This commit is primarily a regression check: confirm target editing at every granularity still works correctly now that KPI cards read from `filteredTrips`/`filteredClients` (target editing itself must remain unaffected by any active cross-filter — you can view "Bhujesh's portfolio" and still edit the org-wide August target underneath it without confusion about which number you're editing).
- **Test:** With a KAM filter active, open the target editor — confirm it's editing the real underlying target (aggregate or the correct entity), not some filtered/derived number.

---

## Group G — Cross-filter visual language

*(Contract doc §10, per your "selected stays prominent, others recede" instruction)*

### Commit 17 — Selection highlight / recede
- **Files:** `NetworkDesktopGoalsPanel.tsx` (styles only)
- **What:** Selected row/pill keeps full-emphasis styling; non-selected rows in the same table dim slightly (opacity/color, not `display: none` — they must stay visible for context, per your explicit instruction not to hide unselected items).
- **Test:** Visual check across KAM table, Client table, Asset table.

### Commit 18 — Filter-chip bar final polish
- **Files:** `NetworkDesktopGoalsPanel.tsx` (styles + minor layout)
- **What:** Final breadcrumb layout (`Showing: Bhujesh × Tata Motors × Behind target × · Clear all`), transitions, empty states ("No assets found for Bhujesh's client portfolio" per contract doc §25).
- **Test:** Full manual pass through the test matrix in the contract doc's §27.

---

## Sequencing rationale

Group A first because every later group's "does this propagate correctly" test depends on the
core filter → every-visual wiring existing already — building Client/Asset filters or modals
against the old narrow-scope filter would mean redoing them once Group A lands. Modals (Group
D) come after Aggregate/Asset (Groups B/C) because the modals display the same derived numbers
those groups compute — building the modals first would mean building against numbers that
don't exist yet. Time intelligence (Group E) is the most self-contained new *logic* (calendar
math, independent of the KAM/Client/Asset plumbing) and deliberately sits after the modals so
the modals don't need a mid-build trend-chart retrofit. Target setting (Group F) is mostly a
regression check, not new work, so it's placed once everything that could regress it already
exists. Visual polish (Group G) is last on purpose — polishing a filter chip bar before the
filters it represents all exist would mean redoing the polish.
