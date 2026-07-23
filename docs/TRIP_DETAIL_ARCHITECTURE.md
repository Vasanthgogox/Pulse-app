# Trip Detail — Architecture Redesign (proposal, awaiting approval)

> Status: **DESIGN ONLY. No code until approved.** Behavior must remain 100% identical.
> Line-count reduction is explicitly a non-goal; the goal is bounded contexts,
> single responsibility, low coupling, and rendering close to its domain.
>
> Progress: Steps 0–2 implemented & committed (48fe4c99) — TripContext,
> useTripDetailUi, useTripRatings. The **Refresh Coordinator** (below) is the
> prerequisite that unblocks all remaining domain-hook extractions AND the render
> split; design it before attempting Steps 3–9.

---

## PREREQUISITE — The Refresh Coordinator (unblocks Steps 3–9)

### Why the remaining slices are blocked
`useTripRatings` extracted cleanly because it has **no loader** — nothing else
triggers it. Every other domain (timeline, finance, documents, tracking) owns a
loader (`loadAssignmentAudit`, `loadAdjustments`, `loadTripDocuments`, `loadTripOtp`)
that is **orchestrated together** by three coordinators inside `useTripDetail`:

- `handleRefresh` (pull-to-refresh) — L1565
- `handleAssignmentUpdated` — L1582
- `handleReassignCompleted` — L2609

Each does the same shape: bump `financeRefreshKey`, refetch transactions, then
**either** invalidate the bundle query (when `bundleActive`, the default for all
orgs) **or** fan out to the individual loaders (legacy path). Extracting a domain
hook naively would strand its loader outside these coordinators → refresh-after-
reassign silently stops updating that domain. That timing bug is invisible to tsc.

### Design: `useTripRefreshCoordinator`
A tiny registry hook that owns the fan-out decision; domain hooks register their
`reload`. Preserves the exact current behavior (bundle-invalidate vs legacy fan-out).

```
type ReloadFn = () => void | Promise<void>;

useTripRefreshCoordinator({ tripId, bundleActive, queryClient })
  returns {
    register(key: string, reload: ReloadFn): void   // domain hook registers on mount
    refreshAll(reason: 'pull' | 'assignment' | 'reassign'): void
  }
```
- `refreshAll` reproduces today's logic exactly:
  - always: `setFinanceRefreshKey(k+1)` + `refetchTransactions()` (kept in core).
  - if `bundleActive && tripId`: invalidate `queryKeys.trips.bundle(tripId)` — **domain
    hooks re-read from the bundle via their own selectors; no reload fan-out needed.**
  - else (legacy): call every registered `reload()` — same set/order as today.
- The three coordinators (`handleRefresh` / `handleAssignmentUpdated` /
  `handleReassignCompleted`) become thin wrappers over `refreshAll(reason)` plus
  their reason-specific extras (e.g. reassign sets `waitingForNewDriverLocation`).

### Why this is the right unlock
- Domain hooks no longer need the screen or god-hook to drive their refresh — they
  register once and read the bundle. **This is what makes Steps 3–7 clean** (each
  hook self-contained) **and Step 9 possible** (tabs call `useTripX()` directly,
  ~0 props).
- Behavior identical: on the live (bundle) path, refresh is already just a bundle
  invalidation — the coordinator formalizes that. Legacy path keeps the exact
  fan-out.

### Migration order for the coordinator (each compiles, reversible)
- **Step 3a** — introduce `useTripRefreshCoordinator` inside `useTripDetail`; route
  the 3 coordinators through `refreshAll`. No hook moved yet. Verify: pull-to-refresh
  + reassign still update every tab (bundle path) and legacy path unchanged.
- **Step 3b onward** — extract one domain hook at a time (order: documents →
  timeline → finance → tracking). Each registers its `reload` with the coordinator
  and reads its bundle slice. `useTripDetail` composes them and spreads their return
  to keep its public surface identical until Step 8.
- Only after the domain hooks exist: **Step 9** splits the render into `tabs/`,
  each tab consuming its domain hook via context (this is where the screen finally
  drops from ~6k toward ~1.5k).

### Verification gate (why this needs a dedicated session)
The coordinator and every domain-hook step change *refresh timing*, verifiable only
by driving the app: pull-to-refresh, assignment, and **reassignment** must still
refresh every tab; live tracking must still update. Requires a test account —
**not available in the current environment.** Do this work where the app can run.

---

## PHASE 1 — Analysis of the current architecture

### The two god-objects
| File | Lines | Problem |
|---|---|---|
| `TripDetailScreen.tsx` | ~5,964 | Orchestrator + 4 tab render trees + 34 `useState` + 12 `useMemo` + 8 `useEffect` + 10 `useCallback`, all inline. |
| `hooks/useTripDetail.ts` | ~2,817 | God-hook: ~55 `useState`, ~24 `useEffect`, ~20 `useMemo`, ~20 `useCallback`. Returns **~130 members** and **leaks 14 raw setters** to children. |

The redesign must fix **both**. Splitting only the screen while leaving a 130-member
hook underneath just moves the coupling.

### Responsibility map (what actually lives here)
Grounded in the code, there are **9 bounded contexts**:

1. **Core trip** — load / refresh / realtime row, loading/error/refreshing, `isAggregate`, `tripCompleted`, the bundle-seed effect.
2. **Parties** — client / supplier / driver / vehicle resolution, avatars, integration flags, `partnerOrgId`.
3. **Finance & adjustments** — ledger entries, transactions merge, adjustments CRUD, `paidToDriver`, subcontract, mover-asset paid, provision panel, inline adjustment form. *Largest local-state cluster on the screen (16 states).*
4. **Dispute / reconciliation** — dispute-by-type, accept/raise/compare, `reconciliationParties`.
5. **Tracking** — driver location fetch/history, broadcast, ping, offline logic, geocoding, map coords/labels, simulation controls. *Most self-contained; ~10 effects.*
6. **Documents** — trip docs, vehicle gallery, POD, preview signing, uploads (vault + LR).
7. **Timeline / assignment** — assignment audit, status timeline rows, reassignment summary, OTP.
8. **Ratings** — completed-trip ratings.
9. **Permissions** — `canAssign`, `canViewDetail`, `canAddFinanceEntry`, `showAssignByPhone`.

Plus **UI shell** (cross-cutting, NOT a domain): active tab, modal/sheet visibility flags, search term, expanded rows.

### Render tree analysis
- 4 tabs in `PersistentTabPanel`: **`trip` (tracking+timeline) · `finance` · `expenses` · `docs`** — each maps 1:1 to a context.
- Render is **duplicated desktop/mobile** (branches at ~3535 mobile / ~4012 finance / ~4428 expenses). This duplication is a top maintenance risk: every change must be made twice.
- 244 `<View>` / 183 `<Text>` inline — most is domain markup that belongs in section components.
- The three **guard returns** (`loading` / `!canViewDetail` / `error||!trip`, ~L1296–1330) short-circuit render and **narrow `trip` to non-null** for everything below. This is why a naive "move logic to one hook" fails (documented last session).

### State ownership analysis
- **Screen-local (should move to focused hooks/UI-state):** finance/provision (16), tracking/sim (8), docs (2), realtime/chat (1), UI shell (6).
- **In the god-hook (should split into domain hooks):** ~55 states across the 9 contexts.
- **14 leaked setters** (`setTrip`, `setDriverName`, `setVehicleDocs`, `setDriverLocation`, …) = hidden write-coupling; children mutate parent state directly. Redesign replaces these with explicit action callbacks owned by the domain hook.

### Coupling analysis
- **Bundle seed effect** (`useTripDetailBundleQuery` → one mega-effect hydrating trip/audit/adjustments/docs/otp/location/parties) is the **cross-cutting seam**. Any hook split must decide: each domain hook selects its own slice from the bundle (preferred) vs. a coordinator distributes it.
- `financeRefreshKey` couples finance ↔ dispute (dispute refresh keys off it).
- Tracking already mid-extraction: `useTrackingState` exists and deprecated fields (`trackingActive`, `isPingingDriver`) point consumers there.

### Which logic BELONGS together (do not separate)
- Location fetch + geocoding + map coords/labels + offline + ping → **one tracking context** (they share refs, dedup guards, and the map store).
- Adjustments CRUD + ledger + transactions merge + provision UI state → **one finance context** (mutations invalidate the same reads).
- Party resolution (client/supplier/driver/vehicle + avatars + integration) → **one parties context** (interdependent async resolution).

### Which logic must NEVER be separated
- The **guard returns + `trip` narrowing** must stay in the screen component. Domain hooks receive a **non-null `trip`** (screen calls them only after the guard), so no hook needs null-checks — this is the key to preserving behavior.
- The **bundle seed** must remain a single atomic hydration (splitting it risks partial-state flicker / render-order bugs).

### Biggest maintenance risks
1. Desktop/mobile render duplication (double edits).
2. 14 leaked setters (untraceable writes).
3. 130-member hook return (no module boundary; any change ripples).

### Biggest performance risks
1. One hook = one render scope: any state change re-runs all ~20 memos and re-renders the whole 5,964-line tree. Splitting into focused hooks + memoized section components naturally scopes re-renders.
2. Geocoding/location effects run regardless of active tab; today they can't be deferred because they're entangled. Post-split, tracking work can be gated on the tracking tab.

---

## PHASE 2 — Target architecture

### Principle
`TripDetailScreen` becomes a **thin orchestrator**: it runs the guards, then composes **focused domain hooks** and renders **per-tab section components**. Each domain owns its state, effects, actions, AND its rendering. No mega-hook, no leaked setters, no prop-drilling beyond one level (a `TripContext` provides the shared non-null `trip` + identity).

### Folder structure
```
features/trips/trip-detail/                      (promote from components/trip-detail)
├─ TripDetailScreen.tsx                 # thin: guards → context provider → tab shell
├─ TripDetailScreen.styles.ts           # (exists)
├─ context/
│  └─ TripContext.tsx                   # provides non-null trip, tripId, viewerOrg, t, refresh
├─ hooks/                               # ONE responsibility each; all assume non-null trip
│  ├─ useTripCore.ts                    # load/refresh/realtime/bundle-seed, isAggregate
│  ├─ useTripParties.ts                 # client/supplier/driver/vehicle + avatars + integration
│  ├─ useTripFinance.ts                 # ledger, transactions, adjustments CRUD, paidToDriver
│  ├─ useTripDispute.ts                 # dispute-by-type, raise/accept/reconcile
│  ├─ useTripTracking.ts                # location, broadcast, ping, offline, geocode, map coords
│  ├─ useTripDocuments.ts               # trip/vehicle docs, previews, uploads
│  ├─ useTripTimeline.ts                # assignment audit, status timeline, OTP, reassignment
│  ├─ useTripRatings.ts                 # completed-trip ratings
│  ├─ useTripPermissions.ts             # canAssign/canView/canAddEntry/showAssignByPhone
│  └─ useTripDetailUi.ts                # tab + modal/sheet visibility ONLY (no domain data)
├─ tabs/                                # one file per tab; render lives with its domain
│  ├─ TripTab.tsx                       # tracking hero + timeline + assignment
│  ├─ FinanceTab.tsx                    # margin, provisions, receivable, ledger
│  ├─ ExpensesTab.tsx                   # expenses hub
│  └─ DocsTab.tsx                       # documents + vehicle gallery
├─ sections/                            # (exists) presentational; grow into it
├─ parts/                              # (exists) leaf components
├─ modals/                              # (exists) lazy modals
└─ tripDetail.helpers.ts               # (exists) pure helpers
```

### Responsibilities (one line each)
- **TripContext** — the only shared state passed down: non-null `trip`, `tripId`, `viewerOrgId`, `t`, `refresh()`. Kills prop-drilling of identity.
- **useTripCore** — owns the trip row lifecycle + bundle seed; everything else reads `trip` from context.
- **useTripFinance/Tracking/Documents/Timeline/Dispute/Parties/Ratings/Permissions** — each owns its slice of the bundle, its effects, its React-Query reads, and its action callbacks. No setters leak; mutations are named actions.
- **useTripDetailUi** — pure client UI state (active tab, which modal is open). No server/domain data.
- **tabs/** — each tab composes the hooks it needs and renders. Desktop/mobile variants collapse into one component with a `layout` prop (kills the duplication).
- **TripDetailScreen** — guards → `<TripProvider>` → header + tab bar + `<PersistentTabPanel>` per tab. ~200–300 lines.

### Shared state & data flow
```
useTripDetailBundleQuery (single fetch)
        │  (each hook selects its own slice)
        ▼
TripDetailScreen  ──guards──►  TripProvider(trip, tripId, org, t, refresh)
        │
        ├─ TripTab      → useTripTracking + useTripTimeline + useTripParties
        ├─ FinanceTab   → useTripFinance + useTripDispute
        ├─ ExpensesTab  → useTripFinance (expenses slice)
        └─ DocsTab      → useTripDocuments
```
- No hook returns >~15 members. Cross-domain coupling (`financeRefreshKey`) becomes an explicit `refresh` on the context or a query-invalidation, not shared mutable state.
- Re-renders scope to the active tab's hooks.

---

## PHASE 3 — Ordered migration plan (each step compiles, is reversible, preserves behavior)

Strategy: **strangler pattern.** Introduce the new structure alongside the old, move one context at a time, delete the old slice only after the new one is wired and tsc-clean. Each step is one reviewable PR.

**Step 0 — Scaffolding (no behavior change).**
Create `context/TripContext.tsx` returning exactly the identity fields the screen already computes post-guard. Wrap the existing return in `<TripProvider>`. Nothing consumes it yet. *Reversible: delete provider.*

**Step 1 — Extract `useTripPermissions`** (smallest, zero effects).
Move the 4 permission memos out of `useTripDetail` into `useTripPermissions(trip)`. `useTripDetail` calls it internally and spreads results (keeps its public surface identical). *tsc-verifiable; behavior identical.*

**Step 2 — Extract `useTripRatings`** (1 effect, isolated).

**Step 3 — Extract `useTripDocuments`** (self-contained; previews/gallery/uploads). Move the screen's `handleVaultUpload`/`handleLRUpload`/`uploadingDocId` here too. Replace the leaked doc setters with actions.

**Step 4 — Extract `useTripTimeline`** (assignment audit + status rows + OTP).

**Step 5 — Extract `useTripTracking`** (largest; ~10 effects + sim state from the screen). Fold in the screen's map/sim state. This is the highest-risk single step → its own PR + explicit tracking click-through.

**Step 6 — Extract `useTripParties`** (async resolution cluster; replace leaked party setters with actions).

**Step 7 — Extract `useTripFinance` + `useTripDispute`** (ledger/adjustments/provisions + dispute). Fold in the screen's 16 finance-state items. Replace `financeRefreshKey` coupling with context `refresh()`/query invalidation.

**Step 8 — Collapse `useTripDetail` into `useTripCore`.** What remains is trip lifecycle + bundle seed. The old 130-member return is gone; consumers now use focused hooks via context.

**Step 9 — Split the render into `tabs/`.** Move each tab's JSX into its tab component, consuming hooks directly (no prop-drilling). Collapse desktop/mobile duplication into a `layout` prop.

**Step 10 — `TripDetailScreen` becomes the thin orchestrator.** Guards + provider + tab shell only.

### Per-step gates (every step)
- `npx tsc --noEmit` clean.
- No change to the screen's external props or route contract.
- Diff is one context/hook → independently reviewable.
- Reversible: each new hook is additive until the old slice is deleted in the same PR; revert = restore the slice.
- **Behavior sign-off:** because there are no unit tests on this screen and no auth in this env, each step needs a manual click-through of the affected tab (asset / aggregate / partner) on desktop + mobile before merge. Steps 5 and 7 are the highest-risk.

### What this explicitly does NOT do
- Does not change any business logic, query, or service call.
- Does not merge the desktop/mobile variants until Step 9 (and only structurally).
- Does not attempt the by-mode (asset/aggregate/partner) *logic* rewrite — that stays as in-place conditionals inside the tab components; only their *location* changes.
