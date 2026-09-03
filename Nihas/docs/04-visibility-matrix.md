# 04 — Visibility & Permission Matrix

**This is the most important document in the set.** Every other requirement is ordinary CRUD.
This is where the product is actually differentiated, and where a bug is a commercial incident
— leaking a Giver's customer identity or a bid price to a supplier can lose a customer
permanently.

---

## 1. The governing principle

> Access to a Trip's commercial data follows **commercial accountability**, not **resource
> ownership**.

A supplier lending a truck is a vendor to the Mover. It is not a party to the Giver↔Mover
contract and must not see it.

Corollary: **an aggregated supplier's access is not a filtered view of the trip. It is a
separate, purpose-built object** (`assignment_brief`) containing only what's operationally
necessary. Do not implement it as "the trip page with fields hidden" — that pattern leaks
via APIs, exports, notifications, and the next developer who adds a field.

---

## 2. Party derivation

For any Trip, the acting Org is exactly one of:

| Party | Derivation |
|---|---|
| `GIVER` | `org_id == trip.award.load.giver_org_id` |
| `OPERATOR` | `org_id == trip.operator_org_id` |
| `RESOURCE_SUPPLIER` | Org owns a Truck or Driver in an ACTIVE assignment on this trip, and is not GIVER/OPERATOR |
| `ASSIGNED_DRIVER` | User is the Driver in an ACTIVE assignment on this trip |
| `PLATFORM` | Platform staff acting under an audited support grant |
| `NONE` | everything else, including losing bidders |

Compute this **once**, server-side, in one function. Never re-derive it in a UI component.

---

## 3. Load & Bid visibility

| Object / field | GIVER (owner) | Eligible movers (pre-award) | Bidding mover (own bid) | Winning mover | Losing mover (post-award) | Supplier | Driver |
|---|---|---|---|---|---|---|---|
| Load core (route, material, qty, window) | RW | R | R | R | R (own bid history) | ✗ | ✗ |
| Giver org identity | RW | **[UNKNOWN] D3** | see D3 | R | see D3 | ✗ | ✗ |
| Giver contact person / phone | RW | ✗ | ✗ | R | ✗ | ✗ | ✗ |
| Exact pickup/delivery address | RW | **coarse only** (city/pincode) | coarse | R full | coarse | ✗ (via brief only) | R full |
| Giver's budget/target rate | RW | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Own bid amount | R | — | RW (pre-award) | R | R | ✗ | ✗ |
| **Other movers' bid amounts** | R | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Bid count on a load | R | **[UNKNOWN] D4** | see D4 | — | — | ✗ | ✗ |
| Rank / "you are 2nd lowest" | — | ✗ | ✗ | — | — | ✗ | ✗ |
| Award decision + winner identity | RW | — | R (own outcome only) | R | R (own outcome only) | ✗ | ✗ |
| Awarded price | R | — | — | R | ✗ | ✗ | ✗ |

**D3 (Giver identity pre-award)** — real tension. Hiding it means movers bid blind on
counterparty payment risk and will pad prices. Showing it means movers can contact the Giver
off-platform and cut us out. Both are bad. Recommendation: show a **reputation proxy** —
verified badge, loads completed, on-time payment band — and reveal identity on award.

**D4 (bid count)** — showing it drives competitive urgency and better prices for the Giver;
it also tells movers when to undercut. Recommendation: show nothing in v1; instrument and
test later.

**Never show rank, "lowest bid so far", or auto-underbid.** That produces a race to the
bottom, movers who win at unsustainable rates, and then renegotiate mid-trip. This is a
documented failure mode of freight bidding platforms.

---

## 4. Trip visibility — the core table

| Object / field | GIVER | OPERATOR | RESOURCE_SUPPLIER | ASSIGNED_DRIVER | PLATFORM |
|---|---|---|---|---|---|
| Trip exists / status | R | RW | ✗ (sees only own brief) | R (own trips) | R audited |
| Route (origin → destination, full address) | R | RW | ✗ | R | R audited |
| Giver org identity & contact | R | R | **✗** | ✗ **[ASSUMPTION — CONFIRM D7]** | R audited |
| Operator org identity | R | R | R | R | R audited |
| Awarded freight rate (Giver↔Mover) | R | R | **✗** | ✗ | R audited |
| Rate paid to supplier (Mover↔Supplier) | **✗** | R | R (own) | ✗ | R audited |
| Consignee name / contact | R | R | ✗ | R | R audited |
| Material description & value | R | R | **generic class only** | R (description, not value) | R audited |
| Assigned truck reg number | R | RW | R (own) | R | R audited |
| Assigned driver name & phone | R | RW | R (own) | R (self) | R audited |
| **Whether the truck/driver was aggregated** | **[UNKNOWN] D8** | R | R | ✗ | R audited |
| Supplier org identity | see D8 | R | R (self) | ✗ | R audited |
| Milestone events + timestamps | R | R | **own-leg subset** | Create (own trip) | R audited |
| GPS / location trail (future) | R | R | ✗ | Create | R audited |
| POD files | R | R | ✗ | Create + R own | R audited |
| Exception events | R | R | **only exceptions raised by/about own resource** | Create | R audited |
| Documents (e-way bill, invoice, LR) | R | RW | ✗ | R (only what driver must carry) | R audited |
| Internal notes | own only | own only | own only | ✗ | R audited |

**D7 (does the driver see the Giver's identity?)** — practically the driver must reach the
consignee at delivery, and the pickup contact at loading. But if the driver belongs to an
aggregated supplier, giving them the Giver's identity leaks the Mover's customer through the
driver. Recommendation: driver sees **site contacts** (pickup contact, delivery contact) as
names + click-to-call proxy numbers, and never the Giver's org name or account contact. Requires
call masking, which is real infra cost — flag it.

**D8 (does the Giver know the truck was subcontracted?)** — commercially loaded. Some Givers
contractually forbid subcontracting. Hiding it is arguably misrepresentation; showing it can
kill the Mover's margin story. Recommendation: expose a per-Giver-contract flag
`subcontracting_disclosure: HIDDEN | AGGREGATED_FLAG_ONLY | FULL_SUPPLIER_IDENTITY`, default
`AGGREGATED_FLAG_ONLY`. This is a policy question for whoever owns customer contracts, not an
engineering call.

---

## 5. The `assignment_brief` — what a supplier actually gets

A separately-persisted, explicitly-built object. Whitelist only; adding a field is a
deliberate act.

**Included:**
- Brief reference (not the trip id)
- Operator org name
- Own truck registration and/or own driver name
- Reporting: pickup **city + area + landmark**, report-by datetime
- Drop **city** only
- Generic material class (`STEEL`, `FMCG`, `FRAGILE`…) — not the description, never the value
- Expected duration / return-by
- Agreed rate to the supplier, and its payment terms
- Own resource's status: `REPORTED`, `LOADED`, `IN_TRANSIT`, `COMPLETED`
- Exceptions concerning their own resource (breakdown, driver no-show)

**Excluded, by construction:**
- Giver identity, contact, or any customer information
- Freight rate charged to the Giver
- Full pickup / delivery addresses
- Consignee details
- Material description or declared value
- POD files
- The trip's own event stream
- Any other resource on the trip
- Any other trip

**A supplier must never be able to reach a trip id from a brief.** Different table, different
primary key, no foreign key exposed through the API.

---

## 6. Notification matrix

Notifications leak more data than APIs do, because nobody reviews the SMS template. Every
template goes through the same whitelist review as the brief.

| Event | GIVER | OPERATOR | SUPPLIER | DRIVER |
|---|---|---|---|---|
| Load published | — | eligible movers: yes | ✗ | ✗ |
| Bid received | yes (count only, no amount) | ✗ | ✗ | ✗ |
| Bid awarded | yes | winner: yes / losers: "not selected", no winner identity or price | ✗ | ✗ |
| Trip assigned | ✗ | yes | yes — brief only, no trip detail | ✗ (not until deploy) |
| Trip deployed | yes | yes | yes — "your resource is deployed" | yes |
| Milestone event | yes | yes | **only own-leg milestones, no route detail** | ✗ (they created it) |
| Exception raised | yes | yes | only if concerning own resource | as relevant |
| POD uploaded | yes | yes | ✗ | confirmation only |
| Trip closed | yes | yes | "assignment complete" | ✗ |

---

## 7. Platform admin access

**Platform admin does not get blanket read.** Bypassing RLS "for support" is how the
confidentiality guarantee above becomes a lie.

Required design:
- Support access requires an explicit, time-boxed `support_grant` row (target org, scope,
  reason, expiry ≤ 24h).
- Every read under a grant writes an audit row.
- The target Org's owner can see the access log for their own org.
- Only a separate `platform_superadmin` may issue grants, and grant issuance itself is audited.

**[UNKNOWN]** whether the team will accept this friction. It is more work than
`bypass_rls = true` and it will be the first thing proposed for cutting. Cutting it is a
defensible choice — but say so in writing rather than shipping a silent backdoor.

---

## 8. How this must be enforced

Three layers, in order of trust:

1. **RLS on every table** — the actual security boundary. Assume the API layer will be bypassed.
2. **Explicit projection at the API layer** — briefs and lists are built by named
   view/function per party. No `select *` reaching a client, ever.
3. **UI gating** — convenience only. Never the enforcement point.

**Non-negotiable test requirement:** for every row in the tables above, a test that asserts
the negative case — supplier cannot read trip X, losing bidder cannot read bid Y. Positive-path
tests do not catch leaks. This suite is a release gate, not a nice-to-have.
