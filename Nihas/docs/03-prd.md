# 03 — PRD: Load → Bid → Award → Trip → POD

**Status:** Draft. Depends on decision D0 (`07`) — if we go execution-first rather than
marketplace-first, Release 1 and 2 swap order.

---

## 1. Scope

**In:** tenant + member management, resource master (trucks/drivers), load creation, bidding,
award, trip creation, assignment (own + aggregated), deploy, driver milestone capture, POD,
supplier assignment brief, notifications.

**Out (v1):** payments/invoicing/settlement, rate benchmarking, multi-stop, part loads, GPS
hardware, bid negotiation, public marketplace, supplier self-serve onboarding, Giver/Mover
mobile apps, analytics beyond the metrics in `01`.

---

## 2. Release plan

Each release is gated on the previous one's metrics, not on a date.

### R1 — Execution core *(no bidding)*
Prove the driver mechanism works before building a marketplace on top of it.

Giver creates a load and directly assigns it to a Mover they already work with (`DIRECT_AWARD`,
no bid). Mover assigns own truck + own driver, deploys. Driver captures milestones and POD.
Giver watches.

**Gate to R2:** driver event completion ≥60% and POD-within-6h ≥50% across ≥3 real tenants and
≥50 real trips. If this gate fails, the product thesis is wrong and R2 makes it worse.

### R2 — Bidding
Publish load to eligible movers, collect bids, compare, award. Losing-bid handling.

**Gate to R3:** bid coverage ≥2 bids on ≥50% of published loads. If movers don't bid, the
marketplace does not exist and we should stop and be an execution tool.

### R3 — Aggregation
Supplier links, aggregated truck/driver assignment, `assignment_brief`, supplier-facing surface.

---

## 3. User stories with acceptance criteria

Format: Given / When / Then. Every story needs a negative-path criterion.

### R1

**S1 — Giver creates a load**
> As an ops manager at a Load Giver, I create a load so a mover can execute it.

- G: I have `OPS_MANAGER` in an Org with `LOAD_GIVER`. W: I submit pickup, delivery, material,
  quantity, vehicle type, pickup window. T: load created in `DRAFT`.
- G: a required field is missing. W: I publish. T: rejected with per-field errors; status
  unchanged.
- G: pickup window start is in the past. W: I publish. T: rejected.
- G: I lack `LOAD_GIVER` capability. W: I call create. T: 403, and the endpoint is not
  discoverable in the UI.

**S2 — Giver directly awards to a known mover**
- G: a `DRAFT`/`PUBLISHED` load and a Mover Org I have an accepted connection with.
  W: I direct-award at an agreed rate. T: `Award` created, load → `AWARDED`, Trip created in
  `CREATED`, Mover notified.
- G: no accepted connection with that Mover. W: I direct-award. T: 403.
- G: load already `AWARDED`. W: I award again. T: 409, no second award, no second trip.

**S3 — Mover assigns own truck and driver**
- G: I have `DISPATCHER` in the operator Org and a trip in `CREATED`. W: I assign a truck and
  driver both owned by my Org. T: `Assignment` created `ACTIVE`, trip → `ASSIGNED`.
- G: that truck is already on another `ACTIVE` assignment with an overlapping window.
  W: I assign. T: warning + explicit confirm required; if confirmed, both are recorded and a
  `DOUBLE_BOOKED` flag is raised on both trips. *(Blocking outright is wrong — real dispatch
  legitimately overlaps at shift boundaries.)*
- G: the driver's licence is expired. W: I assign. T: warning, not a block. **[ASSUMPTION —
  CONFIRM]** — compliance-blocking may be a legal requirement in some geographies.
- G: I try to assign a truck belonging to another Org with no supplier link. W: assign.
  T: 403 (R3 relaxes this to require an ACTIVE link).

**S4 — Mover deploys the trip**
- G: trip in `ASSIGNED`. W: I deploy. T: trip → `DEPLOYED`, driver notified via their
  available channel, driver can now see the trip.
- G: trip in `CREATED` (unassigned). W: I deploy. T: 400.
- G: the driver has no app account and no phone number. W: I deploy. T: blocked with a clear
  reason — there is no way to reach them.

**S5 — Driver executes**
- G: I'm the assigned driver on a `DEPLOYED` trip. W: I open the app. T: I see this trip with
  route, contacts (per D7), and the next expected action. I see no other trip.
- G: I'm at pickup. W: I mark `AT_PICKUP`. T: event appended with device timestamp, server
  receipt timestamp and (if permitted) coordinates. Giver + Mover notified.
- G: **I have no network.** W: I mark events. T: queued locally, applied in order on reconnect,
  original device timestamps preserved. **Non-negotiable.**
- G: I mark `LOADED` without having marked `AT_PICKUP`. W: submit. T: accepted and recorded;
  trip status derives from the highest milestone. A `SKIPPED_MILESTONE` flag is raised for ops.
  *(Blocking out-of-order events means drivers stop using the app.)*
- G: something goes wrong. W: I raise an exception with a type, note and photo. T: event
  appended, trip status unchanged, Giver + Mover notified.

**S6 — POD**
- G: trip at `AT_DELIVERY`. W: I upload 1–5 photos plus receiver name and optional remarks.
  T: POD attached, trip → `DELIVERED`, Giver + Mover notified.
- G: upload fails mid-way / no network. W: retry. T: resumable or queued; no duplicate POD, no
  partial record. Idempotency key required.
- G: photo is unreadable. W: Giver reviews. T: Giver may request re-upload; a new POD version
  is added, the original is retained (never overwritten).

**S7 — Giver tracks**
- G: an active trip. W: I open it. T: current status, event timeline with timestamps, assigned
  truck reg and driver name/phone, POD when present. Per `04`.
- G: a trip I'm not a party to. W: I request it by id. T: 404 (not 403 — don't confirm existence).

### R2

**S8 — Giver publishes for bids**
- G: a `DRAFT` load. W: I publish to eligible movers. T: load → `PUBLISHED`; eligible movers
  see it within 60s; addresses shown coarse per `04`.
- G: eligibility rules. T: **[UNKNOWN] D9** — connected movers only, capability-based, or
  region/vehicle matched? Materially changes the product.

**S9 — Mover bids**
- G: I have `OPS_MANAGER` in a `LOAD_MOVER` Org and see a `PUBLISHED` load. W: I submit price,
  vehicle, ETA, remarks. T: bid created `SUBMITTED`; Giver notified with count only.
- G: I already have a `SUBMITTED` bid. W: I submit again. T: rejected — revise the existing one.
- G: I revise before award. W: submit. T: previous version retained in history; Giver sees only
  the current version.
- G: the load is `AWARDED`. W: I bid. T: 409.
- G: I query another mover's bid. T: 404.

**S10 — Giver awards**
- G: ≥1 `SUBMITTED` bid. W: I award one. T: in **one transaction** — bid → `AWARDED`, all
  siblings → `NOT_SELECTED`, load → `AWARDED`, `Award` created, Trip created in `CREATED`,
  notifications queued.
- G: two ops users award different bids concurrently. W: both submit. T: exactly one succeeds;
  the other gets 409. Enforced by a DB constraint, not application logic.
- G: I try to award after cancelling the load. T: 409.

### R3

**S11 — Mover links a supplier**
- G: I have `FLEET_MANAGER`. W: I invite a supplier Org (or create an external resource record
  per D1). T: `SupplierLink` in `PENDING`; on acceptance → `ACTIVE`.
- G: the link is `PENDING` or `REVOKED`. W: I assign their resource. T: 403.

**S12 — Mover assigns an aggregated resource**
- G: `ACTIVE` supplier link. W: I assign supplier truck + own driver. T: assignment records
  `truck_source=AGGREGATED`, `driver_source=OWN`, supplier org ids stored per resource.
- All four combinations (own/own, agg/own, own/agg, agg/agg) are accepted and recorded distinctly.
- G: any assignment. T: `trip.operator_org_id` is unchanged. **The operator never changes.**

**S13 — Supplier sees only its brief**
- G: my truck is on a deployed trip. W: I open my supplier surface. T: I see exactly the
  `assignment_brief` fields in `04` §5 — and no trip id, no Giver, no freight rate, no POD.
- G: I request the trip endpoint directly with the trip id. T: 404.
- G: a milestone is recorded on a leg not involving my resource. T: I receive nothing.
- **Test gate:** an automated leak test enumerating every trip field and asserting supplier
  access. Release-blocking.

**S14 — Mover reassigns mid-trip**
- G: a deployed trip, driver hasn't reached pickup. W: I reassign the driver. T: old assignment
  → `REPLACED`, new one `ACTIVE`; old driver loses access immediately; new driver notified;
  Giver notified. **[ASSUMPTION — CONFIRM]** Giver notification, not approval.
- G: trip is `IN_TRANSIT`. W: I reassign the truck. T: **[UNKNOWN] D10** — mid-transit truck
  change means a physical transhipment. Probably requires an exception event and Giver consent.
  Do not build this in R3 without a decision.

---

## 4. Non-functional requirements

| Area | Requirement | Notes |
|---|---|---|
| Event write latency | driver event → visible to Giver p95 < 10s | "Within 5 seconds" is not achievable end-to-end on rural mobile networks and shouldn't be promised. |
| Offline | driver app queues events + POD for ≥48h offline, replays in order, idempotent | The single hardest engineering requirement here. |
| Availability | 99.5% for driver-facing write endpoints | 99.9% is a claim requiring on-call, runbooks and multi-region. Don't write it down unless funded. |
| Data isolation | zero cross-tenant reads; RLS on every tenant table; negative tests as a release gate | |
| Auditability | trip events, assignments, awards, POD are append-only; every platform-admin read audited | |
| POD storage | private bucket, signed URLs ≤15min, no public objects | |
| Payload size | POD images client-compressed to ≤500KB each | Driver data cost is a real adoption barrier. |
| Notification delivery | at-least-once, dedup key per (event, recipient, channel) | |
| Localisation | **[UNKNOWN]** which languages for the driver app | Likely blocking for adoption. |

---

## 5. Analytics events

Emit with `org_id`, `party_role`, `actor_user_id`, `trip_id`/`load_id`, server timestamp.

`load_created`, `load_published`, `bid_submitted`, `bid_revised`, `load_awarded`,
`trip_created`, `trip_assigned` *(with `truck_source`, `driver_source`)*, `trip_deployed`,
`driver_trip_opened`, `milestone_recorded` *(type, `was_offline`, `latency_ms`)*,
`milestone_skipped`, `exception_raised`, `pod_uploaded` *(attempt_count)*, `trip_closed`,
`supplier_brief_viewed`, `permission_denied` *(endpoint, party_role — watch this for leak
attempts and for UI that shows users things they can't do)*.

---

## 6. What is deliberately underspecified

Being explicit so nobody assumes these are designed:

- **Rate/pricing model** — no negotiation, no counter-offers, no per-tonne vs per-trip vs
  per-km distinction. Real freight pricing needs all of these. Not designed.
- **Detention / halting charges** — the #1 source of freight disputes. No data model for it.
- **Partial / short delivery** — POD assumes full delivery. Shortage claims unhandled.
- **Damage claims and insurance** — nothing.
- **e-Way bill / LR / statutory documents** — a `documents` table exists; no compliance logic,
  no validation, no GST integration. This may be a legal blocker depending on geography.
  **[UNKNOWN]**
- **Settlement** — POD is the payment trigger but no payment exists. Givers will ask on day one.
