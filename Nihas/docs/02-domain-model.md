# 02 — Domain Model & Glossary

Source of truth for vocabulary. Code, DB columns, API fields and UI copy use these terms
exactly. If you need a new term, add it here first.

---

## 1. The one distinction that matters

Three different notions of "ownership" get confused constantly in this domain. Keep them apart:

| Concept | Term we use | Example |
|---|---|---|
| Who needs the goods moved | **Demand Owner** = Load Giver org | Chennai Steel Traders |
| Who is commercially accountable for moving them | **Trip Operator** = winning Load Mover org | SpeedTrans Logistics |
| Who owns the physical truck / employs the driver | **Resource Owner** | Kumar Fleet Services |

**Resource Owner ≠ Trip Operator.** The whole visibility model in `04` follows from this. A
supplier lending a truck does not become a party to the trip.

---

## 2. Glossary

**Platform** — the multi-tenant system itself. Has staff (`platform_admin`) who are not
members of any tenant.

**Organization (Org)** — a tenant. The unit of data isolation. Everything except platform
tables carries `org_id`.

**Capability** — a business function an Org is enabled for: `LOAD_GIVER`, `LOAD_MOVER`,
`RESOURCE_SUPPLIER`. An Org holds a *set* of capabilities, not a single type. "Does both" is
`{LOAD_GIVER, LOAD_MOVER}` — not a third type. Do not model this as an enum column.

**Member** — a user's membership in an Org. Carries the Org-scoped role. A user may be a
member of more than one Org. **[ASSUMPTION — CONFIRM]** multi-org membership is allowed;
if not, this simplifies significantly.

**Role** — an Org-scoped permission bundle. See §5. Roles are *inside* an Org and are a
different axis from Capability.

**Load** — the commercial requirement. Owned by a Load Giver Org. Has pickup, delivery,
material, quantity, vehicle requirement, window. A Load is *demand*.

**Bid** — a Load Mover Org's priced offer against a Load. Confidential to bidder + Load Giver.

**Award** — the Load Giver's selection of one Bid. Immutable once created; cancellation is a
new record, not an update. **[ASSUMPTION — CONFIRM]** one Award per Load (no load splitting).

**Trip** — the operational execution record created from an Award. A Trip is *supply-side
execution*. One Award → one Trip.

> **Load vs Trip:** the Load belongs to the Giver and describes what must happen. The Trip
> belongs to the Mover and records what did happen. They are separate rows with separate
> lifecycles and separate permissions. Do not collapse them, even though v1 has a 1:1
> relationship — R3 aggregation and future multi-leg both break the 1:1.

**Truck** — a vehicle record owned by exactly one Org.

**Driver** — a driver record owned by exactly one Org. May or may not have a linked platform
user account. See §4 — this is the messiest part of the model.

**Assignment** — the link binding a Trip to a Truck and a Driver, recording each resource's
owning Org and whether it was `OWN` or `AGGREGATED` relative to the Trip Operator.

**Supplier Link** — a persistent relationship between two Orgs allowing one (Mover) to
assign the other's (Supplier's) resources. Must exist and be `ACTIVE` before an aggregated
assignment is permitted.

**Trip Event** — an append-only milestone or exception record on a Trip. Never updated, never
deleted. Corrections are new events with a `supersedes_event_id`.

**POD** — Proof of Delivery. One or more files plus receiver metadata attached to a Trip.

**Deploy** — the Mover's explicit act of publishing an assigned Trip to the driver. Before
DEPLOYED the driver sees nothing.

---

## 3. Lifecycles

### Load

```
DRAFT ──► PUBLISHED ──► AWARDED ──► CLOSED
  │           │             │
  │           └──► CANCELLED│
  └──► CANCELLED            └──► CANCELLED
```

| From | To | Trigger | Guard |
|---|---|---|---|
| DRAFT | PUBLISHED | Giver publishes | required fields complete; pickup window in future |
| PUBLISHED | AWARDED | Giver awards a bid | ≥1 bid in SUBMITTED |
| PUBLISHED | CANCELLED | Giver cancels | — (all bids → WITHDRAWN_BY_SYSTEM) |
| AWARDED | CLOSED | Trip reaches DELIVERED and POD accepted | — |
| AWARDED | CANCELLED | Giver or Mover cancels | Trip not past IN_TRANSIT **[ASSUMPTION — CONFIRM]** |

There is deliberately **no** `BIDDING` state distinct from `PUBLISHED`, and no `NEGOTIATING`
state in v1.

### Bid

```
DRAFT ──► SUBMITTED ──┬──► AWARDED
                      ├──► NOT_SELECTED
                      ├──► WITHDRAWN
                      └──► EXPIRED
```

Awarding one Bid transitions all sibling SUBMITTED bids to NOT_SELECTED in the same
transaction.

### Trip

```
CREATED ──► ASSIGNED ──► DEPLOYED ──► ACCEPTED ──► AT_PICKUP ──► LOADED
   ──► IN_TRANSIT ──► AT_DELIVERY ──► DELIVERED ──► CLOSED
```
Plus: `CANCELLED` reachable from CREATED…IN_TRANSIT; `EXCEPTION` is **not** a state — it's an
event type. A trip in trouble stays in its current state with an exception event attached.

| From | To | Actor | Guard |
|---|---|---|---|
| CREATED | ASSIGNED | Mover dispatcher | truck + driver assigned; aggregated resources have ACTIVE supplier link |
| ASSIGNED | DEPLOYED | Mover dispatcher | driver has a reachable channel (app account or phone) |
| DEPLOYED | ACCEPTED | Driver | **[ASSUMPTION — CONFIRM]** does driver acceptance exist, or is deploy a fait accompli? |
| ACCEPTED | AT_PICKUP | Driver | — |
| AT_PICKUP | LOADED | Driver | — |
| LOADED | IN_TRANSIT | Driver | — |
| IN_TRANSIT | AT_DELIVERY | Driver | — |
| AT_DELIVERY | DELIVERED | Driver | POD uploaded **[ASSUMPTION — CONFIRM]** is POD mandatory to mark delivered? |
| DELIVERED | CLOSED | Mover or Giver | **[UNKNOWN]** who closes — see D5 |

**Honest note on the state machine:** ten states is a lot for v1, and real freight does not
move linearly. Trucks break down, get detained at the gate for six hours, deliver partially,
or get diverted. The linear chain above will be violated within the first week of real use.
Mitigation: milestones are recorded as **events**, and Trip status is *derived* as the highest
milestone reached. This makes out-of-order and skipped events survivable. See `05` §4.

### Assignment

```
ACTIVE ──► REPLACED   (a new assignment supersedes it)
       └──► CANCELLED (trip cancelled)
```
Assignments are never updated. Reassignment = new row + old row → REPLACED. This preserves
"who was driving when" for dispute resolution.

---

## 4. Drivers and aggregated resources — the hard part

A driver from an aggregated supplier needs to receive a trip. Two possible models:

**Model A — Supplier owns the driver record.** Supplier is a tenant, creates its own Truck and
Driver rows, and grants the Mover assignment rights via a Supplier Link.
- ✅ single record per driver, no duplicates, supplier keeps its own fleet data
- ❌ requires every supplier to onboard as a tenant. Most small truck owners will not.

**Model B — Mover owns an "external resource" record.** Mover creates a Truck/Driver row
tagged `external`, with an optional pointer to a supplier Org if that supplier is on-platform.
- ✅ works immediately, zero supplier onboarding
- ❌ the same truck ends up duplicated across five Movers. Supplier has no view of its own
  fleet. Data quality degrades.

**Recommendation: build B in R1/R2, add A in R3 as an upgrade path** — a supplier that later
onboards can claim its external records. Requires a `resource_claim` reconciliation flow, which
is real work; scope it explicitly rather than assuming it's cheap.

**[ASSUMPTION — CONFIRM]** — this is decision D1 in `07` and it is the highest-impact open
question in the whole set. Getting it wrong means a schema migration on the busiest tables.

### Driver identity

A Driver record and a platform User are separate things:
- Driver record = fleet master data (name, phone, licence, owning org)
- User = login identity
- A Driver *may* be linked to a User via `driver.user_id`

**[UNKNOWN]** How an aggregated driver authenticates. Options: (a) they install the app and
register against their supplier Org; (b) the Mover's deploy sends a magic link / OTP that
grants scoped access to that one trip without a full account. (b) is far better for adoption
and far more work. Decision D2.

---

## 5. Roles

Roles are Org-scoped. A role means nothing outside its Org.

| Role | Purpose |
|---|---|
| `ORG_OWNER` | Full org control: members, settings, capabilities, all data |
| `OPS_MANAGER` | Loads, bids, awards, trips, assignments, exceptions. No member/billing admin. |
| `DISPATCHER` | Assign resources, deploy trips, monitor. Cannot bid or award. |
| `FLEET_MANAGER` | Trucks, drivers, supplier links. Cannot touch loads/bids. |
| `FINANCE` | Read trips + POD; own the settlement surface (post-v1). |
| `VIEWER` | Read-only. |
| `DRIVER` | Only their own assigned trips. Not an org-admin role — heavily restricted. |

**Deliberately not roles:** "Load Giver", "Load Mover", "Aggregated Supplier". Those are Org
*capabilities*. Conflating the two axes is the most common modelling error here and the reason
the permission code will rot if you get it wrong.

### "Driver cum Load Mover"

**[UNKNOWN]** — decision D6. Two readings:
1. **Owner-driver**: a one-person Org with capabilities `{LOAD_MOVER, RESOURCE_SUPPLIER}` and a
   single member holding both `ORG_OWNER` and `DRIVER`. No new concept needed — falls out of
   the existing model. Requires the mobile app to expose bidding, which is real UI work.
2. **Employee with extra rights**: a member of a Mover Org holding `DRIVER` + `OPS_MANAGER`.
   Also falls out of the model.

Both work without schema changes. The cost is UI: option 1 means the driver app must contain a
bidding surface. Confirm which one, and budget the mobile work if it's (1).
