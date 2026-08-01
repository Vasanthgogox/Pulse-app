# Trip Variants — How a Load Becomes a Trip

**Who this is for:** anyone who needs to know how trips get created in Pulse — the
product owner, the team, or an AI assistant picking up the codebase cold. No prior
context assumed. Plain English first, table/column names second.

**Verified against the live database and code on 2026-08-01.** Where something is
unverified or was never used in production, it says so explicitly.

---

## The short version

There are **three ways a trip gets created**. That's it.

1. **Local Trip** — you type it in yourself
2. **Awarded → Own Asset** — you win someone's load, you run it with your own truck
3. **Awarded → Supplier** — you win someone's load, your supplier runs it

Two things make this confusing, and both live in flow 3:

- **It creates two database rows, not one.** Everything strange about the schema comes
  back to that. See §4.
- **It has two shapes that look identical in the data** — a supplier who *bid and won*
  (pull) versus a partner you *handed it to* off your own list (push). Same field, same
  row, opposite story. See §3.

---

## 1. Vocabulary — read this first

Four words that get mixed up constantly.

| Word | Means |
|---|---|
| **Indent** | A load someone wants moved. A request. Not yet a trip. |
| **Trip** | An actual job in execution — has a driver, a truck, a status. |
| **Asset** | You're moving it with your own driver and truck. |
| **Aggregate** | Someone else is moving it for you. You're the middleman. |
| **Mover** | The org that physically moves the goods. The one with the truck on the road. |

### ⚠️ "Supplier" means two opposite things

The word is overloaded and it is the #1 source of misreading this schema.

| Sense | Means | Direction |
|---|---|---|
| **Supplier (awardee)** | The org that *bid on your load and won it* | they pulled it from you |
| **Supplier (partner)** | A name in *your own* supplier list you hand work to | you pushed it to them |

Both end up in `trips.supplier_id`. **The row looks identical either way.** To tell them
apart you must compare against `indents.assigned_supplier_id` — see the PULL vs PUSH test
in §3.

Related: **your `suppliers` table is your private address book.** A row there is *your*
record of a partner. If it has `linked_organization_id`, that partner is a real org on
the app; if null, they're a contact who isn't. Two different orgs can each have a
`suppliers` row pointing at the same company.

**Asset vs Aggregate is decided by exactly one field.** From
[driverUtils.util.ts:52](../features/drivers/utils/driverUtils.util.ts#L52):

```ts
export function isAggregateTrip(trip) {
  const sid = trip.supplier_id;
  return !!(sid && String(sid).trim());
}
```

`supplier_id` filled in → **Aggregate**. Empty → **Asset**. Nothing else is consulted —
not the driver's owner, not the truck's owner, not the money. Just that one field.

This matters more than it looks. See the mixed-ownership warning in §6.

---

## 2. Who is allowed to create a trip

**Rule: the load-giver never creates the trip. The load-taker does.**

```
Client creates indent          →  status: pending
        ↓  suppliers quote, or client directly assigns
Client awards it               →  status: awarded
        ↓
SUPPLIER creates the trip         ← "Assign Staff & Deploy"
        ↓
Trip runs                      →  completed
```

In the app:
- **Shipper's view** (Network → Load → HIRE PARTNER) — sees "Supplier secured / Pending".
  Only "View Detail" is clickable. **No Create Trip button.** This is intentional.
- **Supplier's view** (Network → Load → CLAIMED) — sees "Assign Staff & Deploy".
  This is where the trip is born.

Source: [LOAD_INDENT_TRIP_FLOW.md](LOAD_INDENT_TRIP_FLOW.md).

---

## 3. The three flows

### Flow 1 — Local Trip

**Plain English:** You have no partners on the platform, or you just don't need them.
You open Add Trip, type the job in, pick one of your drivers. Done. You can assign the
driver now or leave it and assign later.

**When to use it:** small operators, or any job that never went through an indent.

**In the database:**

| Field | Value |
|---|---|
| `source` | `manual` |
| `supplier_id` | empty → **Asset** |
| `indent_id` | empty (no indent involved) |
| Rows created | **1** |

**Verified:** 57 manual trips exist platform-wide. **56 of them have a `client_id`** — so
in practice this flow still picks or creates a proper client record, it isn't just a
free-typed name.

---

### Flow 2 — Awarded → Own Asset

**Plain English:** Ajio posts a load. You bid. Ajio awards it to you. You run it with
your own truck and your own driver.

**Worked example (real data):** Ajio's load → nihas logs quotes → awarded → nihas logs
assigns own driver + truck. One trip, owned by nihas logs.

**In the database:**

| Field | Value |
|---|---|
| `source` | `direct_quote` |
| `supplier_id` | empty → **Asset** |
| `indent_id` | the indent |
| Rows created | **1** |

---

### Flow 3 — Awarded → Supplier

**Plain English:** Same as flow 2 up to the award. But you don't run it yourself — you
pass it to one of your suppliers. They send the truck. You keep the difference between
what the client pays you and what you pay them.

**Worked example (real data):** Ajio pays nihas logs ₹96,000. nihas logs pays the mover
₹81,500. nihas logs keeps ₹14,500.

**In the database — this is the one that creates two rows.** See §4.

---

### Flow 3 has TWO different shapes — pull and push

This is the single easiest thing to get wrong, because **both shapes write the same
field** (`trips.supplier_id`) and the row looks identical afterwards. Only the human
story differs.

**Shape A — PULL (they won it).** You post a load. Orgs quote on it. One wins. The
winner is written to `indents.assigned_supplier_id`, and the same org lands on
`trips.supplier_id`. Nobody chose them off a list — they competed and beat the others.

**Shape B — PUSH (you handed it down).** You *already own* the load — either you created
it, or you won it from someone upstream. You open **Deploy load** and pick a name from
**your own supplier list**. That name is written to `trips.supplier_id`.

| | Shape A — PULL | Shape B — PUSH |
|---|---|---|
| Who picked whom | they bid, you awarded | you chose from your list |
| Where the name came from | `direct_quotes` | your `suppliers` table |
| Driver on the trip | usually set — came with the bid | **`null` by design** |
| Tracking | real driver record, OTP | typed name + plain phone |
| `assigned_supplier_id` | **equals** `trips.supplier_id` | unrelated or absent |

**How to tell them apart in SQL** — the only reliable test:

```sql
-- PULL if the trip's supplier IS the org that won the indent; PUSH otherwise.
select s.linked_organization_id = i.assigned_supplier_id as is_pull
from trips t
join indents i on i.id = t.indent_id
left join suppliers s on s.id = t.supplier_id
where t.id = '<trip-id>';
```

> **The database alone cannot tell you which happened** without this join. If you look
> only at `trips.supplier_id`, a bidder who won and a partner you handed it to are
> indistinguishable. Every mis-read of this schema starts here.

**Live counts (verified):** 19 trips are **PULL**. **Zero** are PUSH. Ten more have a
supplier but their indent was never awarded — all ten have `driver_id = null`, the
signature of the push path. `trip_subcontracts` holds 2 rows. So the push path is
**built and reachable in the UI but essentially unused in production.**

---

### The Deploy load wizard (Asset vs Aggregate)

The 6-step **Deploy load** screen is where shape B happens. You reach it once a load is
yours, and step 1 asks the only question that matters:

- **Asset** → you run it. Your driver, your truck, picked from your roster.
- **Aggregate** → you hand it to a partner. The list shown is **your own suppliers**.

What the Aggregate branch actually writes
([useStaffHandshake.ts:674-733](../features/network/hooks/useStaffHandshake.ts#L674-L733)):

1. Creates **one** trip in **your** org from your winning quote.
2. Sets `supplier_id` = the partner and `supplier_rate` = what you agreed to pay them.
3. Inserts a `trip_subcontracts` row recording the same handoff separately.
4. Marks the indent `completed`.

**The driver is deliberately `null`.** The code passes `driverId: null` and instead
collects a **typed name and a plain phone number** for tracking — no driver record, no
roster entry, no OTP handshake. That is what the *"Assign later — add vehicle & driver
phone on trip detail"* toggle refers to.

> **So in a true Aggregate deploy, nobody owns a driver in the app.** It's a phone
> number to call. Do not expect a `drivers` row.

**The same org can appear in both roles.** Paperkraft has *bid on and won* nihas's loads
(pull), and also sits in nihas's supplier dropdown as a partner he could hand work to
(push). Same org, opposite direction. Judge by the join above, never by the name.

---

## 4. Why flow 3 makes two rows

This is the single most confusing part of the schema. Here's the whole thing.

### The problem

Two companies need different things from the same load:

- **The middleman** needs a *money* record — what the client pays, what the supplier
  costs, what's left over.
- **The mover** needs a *work* record — their driver, their truck, and somewhere to log
  fuel, tolls and driver pay.

One row can't be both. The middleman's row says `supplier_rate = ₹81,500` (money going
out). The mover's row needs `₹81,500` as money coming *in*. Same number, opposite sign,
same field. Impossible in one row.

### The hard blocker

There is a unique index on the trips table:

```sql
CREATE UNIQUE INDEX trips_one_per_indent
  ON public.trips (indent_id) WHERE (indent_id IS NOT NULL);
```

**One indent can only ever have one trip via `indent_id`.** Full stop.

So the mover's row links to the indent through a *different* column —
`source_indent_id` — which sits outside that index. Two rows isn't a design preference.
It's the only legal way to do it.

### The two rows, side by side

| | Middleman's row | Mover's row |
|---|---|---|
| Owned by | nihas logs | the supplier org |
| `source` | `direct_quote` | **`mover_asset`** |
| Links via | `indent_id` | `source_indent_id` |
| `supplier_id` | the supplier → **Aggregate** | empty → **Asset** |
| `client_price` | ₹96,000 (what Ajio pays) | ₹81,500 (what the mover earns) |
| `supplier_rate` | ₹81,500 | **0** — nobody downstream to pay |
| `trip_payout_mode` | — | `asset` |
| Initial status | normal | **`draft`** |
| Purpose | settlement + margin | fuel / toll / driver pay |

**`supplier_rate = 0` on mover rows is correct, not a bug.** The mover has no
sub-supplier. Any report that sums margin will over-count these unless it excludes them.

**Why `draft`?** From the RPC's own comment: draft is exempt from
`enforce_single_active_trip_per_driver`, so creating the mover row never fails when that
driver is already busy on the middleman's active trip. The Expense Hub and trip list key
off `source='mover_asset'`, not status, so it still renders normally.

### Verified pairing

All **17 of 17** mover rows in production are correctly paired. In every single case the
middleman's `supplier_rate` matches the mover's `client_price` to the rupee:

| Middleman → Mover | Client pays | Mover gets | Margin |
|---|---|---|---|
| AJIO → nihas logs | ₹96,000 | ₹81,500 | ₹14,500 |
| AJIO → nihas logs | ₹69,000 | ₹45,000 | ₹24,000 |
| Paperkraft → nihas logs | ₹70,000 | ₹67,000 | ₹3,000 |
| nihas logs → Paperkraft | ₹55,000 | ₹49,500 | ₹5,500 |
| ITS Logistics → PR logistics | ₹200,000 | ₹149,000 | ₹51,000 |

Note row 4 — nihas logs appears on **both sides** across different loads. Middleman on
some, mover on others. That's normal, and it's why `operating_model` is `HYBRID`.

**All five of these are PULL** (the mover bid and won). None came from the Deploy
wizard's Aggregate list. Row 4 is a good worked example, because its name collision is
exactly the trap §3 warns about:

> **IND091 / TRP091 + TRP047.** nihas created a ₹55,000 Ramco Cement load
> (Tiruvannamalai → Tenkasi). Paperkraft **quoted ₹49,500 and won it** — the bid already
> carried their driver *Mani* and truck *TN 11 HH 2580*. nihas awarded it; TRP091 was
> born in nihas's org with ₹5,500 margin. A day later TRP047 appeared in Paperkraft's
> org as the `mover_asset` half.
>
> Paperkraft **also sits in nihas's supplier dropdown**, so this trip is easy to misread
> as a push. It wasn't — `assigned_supplier_id` equals the trip's supplier, which is the
> pull signature. The giveaway: a real driver record came with the bid. A push would
> have left `driver_id` null.

### The two rows do NOT share a trip number

Each org numbers trips in its own sequence. The Ajio pair above is `TRP015` (nihas's
middleman row) and `TRP005` (the mover's row). **Do not try to match them by display
code.** Match on `source_indent_id`.

> Correction: an earlier note in this project claimed the two rows share a TRP code.
> They don't. Verified false against all 17 pairs.

---

## 5. How the mover row gets created

**It is not automatic.** No database trigger creates it.

It only appears when the app explicitly calls the RPC:

```
UI → createMoverAssetTrip()  →  public.create_mover_asset_trip
                             →  public._ensure_mover_asset_trip
```

Client-side entry point: [indentConversionService.ts:195](../features/indents/services/indentConversionService.ts#L195).

The RPC refuses to do anything unless all of these hold:

1. The indent exists
2. `assigned_supplier_id` is set — this identifies who the mover is
3. **A driver was supplied.** From the source: *"Only meaningful when the mover runs its
   own driver (asset execution)."* No driver → no row.
4. No row already exists for that (mover org, indent) — it's idempotent, safe to re-run

**Consequence worth knowing:** if that call fails, or the flow is entered by some other
path, the mover simply has no row. The middleman's side still looks complete. Nothing
alerts anyone. I have not verified whether every real-world path reaches this call.

---

## 6. Traps

### Mixed driver ownership is invisible

The Aggregate label keys off `supplier_id` alone. It never checks who owns the driver.

**Live data:** of 40 aggregate trips with a driver, **22 have a driver belonging to the
trip's own org**, not the supplier's. That's more than half.

All 22 display as plain "Aggregate". The app cannot currently tell you "my truck, their
driver" or any other mix. If that distinction matters commercially, it is **not
supported today** — this is a genuine gap, not a bug.

### Don't re-infer Asset from the shipper's trip

There's an explicit warning in
[driverUtils.util.ts:75](../features/drivers/utils/driverUtils.util.ts#L75) against an
old workaround that tried to guess Asset-ness for a supplier viewing a shipper's trip.
It made both tiles look identical and dumped movers on a screen with no expense entry.
The two-row design replaced it. Don't bring it back.

### The Expense Hub has never been used

The mover row exists so fuel, tolls and driver pay have somewhere to live. Platform-wide:

| Table | Rows |
|---|---|
| `trip_fuel_entries` | **0** |
| `trip_toll_entries` | **0** |
| `trip_other_expenses` | 5 — **none on a mover_asset trip** |

17 mover trips, zero expense entries. The feature is built and wired but **has never
been used by anyone in production.** Treat any claim about "movers logging fuel" as
aspirational.

### Posts and bids never become trips

`posts` (67) and `bids` (19, **0 accepted**) are a separate broadcast surface. **Zero**
trips exist with a source outside the three documented ones. This path dead-ends today.

Don't confuse the two bidding systems:

| Path | Table | Hangs off | Live |
|---|---|---|---|
| Direct circulation | `direct_quotes` | `indents` | ✅ produces trips |
| Broadcast feed | `bids` | `posts` | ❌ never has |

### Status has 24 accepted spellings

There is **no CHECK constraint** on `trips.status`, by design.
[tripPreservableStatuses.util.ts](../features/trips/utils/tripPreservableStatuses.util.ts)
lists 24 tolerated values — including `in_transit`, `in_progress`, `intransit` and
`transit` as four spellings of the same phase. The app normalises instead of enforcing.

**Do not "clean up" odd status values.** They're deliberate. The list exists so that
reassigning a driver mid-haul doesn't rewind the trip to `assigned`.

---

## 7. Quick reference

| Flow | Name | `source` | `supplier_id` | Kind | Rows |
|---|---|---|---|---|---|
| 1 | Local Trip | `manual` | empty | Asset | 1 |
| 2 | Awarded → Own Asset | `direct_quote` | empty | Asset | 1 |
| 3 | Awarded → Supplier | `direct_quote` | set | Aggregate | **2** |
| 3b | *(the mover's half of 3)* | `mover_asset` | empty | Asset | — |

`mover_asset` is **not a fourth flow**. It's the back half of flow 3, seen from the
supplier's side.

**Flow 3's two shapes** (see §3) — same row, different story:

| Shape | Who chose | Driver | `assigned_supplier_id` | Live count |
|---|---|---|---|---|
| **PULL** — they bid & won | you awarded | usually set | **= `supplier_id`** | 19 |
| **PUSH** — Deploy → Aggregate | you picked from your list | **null** | unrelated/absent | 0 |

### Useful queries

```sql
-- Find both halves of a two-row load
SELECT t.display_trip_id, o.name AS org, t.source,
       t.client_price, t.supplier_rate
FROM trips t
JOIN organizations o ON o.id = t.organization_id
WHERE coalesce(t.source_indent_id, t.indent_id) = $1
  AND t.deleted_at IS NULL;

-- PULL or PUSH? (did they win it, or did you hand it to them?)
SELECT t.display_trip_id,
       CASE WHEN s.linked_organization_id = i.assigned_supplier_id
            THEN 'PULL — they bid and won'
            ELSE 'PUSH — handed to your own partner' END AS shape
FROM trips t
JOIN indents i ON i.id = t.indent_id
LEFT JOIN suppliers s ON s.id = t.supplier_id
WHERE t.supplier_id IS NOT NULL
  AND t.deleted_at IS NULL;

-- Margin, excluding mover rows (which would double-count)
SELECT sum(client_price - supplier_rate) AS margin
FROM trips
WHERE organization_id = $1
  AND source <> 'mover_asset'
  AND deleted_at IS NULL;

-- Aggregate trips where the driver is actually ours (the hidden mix)
SELECT t.display_trip_id, d.name AS driver
FROM trips t
JOIN drivers d ON d.id = t.driver_id
WHERE t.organization_id = $1
  AND t.supplier_id IS NOT NULL
  AND d.organization_id = t.organization_id
  AND t.deleted_at IS NULL;

-- Middleman rows missing their mover half (possible gaps)
SELECT t.display_trip_id, t.client_name, t.supplier_rate
FROM trips t
WHERE t.supplier_id IS NOT NULL
  AND t.indent_id IS NOT NULL
  AND t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM trips m
    WHERE m.source_indent_id = t.indent_id
      AND m.source = 'mover_asset'
      AND m.deleted_at IS NULL
  );
```

---

## 8. Known unknowns

Stated plainly so nobody treats these as settled:

1. **Whether every flow-3 path actually creates the mover row.** The RPC is only called
   from one place. Other award paths may skip it silently. Not traced.
2. **Whether mixed driver/truck ownership is a real commercial need.** It occurs in 22
   live trips but may be incidental rather than intended.
3. **Why the Expense Hub was never adopted.** Built, wired, zero usage. Unknown if it was
   never launched, never trained, or abandoned.
4. **Deeper subcontracting** (mover passes to another mover) is **designed but not
   built** — see [aggregation-subcontract-flow-KNOWLEDGE.md](aggregation-subcontract-flow-KNOWLEDGE.md),
   marked *"Proposal only. Nothing implemented."* Today the sub-supplier can't even see
   the trip: `trip_subcontracts` RLS only admits `viewer_org_id`.
5. **Why the PUSH path has zero production trips.** The Deploy wizard's Aggregate branch
   is fully built and reachable, but 19 of 19 supplier-linked awarded trips are PULL.
   Unknown whether it's unused, used only in dev, or abandoned mid-rollout.
6. **Whether a PUSH creates a mover row at all.** The RPC requires a driver, and the
   Aggregate branch deliberately passes `driverId: null` — so on the face of it the
   partner gets **no** `mover_asset` row and no expense shell. Not tested, because no
   production PUSH trip exists to check. If the push path is ever adopted, verify this
   first.
7. **Whether PUSH and chained subcontracting are the same feature.** The Deploy wizard
   writes `trip_subcontracts`, which is also the table the chaining proposal builds on.
   Unclear whether the wizard is a first slice of that design or something separate.

---

## Related

- [docs/database/QUERY_GUIDE.md](database/QUERY_GUIDE.md) — schema, columns, FK map
- [docs/LOAD_INDENT_TRIP_FLOW.md](LOAD_INDENT_TRIP_FLOW.md) — who creates the trip
- [docs/aggregation-subcontract-flow-KNOWLEDGE.md](aggregation-subcontract-flow-KNOWLEDGE.md) — chaining proposal
- [docs/RBAC_OPERATING_MODEL.md](RBAC_OPERATING_MODEL.md) — asset/aggregate/hybrid roles
