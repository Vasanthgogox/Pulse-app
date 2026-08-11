# Driver + Fleet Owner — Phase 1 (Owner identity foundation)

**Status:** Source of truth for Phase 1.  
**Related:** [`DRIVER_TRIP_COMPENSATION_MODEL.md`](./DRIVER_TRIP_COMPENSATION_MODEL.md) Part 2 (load-discovery / ownership) and **Part 5** (Business trip assignment counterparties + trip-level receivable/payable UX — Driver cum Owner); [`RBAC_OPERATING_MODEL.md`](./RBAC_OPERATING_MODEL.md) (Business org Asset/Aggregate/Hybrid — separate domain); change log [`RBAC_OPERATING_MODEL_CHANGELOG.md`](./RBAC_OPERATING_MODEL_CHANGELOG.md).

---

## Cross-cut (Business trips — not Driver App TMS)

Pulse must **not** treat Driver and Fleet Owner as mutually exclusive identities. When Business assigns an Open Trip, the trip layer may represent:

- **Normal fleet:** Transporter = Fleet Owner, Executing Driver = assigned driver → payout/settlement per fleet + driver terms.  
- **Owner-driver (Driver cum Owner):** Transporter = same person as Executing Driver → payable attributable **directly** to that driver/owner (no forced separate FO entity).

Trip List / Trip Detail payment visibility (customer receivable + driver/owner payable, Update Payment from Trip Detail) lives in **Part 5** of the compensation/plan doc and reuses existing Finance allocation — out of scope for FO Phase 1–3B Driver App work. Full lock: [`DRIVER_TRIP_COMPENSATION_MODEL.md`](./DRIVER_TRIP_COMPENSATION_MODEL.md) § Part 5.

---

## Product rule (hard boundary)

A **Fleet Owner** is an independent transportation operator on the **Driver App**, not a Business organization employee and not a second Business/TMS app.

| May | Must not (Driver App) |
|-----|------------------------|
| Own/manage personal vehicles | Create trip |
| Manage vehicle documents (Phase 2+) | Create load / indent |
| Discover loads, bid, accept client assignment (Phase 3+) | Create customer |
| Operate trips, POD, expenses | Business ledger / GST / org admin |
| View earnings / fleet P&L (Phase 4+) | Infer ownership from employment |

**Origin of work:** Client/business assignment **or** eligible open-market load — never ad-hoc trip creation from the Driver App.

**Identity rule:** One auth user. Existing Driver identity (`profiles.role = 'driver'`) **plus** an **explicit** Fleet Owner capability/profile. Employment / org relationships stay separate. **Do not** create a personal organization for V1. **Do not** infer owner status from `active_employee`, `organization_members`, or non-`tracking_only` driver rows.

---

## Agreed identity model (V1)

```
auth.users
   └── profiles (role = driver)          ← Driver identity (unchanged)
          └── driver_fleet_owner_profiles ← explicit owner capability (this phase)
                 └── (later) owner_vehicles owned by user_id
```

- **Employment** = relationship to a Business org (existing `drivers` / invites / `relationship_status`).
- **Ownership** = row in `driver_fleet_owner_profiles` (and later vehicles keyed by `owner_user_id`).
- A person can be employed **and** a fleet owner; those facts must not collapse into one flag.
- On a **trip**, the same person may be **Driver cum Owner** (Transporter + Executing Driver) — see [`DRIVER_TRIP_COMPENSATION_MODEL.md`](./DRIVER_TRIP_COMPENSATION_MODEL.md) Part 5. Do not require a second party to represent “the fleet owner.”
- Future multi-driver fleet management adds assignment rows under ownership — it must not require rewriting identity.

---

## Phase 1 scope

### In scope

1. Durable PRD for Phase 1 (this doc).
2. Schema + RPC: enable Fleet Owner capability for a driver.
3. Client read path: “is this user a fleet owner?”
4. Driver App entry: **Become a Fleet Owner** (lightweight onboarding Step 1 — value props + enable).
5. Navigation / route registration for the onboarding screen.
6. Explicit non-goals and Phase 2–5 pointers so later work does not blur the Business boundary.

### Out of scope (do not implement in Phase 1 foundation)

| Deferred | Why |
|----------|-----|
| Vehicle CRUD / My Fleet list | Needs `owner_vehicles` (or equivalent) — Phase 1b immediately after enable |
| Vehicle documents / expiry alerts | Phase 2 |
| Marketplace bid / assign vehicle | Phase 3 |
| Owner earnings / P&L | Phase 4 |
| Fleet intelligence (₹/km, utilization) | Phase 5 |
| Create trip / load / indent anywhere in Driver App | Forever out for this persona |
| Personal `ASSET_BASED` org as ownership hack | Rejected for V1 |
| Full employee/HR for owner’s other drivers | V1: owner-as-driver only; data model should leave room |

---

## Capability matrix (Driver App)

| Capability | Driver | Fleet Owner |
|------------|:------:|:-----------:|
| View/operate assigned trips | ✓ | ✓ |
| Capture POD / trip expenses | ✓ | ✓ |
| View open loads / bid (later) | ✓* | ✓ |
| Accept client assignment (later) | ✓* | ✓ |
| Add / manage owned vehicles | — | ✓ (post–Phase 1b) |
| Vehicle docs / P&L | — | ✓ (Phase 2 / 4) |
| Create trip / load / indent | ❌ | ❌ |
| Business ledger / customers | ❌ | ❌ |

\*Subject to existing employed-driver restrictions (recommend vs bid). Owner eligibility for bid paths must come from **ownership + marketplace rules**, not from employment alone.

**Enforcement principle:** Hide UI **and** deny at RPC/RLS. Phase 1 ships the capability record; Phase 3 must add hard denies on any trip/load create path callable from the Driver experience.

---

## Data model

### 1. `public.driver_fleet_owner_profiles` (Phase 1)

| Column | Type | Notes |
|--------|------|--------|
| `user_id` | `uuid` PK → `profiles(id)` | Same person as Driver |
| `enabled_at` | `timestamptz` NOT NULL | When they became an owner |
| `preferred_view` | `text` | `'driver' \| 'fleet_owner'` — mode switch later; default `'driver'` |
| `created_at` / `updated_at` | `timestamptz` | Standard |

RLS: owner can `SELECT` own row; **no** direct client `INSERT`/`UPDATE` of enablement — enablement only via RPC.

### 2. RPC `enable_driver_fleet_owner()`

- Caller must be authenticated.
- `profiles.role` must be `'driver'`.
- Idempotent upsert of `driver_fleet_owner_profiles`.
- Returns the profile row.
- Does **not** create an organization, membership, or vehicle.

### 3. Helper `is_driver_fleet_owner(uid default auth.uid())`

- `true` iff a row exists for that user.
- Use in later RLS policies for `owner_vehicles` etc.

### 4. Phase 1b — `owner_vehicles` (shipped)

**Decision (inspected vs Business `public.vehicles`):** keep a **separate** table.

| Evidence | Implication |
|----------|-------------|
| `organization_id NOT NULL` + RLS `is_org_member` | Personal fleet cannot reuse this table without dual ownership or a fake org |
| FKs from trips, ledgers, maintenance, quotes → `vehicles.id` | Dual-mode rows would blur org TMS accounting with personal inventory |
| No personal org (Phase 1 rule) | Extending Business table would pull Driver owners into org semantics |

**Reuse:** field shapes (number, type, capacity, brand/model, documents JSON), validation (`validateIndianVehicleNumber`), category chip labels from `vehicleFormOptions.util`.

**Do not reuse:** Business Add Vehicle portal, org garage RLS, `vehicle_code` operational identity, supplier/adhoc type.

```
owner_vehicles.owner_user_id → profiles.id
```

- Soft delete via `deleted_at`
- Unique active plate per owner
- RLS: owner + `is_driver_fleet_owner()`
- Future trip link: add explicit `trips.owner_vehicle_id` (or equivalent) later — never imply create-trip from ownership

Screens: `/(driver)/my-fleet`, `/add`, `/[vehicleId]`.

### 5. Phase 2 — Document vault (shipped)

**Finding:** Business `vehicle-documents` Storage is org-scoped (`folder[1] = organization_id` + `is_org_member`). Unsafe to reuse for personal owner docs without dual-policy ambiguity.

| Piece | Design |
|-------|--------|
| Table | `owner_vehicle_documents` (typed rows; not JSON operational store) |
| Types | rc, insurance, fitness, permit, puc, tax, other |
| Fields | document_number, issued_at, expires_at, storage_path, mime, status (`current`/`replaced`/`deleted`) |
| Bucket | private `owner-vehicle-documents` |
| Path | `{owner_user_id}/{owner_vehicle_id}/{document_id}.{ext}` |
| Expiry UI | Valid · Expiring Soon (≤30d) · Expired + vehicle headline summary |
| Auth | Table RLS + Storage policies both require owner + `is_driver_fleet_owner()` |

`owner_vehicles.documents` JSONB is deprecated for operational use.

Notifications feed integration is deferred (reuse existing notification infra later).

---

## Client architecture

| Layer | Path / pattern |
|-------|----------------|
| Service | `features/driver/services/driverFleetOwner.service.ts` |
| Query | `lib/queries/useDriverFleetOwnerQuery.ts` + `queryKeys` |
| Capability helper | Prefer query/RPC over inferring from employment |
| Onboarding UI | `features/driver/components/BecomeFleetOwnerScreen.tsx` |
| Route | `app/(driver)/become-fleet-owner.tsx` + `ROUTES` + driver nav policy |
| Entry | Driver Profile card: “Become a Fleet Owner” / “Add your fleet” when not enabled; “My Fleet” when enabled (My Fleet screen can stub until 1b) |

Minimize AuthContext changes: hydrate owner status via React Query, not by expanding business `UserProfile` role enums.

---

## Navigation (Phase 1)

Current Driver tabs: Dashboard · Stories · History · Earnings.

Phase 1: **no new bottom tab**. Entry from Profile (and optional home promo).  
Later (when My Fleet ships): tabs may become Home · Loads · Fleet · Trips · More — out of Phase 1 foundation.

Mode switching (“Switch to Driver View”) uses `preferred_view` later; Phase 1 only establishes the capability.

---

## Onboarding copy (Step 1 only in foundation)

**Become a Fleet Owner**

- Manage your vehicles  
- Track documents & expiry  
- Bid for loads  
- Track earnings  
- See vehicle-wise P&L  

CTA: **Set up my fleet** → calls `enable_driver_fleet_owner` → success → navigate toward add-vehicle (stub: success state + “Coming next” or Profile until 1b).

Step 2 Add Vehicle + documents = Phase 1b / Phase 2.

---

## Existing code reuse (do / don’t)

| Reuse | Do not reuse as ownership |
|-------|---------------------------|
| Driver App shell, theme, List/Detail layouts | Business `vehicles` org RLS as the only ownership path |
| Vehicle form field options / document type labels (later) | `organization_members.role = driver` as “fleet owner” |
| Expense chip UI / ledger concepts (Phase 4) | `profiles.asset` / org operating model for personal owner |
| Marketplace load → bid flows (Phase 3) | Org create-trip permissions for Driver App |

Business org **Fleet Owner** language in Network/Reach means “asset-mode Business org”, not this persona. Keep names distinct in UI: **My Fleet** / **Fleet Owner** on Driver App vs org Operating Model.

---

## Acceptance criteria (foundation)

1. Driver with `profiles.role = 'driver'` can open Become Fleet Owner and enable once; second call is idempotent.
2. Non-drivers cannot enable (RPC error).
3. Query returns `isFleetOwner: true` after enable; Profile CTA reflects state.
4. No organization is created.
5. No trip/load/indent create surface is added.
6. Employment relationships unchanged.
7. Docs + RBAC changelog pointer updated.

---

## Implementation phases (roadmap)

| Phase | Focus |
|-------|--------|
| **1 — Owner identity** | Capability, entry, RPC/RLS foundation ✅ |
| **1b — My Fleet** | `owner_vehicles` CRUD + list/detail foundation ✅ |
| **2 — Document vault** | `owner_vehicle_documents` + private storage + expiry UI ✅ |
| **3A — Load discovery** | Read-only Available Loads from Business marketplace demand ✅ |
| **3B — Story/Reach bidding path** | Demand Stories + capacity Stories + bid attach to Business demand (inspect baseline below) |
| **3C — Assignment → operate** | Award → assigned trip + explicit `owner_vehicle_id` |
| **3D — Earnings** | Trip value = owner gross; expenses → margin (feeds Phase 4 P&L) |
| **4 — Fleet P&L** | Vehicle/trip/fleet P&L on existing ledger concepts |
| **5 — Fleet intelligence** | ₹/km, utilization (after enough data) |

**Deferred:** expiry notification feed; My Fleet is **not** a bidding surface.

---

## Phase 3B — Story/Reach inspection baseline (2026-08-10)

**Status:** **NO-GO for 3B.2 until security re-audit is green.**  
3B.1 + Bid Now parity shipped; anon `get_network_feed` EXECUTE was a **blocker** (grant regression). Fixes: `20270210182000` (authenticated-only feed) + `20270210183000` (Option A deleted-Story bid = campaign snapshot). Employed-driver RLS tracked separately: [`SECURITY_TICKET_EMPLOYED_DRIVER_RLS.md`](./SECURITY_TICKET_EMPLOYED_DRIVER_RLS.md).  
**Do not start 3B.2 / bidding product expansion until re-audit passes.**  
**Product framing:** Stories = **common distribution layer** (one `posts` model). Business indent = demand truth. My Fleet = inventory only.

### Architecture lock (do not “fix” with a second feed)

**Fleet Owner availability is a Network Story type, not a separate feed.** Fleet Owner capacity uses the existing `posts` model and `get_network_feed` distribution infrastructure and is surfaced to Business users through existing Load Center opportunity discovery (`Idle capacity` / `Find vehicles` → `OpportunityCard`). Personal FO availability may have `organization_id = NULL`; consumers must therefore be **null-org-safe** and must **not** equate `organization_id IS NULL` with unrestricted visibility.

| Rule | Meaning |
|------|---------|
| One Story system | ❌ Do not create a parallel FO/Business capacity feed or table |
| Distribution | `posts` → `get_network_feed` → existing Business discovery surfaces |
| Business-owned capacity | `organization_id` set; subject to existing org/feed connection + Reach rules |
| FO personal capacity | `type = VEHICLE_AVAILABILITY`, `organization_id = NULL`, optional `owner_vehicle_id`; author = driver FO |
| V1 organic audience | Marketplace-wide to **authenticated Business orgs** calling `get_network_feed` (**EXECUTE revoked from PUBLIC/anon** — `20270210182000`; never anonymous) |
| Discovery ≠ authority | Business may view public Story fields only; **no** mutate of FO vehicle/docs/capacity from discovery UI |
| Offline | FO deactivates Story (`is_active = false`) → must disappear from Business discovery after refresh |

```
Fleet Owner → My availability Story → posts (VEHICLE_AVAILABILITY, org NULL)
        → get_network_feed → Business Load Center → Idle capacity / Find vehicles
        → OpportunityCard
```

### Two concepts, one demand source of truth

| Concept | Object | Owner surface |
|---------|--------|----------------|
| **Load demand** | Marketplace `indents` (+ optional `posts` with `source_indent_id`) | Business TMS |
| **Capacity / availability** | Story (`posts`) referencing `owner_vehicles` | Driver App Stories tab |
| **Distribution** | Reach `reach_campaigns` + Boost plans + Pulse Credits | Existing Boost flow |
| **Response** | Bid attached to demand (`source_indent_id` / post) | Not My Fleet |

```
BUSINESS indent ──► LOAD Story / Reach ──► Driver discovers
FO owner_vehicle ──► CAPACITY Story (+ optional Boost) ──► Business discovers
                              │
                              ▼
                    Bid/respond on demand object
                              │
                              ▼
                 Business award → (3C) trip + owner_vehicle_id
```

### Existing surfaces (reuse)

| Area | What exists | FO relevance |
|------|-------------|--------------|
| **posts** | `type` ∈ `UPDATE`\|`LOAD`; fields: origin, destination, load_date, vehicle_type, weight_tonnes, rate_offer, material, `source_indent_id`, **`organization_id NOT NULL`** | LOAD Stories already carry demand shape; **org required** blocks FO author today |
| **Driver Stories UI** | `DriverStoriesScreen` + `get_driver_reach_stories`; CTA via `resolveDriverParticipation` (employed recommend / independent Bid Now) | Discovery home for FO — **keep here**, not My Fleet |
| **Reach/Boost** | `reach_plans`, `publish_reach_campaign`, snapshots, `reach_campaign_targets`, wallet debit | Boost stays distribution-only |
| **Pulse Credits** | `pulse_credit_wallets` / `pulse_credit_transactions` keyed by **`org_id`** | FO has no personal org — Boost-as-FO needs a credits actor model (user-wallet or deliberate exception) |
| **Org marketplace bid** | `bids` + `direct_quotes` + `submit_pulse_bid_with_direct_quote`; **`bidder_organization_id NOT NULL`** | Structurally Business/org — **do not fork**; not FO-native |
| **Driver direct bid** | `driver_direct_bids` + `submit_driver_direct_bid`; actor = `driver_user_id`; post must be live driver-channel boost | **Smallest FO-safe bid write path today**; award/trip **not built** |
| **owner_vehicles** | Personal inventory + documents | Reference for capacity Story payload only — never auto-creates bid/trip |

### Reusable fields vs missing

**Reuse as-is (no duplicate load table):**

- Demand: `indents.*` + `posts.source_indent_id` + commercial open predicate `indent_open_for_marketplace_bids`
- Story payload shape: origin, destination, load_date, vehicle_type, weight_tonnes, rate_offer, material, content
- Boost UX: plan picker → credits/cash → campaign history (`BoostSheet`, `publish_reach_campaign`)
- Driver discovery: Stories tab + `get_driver_reach_stories`
- Bid actor (FO/user): `driver_direct_bids` pattern (attach to post; escalate to indent via `posts.source_indent_id`)

**Genuinely missing for FO capacity + Boost (minimal):**

1. **Author model for posts without Business org** — today INSERT RLS requires `organization_id` ∈ caller’s memberships.
2. **Optional `posts.owner_vehicle_id` → `owner_vehicles.id`** — soft reference for capacity Stories (display plate/type only; **never** trip create).
3. **Capacity story semantics** — either `posts.type = 'CAPACITY'` (CHECK widen) **or** `LOAD` + convention `source_indent_id IS NULL` + `owner_vehicle_id IS NOT NULL`. Prefer explicit `CAPACITY` to avoid polluting demand LOAD analytics.
4. **Pulse Credits for non-org actors** — wallets are org-scoped; FO Boost needs user-scoped credits **or** Boost-from-capacity deferred until that exists.
5. **Award path** — `driver_direct_bids` accepts pending/accepted/rejected statuses but **no Business award → trip** wiring yet (3C).

**Must not expose on capacity Stories:** document URLs, document numbers, private KYC, employment relationships.

### Bidding principle (corrected)

- Actor may be Fleet Owner **user**.
- Bid must attach to **existing Business demand** (`posts` linked to indent, or indent via `source_indent_id`) and respect marketplace lifecycle/security.
- Prefer **extend `driver_direct_bids` / award pipeline** over inventing FO `direct_quotes` with fake orgs.
- Do **not** start from “new FO bidding tables” unless inspection proves `driver_direct_bids` cannot be awarded safely.

### Recommended 3B sequencing (after this baseline)

| Slice | Scope |
|-------|--------|
| **3B.1** ✅ scoped | Capacity Story authoring + Business Idle capacity integration via **same** Story/`get_network_feed`/`OpportunityCard` path. Null-org-safe. Marketplace-wide organic to Business orgs (V1). Offline removes. **Smoke gate before close.** No bid / Boost / trip. |
| **Reach FO patch** ✅ | Driver-cum-FO also sees **fleet-channel** Boosted **LOAD** Stories only (`snapshot_post_type = LOAD`) on Driver Stories + matching `submit_driver_direct_bid`. Not all fleet-channel campaigns. Organic FO capacity unchanged. (`20270210153000`, tightened `20270210154000`) |
| **3B.2** | Demand discovery stays Stories + Available Loads; Bid Now for FO uses/extends `submit_driver_direct_bid`. **Blocked until 3B.1 smoke passes.** |
| **3B.3** | Reuse Boost only if credits actor for FO is defined; else keep capacity Stories organic first. |
| **3B.4 / 3C** | Business accepts direct bid → trip + **explicit `owner_vehicle_id`**. |

### Hard non-goals for 3B

❌ Bidding or Available Loads UI inside My Fleet  
❌ New load/indent tables for Stories  
❌ Parallel Boost/payment system  
❌ Auto trip/bid from vehicle ownership  
❌ Using org `bids`/`direct_quotes` by inventing a personal org  
❌ Putting vehicle documents into Story payload  
❌ A second FO/Business capacity discovery feed (“fixing” null-org by forking distribution)  
❌ Treating `organization_id IS NULL` as anonymous/unrestricted public visibility  
❌ Discovery UI that mutates FO fleet inventory or documents  

### Architectural boundary (organic vs Boosted)

```
ORGANIC FO CAPACITY                         BOOSTED SHIPPER LOAD
posts (VEHICLE_AVAILABILITY, org NULL)      Business Boost
  ↓                                           ↓
get_network_feed                            fleet channel + LOAD snapshot
  ↓                                           ↓
Business Load Center                        get_driver_reach_stories (FO bridge)
  ↓                                           ↓
Idle Capacity / Find Vehicles               FO Driver Stories → Bid Now
```

Two purposes; shared Network/Reach infrastructure where appropriate. ❌ No duplicate capacity feed. ❌ No organic↔Boosted cross-over.

### Final smoke gate (must pass before /compact → 3B.2)

1. Business → Boost LOAD (fleet channel, active)  
2. FO → Driver Stories → pull refresh → Boosted shipper LOAD below My availability (not as capacity)  
3. Independent FO → Bid Now succeeds (no audience dead end)  
4. FO capacity regression: My availability + Offline → Business Idle Capacity gone; not a Boosted Story  
5. Business Idle Capacity / Find Vehicles unchanged; organic ≠ Boosted  
6. Type boundary: null/unknown/`non-LOAD` fleet-channel campaigns do **not** appear on FO Driver Stories  

---

## Phase 3 — Marketplace (architecture locks)

### Hard capability rules (Driver App Fleet Owner)

| Capability | FO |
|------------|:--:|
| Add/manage own vehicles + docs | ✅ |
| See open marketplace loads | ✅ |
| Bid / win / accept award | ✅ (3B+) |
| Operate assigned trip + expenses | ✅ |
| See trip earnings / later P&L | ✅ |
| **Create trip / indent / load / demand** | ❌ |
| **Assign another transporter / Business TMS** | ❌ |

Client/Business remains demand-side authority. Fleet Owner supplies capacity only.

### Trip ↔ vehicle association (lock now)

Do **not** infer trip ownership from `owner_vehicles.owner_user_id`.

When awards become trips (3C), use an **explicit** link:

```
trip
 └── owner_vehicle_id  →  owner_vehicles.id   (nullable until assigned)
```

- Who owns the vehicle ≠ which vehicle runs this trip (multi-vehicle fleets / other drivers later).
- Demand still creates/owns the trip row under Business semantics; FO only receives assignment + explicit vehicle reference.

### Demand source of truth

- **Indent / CommercialOpportunity** from Business marketplace remains the commercial object (`docs/MARKETPLACE_DOMAIN.md`).
- Reach/Stories may amplify discovery later — not a second load model.
- Find Work `market_indents_for_org` is **org-member** scoped — FO has no personal org, so FO discovery uses a dedicated sanitized RPC, not duplicated indent tables.

### Phase 3A scope (read-only)

In:
- RPC: open marketplace/broadcast indents (status open for bids; `circulation_target` ∈ marketplace/both)
- Driver App Available Loads list + detail
- Soft vehicle-type compatibility hints vs My Fleet
- Gate on `is_driver_fleet_owner()`

Out:
- Bidding, award, trip create, `owner_vehicle_id`, P&L, notifications

---

## Non-goals (V1 product)

❌ Second account / dual login for owner vs driver  
❌ Personal Business org for garage reuse  
❌ Create trip/load/indent/customer from Driver App  
❌ Infer owner from employment  
❌ Infer trip vehicle from fleet ownership alone  
❌ Full payroll / multi-driver HR  
❌ Parallel accounting system for fleet P&L  
❌ Parallel “FO loads” table that forks marketplace truth  

---

## In one sentence

Fleet Owner is a supply-side operator on the Driver identity: own vehicles + documents, discover/bid on Business-created loads, operate assigned trips with explicit vehicle linkage — never invent demand or TMS trip creation inside the Driver App.
