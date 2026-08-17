# Performance page — Sales + Goals merge: audit and proposed architecture

**Status: LOCKED architecture, Phase 1 implementation approved and underway (Commit 1).**
Everything in this document is the governing contract for implementation. See "Final locked
product constraints" immediately below for the approval boundary this build proceeds under.

## Final locked product constraints (approval boundary — read this before touching any code)

Approved for implementation. These rules govern every commit in every phase, not just Commit 1:

- **Do not reopen Goals, do not create a separate Supplier analytics page, do not create
  supplier targets, do not add an import system, do not create a seventh Driver perspective.**
- **Performance is the single analytical destination**, structured as one hierarchy, not a
  concatenation of the old Goals + Sales pages:

  ```
  Performance
    Period · Perspective · Cross-filter context
        ↓
    Executive KPI strip — Target · Actual · Achievement % · Target-to-date · Pacing % ·
                            Previous period · Growth %
        ↓
    Performance trend — Daily / Weekly / Monthly / Quarterly / YTD
        ↓
    Performance breakdown — changes shape by active perspective (table below)
        ↓
    Existing Sales/Asset intelligence — reused unchanged (lanes, origins/destinations, margin,
                                          contribution, role mix, asset intelligence)
        ↓
    Evidence — Trips: "Showing 5 of 48" · [5] [10] [View all] [Download]
  ```

- **Breakdown shape per perspective** (§31/§32's drill-down hierarchy, made concrete per
  perspective — this is what renders in the "Performance breakdown" band above):

  | Active perspective | Breakdown shows |
  |---|---|
  | Aggregate | KAM / Client / Supplier / Asset (top-level summary rows for each) |
  | KAM | Clients → Suppliers → Assets |
  | Client | Suppliers → Assets → Drivers |
  | Supplier | Clients → Assets → Drivers |
  | Asset | Clients → Suppliers → Drivers |
  | Region | Clients → Suppliers |

- **One cross-filter, no separate filter panels.** Clicking any chart/table element cross-filters
  the entire page — there is no "KAM Filter" / "Client Filter" / "Supplier Filter" panel anywhere.
  The chip bar (`Bhujesh × Tata Motors × ABC Logistics × · Clear all`) is the only filter UI at
  the Performance level; per-chip removal and Clear all are the only two controls.
- **Every Progress modal (KAM/Client/Region/Supplier/Asset — not just Supplier) follows the same
  evidence pattern**: KPI comparison (actual/target-where-applicable/achievement/pacing/previous)
  → "Why?" breakdown (supplier/asset/lane contribution, whichever apply) → the standard 5/10-row
  mini Trips table → View all → Download. This is now a shared component contract across every
  modal, not a Supplier-specific feature.
- **Attribution honesty is non-negotiable.** If a metric can't be attributed to the active filter
  (Payable under a KAM/Region filter is the running example), show the real org-wide number with
  a visible "Not affected by KAM filter" label — never a mathematically-convenient but incorrect
  number.
- **Supplier targets stay explicitly unsupported** in this slice — "No supplier target set,"
  never a fabricated/allocated one. A separate product decision, not reopened here.
- **Process rule for every commit:** report the exact files that will change and confirm no
  concurrent/unrelated work is swept in, before implementing. No `git commit`/push without
  explicit request, per this repo's standing git-safety rule.

## Important finding before anything else: concurrent work already overlaps this exact merge

While auditing, `git status` showed the Network Hub Sales area was modified moments ago by a
process other than this session — 8 modified files plus two new ones
(`NetworkDesktopSalesPanel.tsx`, `NetworkDesktopSalesTableOverflow.tsx`). Reading the new files
(not assuming from memory) shows **someone has already merged "Connection sales" and "Asset
sales" into one tab labeled "Sales"**, with a `NetworkDesktopSalesPanel.tsx` wrapper that
toggles `[Aggregate] [Asset]` scope via a `resolveSalesScope()` function, gated on
`canAccessClients`/`canAccessDrivers` capabilities (handles Asset-only, Aggregate-only, and
Hybrid orgs correctly). Current `NetworkDesktopHub.tsx` tabs are now: `Details · Team · My
Profile · Sales · Goals · Network · Chat` — "Asset sales" is no longer a separate tab.

This directly overlaps your request's `[Aggregate] [KAM] [Client] [Region] [Asset]` toggle
concept — it's the same underlying idea, already half-built on the Sales side. **The Performance
plan below reuses `resolveSalesScope()`'s gating pattern rather than reinventing it**, and flags
everywhere else this concurrent work intersects. The Goals-side files
(`NetworkDesktopGoalsPanel.tsx`, `connectionGoalsAnalytics.util.ts`, `networkGoalsStorage.service.ts`)
are untouched by this concurrent activity — my existing Goals investigation (`docs/GOALS_CROSS_FILTERING_MODEL.md`,
`docs/GOALS_PHASE1_IMPLEMENTATION_PLAN.md`) remains valid and is the basis for everything below
regarding Goals. This document adds the Sales-side audit on top of it and proposes how the two combine.

---

## Implementation map

| Existing capability | Current location | Reuse / modify / replace |
|---|---|---|
| Actual sales (connection/partner) | `NetworkDesktopConnectionSalesPanel.tsx` + `connectionSalesAnalytics.util.ts` | **Reuse as the "Why?" layer** under the new Performance KPI/target layer — not deleted, not rebuilt |
| Actual sales (own fleet) | `NetworkDesktopAssetSalesPanel.tsx` + `assetSalesAnalytics.util.ts` | **Reuse**, same treatment |
| Aggregate/Asset scope toggle | `NetworkDesktopSalesPanel.tsx` (`resolveSalesScope`, `SalesScope`) | **Reuse and extend** — this becomes the base of Performance's perspective toggle; add KAM/Client/Region as additional perspectives alongside it |
| Targets | `NetworkGoalsStore` (`networkGoalsStorage.service.ts`) | **Reuse**, unchanged storage; no target concept exists on the Sales side to reconcile against |
| KAM assignment | `store.kamAssignments` (client-id keyed) | **Reuse**, unchanged — confirmed zero KAM concept anywhere in Sales/Asset panels |
| Region assignment | `store.clientRegions` (client-id keyed) | **Reuse**, unchanged — same |
| Client performance | `EntityGoalRow` (`connectionGoalsAnalytics.util.ts`, focus=client) | **Reuse** for target-vs-actual; Sales panel's own client-adjacent data ("by role" client slice, partner contribution) becomes supplementary "Why" detail |
| Asset performance | `EntityGoalRow` (focus=vehicle/driver) for target-vs-actual; `assetSalesAnalytics.util.ts` for everything else (utilization, on-time%, revenue-per-km, fleet intelligence score) | **Reuse both** — Goals side gives target/actual, Sales side gives the rich diagnostic metrics Goals never had |
| Trip metrics | `computeTripMetrics`/`entityActualsForFocus` (Goals util) and `buildMonthlyTripTrend`/`buildAssetMonthlyTrend` (Sales utils) | **Reuse both**, different purposes (target-vs-actual vs. historical trend detail) |
| Receivable | `computePayableReceivableSnapshot` → `aggregateCustomers` (Goals side only — no equivalent in Sales panels) | **Reuse**, unchanged |
| Payable | Same function, `aggregateSuppliers`/`aggregateDrivers` | **Reuse**, unchanged; "not affected by KAM filter" label per the already-locked decision |
| Existing cross-filter (KAM/Region) | `NetworkDesktopGoalsPanel.tsx` (`selectedKamFilter`/`selectedRegionFilter`, per prior Phase 1 plan folded into `GoalsCrossFilter`) | **Reuse and rename/promote** to a page-level `PerformanceCrossFilter` (see below) |
| Existing cross-filter (lane/role/rating/driver/vehicle) | `SalesCrossFilters`/`AssetSalesCrossFilters` (Sales util files) | **Reuse unchanged, keep local** — these are lower-level "Why" lenses, not Performance-level dimensions; see architecture note below |
| Existing drill-down modal | `NetworkDesktopEntityGoalWizard.tsx` (Goals side only — confirmed zero modals anywhere in the Sales/Asset panels) | **Reuse this exact modal shell** for KAM/Client/Region/Asset Progress — it's the only precedent that exists anywhere in this tab |
| Date-range control | Sales side: `SalesDateRange` (`3m/6m/12m/all`) chips, Asset panel only renders them visibly | **Reuse the type**, but reconcile the inconsistent "all" window (18mo in connection util vs. 12mo in asset util — flagged as a pre-existing bug, not introduced by this merge, worth fixing in passing) |

---

## Report-back (your 11 items)

**1. Current Sales architecture.** Two independent panels under one new toggle wrapper:
`NetworkDesktopConnectionSalesPanel.tsx` (491 lines, Aggregate/partner trips — KPIs, trend,
lane mix, by-role, partner contribution, origins/destinations, trips table) and
`NetworkDesktopAssetSalesPanel.tsx` (1924 lines, own-fleet — same shape plus driver/vehicle
contribution, on-time/utilization leaders, a composite "fleet intelligence" score, and separate
paginated driver/vehicle tables), unified by the just-added `NetworkDesktopSalesPanel.tsx`. Data
comes from `useTripsQuery` (both) plus `useDriversQuery`/`useVehiclesQuery` (asset panel only) —
all already shared with the Goals panel's own data layer.

**2. Current Goals architecture.** Unchanged from the prior investigation — see
`docs/GOALS_CROSS_FILTERING_MODEL.md` §2-3 for the full detail. One orchestration component
(`NetworkDesktopGoalsPanel.tsx`), targets/KAM/region in `NetworkGoalsStore` (AsyncStorage), one
existing modal pattern (`NetworkDesktopEntityGoalWizard.tsx`).

**3. Components that can be reused (not rebuilt).** Every Sales/Asset analytics function
(lane/role/origin/destination/contribution/fleet-intelligence builders), the new
`NetworkDesktopSalesPanel.tsx` scope-toggle + `resolveSalesScope()` gating, every Goals-side
function already catalogued in the prior docs (`buildEntityGoalRows`,
`computePayableReceivableSnapshot`, `sumEntityTargetsForKeys`, etc.), and the
`NetworkDesktopEntityGoalWizard.tsx` modal shell.

**4. Existing cross-filter implementation(s) — there are three, independent today, confirmed by
direct read, not assumed:**
- Goals: `selectedKamFilter`/`selectedRegionFilter` (client-id-keyed, reaches only the entity table today — the exact gap the prior Goals docs already cover).
- Connection Sales: `SalesCrossFilters` (lanes, roles, statuses, monthKey, rating, search, dateRange) — fully self-contained, zero overlap with Goals.
- Asset Sales: `AssetSalesCrossFilters` (adds drivers, vehicles, on-time/utilization thresholds) — also fully self-contained.

None of the three currently talk to each other. This is the central integration problem this
merge has to solve — not "there's no cross-filter," but "there are three unconnected ones."

**5. Existing target implementation.** `NetworkGoalsStore` only — confirmed zero target concept
anywhere in either Sales/Asset util file (the one "Target" hit in the Asset panel is a decorative
lucide icon next to a comparison line, not a data field). No reconciliation needed against a
second target system because a second one doesn't exist.

**6. Existing KAM/Region attribution.** Client-id-keyed maps in `NetworkGoalsStore`, as already
documented. Confirmed (not assumed) zero KAM/region reference anywhere in either Sales/Asset
util or panel file.

**7. Existing drill-down/modal pattern.** Exactly one, in Goals
(`NetworkDesktopEntityGoalWizard.tsx`, centered `<Modal transparent animationType="fade">`).
Confirmed zero modals anywhere in the Sales/Asset panels — cross-filtering there is done
entirely inline (click a chart element → filter state updates → same-page table re-renders),
never via a popup. **This makes the Goals modal the only established pattern in this tab**, and
the one to extend for KAM/Client/Region/Asset Progress.

**8. Data available for Asset performance.** Two complementary, non-overlapping sources: (a)
Goals side gives target/actual/achievement % via `EntityGoalRow` (focus=vehicle/driver); (b)
Sales side gives everything Goals never had — utilization %, on-time %, revenue-per-km, a
composite fleet-intelligence score, lane/body-type mix, driver/vehicle contribution bars. Both
are real, both should surface in the Asset Progress modal — (a) as the target-vs-actual header,
(b) as the diagnostic detail beneath it.

**9. Data that cannot safely be filtered.** Unchanged from the Goals investigation: Payable
(supplier/driver side) has no KAM/Region attribution — same locked "not affected by KAM filter"
treatment applies once Sales' own Payable-adjacent figures (if any; confirmed there are none —
Receivable/Payable only exist on the Goals side) enter the merged page. Additionally new from
this audit: Sales' "by role" (client vs. supplier revenue split) and "partner contribution" bars
are **client/supplier-level**, so a KAM/Region filter (client-derived) legitimately narrows the
client half but has no meaning for the supplier half of those same charts — same caveat, one
level deeper into the Sales analytics than previously scoped.

**10. Exact files proposed to modify (when implementation is approved — not now).** No new file
is anticipated beyond what a Progress-modal extraction would need (splitting
`NetworkDesktopEntityGoalWizard.tsx`'s modal shell into a reusable wrapper component used by
both target-editing and Progress viewing). Everything else is additive changes inside
`NetworkDesktopGoalsPanel.tsx`, `NetworkDesktopSalesPanel.tsx`, and the existing
Connection/Asset Sales panels (threading a `filteredTrips` prop into their existing analytics
calls) — consistent with "extend, don't replace."

**11. Schema/RPC changes believed necessary: none.** Every data point above resolves from the
seven React Query hooks already shared between Goals and Sales. No new Supabase query, table,
or RPC identified in this audit.

---

## Final architecture, data flow, and phase plan

**Status: still planning only.** Nothing past this point has been implemented. This section
supersedes the shorter "Proposed component/data-flow architecture" draft from the first pass —
it's the same shape, now made precise enough to hand to Phase 1.

### 1. Final architecture

```
NetworkDesktopHub.tsx
  tab === "performance"   (replaces both "sales" and "goals" tab ids — see §13/§14)
      ↓
NetworkDesktopPerformancePanel.tsx
  — new orchestrator, but NOT a from-scratch component: it inherits
    NetworkDesktopGoalsPanel.tsx's state, hooks, and derivations wholesale (the target/KAM/
    Region/modal machinery only ever existed there), then renders the existing
    NetworkDesktopConnectionSalesPanel.tsx / NetworkDesktopAssetSalesPanel.tsx underneath,
    unchanged, as the "Why?" section.
      ↓
  PerformanceCrossFilter  (§3 — the one page-level filter)
      ↓
  filteredTrips / filteredClients  (§2 — same resolveClientIdsForFilter/filterTripsForCrossFilter
                                    helpers already scoped for Goals, reused unchanged)
      ↓                                    ↓
  TARGET/ACTUAL LAYER                 "WHY?" LAYER
  (KPI strip, trend,                  (existing Sales/Asset analytics, reused verbatim,
   perspective tables,                 now fed filteredTrips instead of raw trips;
   Progress modals — Phase 2)          local SalesCrossFilters/AssetSalesCrossFilters
                                        untouched, operate as a second narrowing step)
```

### 2. Performance data flow

Identical shape to the Goals-only design already documented (`docs/GOALS_CROSS_FILTERING_MODEL.md`
§10, `docs/GOALS_PHASE1_IMPLEMENTATION_PLAN.md` Group A), extended one hop further so the same
`filteredTrips` also reaches the Sales/Asset panels:

```
crossFilter (useState<PerformanceCrossFilter>)
      ↓
clientIdSet = resolveClientIdsForFilter(crossFilter, clients, kamAssignments, clientRegions)
      ↓
filteredTrips   = filterTripsForCrossFilter(trips, crossFilter, clientIdSet)
filteredClients = clientIdSet ? clients.filter(c => clientIdSet.has(c.id)) : clients
      ↓
┌─────────────────────────────┬──────────────────────────────────────────┐
│ Target/Actual layer          │ Why? layer                                │
│ computeGoalsActualsForRollup │ NetworkDesktopConnectionSalesPanel /       │
│ buildBalanceTrendPoints      │ NetworkDesktopAssetSalesPanel — called    │
│ computePayableReceivableSnap │ with filteredTrips in place of the raw    │
│ buildEntityGoalRows          │ `trips` they read today; their own        │
│ (all existing Goals util fns,│ SalesCrossFilters/AssetSalesCrossFilters  │
│  called exactly as today,    │ apply on top, unchanged, local to that    │
│  just given filteredTrips)   │ layer                                     │
└─────────────────────────────┴──────────────────────────────────────────┘
```

No function in either util file changes signature. Every existing call site that currently
passes `trips` passes `filteredTrips` instead.

### 3. Global filter model (`PerformanceCrossFilter`)

One `useState` object, page-level, replacing/absorbing all of Goals' `selectedKamFilter`/
`selectedRegionFilter` (already the plan) plus becoming the single filter that also reaches the
Sales/Asset panels below (new in this merge):

```ts
type PerformanceCrossFilter = {
  kamId: string | null;
  regionId: string | null;
  clientId: string | null;
  supplierId: string | null;           // trip.supplier_id — direct match, not client-derived (§31)
  assetId: string | null;              // vehicle or driver id
  performanceStatus: "behind" | "on_track" | "exceeded" | null;
  trendPointKey: string | null;
};
```

Becomes global (promoted to the page-level chip bar): KAM, Region, Client, Asset,
Performance status, Time point — exactly the six dimensions already specified for Goals, now
also driving the Why layer.

### 4. Local filter model (unchanged, kept where it is)

`SalesCrossFilters` (lanes, roles, statuses, rating threshold, search) and
`AssetSalesCrossFilters` (adds drivers, vehicles, on-time%/utilization% thresholds) **stay
exactly as they are today, local to their respective panels.** These are a different kind of
filter — an analytical lens on *why* a number looks the way it does (which lane, which role,
above what rating) — not a "whose portfolio" dimension. They are not promoted to the
Performance-level chip bar and do not gain their own chips there.

**How the two interact:** local filters apply *after* the global one. A user with `kamId:
"bhujesh"` active sees the Why-layer's lane-mix/role/contribution charts already narrowed to
Bhujesh's trips; if they then also set a local `minRating` filter inside that layer, it narrows
further, on top. Clearing the global filter (Performance chip) does not touch local filter
state (a user's lane/role selection inside the Why layer isn't reset just because they changed
whose portfolio they're viewing) — clearing a *local* filter never touches the global one
either. They compose, they don't overwrite each other.

**Clear/reset:** "Clear all" in the Performance chip bar resets only `PerformanceCrossFilter`.
Each panel's own local filters keep their own existing "clear" affordance (already present in
both Sales panels today), unchanged.

**Chip display:** one Performance-level bar (`Showing: Bhujesh × Tata Motors × Behind target ×
· Clear all`), per-chip removable, exactly as already specified for Goals. Local filters render
in their existing panel-local chip/pill UI, unchanged in appearance and position.

### 5. Period model

One shared period context, promoted from Goals' existing `selectedMonthKey`/`rollup`
(`GoalsRollup: "month"|"quarter"|"year"`) to drive both layers:

- Granularity: Month / Quarter / Year (existing `GoalsRollup` values, unchanged) plus Daily/Weekly
  as trend-chart-only detail (per the earlier Goals time-intelligence work), not top-level
  period options.
- Comparison: "previous equivalent period," computed as an elapsed-day-aligned window — e.g.
  Aug 1–17 vs Jul 1–17, not full-July vs partial-August, exactly as specified. This is the same
  `targetToDate()`-style calendar math already scoped for Goals, extended to also compute a
  matching previous-period actual (a second `filterTripsForCrossFilter` call against a shifted
  date window, same helper, no new plumbing).
- This one period context also drives the Sales/Asset panels' own trend charts — their existing
  `SalesDateRange` (`3m/6m/12m/all`) becomes a *derived* value from the shared period + rollup
  rather than an independently chosen chip (see §16 for the exact mapping and the "all" bug fix
  this requires).

### 6. Target/actual model

Unchanged from the Goals contract doc (§6, §16 there) — `NetworkGoalsStore`'s existing
`month.aggregate`/`month.clients[id]`/`month.vehicles[id]`/`month.drivers[id]`, plus the
already-scoped `sumTargetsForIds()` helper for KAM/Region rollups. Terminology, locked:

- **Period Target** — full target for the selected period.
- **Actual** — what's actually been achieved.
- **Target-to-date** — `Period Target × (elapsed / total days in period)`.
- **Achievement %** — `Actual / Period Target`.
- **Pacing %** — `Actual / Target-to-date` — this, not Achievement %, is what "Behind pace" /
  "On pace" / "Exceeded" is computed from. Example from your spec: ₹1.55Cr/₹3.3Cr = 47%
  achieved, but Pacing 86% ("Behind pace") — both numbers shown together, never one replacing
  the other.

No `PerformanceTargetStore`, no new table, no new RPC — confirmed unnecessary in the original
audit and unchanged by this expansion.

### 7. KAM drill-down (Phase 2 — architecture defined now, not built in Phase 1)

Modal, `NetworkDesktopEntityGoalWizard.tsx`'s existing centered `<Modal transparent
animationType="fade">` shell. Content, each item's real source:

| Field | Source |
|---|---|
| KAM name, period | existing state |
| Revenue/Trips target, actual, achievement % | `sumTargetsForIds` + `computeTripMetrics` over that KAM's client-id set |
| Target-to-date, Pacing % | §6's helper, same id set |
| Previous period, Change % | §5's shifted-window computation, same id set |
| Margin | derived (revenue − cost) over the same filtered trip set |
| Client portfolio table (Target/Actual/Achievement/Pacing/Previous/Growth/Status per client) | `entityRows` already scoped to this KAM's clients, sorted by achievement — this table already exists in shape, just needs the Pacing/Previous/Growth columns added |

Clicking a client row inside this modal navigates the same modal to Client Progress (§7 in the
Goals Phase 1 doc's Group D — in-modal stack, parent page `crossFilter` untouched, restored
exactly on close).

### 8. Client drill-down (Phase 2)

Same modal shell, Client Progress view: Target/Actual/Achievement/Target-to-date/Pacing/
Previous/Growth (same sources as §7, scoped to one client id), Trips, Margin, Receivable (single-
client `aggregateCustomers` call), Payable "where meaningful" — **confirmed there is no
client-level Payable concept at all** (Payable is exclusively supplier+driver); this row is
simply omitted from the Client modal rather than shown as zero or fabricated. Then: "Assets
serving this client" (vehicles/drivers appearing in this client's trips, same Target/Actual/
Achievement/Pacing/Status shape), plus reused Sales-side detail — lanes, origins, destinations,
recent trips — computed by calling the existing `connectionSalesAnalytics.util.ts` builder
functions with this client's `filteredTrips` subset, not reinvented.

### 9. Region drill-down — recommendation, not silent decision

**Recommendation: Region ships as a global filter dimension in Phase 1 (clickable pill,
cross-filters everything, same as KAM), but a dedicated Region *perspective table + Region
Progress modal* is deferred to Phase 2, not built alongside KAM/Client/Asset in the first
modal wave.**

Reasoning, stated plainly: KAM and Client are both already backed by an existing assignment
workflow with an existing UI (the KAM-assignment modal, client rows themselves) — there's a
clear signal these fields get populated. Region assignment (`clientRegions`) exists in the same
store with the same mechanism, but this audit has **no evidence of how consistently orgs
actually fill it in** — that wasn't checked against live data, and building a full dedicated
perspective + progress modal for a dimension whose real-world coverage is unverified risks
shipping a feature that shows "no region assigned" for most rows in practice. Filtering by
Region wherever it *is* set costs nothing extra (it's the exact same `clientRegions`-keyed join
already used for KAM) and degrades gracefully — clients without a region simply don't appear
under any region filter, same as clients without a KAM today. Once real usage data shows
region assignment is populated meaningfully, promoting it to a full perspective (table + modal,
mirroring §7) is a small, low-risk follow-up, not a redesign.

Same data-model caveat as KAM: Region is client-level only. No supplier/driver/asset has a
region independent of the client they served that trip for.

### 10. Asset drill-down (Phase 2)

Same modal shell. Target/Actual/Achievement/Target-to-date/Pacing/Previous/Growth (from
`EntityGoalRow`, focus=vehicle/driver), Trips, Margin (derived), Client (dominant client among
this asset's trips — **explicitly labeled inferred**, not authoritative, since an asset can
serve more than one client), Driver (for a vehicle) or Vehicle (for a driver) where the trip
data links them, Lane contribution (reused from `assetSalesAnalytics.util.ts`'s existing
builder, called with this asset's filtered trips).

**Not built, explicitly future scope — confirmed no such data exists today:** utilisation, idle
days, fuel economics, operating costs. The audit found only a generic `status: string` on
`VehicleRow`/`DriverRow` — nothing else. The existing "fleet intelligence" composite score
(`computeAssetFleetIntelligence`) is real and does get reused where it already computes
something (profit/utilization/done/cost-efficiency dimensions per the Sales audit) — but it is
not treated as authoritative utilisation/cost data; it's a scoring heuristic, presented as such.

### 11. Sales analytics placement

`NetworkDesktopConnectionSalesPanel.tsx`'s existing content (top contributors, sale trends,
lane mix, by-role, partner contribution, origins/destinations, trips table) renders unchanged,
positioned as the "Why?" section beneath the Target/Actual layer — per your hierarchy: Executive
performance → Target vs actual → Performance breakdown (KAM/Client/Region/Asset) → Exceptions →
**Sales/asset diagnostics** → Detailed trips. Not concatenated at the same visual weight as
today's standalone tab; demoted to supporting detail, exactly as instructed.

### 12. Asset analytics placement

Same treatment, `NetworkDesktopAssetSalesPanel.tsx` unchanged, positioned in the same "Why?"
section when the Asset perspective is active (§2 of your message — see the perspective-toggle
resolution below for exactly when each renders).

### How the two toggles coexist (your §2 question, answered directly)

They don't coexist as two separate controls — **the six-way Performance perspective selector
replaces `resolveSalesScope()`'s UI surface**, while reusing its gating logic wholesale. Updated
per §31 below to include Supplier as a first-class perspective (Driver stays filter/drill-down
only, not a seventh tab — see §31):

- `[Aggregate | KAM | Client | Region | Supplier | Asset]` is gated exactly like
  `resolveSalesScope` already gates Aggregate/Asset today: KAM/Client/Region require
  `canAccessClients` (same concepts `resolveSalesScope`'s "aggregate" scope already assumes);
  Supplier requires `canAccessSuppliers` (an existing, separate capability — confirmed at
  `lib/capabilities.ts:138-140` — already used elsewhere in this hub, e.g. gating the Supplier
  party-directory tile; not invented for this plan); Asset requires `canAccessDrivers`
  (identical to `resolveSalesScope`'s "asset" scope). An Asset-only org sees `[Aggregate |
  Asset]` only; an Aggregate-only org without supplier access sees `[Aggregate | KAM | Client |
  Region]`; an org with all three capabilities sees all six — same resolution pattern
  `resolveSalesScope` already encodes, just applied to six options gated by three capability
  checks instead of two.
- The Why-layer's choice of which Sales panel to render is **derived from the perspective**,
  not independently chosen: `Asset` perspective → render `NetworkDesktopAssetSalesPanel`;
  `Aggregate`/`KAM`/`Client`/`Region`/`Supplier` perspectives → render
  `NetworkDesktopConnectionSalesPanel` (Supplier is a connection/partner concept — the
  Connection Sales panel already computes supplier cost via its "by role" donut, confirmed in
  the original audit — so it's the correct existing Why-layer for this perspective too, no new
  panel needed). This removes the naming collision entirely — there is one "Aggregate" (the
  whole-business rollup, no breakdown), one "Supplier," and one "Asset," each meaning exactly
  one thing, in exactly one place. `resolveSalesScope()` itself is kept as the underlying
  capability-resolution function, now called to decide which perspectives are *offered*, not to
  render a second, separate
  toggle.

### 13. Navigation migration

`NetworkDesktopHub.tsx`'s `TABS` array: remove `"sales"` and `"goals"` entries, add one
`"performance"` entry. `NetworkDesktopTab` type gains `"performance"`, keeps `"sales"` and
`"goals"` as deprecated aliases (same treatment already given to `"connections"`/`"grow"` →
`"network"` in `normalizeHubTab()`). `NetworkDesktopHub.tsx`'s panel-render `if` chain: replace
the `tab === "sales"` and `tab === "goals"` branches with one `tab === "performance"` branch
rendering `NetworkDesktopPerformancePanel`.

### 14. Deep-link strategy

Reuse the exact existing alias pattern, don't invent a new mechanism:

```ts
function normalizeHubTab(raw: NetworkDesktopTab): NetworkDesktopTab {
  if (raw === "connections" || raw === "grow") return "network";
  if (raw === "sales" || raw === "goals") return "performance";   // new
  return raw;
}
```

Any existing bookmark/deep link to `?panel=sales` or `?panel=goals` resolves straight to
Performance, landing on Aggregate perspective (no scope/context is lost — there was no
KAM/Client/Asset selection encoded in those old URLs to begin with, since neither old tab put
filter state in the URL).

### 15. Data limitations (consolidated, all previously stated, restated together for one reference point)

- No `trip.kam_id` — KAM is derived via `clientId → kamAssignments[clientId]`, one hop.
- No supplier/driver/asset-level KAM or Region — both are client-level only.
- No target concept anywhere in Sales/Asset — target/actual only exists via `NetworkGoalsStore`.
- No utilisation/idle-days/fuel/operating-cost data on `VehicleRow`/`DriverRow` — only a generic
  `status` field.
- No previous-period comparison logic exists anywhere today (Goals or Sales) — new for this
  merge, per §5/§6.
- Payable (supplier+driver) has no KAM/Region attribution path — **locked**: always shows the
  org-wide figure with a "Not affected by KAM/Region filter" label when either is active. Same
  now applies to Sales' "by role" supplier-half and "partner contribution" supplier rows.
- The two Sales utils' "all" date range disagree (18mo vs. 12mo) — see §16, must be resolved
  before the shared period model can drive both layers correctly.

### 16. Exact file changes (Phase 1 scope only — §17 defines exactly what Phase 1 touches)

| File | Change |
|---|---|
| `NetworkDesktopHub.tsx` | Tab list/type/alias/render-branch changes (§13/§14) |
| `NetworkDesktopGoalsPanel.tsx` → renamed/evolved into `NetworkDesktopPerformancePanel.tsx` | Absorbs existing state/hooks unchanged; adds `PerformanceCrossFilter`, period/comparison plumbing, renders Sales/Asset panels as a new section |
| `connectionGoalsAnalytics.util.ts` | Additive only — `resolveClientIdsForFilter`, `filterTripsForCrossFilter`, `sumTargetsForIds` (already scoped for Goals Phase 1), plus a new previous-period-window helper (§5) |
| `NetworkDesktopSalesPanel.tsx` | `SalesScope` state removed as an independent choice; scope becomes derived from the new perspective (§12) |
| `NetworkDesktopConnectionSalesPanel.tsx`, `NetworkDesktopAssetSalesPanel.tsx` | One-line change each: accept `filteredTrips` in place of calling `useTripsQuery` results directly — **not otherwise modified in Phase 1** |
| `connectionSalesAnalytics.util.ts`, `assetSalesAnalytics.util.ts` | Only the "all" date-range constant fixed (§20/§16-here) — no other change |

No new file needed for Phase 1 beyond the panel rename. Progress modals (§7-10) are Phase 2 and
will need one new modal component, scoped when that phase starts.

### 17. Phase 1 commit sequence

Strictly the foundation your message scoped in its own §21 — navigation merge, shared period,
shared cross-filter, KPI layer, primary trend, perspective selector, existing analytics
preserved underneath. **No Progress modals in this list — those are Phase 2, per your own
phase split, documented above in §7-10 as forward architecture only.**

1. **Fix the "all" date-range inconsistency first** (§15/§20) — a one-constant change in
   `assetSalesAnalytics.util.ts` (or `connectionSalesAnalytics.util.ts`, whichever the product
   decides is canonical) so the shared period model in Commit 6 has one correct number to drive
   both layers with. Small, isolated, testable alone before anything depends on it.
2. **Navigation merge** (§13/§14) — `NetworkDesktopHub.tsx` tab list/alias/render-branch change,
   pointing `"performance"` at the *existing* `NetworkDesktopGoalsPanel` unchanged (a pure
   rename/routing commit — proves navigation works before any new behavior is added).
3. **`PerformanceCrossFilter` state** (§3) — same as Goals Phase 1 Commit 1: fold existing
   `selectedKamFilter`/`selectedRegionFilter` into one object, zero behavior change yet.
4. **`resolveClientIdsForFilter`/`filterTripsForCrossFilter` helpers** (already scoped, Goals
   Phase 1 Commit 2) — pure, unit-tested, not wired in yet.
5. **Wire `filteredTrips`/`filteredClients` into the existing Target/Actual layer** (Goals Phase
   1 Commits 3-4) — KPI cards, trend, Receivable/Payable (with the "not affected" label) all
   read filtered data. This is the same core-gap fix as the Goals-only plan, unchanged.
6. **Shared period + previous-period comparison** (§5) — promote `selectedMonthKey`/`rollup` to
   drive a derived `SalesDateRange` for the Sales panels (using the now-fixed "all" constant
   from Commit 1); add the elapsed-day-aligned previous-period window helper and wire Previous/
   Change% into the KPI strip.
7. **Perspective selector** (§12, §31) — replace `NetworkDesktopSalesPanel`'s independent
   `SalesScope` state with the six-way `[Aggregate|KAM|Client|Region|Supplier|Asset]` selector,
   capability-gated identically to today (adds `canAccessSuppliers` alongside the existing
   `canAccessClients`/`canAccessDrivers` checks); Why-layer panel choice becomes derived, not
   separately stored.
8. **Client + Asset + Region + Supplier filter dimensions** (§3, §9, §31) — extend
   `PerformanceCrossFilter` with `clientId`/`assetId`/`regionId`/`supplierId`, wire click-to-filter
   on whichever perspective table is active (Supplier's is a direct `trip.supplier_id` match, no
   derived join — see §31), per-chip clear/Clear-all UI.
9. **Thread `filteredTrips` into the Why-layer panels** (§2/§11/§12) — the one-line change to
   `NetworkDesktopConnectionSalesPanel.tsx`/`NetworkDesktopAssetSalesPanel.tsx` from §16's table;
   confirm their own local filters still work unchanged on top.
10. **Selection highlight/recede + chip-bar polish** (carried over from the Goals-only plan's
    Group G, since it applies identically here).

**Phase 1 stop-point:** after Commit 10, before Phase 2 (Progress modals) begins — matches your
own §21/§22 boundary exactly.

### 18. Test plan

Extends the Goals-only test matrix (`docs/GOALS_CROSS_FILTERING_MODEL.md` §27,
`docs/GOALS_PHASE1_IMPLEMENTATION_PLAN.md` §27) with the merge-specific cases from your message's
§24:

| # | Action | Expected |
|---|---|---|
| 1 | Old `?panel=sales` / `?panel=goals` link | Resolves to Performance, Aggregate perspective |
| 2 | Performance → Aggregate | Target vs actual KPIs correct, matches what Goals showed pre-merge |
| 3 | Click KAM (Bhujesh) | All compatible KPIs, trend, and the Why-layer analytics (lane mix, contribution) recompute to Bhujesh's trips |
| 4 | Switch Aggregate → Asset perspective with KAM active | KAM chip persists; Why-layer switches to Asset Sales analytics, scoped to assets in Bhujesh's client trips |
| 5 | Month → Quarter → Year | KPIs, trend, and Why-layer period all move together (one shared context, not three separate ones) |
| 6 | Aug 1–17 vs Jul 1–17 | Confirmed equivalent elapsed-day window, not full-July vs partial-August |
| 7 | Edit a target, save | Performance reflects the update immediately, without navigating away |
| 8 | Existing Sales analytics (lane mix, by-role, partner contribution) | Still render correctly, now scoped by the active Performance filter, local filters still work on top |
| 9 | Existing Asset analytics (fleet intelligence, driver/vehicle contribution) | Same check |
| 10 | Clear all | Returns to Aggregate, org-wide, matching pre-filter state exactly |
| 11 | KAM filter active, view Payable | Org-wide figure + "Not affected" label, never fabricated |

### 19. Explicitly deferred items

- Progress modals for KAM/Client/Asset (Phase 2, per your own phasing) — Region Progress modal
  additionally deferred past that pending real usage data (§9).
- Contextual target editing polish, quarterly/yearly dedicated views, Exceptions/"Needs
  attention" section — Phase 3, per your own §23.
- Target allocation (business target → KAM/client breakdown) — confirmed not to exist in the
  underlying model; out of scope entirely unless requested as a distinct future feature (locked
  in the Goals contract doc, unchanged here).
- New permission model for target editing — pre-existing gap, not introduced or fixed by this
  merge (locked in the Goals contract doc, unchanged here).

### 20. Open decisions

1. ~~**Which file's "all" constant is canonical**~~ **RESOLVED (Commit 1, implemented).** Closer
   read at implementation time found a third inconsistency beyond the originally-reported
   18mo/12mo split: `assetSalesAnalytics.util.ts` had two of its own local special-cases —
   `dateRangeToWindowMonths()` returning 12 months for "all", and a separate `periodDayCount()`
   returning a hardcoded 180 *days* (≈6 months) for "all" — both independent of the shared,
   already-exported `monthsForRange()` (18 months) that both util files already use for trend
   month-keys. No new number was chosen; both duplicated special-cases were deleted and now
   derive from the one existing shared function instead, so "all" means 18 months everywhere in
   both files. `dateRangeToWindowMonths()` itself was removed as a now-pointless one-line
   pass-through — its single call site calls `monthsForRange()` directly. Files touched: only
   `assetSalesAnalytics.util.ts` (`connectionSalesAnalytics.util.ts` was already correct — it
   owns the shared function). `tsc --noEmit` clean on both files.
2. **Region: filter-only in Phase 1, full perspective deferred** — this is a recommendation
   (§9), not a unilateral decision; confirm before Commit 8.
3. **Exact new component name/location for the Phase 2 Progress modal** — deferred until Phase 2
   scoping, not needed for Phase 1.

---

## Addendum — Supplier/Operator dimension, trip evidence, and smart data access

**Status: still planning only.** This section answers the 15-item audit you required before
any code, updates the perspective selector and drill-down hierarchy to include Supplier, and
adds the trip-evidence/export/import architecture. Nothing above this addendum is invalidated —
this extends §1-20, it doesn't replace them (only the perspective-selector text at §12 and the
`PerformanceCrossFilter` type at §3 were directly edited in place to add Supplier).

### 21. Audit answers (your 15 required items)

**1. Where supplier attribution comes from.** Directly on the trip row — `trip.supplier_id`
(`trips.service.ts:75`), with `trip.supplier_name` as a fallback "used for supplier due/name
matching (e.g. synced trips)" per its own doc comment (`:79`). This is the same tier as
`client_id`/`vehicle_id`/`driver_id` — a direct trip-level field, **not** a derived join like
KAM/Region.

**2. Whether supplier is available directly on `TripRow`.** Yes, confirmed above — no
aggregation or lookup table needed to know which supplier operated a given trip.

**3. How supplier cost is calculated.** `trip.supplier_rate` (`trips.service.ts:89`) — the exact
same field already summed as "cost" in every existing margin calculation this session has
touched (`computeTripMetrics`, `buildBalanceTrendPoints`, the Sales panel's "by role" donut).
Nothing new to compute — Supplier performance's Cost/Margin columns reuse this field, same as
everything else already does.

**4. Whether supplier targets exist.** No. Confirmed: `NetworkGoalsStore`'s `GoalFocus` type is
exactly `"client" | "vehicle" | "driver"` (`networkGoalsStorage.service.ts:12`) — there is no
`"supplier"` option and no `suppliers` bucket in `NetworkGoalsMonthStore` (only `clients`,
`vehicles`, `drivers`). **Do not invent one.** Per your own instruction, Supplier performance
shows Actual / Previous period / Growth / Trips / Cost / Margin, with an explicit "No supplier
target set" state — never a fabricated target.

**5. Whether supplier target editing is possible with the existing target store.** No — same
reason as #4. Adding it would mean extending `NetworkGoalsMonthStore` with a `suppliers` bucket,
which is a real, identifiable, *out-of-scope-for-this-merge* schema change to the target model,
not something to slip in silently. If supplier targets become a real product requirement, that's
a distinct, explicit decision — flagged, not decided here.

**6. Whether supplier can be cross-filtered safely.** Yes, safely and directly — `supplierId` in
`PerformanceCrossFilter` matches `trip.supplier_id` exactly the way `assetId` already matches
`trip.vehicle_id`/`trip.driver_id`. No derived join, no attribution risk, unlike KAM/Region.

**7. Whether driver attribution is available.** Yes — `trip.driver_id` (`trips.service.ts:80`),
confirmed earlier in this session and unchanged. Available as a filter/drill-down dimension
inside Supplier/Asset (per §31 below), not promoted to its own top-level perspective, per your
explicit instruction not to overbuild it.

**8. Whether current users have permission to see supplier cost/margin.** Confirmed: the
existing Connection Sales panel's "by role" donut and "partner contribution" bars already show
supplier cost/revenue split (`connectionSalesAnalytics.util.ts:610-643`) with **zero additional
capability check found** in that panel or util file — any user who can open the Sales tab today
already sees supplier financials. Separately, `canAccessSuppliers()` exists
(`lib/capabilities.ts:138-140`) as a real, existing, org-operating-model-level capability
already used elsewhere in this hub (gating the Supplier tile in the party directory). **Reusing
this existing gate** to decide whether the Supplier *perspective* is even offered is the correct,
non-invented answer — it does not change what a user who already sees the Sales tab can see
within it; it only decides whether "Supplier" appears as a perspective tab at all (mirroring how
Asset already only appears for `canAccessDrivers` orgs).

**9. Existing trip pagination implementation.** None, for the hook this page uses.
`useTripsQuery` (`lib/queries/useTripsQuery.ts:20`) is explicitly documented in its own comment
as **"Full list (no pagination)... Use for Trips tab"** — it calls `get_trips_for_org` with no
limit/offset and returns every trip for the org. This is confirmed as a known,
already-documented, repo-wide characteristic in `docs/PAGINATION_AND_CACHE_ANALYSIS.md`
("No list uses `.range()`/`.limit()`; all list APIs fetch full tables" — listed as a top
pre-existing performance risk, predating this merge entirely). A *separate*, genuinely paginated
hook exists — `useTripsInfiniteQuery` (`limit`/`offset`, `getTripsByOrganization`) — used
elsewhere (the actual Trips tab list), not by Goals/Sales/Performance today.

**10. Existing trip export implementation.** Yes, real and reusable —
`features/network/lib/networkExport.util.ts` builds `XLSX.WorkBook`s entirely client-side (via
the `xlsx` package) from in-memory arrays already loaded in React state (vehicles/drivers/
partners sheets today), triggered from `NetworkExportMenu` (already used in
`NetworkDesktopHub.tsx` for "Export Connections (Excel)"). This is the exact pattern to reuse
for a "Download matching trips" action — no new export mechanism needed.

**11. Existing import implementation.** None found — grepped for import/bulk-upload patterns
across `features/` and `app/`, zero matches for anything resembling trip or target import. Per
your instruction: document as **"Import data — future capability,"** do not build one now.

**12. Whether full-data export can be performed from current cached data.** Yes, for the same
reason pagination doesn't currently exist: `useTripsQuery` already loads the *entire* org's
trips into memory today (see #9), so `filteredTrips` (the Performance cross-filter's output) is
already the complete matching dataset, not a truncated page — "Download" needs no separate
fetch, it exports exactly what's already in memory.

**13. Whether a server-side export is required.** No, not for current data volumes, precisely
*because* of #9/#12 — but this is a double-edged fact, not a clean "no": it means the
Performance page (like every other list screen in this app today) is exposed to the same
already-documented, pre-existing scalability ceiling (`docs/PAGINATION_AND_CACHE_ANALYSIS.md`'s
"first load is slow and memory use is high" for large orgs). **This plan does not fix that
ceiling** — fixing `useTripsQuery` itself is a repo-wide concern already tracked in that doc,
independent of this merge, and out of scope here. Flagging plainly: if a specific org's trip
volume ever makes the full in-memory fetch itself too slow, that is the pre-existing
`useTripsQuery` limitation surfacing, not something Performance's mini-table/export design
introduces or can fix from its side.

**14. Exact fields safe for export.** Matching your own list exactly, since it aligns with what's
already visible in the existing Sales panels' tables/exports and existing capability gates: Trip
ID, Date, Client, KAM (where assigned), Region (where assigned), Supplier, Asset, Driver (where
available), Origin, Destination, Sales, Cost, Margin, Status. No internal/database-only fields
(row ids beyond the trip's own display number, raw foreign keys, audit timestamps) are included.

**15. Exact files required for implementation.** Added to the §16 file-changes table below this
section — no files beyond what's already listed there, plus reuse (not modification) of
`networkExport.util.ts` and `TripDetailScreen.tsx`.

### 22. Attribution rule — commercial vs. operational, never fabricate the intersection

Two independent attribution chains, both real, neither one a substitute for the other:

```
Commercial:   Client → KAM → Region        (all client-id-keyed, derived through kamAssignments/clientRegions)
Operational:  Supplier → Asset → Driver    (all direct trip-level fields: supplier_id, vehicle_id, driver_id)
```

A trip can be filtered on **any combination** of these simultaneously (`Bhujesh × Tata Motors ×
ABC Logistics × Vehicle 101` is just four independent `AND` conditions on the same `filteredTrips`
array — no new join logic beyond what `filterTripsForCrossFilter` already does, just more fields
to check). What must **not** happen: computing a metric for a combination the data can't support
— e.g. there is no "ABC Logistics's KAM" (suppliers aren't KAM-assigned) and no "Tata Motors's
driver-of-record" (a client doesn't have one driver, trips do). Every metric shown must trace to
a real field on the trip or a real derived map (`kamAssignments`/`clientRegions`) — if a
perspective/modal would need to invent a relationship to show a number, that field is omitted
(§8's already-locked pattern for Client-level Payable, extended here to Supplier-level KAM/Region).

### 23. Supplier performance view

New table, same shape as the existing KAM/Client tables, computed from `filteredTrips` grouped
by `supplier_id` (reusing `suppliers` from `useSuppliersQuery`, already fetched by the Goals
panel today — confirmed no new query needed): Supplier name (`SupplierRow.name`, with
`trip.supplier_name` fallback for synced trips lacking a matched `supplier_id`), Trips, Sales
(`client_price` sum), Cost (`supplier_rate` sum), Margin, Previous period, Change %, Status. **No
Target/Achievement/Pacing columns** — per #4/#5 above, there is no supplier target model; if a
future decision adds one, these columns slot in without restructuring the table.

### 24. Supplier Progress modal (Phase 2 — architecture defined now, not built in Phase 1)

Same `NetworkDesktopEntityGoalWizard.tsx` modal shell as every other Progress modal. Header:
supplier name + period. KPI strip: Sales, Previous period + Change %, Trips, Cost, Margin — no
Achievement/Pacing row unless/until a target model exists (shown only if present, never
fabricated). Then, in order: **Clients served** (this supplier's trips grouped by `client_id` —
same shape as the Client table, scoped to this supplier), **Assets operated** (grouped by
`vehicle_id`), **Drivers** (grouped by `driver_id`, "where driver attribution exists" — omitted
entirely if this supplier's trips have no driver data, not shown as a zero-row table), **Recent
trips** (the mini evidence table, §26, scoped to this supplier). Clicking a client/asset row
inside this modal navigates the modal in place (same in-modal stack already designed for
KAM→Client→Asset), extended to include Supplier as one more node in that same stack.

### 25. Client × Supplier and Asset × Supplier diagnostic views

Two new small breakdown widgets, not new data sources — both are the exact same `filteredTrips`
array grouped a different way:

- **Client × Supplier contribution** (inside Client Progress, §8 above): this client's trips
  grouped by `supplier_id`, sorted by revenue — "Tata Motors" → "ABC Logistics ₹18L, XYZ
  Transport ₹12L, ...". Clicking a supplier row sets `supplierId` in `PerformanceCrossFilter`
  (context becomes `Tata Motors × ABC Logistics`) — a cross-filter action, not a navigation.
- **Asset × Supplier / Supplier × Asset** (inside either modal, whichever the user entered
  through): same grouping, the other direction. Both are cheap `Map`-based groupings over an
  already-filtered array already sitting in memory — no new query, no new util file, just two
  small grouping functions alongside the ones already scoped for §7-10.

### 26. Trip evidence layer — the mini Trips table

Every Progress modal (KAM/Client/Region/Supplier/Asset) and the main Performance page itself get
one compact, shared table component (`PerformancePerformanceTripsEvidence` or similar — exact
name is a Phase 3 detail, not decided here), always fed the currently-filtered trips (whatever
combination of `PerformanceCrossFilter` is active), never the full org trip list:

**Columns** (per your priority list, exactly): Trip, Date, Lane, Client, Supplier, Sales, Cost,
Margin, Status — with Asset as a compact secondary field or modal-detail-only column when width
is constrained, matching your explicit priority ordering.

**Row limit:** 5 by default, a `[5 | 10]` toggle, never 50/100 by default. Because
`useTripsQuery` already loads everything (§21.9/§21.12), this is a pure client-side `.slice()` on
the already-filtered array — no new fetch triggered by changing the page size.

**"Showing X of Y matching trips"** — always visible, making the row-limit-≠-data-limit
distinction explicit per your §13, using `filteredTrips.length` as `Y`.

**"View all trips"** — does not expand Performance into a giant in-page table. Opens the
*existing* Trips experience (the real `app/(tabs)/trips.tsx`/`TripDetailScreen.tsx` machinery),
passed the current filter context, with a visible "Showing trips for: Bhujesh × Tata Motors ×
ABC Logistics × Vehicle 101" banner — reusing the existing screen, not building a second one, per
your explicit instruction.

**Trip ID click** — opens the existing `TripDetailScreen.tsx` (`features/trips/components/
trip-detail/TripDetailScreen.tsx`), confirmed to already exist and already be the real
operational trip-detail experience. No second trip-detail component is built.

**Download** — client-side, reusing `networkExport.util.ts`'s existing `XLSX.WorkBook`-from-
array pattern, exporting exactly `filteredTrips` (the complete matching set, not just the 5/10
visible rows — confirmed safe per §21.12) with the field list from §21.14. Before download, show
the exact context being exported (period, active chips, row count) and require an explicit
confirm — per your §25 — preventing an accidental full-organization export when the user meant a
filtered slice.

**Import** — not built. Documented in the UI (if at all) as "Import data — future capability,"
per §21.11, exposed nowhere prominent in Phase 1-3.

### 27. Smart, contextual actions (not a toolbar)

Matching your §15 exactly: page-level header gets one `[Export]` (or an overflow `⋮` once
Import ever becomes real); each Progress modal/mini-table gets `[View all]`/`[Download]`
adjacent to that specific table, not duplicated globally; trip-row-level actions stay whatever
the existing `TripDetailScreen`/trip list already offers today — nothing new invented at that
level.

### 28. Updated drill-down hierarchy

```
Commercial:    Aggregate → KAM → Client → Region
Operational:   Supplier → Asset → Driver
Evidence:      → Trip

Composable, not linear — a user can jump:
  Client → Supplier          (§25's Client×Supplier widget)
  Supplier → Asset            (§25's Asset×Supplier widget, or the Supplier Progress modal's
                                "Assets operated" table)
  Asset → Trip                 (mini evidence table or "View all")
  or go straight from any perspective table row to that entity's Progress modal via an explicit
  "View progress" action (drill-down), separate from clicking the row itself (cross-filter) —
  same rule already locked in the Goals contract doc, unchanged.
```

Users are never forced through every level — per your §23, a direct Client → Supplier or
Supplier → Asset jump is a first-class interaction, not a fallback.

### 29. Updated perspective selector (supersedes the five-way text elsewhere in this doc)

`[Aggregate | KAM | Client | Region | Supplier | Asset]` — six options, three capability gates
(`canAccessClients` → KAM/Client/Region; `canAccessSuppliers` → Supplier; `canAccessDrivers` →
Asset; Aggregate always available). Driver is **not** a seventh option — it remains a
filter/drill-down dimension reachable from inside Supplier/Asset Progress modals and the mini
trip table, per your explicit instruction not to overbuild it unless a real business requirement
for a dedicated Driver perspective surfaces later.

### 30. Updated file changes (adds to §16's table, does not replace it)

| File | Change |
|---|---|
| `connectionGoalsAnalytics.util.ts` (or wherever §16 already places the shared helpers) | Add `groupTripsBySupplier`, `groupTripsByClientSupplier`/`groupTripsByAssetSupplier` — small, pure, additive |
| New small component (name TBD, Phase 3) | The shared mini Trips evidence table — reused by every Progress modal and the main page |
| `NetworkDesktopSalesPanel.tsx` | Perspective options extended to six; `canAccessSuppliers` added to its gating alongside the existing two capability checks |
| *(reuse only, no modification)* | `features/network/lib/networkExport.util.ts` (download), `features/trips/components/trip-detail/TripDetailScreen.tsx` (trip detail), the existing Trips tab (`app/(tabs)/trips.tsx`, for "View all") |

No schema, RPC, or new query identified anywhere in this addendum either — every answer in §21
resolves from data already fetched by hooks already in use today.

### 31. Updated phase structure (supersedes the Phase 2/3 labels used earlier in §17-19 where they conflict)

Adopting your four-phase structure exactly, since it's cleaner than this doc's earlier three-phase
split:

- **Phase 1 — Performance foundation** (this doc's §17 commit sequence, now including the
  Supplier perspective + `supplierId` filter dimension per the edits above; unchanged
  otherwise — still the only phase with an approved-for-implementation commit sequence).
- **Phase 2 — Performance drill-down**: KAM/Client/Region/Supplier/Asset Progress modals (§7-10,
  §24), Client×Supplier and Supplier×Asset diagnostics (§25), Driver drill-down inside those
  modals (§26/§28). Region Progress modal specifically stays deferred past this phase per §9's
  recommendation, pending real coverage data.
- **Phase 3 — Operational evidence**: the mini Trips table (§26), 5/10 pagination, "View all"
  (existing Trips experience), Trip detail (existing `TripDetailScreen`), Download (existing
  export pattern).
- **Phase 4 — Management actions**: Exceptions/"Needs attention," contextual target editing,
  Import (only if/when a real import mechanism is built elsewhere — not created here), export
  polish (the confirm-before-download context screen, §26).

Only Phase 1 has an approved-for-review commit sequence (§17). Phases 2-4 are documented
architecture, not yet broken into commits — that happens when each phase is scheduled, matching
how this session has handled every prior phase boundary.

---

No implementation has started. Awaiting explicit approval of this Phase 1 commit sequence
(§17, now including the Supplier additions from this addendum) before Commit 1 begins.
