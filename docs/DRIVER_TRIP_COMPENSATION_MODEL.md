# Driver Trip Compensation Model → Driver / Fleet / Marketplace / Reach Contract

**Status: Design note — no schema implementation in this document.** Started as a compensation-only fix after a production bug (an Aggregate-mode org's open-trip assignment fabricated an "Estimated Earnings" figure with no salary/commission ever configured — fixed in `DriverControlScreen.tsx`). Part 1 below is that original scope: the compensation map, its governing rules, and two open decisions. Part 2 extends it — the product direction turned out to be bigger than compensation alone (Driver App as a load-discovery surface, vehicle ownership, marketplace bidding vs. fleet recommendation, Reach/Credits integration). **Part 5** locks a cross-cutting Business requirement: **Trip Assignment + Counterparty Role + Trip-level Receivable + Driver/Owner Payable** (including **Driver cum Owner** on Open Trip assign, and Trip List/Detail payment visibility on top of existing multi-trip payment allocation). Parts 2–5 are design locks unless a later decision authorizes build. Naming note: this file's title grew with its scope — renaming later is fine when the product direction settles.

---

# Part 1 — Compensation Model (original scope)

---

## 1. Purpose / scope

- Fix compensation **semantics** — when the app is and isn't allowed to show a driver an earnings figure.
- Preserve existing connected-fleet behavior.
- Preserve the existing attribution behavior unless a decision explicitly supersedes it (Section 5).
- Define marketplace compensation as a new capability, designed separately (Section 6) — not folded into attribution.
- No schema implementation here. This is the map and the decisions that need making before any migration is written.

---

## 2. Current-state model

| Scenario | Current implementation | Status |
|---|---|---|
| Connected fleet trip | `tripEarningsDetailForDriver()` (`features/drivers/utils/driverUtils.util.ts`) + existing commission/offer data on `drivers` / `trips` | Existing — but see Section 4, a second calculator also exists and disagrees with this one |
| Direct/open assignment (no employment) | `drivers.tracking_only` flag, already respected in ~15 call sites (`DriverWalletScreen`, `drivers.service.ts`, `aggregateDrivers.ts`, `DriverFleetRankingTab`, `useDriverPendingEarnings`, `PartyDirectoryScreen`, etc.) | Existing + the one missing call site (`DriverControlScreen.tsx`) fixed this session |
| Fleet attribution (open trip → driver claims it's for their real fleet) | `salary_requests` (`request_type: 'trip_based'`) → fleet-owner reviews via the `attribution-trip-create` modal (`AttributionTripCreateScreen.tsx`) → creates a **new historical trip inside the fleet's own org** → commission computed from the fleet's current `commission_percent` × entered sale value → written onto the new trip's `driver_commission` column via `updateTripDriverCommission()` (a de facto snapshot) → source salary request marked `approved` | Existing, end-to-end, already shipping |
| Marketplace compensation (driver sees an explicit earning on a load, independent of any fleet relationship) | None. `isAggregateTrip()`'s own doc comment: aggregate/marketplace trips are "outsourced/partner; driver payment is handled offline." Only adjacent piece is `driver_direct_bids` (Reach Boost V2, `20270201090000_driver_direct_bid_no_org.sql`), which is bid-submission only — its own comment states award/acceptance is "deliberately NOT built here" | New capability |

---

## 3. Governing rules

These are the invariants this note is asking the team to lock in, derived directly from the bug and the mapping above:

1. Driver-row existence ≠ employment.
2. `tracking_only` ≠ employer.
3. Assignment ≠ compensation.
4. Attribution ≠ compensation until the fleet confirms it.
5. Confirmed compensation must be stable for the historical trip (it must not change retroactively because the fleet's current commission config changes later).
6. Marketplace compensation must not depend on fleet employment.
7. UI must consume the canonical earnings resolver rather than independently calculating earnings.

Rule 7 is what prevents another `DriverControlScreen`-shaped exception from appearing on some future screen.

---

## 4. Resolver decision

**Proposal: make `tripEarningsDetailForDriver()` the canonical read path**, not a new function. It already:
- Has an explicit precedence order (stored `trip.driver_commission` → agreed per-km rate → agreed commission-% rate → a legacy 10% guess).
- Returns provenance, not just a number: `{ amount, basis, isEstimated }`.
- Is already used in 11 call sites across the driver app.

It is *not* currently used by `DriverControlScreen`'s hero "Estimated Earnings," which instead calls `computeDriverTripEstEarningsInr()` (`features/finance/selectors/assetTripProvisionSelectors.ts`) — a second calculator that reads commission live from `driverOffer` on every call, with no `isEstimated`/provenance concept at all. These two can disagree for the same trip today.

**What this note is *not* proposing**: silently removing the 10% legacy fallback. Before touching it, audit every one of the 11 existing call sites for whether it actually checks `isEstimated` before rendering `.amount`, or just reads the number. Some screens may intentionally show an estimate; others may be treating a guess as payable money the same way the original bug did. That audit is a precondition for consolidating onto this resolver, not an assumption.

### 4.1 Audit result (done)

**2 of 11 callers check `isEstimated`:**
- `DriverPassbookDetailScreen.tsx` — computes the amount via `tripEarningsForDriver()`, separately checks `tripEarningsDetailForDriver(...).isEstimated` to label it.
- `trips.service.ts:2103-2104` — gates on `detail.isEstimated || detail.amount <= 0` before proceeding. This is the most careful call site found — it guards a settlement/freeze write, not just a display.

**9 of 11 callers use `tripEarningsForDriver()` (the bare-`.amount` wrapper) and never see `isEstimated`:**

| Call site | Feeds | Risk class |
|---|---|---|
| `DriverWalletScreen.tsx:89` | Wallet earnings display | Display |
| `DriverTripHistoryScreen.tsx:721` | Per-trip history list | Display |
| `tripHistoryDetail.util.ts:175,181` | Trip history detail | Display |
| `useDriverPendingEarnings.ts:282` | "Pending earnings" aggregate | Display, aggregated — a guess blends silently into a total |
| `DriverRequestsScreen.tsx:190` | Sum of completed-trip earnings | Display, aggregated |
| `DriverSalaryRequestScreen.tsx:66` | What a driver can request as salary | **Money-moving** — a 10% guess can become the basis of an actual salary claim |
| `DriverControlScreen.tsx:379` | Amount used by the "Attribute"/"Send to my fleet" action | **Money-moving** — feeds the same `salary_requests` row a fleet owner reviews and converts into real commission (Section 5) |
| `DriverTripHistoryDetailScreen.tsx:390` | Same attribute-style request amount, different screen | **Money-moving**, same pattern |
| `driverTripSettlement.util.ts:243` | `expectedAmount` in settlement math | **Money-moving** — an "expected" settlement figure derived from a guess, unflagged |

Three of the nine (`DriverSalaryRequestScreen`, `DriverControlScreen`'s attribute flow, `driverTripSettlement.util.ts`) aren't display-only — they feed a number into an actual request or settlement expectation with nothing distinguishing "10% legacy guess" from "agreed rate." Same class of problem as the bug this document started from — a fabricated number treated as real terms — just quieter, in a money-moving flow rather than a fabricated employer relationship.

### 4.2 The 3 money-moving callers — fixed

Each fix reuses that file's existing guard pattern rather than introducing new UI:

- **`driverTripSettlement.util.ts`** — `DriverTripSettlementView` now carries `isEstimated`; `canRequestPayment` / `canMarkAsPaid` also require `!isEstimated`. A driver can no longer tap "Request payment" or "Mark as paid" for a trip whose amount is the legacy 10% guess.
- **`DriverSalaryRequestScreen.tsx`** — `pendingTripsForSalaryOrg` now excludes trips where `tripEarningsDetailForDriver(t).isEstimated` is true. A guessed-amount trip can no longer be selected into a salary request at all.
- **`DriverControlScreen.tsx`** — the "Attribute" / "Send to my fleet" action now checks `tripEarningsDetailForDriver(trip).isEstimated` and blocks with *"This trip has no agreed commission or salary terms on file... ask your fleet to set terms first"* instead of submitting a `salary_requests` row built on a guess.

The other 6 (display-only: wallet total, trip history list/detail, pending-earnings aggregate) are **not fixed** — lower risk (a guessed number rendered, not acted on), but still worth closing before calling the resolver fully consolidated.

---

## 5. Attribution decision

Documenting the existing flow explicitly, since it's real and shipping:

```
Driver
  ↓
"Attribute" (DriverControlScreen)
  ↓
salary_requests (request_type: trip_based, status: pending)
  ↓
Fleet owner opens attribution-trip-create modal
  ↓
AttributionTripCreateScreen: confirm shipper as client, enter sale value
  ↓
New historical trip created in the fleet's own org
  ↓
driver_commission computed from fleet's current commission_percent × sale value, written onto the new trip
  ↓
Source salary_request marked approved
```

**Open decision — pick one before any schema work starts:**

- **A. Preserve and improve the existing attribution model.** It duplicates the trip into the fleet's own org rather than tagging the original trip. That's an existing product decision, not an accident — it may carry real advantages: the trip shows up in the fleet's own trip history/reporting, its client relationship, its commission accounting, and its operational ownership, all for free, because it's a first-class row in that org's own trip table. We have not established that these benefits are unneeded.
- **B. Replace it with an explicit trip-level attribution relationship** (e.g., a `trip_fleet_attribution` table tagging the source trip directly, no duplicate row).

**Decision (made): Option A — preserve and rename, do not build `trip_fleet_attribution`.** The existing `salary_requests` → `attribution-trip-create` → fleet-owned historical trip flow already does the business operation. Building a second table alongside it, without retiring one, would recreate the exact "two systems solving the same problem differently" pattern already found and corrected in the chat platform work (`docs/CHAT_MIGRATION_DISCOVERIES_2026.md`). This also resolves Part 2, Section 2.8, item 3 (the "Recommend to my fleet" mechanism targets this same existing flow, not a new one).

**Copy changes that follow from this decision** (driver-facing, over the existing mechanism — no new backend):
- "Attribute" → **"Recommend to my fleet"** (open-load discovery context) / **"Send to my fleet"** (already-running open-trip context, per Part 2 Section 2.5)
- Fleet-side "Accept Attribution" → **"Accept as Fleet Trip"**

This is a naming and framing change over the mechanism documented above, not a new mechanism — the `salary_requests` row, the `attribution-trip-create` modal, and the trip-duplication behavior are unchanged.

---

## 6. Marketplace compensation — new capability

This gets its own design rather than being folded into attribution, because the compensation source is structurally different:

```
Marketplace load
      ↓
Driver sees offer
      ↓
Driver accepts / bids
      ↓
Compensation becomes explicit (from the marketplace transaction itself)
      ↓
Trip execution
      ↓
Earnings / settlement
```

The governing distinction: a marketplace amount comes from the marketplace transaction (the load's own posted/agreed rate), never derived by walking `driver → fleet → commission`. A driver with no fleet at all, and a driver with an established fleet, must see the same marketplace-sourced number for the same load — fleet relationship is irrelevant to this path (Rule 6).

No existing model to preserve or migrate here — this is genuinely greenfield, which makes it lower-risk to design fresh, but also means it should not be scoped as "mostly already built" the way Scenarios 1–3 are.

---

## 7. UI behavior (`DriverControlScreen` and any future consumer)

| State | What the driver sees |
|---|---|
| Connected fleet trip | Existing compensation, from the canonical resolver |
| `tracking_only` direct assignment, no attribution | No fabricated earnings — `—`, not `₹0` |
| Attribution submitted, not yet confirmed by fleet | Attribution status ("Waiting for fleet confirmation"), not an earnings number |
| Attribution confirmed | The snapshotted commission from the confirmed trip |
| Marketplace trip | Marketplace-sourced compensation |
| Genuinely unknown / no agreed terms | `—`, or explicitly labelled **Estimated**, per the resolver's `isEstimated` flag — never presented as payable money |

The distinction in that last row matters concretely: **₹0**, **₹1,600 estimated**, and **₹1,600 payable** are three different states, and collapsing them into one number is the exact failure mode this whole investigation started from.

---

## Bottom line

Three of the four scenarios already have working infrastructure. The change surface this note is actually proposing is smaller than the original three-new-table proposal:

1. Consolidate driver-facing earnings reads onto the existing `tripEarningsDetailForDriver()` resolver (after auditing its `isEstimated` handling across current call sites).
2. Make an explicit product decision on the existing attribution flow (Section 5, A vs. B) before writing any new attribution schema.
3. Design marketplace compensation (Section 6) as its own capability, on its own timeline, not bundled into the attribution decision.

No architecture is being built in this document. The next action is the Section 5 decision (A vs. B) and the Section 4 audit — both scoping questions, not migrations.

---
---

# Part 2 — Driver as Load-Discovery Surface (Driver / Fleet / Marketplace / Reach)

**Scope of this part:** Pulse Driver becomes a load-discovery and demand-generation surface, not only a trip-execution app. This is a distinct product direction from Part 1 — it depends on Part 1's compensation rules (Section 3) but adds new relationships (vehicle ownership, marketplace bidding, fleet recommendation) on top of them. Nothing here is scoped for immediate build; per Section 2.8, the next action is Phase 1 of Part 1, not any part of this section.

## 2.1 Object mapping — existing vs. genuinely new

Checked against the current codebase before writing anything below:

| Named object | Status | Evidence |
|---|---|---|
| `drivers` / `drivers.tracking_only` | Existing | Part 1, Section 2 |
| `trip.driver_commission` | Existing | Used by `tripEarningsDetailForDriver()`, Part 1 Section 4 |
| `tripEarningsDetailForDriver()` | Existing | `features/drivers/utils/driverUtils.util.ts` |
| `salary_requests` (attribution flow) | Existing | Part 1, Section 5 |
| Reach / Boost | Existing | `features/reach/*`, live product (Phase 2.1/2.2 shipped per prior work) |
| Credits / wallet (earn side) | Existing | `features/reach/services/wallet.service.ts`, `ReachEarnCreditsScreen.tsx` |
| `driver_direct_bids` | Existing, narrow | `supabase/migrations/20270201090000_driver_direct_bid_no_org.sql` — independent driver bids on a **boosted Reach story**; submission + status display only, no award/acceptance wired |
| Vehicle ownership (driver owns a vehicle) | **Does not exist** | No `owner_type`/`owned_by`/equivalent field found anywhere in `features/vehicles` service code |
| Driver-facing "My Fleet" (vehicles I own) | **Does not exist** | The only "fleet" screens found (`DriverFleetInviteSalaryModal`, `DriverFleetRankingTab`, `FleetDriverAnalyticsTab`) are business-side — a fleet owner managing their drivers, not a driver managing owned vehicles |
| `trip_driver` (as a distinct table) | **Does not exist** | No such table in any migration |
| `driver_offers` (as a stored table) | **Does not exist as a table** | `DriverOfferForAggregation` is a TypeScript shape assembled at read time from `drivers` columns, not a persisted offer/bid object |
| Marketplace load with driver-visible compensation | **Does not exist** | Part 1, Section 6 |
| Credits spent by a driver to boost their own posted load | **Does not exist** | Wallet/credits code found is earn-only |

**What this changes about scope**: the "Bid" path (State A — driver as micro-fleet owner) has no existing foundation at all — no vehicle ownership model, no bid-storage object, no marketplace-compensation path (Part 1, Section 6 already flagged this as new). The "Recommend to my fleet" path (State B) is closer to existing — it's a variant of the attribution flow already mapped in Part 1, Section 5, not a new mechanism.

## 2.2 The core principle: resolve relationship before compensation

```
                 ┌── Employer relationship
                 │
Driver ──────────┼── Owned vehicle
                 │
                 └── Tracking-only relationship
                         │
                         ↓
                    Load / Trip
                         │
                         ↓
              Commercial relationship
                         │
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
       Fleet         Attribution    Marketplace
    compensation    compensation    compensation
```

This extends Part 1's Rule 7 (UI must consume the resolver, never calculate independently) with a precondition: the resolver must first establish **who is contracting this trip** before asking what compensation model applies. The original `DriverControlScreen` bug was exactly a violation of this ordering — it inferred a compensation-eligible relationship (`employerOrgIdSet`) from a row that only ever answered a different question (does a `drivers` row exist).

## 2.3 Driver state → marketplace action

| Driver state | Marketplace action |
|---|---|
| No employer + owns vehicle | Bid |
| No employer + no vehicle | Find / recommend / potentially bid, depending on load rules |
| Employer + no owned vehicle | Recommend to my fleet |
| Employer + owns vehicle | Choose: recommend to fleet OR bid with own vehicle |
| `tracking_only` relationship | Bid / independent path — **never** the employer path |

The last row is the direct continuation of the bug this document started from: `tracking_only = true` must never be read as "has an employer," in this new surface or the existing one.

## 2.4 Two commercial paths, kept structurally separate

**Bid (owner-driver path)** — new, no existing foundation (Section 2.1):
```
Load → Driver selects eligible vehicle → Bid submitted → Bid accepted →
Trip created → Marketplace compensation locked (snapshotted) → Execution → Settlement
```
The bid carries the commercial terms; once accepted, the compensation amount is snapshotted the same way Part 1 requires for attribution (Rule 5) — a later change to anything does not retroactively alter an accepted bid's earnings.

**Recommend to my fleet (employed-driver path)** — a variant of the existing attribution flow (Part 1, Section 5), not a new mechanism:
```
Driver finds load → "Recommend to my fleet" → Fleet owner notified →
Fleet reviews → Fleet accepts → Indent/trip created under the fleet →
Existing fleet commission rules apply
```
This is explicitly **not** a bid. The driver is surfacing an opportunity, not personally contracting — which is what keeps this from creating accounting/permission problems (an employed driver independently contracting with the marketplace).

Both paths must resolve through the same governing rule as Part 1, Section 3, extended:
> Marketplace compensation must not depend on fleet employment, and fleet recommendation must never be treated as a bid.

## 2.5 Driver-facing language (extends Part 1, Section 5's naming fix)

| Old / internal term | Replacement | Context |
|---|---|---|
| "Attribute" | "Send to my fleet" | Existing flow — an already-running open trip the driver wants their fleet to pick up |
| (new) | "Recommend to my fleet" | New flow — a discovered marketplace load, not yet a trip |
| (new) | "Bid" | New flow — owner-driver contracting a load directly |

Confirmation copy should say what the system actually does, not an abstraction: *"We'll send it to your fleet owner to review"* / fleet owner sees *"Load recommended by [driver]"* or *"[driver] wants to add this trip to your fleet"* — matching Part 1 Section 5's existing `AttributionTripCreateScreen` framing ("Accept Attribution") in spirit, in plain language.

## 2.6 Credits neutrality rule

Credits may buy **distribution**, never **priority**:

- Business: spend credits to boost a load to reach more drivers. (Existing — Reach/Boost.)
- Driver-as-owner: spend earned credits to boost their own posted load. (New — no posting-a-load-as-a-driver concept exists yet, Section 2.1.)
- **Never**: credits influencing bid ranking, acceptance odds, or compensation. A "pay credits → win load" dynamic breaks marketplace neutrality and must be treated as a hard constraint on any future bid-ranking design, not a tuning parameter.

## 2.7 Phased rollout (sequencing, not a build authorization)

1. **Compensation safety** (Part 1's existing scope — the only phase with an approved next action)
2. **Driver capability** — activate vehicle ownership + a driver-facing "My Fleet"; establish marketplace eligibility from ownership
3. **Load discovery** — Stories → "Available Loads" entry, filters, load detail
4. **Two actions** — Bid (owner path) vs. Recommend to my fleet (employed path)
5. **Marketplace transaction** — bid → award → snapshot → trip → settlement
6. **Reach loop** — boosted loads, driver credits, driver-owner boosting their own posted loads, credits-never-affects-outcome enforced

Each phase depends on the previous one's data model existing — Phase 3's load cards showing "potential driver earning" depend on Phase 5's marketplace compensation existing to be genuine (Part 1, Section 6's rule: never show a number with nothing backing it — the same rule the original bug violated, now generalized to a whole new surface before that surface is built).

## 2.8 Open decisions before Phase 2 starts

1. **Vehicle ownership model** — Phase 1 design: [`DRIVER_FLEET_OWNER_PHASE1.md`](./DRIVER_FLEET_OWNER_PHASE1.md) (explicit `driver_fleet_owner_profiles`, personal vehicles via `owner_user_id` in 1b — **no** personal org). Schema for vehicles still Phase 1b.
2. **Bid storage object** — genuinely new. `driver_direct_bids` (Reach Boost V2) is the closest existing pattern but is scoped narrowly to boosted stories with award/acceptance explicitly not built. Whether Phase 5's marketplace bid reuses/extends that table or needs its own is an open question, not decided here.
3. **Part 1, Section 5's A/B decision** (preserve vs. replace the attribution flow) now also gates Section 2.4's "Recommend to my fleet" — if Part 1 replaces the attribution model, the recommendation flow should target whatever replaces it, not the current `salary_requests`-based mechanism.

None of Part 2 is authorized for implementation. The only approved next action remains Part 1's: the Section 5 decision and the Section 4 audit.

---
---

# Part 3 — End-to-end flow state matrix

**Purpose**: before any schema work, place every stage of `Driver → Story → Load preview → Bid/Recommend → Employer alert → Award → Trip → Compensation → Credits/Reach` against what already exists, so "existing," "needs modification," and "greenfield" are decided from evidence, not assumption.

## 3.0 A prior finding this matrix depends on: two competing "employed" signals

Before the stage-by-stage matrix, one thing found while researching it that has to be resolved first, because it changes what several rows below even mean:

- `features/drivers/screens/DriverControlScreen.tsx` (and everything audited in Part 1) answers "is this driver employed here?" from the **`drivers` table** — a real, non-`tracking_only` row for that org.
- `features/reach/utils/driverParticipation.ts` (`resolveDriverParticipation`) — already live, backing the "Recommend to Fleet Owner" vs. "Bid Now" story CTA — answers the **same question** from **`organization_members`** (`role='driver'`, `status='active'`), a completely different table and relationship.

These can disagree for the same driver+org pair — e.g., a driver with a `tracking_only` `drivers` row but no `organization_members` row (today's Godrej/Vincent shape) is unambiguously "not employed" by both signals, but a driver with a real `drivers` row who was never formally invited as an `organization_members` row would read as "employed" by the compensation logic and "independent" by the Reach logic. Section 2.3's whole Bid-vs-Recommend split depends on a single, correct answer to "is this driver employed" — so **this needs a decision before the matrix below can be trusted**: pick one canonical signal (most likely `organization_members`, since it's the one with real invite/accept semantics — `drivers.tracking_only` was designed to say "this row isn't real employment," not to be the positive source of truth for what employment *is*), or define how the two reconcile.

## 3.1 Stage-by-stage matrix

| Stage | Existing object(s) | Status | Notes |
|---|---|---|---|
| **Story** (driver discovers something) | `get_driver_reach_stories()` RPC, Reach Stories feed (`ReachHomeScreen`) | Existing | Today's Stories are boosted marketing/campaign posts, not freight loads with pickup/drop/rate fields |
| **Load preview / load card** | — | **Greenfield** | No freight-load schema (pickup, drop, vehicle type, capacity, rate) exists on the `posts`/campaign objects backing Stories today; the load card in Part 2, Section 2.2 has nothing to render from yet |
| **Bid** | `driver_direct_bids` table, `submit_driver_direct_bid()` RPC | Existing, narrow | Scoped only to bidding on a **boosted story**, not a real freight load; no vehicle-eligibility check; award/acceptance explicitly not built (migration's own comment) |
| **Recommend (pre-award)** | `resolveDriverParticipation()` + `driverStoryCta()` (UX pattern, live) → wired to `reach_referrals` (reward/growth mechanism) | Existing pattern, wrong mechanism | The employed/independent CTA split already works — but it pays a **referral reward**, not a **trip commission**. Reusable as UX; not reusable as the compensation path |
| **Employer alert** | (a) `reach_referrals`-based notification (story recommendation) · (b) `salary_requests` → `attribution-trip-create` modal (post-execution attribution) | Existing, wrong lifecycle stage | (a) is growth-context, not load economics. (b) is real trip/commission logic, but fires **after** a trip already happened — there is no existing "fleet owner is alerted about a load recommendation before it's awarded" flow |
| **Award** | `AttributionTripCreateScreen`'s "fleet owner reviews → creates trip" logic | Existing, wrong lifecycle stage | Same gap as Employer alert: this creates a trip from something that **already ran**. A pre-award "accept this recommended load → create the trip that will run" flow doesn't exist; `driver_direct_bids` has no award path at all |
| **Trip** | `tripsService.createTrip()` | Existing, reusable | Already the single trip-creation path used by every flow traced this session |
| **Compensation** | Fleet: `tripEarningsDetailForDriver()` + `trip.driver_commission` (Part 1). Marketplace: none (Part 1, Section 6) | Existing (fleet) / **Greenfield** (marketplace) | No change from Part 1 — restated here because this is the stage every upstream stage in this table ultimately has to produce a real, non-fabricated number for |
| **Credits / Reach loop** | Earn side: `wallet.service.ts`, `ReachEarnCreditsScreen.tsx` | Existing (earn) / **Greenfield** (spend-to-boost-own-load, and the neutrality guarantee) | Neutrality ("credits buy distribution, never priority") has nothing to violate yet, because there's no bid-ranking system for real loads to protect it against — that makes this the right time to design the constraint in, before a bid-ranking system exists to retrofit it onto |

## 3.2 Summary

- **Existing, reusable as-is**: Story feed infrastructure, trip creation, fleet compensation resolver (Part 1), credits earn-side.
- **Existing, but the wrong lifecycle stage or wrong mechanism** — this is the largest bucket, and the one most likely to tempt a shortcut: Recommend/Employer-alert/Award all have a working analog today, but every one of them operates on an *already-executed* trip or a *marketing* reward, not a *not-yet-awarded freight load*. Reusing the pattern is right; reusing the underlying table/trigger as-is would silently import "post-hoc" semantics into a "pre-award" flow.
- **Genuinely greenfield**: load-card schema, real-load bidding with vehicle eligibility, award-to-trip conversion pre-execution, marketplace compensation, driver-side vehicle ownership (Part 2), spend-side credits.
- **Blocking prerequisite, not in either bucket**: Section 3.0's employment-signal reconciliation. Every row above that depends on "is this driver employed" (Recommend vs. Bid eligibility) inherits whichever answer that decision produces.

Nothing in Part 3 is authorized for implementation. It exists to make the next scoping conversation start from a table instead of a diagram.

---
---

# Part 4 — The non-negotiable separation, and the resulting priority order

Section 3.0's employment-signal conflict (`drivers.tracking_only` vs. `organization_members`) turned out to be an instance of a more general rule this whole document has been converging on. Stated once, explicitly:

**Employment, vehicle ownership, load participation, compensation, and trip counterparty roles are separate concepts. No single table or flag should be asked to answer more than one of them.**

- **Employment** — does this fleet employ/represent this driver? (Section 3.0 — currently two disagreeing answers.)
- **Ownership** — does this driver own/control this vehicle? (Part 2 / [`DRIVER_FLEET_OWNER_PHASE1.md`](./DRIVER_FLEET_OWNER_PHASE1.md).)
- **Participation** — how is this driver responding to this load: bid, recommend, accept? (Part 3 — exists in fragments, at the wrong lifecycle stage.)
- **Compensation** — what amount/basis was actually agreed for this trip? (Part 1 — exists, partially audited in Section 4.1.)
- **Trip counterparties** — who is Customer / Transporter(Owner) / Executing Driver on this trip; where receivable and payable attach (Part 5). **Driver** and **Fleet Owner** are not mutually exclusive identities; owner-driver is an allowed assignment shape.

Every bug and near-bug found across this document's parts is one of these questions being answered by inferring it from another: `tracking_only` existence implying employment (the original bug), a `drivers` row implying compensation eligibility, story-recommendation reward logic implying trip-compensation logic, `organization_members` vs. `drivers` implying two different answers to employment, or assuming every driver sits under a separate fleet-owner entity. Keeping the concepts structurally separate is what prevents the next occurrence of this pattern on a screen nobody has looked at yet.

## Priority order this implies

| Priority | Work | Why it's blocking |
|---|---|---|
| P0 | Define one canonical driver ↔ organization relationship model (resolve Section 3.0) | Determines Recommend vs. Bid eligibility, employer status, and which compensation path applies |
| P0 | Fix the 9 `tripEarningsForDriver()` consumers found in Section 4.1 | Already in production; 3 of the 9 feed money-moving flows (salary request, attribution amount, settlement) with no estimate flag — **the 3 money-moving ones are fixed** (see 4.2); the 6 display-only ones are not |
| P1 | Resolve Section 5's attribution A/B | Prevents a second attribution system existing alongside the first |
| P1 | Design the driver-owned vehicle (ownership) model | Required before "owner → vehicle → bid" can exist at all |
| P1 | Design the marketplace bid/award model | `driver_direct_bids` is real but scoped to boosted stories only, with no award path |
| P1 | Part 5 — trip counterparty + trip-level receivable/payable UX | Open Trip assign must support Driver cum Owner; Trip List/Detail payment visibility must sit on existing allocation (not a parallel payment model) |
| P2 | Build Story → Load preview → Recommend/Bid | Only safe once the relationship model it reads from is canonical |
| P2 | Connect Reach credits/Boost as the distribution layer | Monetization/growth layer, sequenced after transaction semantics are solid — Reach stays discovery + boost + credits; it does not become a second transaction engine alongside Marketplace |

The two P0s are independent of each other (one is a data-model ambiguity, the other is a consumer-discipline gap) but both are prerequisites to everything below — Recommend-vs-Bid depends on the first, and no compensation figure computed anywhere in Part 2/3's new flows should inherit the second issue's unflagged-estimate pattern.

Nothing in this document authorizes implementation of any row in this table. This is the accumulated decision backlog — Section 3.0, Section 5, Section 4.1's 9 callers, Part 2 Section 2.8's three new-object designs, and Part 5 — in the order the team should resolve them, not a build plan.

---
---

# Part 5 — Trip Assignment + Counterparty Role + Trip-level Receivable + Driver/Owner Payable

**Status: Product / architecture lock only — not authorized for implementation in this note.**  
**Audience:** Business App Open Trip → Assign, Trip List, Trip Detail, and Finance allocation. Complements Driver App FO identity ([`DRIVER_FLEET_OWNER_PHASE1.md`](./DRIVER_FLEET_OWNER_PHASE1.md)) without collapsing roles into mutually exclusive identities.  
**Finance reuse:** Sit on existing trip-linked payment / multi-trip allocation and status model ([`TRIP_TO_FINANCE_FLOW.md`](./TRIP_TO_FINANCE_FLOW.md), [`CORE_ACCOUNTING_MODEL.md`](./CORE_ACCOUNTING_MODEL.md), [`TRIP_FINANCIAL_LIFECYCLE_TDD.md`](./TRIP_FINANCIAL_LIFECYCLE_TDD.md) / `payment_status`). **Do not** invent a parallel “Trip Detail payment” ledger.

## 5.1 Assignment cases Pulse must support

### A. Fleet owner → driver (normal fleet)

| Role | Who |
|------|-----|
| Contracting / owning party (Transporter) | Fleet Owner |
| Executing driver | Assigned driver (may be employed or open-assigned) |
| Driver payout | Per agreed **driver** terms (salary / commission / trip deal) |
| Owner settlement | Per fleet settlement model (owner receives commercial margin / supplier-style payout as already modeled for the org) |

### B. Driver = fleet owner / owner-driver (**Driver cum Owner**)

| Role | Who |
|------|-----|
| Transporter / Owner | Same person (Driver cum Owner) |
| Executing Driver | Same person |
| Payable attribution | **Directly to that driver/owner** — not forced through a separate fleet-owner entity stub |

Open Trip → Assign must support choosing this person as the **actual transporter/owner** from day one of any UI work that touches this requirement. Do **not** hard-code “every driver belongs under a distinct fleet owner party.”

## 5.2 Trip assignment layer (conceptual)

```
Trip
 ├── Customer / Shipper          ← receivable / AR side
├── Transporter / Owner         ← commercial counterparty for haulage
 │     ├── Fleet Owner          ← may differ from executing driver
 │     └── Driver cum Owner     ← same person as executing driver
 └── Executing Driver           ← who runs the trip / POD
```

| Pattern | Transporter | Executing driver | Payable destination |
|---------|-------------|------------------|---------------------|
| Normal fleet | Fleet Owner | Assigned driver | Fleet Owner / settlement model; driver paid per driver terms |
| Owner-driver | Driver cum Owner | Same person | That driver/owner directly |

This distinction matters for ledger, salary/payout, invoices, receivables, and settlement. It extends Part 4: **transporter role ≠ employment ≠ ownership flag alone** — an assignment can make one person fill two trip roles without inventing a fake second party.

## 5.3 Trip List — payment visibility (no Finance detour required to understand status)

Trip List should surface trip-level money state (exact column layout is UX detail; semantics are locked):

**Customer receivable**

- Receivable: ₹X  
- Received: ₹X  
- Balance: ₹X  
- Status: **Unpaid** / **Partially Paid** / **Paid** (align naming with existing `payment_status` vocabulary where present)

**Driver / Fleet payout**

- Payout / payable: ₹X  
- Payout status: **Pending** / **Requested** / **Paid**

Users must not be forced into Finance solely to answer “is this trip paid / what’s left?” Finance remains the ledger home; Trip List is the operational glance.

## 5.4 Trip Detail — payment control point

Trip Detail shows **both sides** and allows customer payment recording without leaving the trip:

**Customer side**

- Receivable ₹… · Received ₹… · Balance ₹…  
- **[Update Payment]** — manually record / allocate against this trip using the **existing** payment + allocation machinery (one customer payment may still cover multiple trips; this trip updates to Paid / Partially Paid / Unpaid accordingly)

**Driver / Owner side**

- Payable ₹… · Status: Pending / Paid (and Requested where that lifecycle already exists)  
- **[View payout / payment details]** — navigate into existing payout/settlement surfaces; do not fork a second payable writer

## 5.5 Architecture constraints (non-negotiable)

1. **Not mutually exclusive identities** — Driver and Fleet Owner capabilities may coexist on one auth user; trip roles are assignment fields, not exclusive profile types.
2. **No parallel payment mechanism** — Trip Detail “Update Payment” allocates into the same transaction / allocation model that already supports one payment → many trips and trip-level statuses.
3. **No forced FO entity for owner-drivers** — Open Trip assign must allow Driver cum Owner without creating a dummy fleet-owner counterparty.
4. **Receivable vs payable stay separate objects** — customer AR vs driver/owner/supplier AP (existing architecture); UI just composes both on the trip.
5. **Still design-only here** — schema/UI work needs an explicit build authorization; this Part does not authorize migrations or screens by itself.

## 5.6 Relationship to Driver App FO work

| Concern | Where |
|---------|--------|
| FO identity + My Fleet + capacity Stories | [`DRIVER_FLEET_OWNER_PHASE1.md`](./DRIVER_FLEET_OWNER_PHASE1.md) |
| Marketplace bid / award later | Parts 2–3; **3B.2 remains gated** on app five-pack |
| Business trip assign + trip payment UX | **This Part** |

A Driver App FO who later wins work as owner-driver must map cleanly onto Transporter = Driver cum Owner / Executing Driver = same person when Business creates or assigns the trip — without requiring a personal Business org.
