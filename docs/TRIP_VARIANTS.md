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

The only thing that makes this confusing: **flow 3 creates two database rows, not one.**
Everything strange about the schema comes back to that. See §4.

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

### Useful queries

```sql
-- Find both halves of a two-row load
SELECT t.display_trip_id, o.name AS org, t.source,
       t.client_price, t.supplier_rate
FROM trips t
JOIN organizations o ON o.id = t.organization_id
WHERE coalesce(t.source_indent_id, t.indent_id) = $1
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

---

## Related

- [docs/database/QUERY_GUIDE.md](database/QUERY_GUIDE.md) — schema, columns, FK map
- [docs/LOAD_INDENT_TRIP_FLOW.md](LOAD_INDENT_TRIP_FLOW.md) — who creates the trip
- [docs/aggregation-subcontract-flow-KNOWLEDGE.md](aggregation-subcontract-flow-KNOWLEDGE.md) — chaining proposal
- [docs/RBAC_OPERATING_MODEL.md](RBAC_OPERATING_MODEL.md) — asset/aggregate/hybrid roles
