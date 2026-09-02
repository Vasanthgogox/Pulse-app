# 05 — Technical Design

**Status:** Draft. **Not reconciled against the existing q-web schema** — see §9, which is the
first thing to fix.

---

## 1. Architecture

```
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│  Giver/Mover   │   │   Driver app   │   │ Supplier view  │
│   web (React)  │   │  (RN / Expo)   │   │   (web, thin)  │
└───────┬────────┘   └───────┬────────┘   └───────┬────────┘
        └──────────────┬─────┴────────────────────┘
                       │ HTTPS + JWT
        ┌──────────────▼──────────────┐
        │  Postgres (Supabase)        │
        │  • RLS = security boundary  │
        │  • RPC fns for transactions │
        │  • party-scoped views       │
        └──────┬───────────────┬──────┘
               │               │
     ┌─────────▼──────┐  ┌─────▼──────────┐
     │ Edge Functions │  │ Object storage │
     │ notify, brief  │  │ POD (private)  │
     │ build, audit   │  └────────────────┘
     └────────────────┘
```

**Deliberate choice:** authorization lives in RLS, not in application middleware. Three
clients plus future integrations means an app-layer-only check will be bypassed eventually.
The cost is that RLS policies are harder to read, harder to test, and can hurt query plans —
accepted, mitigated by §8.

---

## 2. Multi-tenancy

- Single database, shared schema, `org_id` on every tenant table.
- **Not** schema-per-tenant: hundreds of SME tenants makes migrations untenable.
- Isolation via RLS keyed on JWT claims.

JWT custom claims (set by an auth hook on login):
```json
{ "sub": "...", "org_memberships": [ { "org_id": "...", "roles": ["OPS_MANAGER"] } ],
  "active_org_id": "...", "platform_role": null }
```

**Risk:** claims go stale — a revoked role stays valid until the token refreshes. Mitigation:
short access-token TTL (≤15 min) and a `membership_version` claim checked against the DB for
destructive operations. **[ASSUMPTION — CONFIRM]** acceptable staleness window.

Helper functions, `STABLE` and used by every policy:
```sql
auth_org_ids()        -- uuid[]  orgs the caller belongs to
auth_has_role(org, r) -- boolean
trip_party(trip_id)   -- enum GIVER|OPERATOR|RESOURCE_SUPPLIER|ASSIGNED_DRIVER|PLATFORM|NONE
```
`trip_party` is the single derivation point for `04` §2. Nothing else may re-derive it.

---

## 3. Schema

Illustrative, not final. Timestamps are `timestamptz`. All tables have
`created_at/created_by/updated_at`.

```sql
-- ── Tenancy ──────────────────────────────────────────────────
organizations (id pk, legal_name, display_name, status, kyc_status,
               subcontracting_disclosure, created_at)

org_capabilities (org_id fk, capability, enabled_at,
                  primary key (org_id, capability))
  -- capability: LOAD_GIVER | LOAD_MOVER | RESOURCE_SUPPLIER

users (id pk = auth.users.id, full_name, phone, email)

org_members (id pk, org_id fk, user_id fk, status,
             unique (org_id, user_id))
org_member_roles (org_member_id fk, role,
                  primary key (org_member_id, role))
  -- roles are a SET, not a column. A user can be DISPATCHER + FLEET_MANAGER.

org_connections (id pk, from_org_id, to_org_id, kind, status,
                 unique (from_org_id, to_org_id, kind))
  -- kind: TRADE (giver<->mover) | SUPPLY (mover<->supplier)
  -- status: PENDING | ACTIVE | REVOKED

-- ── Resources ────────────────────────────────────────────────
trucks (id pk, org_id fk, registration_no, vehicle_type, capacity_kg,
        is_external, external_supplier_org_id fk null, status,
        unique (org_id, registration_no))

drivers (id pk, org_id fk, full_name, phone, licence_no, licence_expiry,
         user_id fk null, is_external, external_supplier_org_id fk null, status,
         unique (org_id, phone))
  -- is_external + external_supplier_org_id implement Model B (see 02 §4).
  -- If D1 chooses Model A, DROP these two columns and rely on org_id + org_connections.
  -- This is the migration that hurts. Decide before R3.

-- ── Commercial ───────────────────────────────────────────────
loads (id pk, giver_org_id fk, reference_no, status,
       pickup_address jsonb, pickup_city, pickup_pincode,
       delivery_address jsonb, delivery_city, delivery_pincode,
       pickup_window_start, pickup_window_end,
       material_description, material_class, declared_value,
       quantity_value, quantity_unit, vehicle_type_required,
       target_rate, special_instructions, published_at, awarded_at)
  -- coarse (city/pincode) and precise (jsonb) location are SEPARATE COLUMNS so the
  -- pre-award view can select coarse without any risk of leaking precise.

bids (id pk, load_id fk, mover_org_id fk, version, status,
      amount, currency, vehicle_type, eta_pickup, eta_delivery, remarks,
      submitted_at, unique (load_id, mover_org_id, version))

-- exactly one AWARDED bid per load, enforced in the DB not the app:
create unique index one_award_per_load
  on bids (load_id) where status = 'AWARDED';

awards (id pk, load_id fk unique, bid_id fk null, operator_org_id fk,
        award_type, agreed_amount, awarded_by, awarded_at)
  -- award_type: BID | DIRECT   (DIRECT => bid_id null, for R1)

-- ── Execution ────────────────────────────────────────────────
trips (id pk, award_id fk unique, load_id fk, giver_org_id fk,
       operator_org_id fk, reference_no, status,
       deployed_at, delivered_at, closed_at)
  -- giver_org_id is DENORMALISED from load. Deliberate: every RLS policy on trips and
  -- trip_events needs it, and joining through award->load in a policy is a measurable
  -- planner problem. Enforced by trigger.

trip_assignments (id pk, trip_id fk, status,
       truck_id fk, truck_owner_org_id fk, truck_source,
       driver_id fk, driver_owner_org_id fk, driver_source,
       supplier_rate_truck, supplier_rate_driver,
       assigned_by, assigned_at, replaced_by_assignment_id fk null)
  -- *_source: OWN | AGGREGATED, computed vs trips.operator_org_id, enforced by trigger.
  -- Truck and driver ownership are tracked SEPARATELY -> all four combos fall out for free.
  -- Never UPDATE. Reassignment = insert new + set old status REPLACED.

create unique index one_active_assignment_per_trip
  on trip_assignments (trip_id) where status = 'ACTIVE';

trip_events (id pk, trip_id fk, event_type, occurred_at, recorded_at,
             actor_user_id, actor_org_id, source,
             latitude, longitude, accuracy_m,
             payload jsonb, client_event_id, supersedes_event_id fk null,
             unique (trip_id, client_event_id))
  -- APPEND ONLY. No update, no delete grant to any role.
  -- occurred_at = device time; recorded_at = server time. Both kept; they disagree in reality.
  -- client_event_id makes offline replay idempotent. This is what makes the driver app work.

pods (id pk, trip_id fk, version, receiver_name, receiver_phone, remarks,
      uploaded_by, uploaded_at, status)
pod_files (id pk, pod_id fk, storage_path, mime_type, size_bytes, checksum)

assignment_briefs (id pk, trip_assignment_id fk, supplier_org_id fk,
       brief_ref, operator_org_name, report_city, report_area, report_landmark,
       report_by_at, drop_city, material_class, agreed_rate, payment_terms,
       leg_status, created_at)
  -- SEPARATE TABLE, not a view over trips. The whitelist is the schema.
  -- No trip_id column. The supplier can never traverse to the trip.

-- ── Platform ─────────────────────────────────────────────────
support_grants (id pk, platform_user_id, target_org_id, scope, reason,
                granted_by, granted_at, expires_at)
support_access_log (id pk, grant_id fk, platform_user_id, target_org_id,
                    object_type, object_id, action, at)
notifications (id pk, recipient_user_id, org_id, channel, template_key,
               dedup_key unique, payload jsonb, status, sent_at)
```

### Why `assignment_briefs` is a table, not a view

A view over `trips` puts the supplier one column-addition away from a leak: the next developer
adds `consignee_phone` to the trip view for a Giver feature, forgets the supplier variant, and
we've leaked. A physically separate table with no FK to `trips` makes leaking require writing
new code on purpose. Cost: the brief must be built and kept in sync by a trigger/function, and
it can drift. Accepted — drift is a correctness bug, a leak is a commercial incident.

---

## 4. Trip status is derived, not set

The linear state machine in `02` will be violated by reality. So:

- `trip_events` is the source of truth.
- `trips.status` is a **materialised derivation**: highest milestone rank reached, unless
  `CANCELLED`/`CLOSED` (explicit terminal states).
- Milestone ranks: `ACCEPTED 10, AT_PICKUP 20, LOADED 30, IN_TRANSIT 40, AT_DELIVERY 50, DELIVERED 60`.
- Out-of-order or skipped events are **accepted**, recorded, and flagged (`SKIPPED_MILESTONE`)
  for ops — not rejected.

This is the single most important design decision for driver adoption. Strict transition
validation on the driver's write path guarantees they abandon the app the first time it says
"you cannot do that".

Exceptions are events, never states — a broken-down truck is still `IN_TRANSIT` with an
exception attached.

---

## 5. Critical transactions

Must be single Postgres functions (`SECURITY DEFINER`, explicit `search_path`), not multi-call
client orchestration.

**`award_load(load_id, bid_id, actor)`**
1. lock the load `FOR UPDATE`
2. assert `status = PUBLISHED`, caller is GIVER with `OPS_MANAGER`
3. bid → `AWARDED`; siblings → `NOT_SELECTED`
4. insert `award`; load → `AWARDED`
5. insert `trip` (`CREATED`)
6. enqueue notifications
Partial unique index `one_award_per_load` is the real guard against the concurrent-award race.

**`assign_resources(trip_id, truck_id, driver_id, actor)`**
Validates supplier links, derives `*_source` and owner orgs, sets prior assignment `REPLACED`,
inserts new `ACTIVE`, and inserts/updates `assignment_briefs` for any aggregated resource.

**`record_trip_event(trip_id, client_event_id, type, occurred_at, payload)`**
Idempotent on `(trip_id, client_event_id)`. Appends, recomputes derived status, enqueues
notifications, updates the relevant `assignment_briefs.leg_status`. Never rejects on ordering.

---

## 6. RLS sketch

```sql
alter table trips enable row level security;

create policy trips_read on trips for select using (
  giver_org_id    = any (auth_org_ids())
  or operator_org_id = any (auth_org_ids())
  or exists (                       -- assigned driver, own trips only
    select 1 from trip_assignments a join drivers d on d.id = a.driver_id
    where a.trip_id = trips.id and a.status = 'ACTIVE' and d.user_id = auth.uid()
  )
);
-- NOTE: resource-supplier orgs are ABSENT from this policy on purpose.
-- Suppliers read assignment_briefs. They have no path to trips.

create policy briefs_read on assignment_briefs for select using (
  supplier_org_id = any (auth_org_ids())
  or exists (select 1 from trip_assignments a
             where a.id = assignment_briefs.trip_assignment_id
               and a.trip_id in (select id from trips
                                 where operator_org_id = any (auth_org_ids())))
);

create policy bids_read on bids for select using (
  mover_org_id = any (auth_org_ids())                       -- own bids
  or exists (select 1 from loads l where l.id = bids.load_id -- giver sees bids on own loads
             and l.giver_org_id = any (auth_org_ids()))
);
-- No policy grants any org sight of a competitor's bid. There is no such read path.

-- trip_events: no update/delete policy exists for any role. Append only.
```

**Indexes required by these policies** (RLS predicates are query predicates):
`trips(giver_org_id)`, `trips(operator_org_id)`, `trip_assignments(trip_id) where status='ACTIVE'`,
`drivers(user_id)`, `bids(load_id)`, `bids(mover_org_id)`, `trip_events(trip_id, occurred_at)`,
`assignment_briefs(supplier_org_id)`.

---

## 7. API surface

Prefer Postgres RPC for anything transactional; REST/PostgREST for reads through
party-scoped views.

| Method | Path | Party | Notes |
|---|---|---|---|
| POST | `/loads` | GIVER | |
| POST | `/loads/:id/publish` | GIVER | |
| GET | `/loads/open` | MOVER | coarse locations only, via `v_loads_for_movers` |
| POST | `/bids` | MOVER | idempotency key required |
| POST | `/rpc/award_load` | GIVER | txn, §5 |
| POST | `/rpc/direct_award` | GIVER | R1 |
| POST | `/rpc/assign_resources` | OPERATOR | txn |
| POST | `/trips/:id/deploy` | OPERATOR | |
| GET | `/driver/trips` | DRIVER | own active trips only |
| POST | `/rpc/record_trip_event` | DRIVER | idempotent on `client_event_id` |
| POST | `/trips/:id/pod` | DRIVER | multipart, idempotency key |
| GET | `/supplier/briefs` | SUPPLIER | `assignment_briefs` only — no trip endpoint exists |

Conventions: `404` (not `403`) for objects the caller may not know exist; `409` for state
conflicts with the current state in the body; every mutating endpoint takes an idempotency key.

---

## 8. Testing the security model

Positive tests do not catch leaks. Required:

1. **Party fixture matrix** — one seeded scenario with Giver A, Mover B, Supplier C, drivers
   from B and C, plus uninvolved Org D and losing bidder E.
2. **Field-level leak test** — enumerate every column of `trips`, `loads`, `bids`,
   `trip_events`, `pods` via introspection; for each × each party, assert the expected
   allow/deny from `04`. **A new column with no assertion fails the build.** This is the
   mechanism that keeps `04` true over time.
3. **Negative endpoint suite** — every endpoint called by every wrong party.
4. **RLS-on assertion** — every table in the tenant schema has RLS enabled and ≥1 policy.
5. **Offline replay tests** — duplicate `client_event_id`, out-of-order arrival, 48h-stale
   events, POD retry.

Release gate: 2, 3 and 4 green. No exceptions, including for hotfixes.

---

## 9. Reconciliation with existing q-web — DO THIS FIRST

The repo already contains `features/clients`, `features/suppliers`, `features/connections`,
`features/network`, `features/finance`, and a `lib/database.types.ts`. There is a
`lib/sameOrgPartyGuard.ts` (untracked) which suggests same-org party guarding is already an
active concern.

**This design was written without reading that schema.** Before any of it is built:

1. Diff `organizations` / `org_members` / connections here against what exists. Almost
   certainly reuse rather than create.
2. Determine whether existing `clients` / `suppliers` are the same concept as
   `org_connections(kind=TRADE|SUPPLY)`. If yes, do not add a parallel table.
3. Check whether `finance` already models rates/settlement — the PRD declares settlement out
   of scope, which may contradict what's already there.
4. Confirm whether existing tables have RLS at all, and to what standard.

**Effort for this reconciliation is not in the delivery plan and could be substantial.** A
greenfield design dropped into a live codebase is where estimates go to die.
