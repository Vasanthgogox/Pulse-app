# Technical Design Document v2 — Trip Financial Lifecycle Domain (Pulse / q-web)

**Status:** Design v2 — resolves hostile review findings from v1. For Staff + Codex re-review.
**Owner:** Finance Platform
**Scope:** Same as v1 — creation → pricing → adjustment → invoicing → payment collection → driver settlement → supplier settlement → closure.
**Changelog vs v1:** v1 was reviewed by an independent adversarial Principal Engineer pass and rejected — see `docs/TRIP_FINANCIAL_LIFECYCLE_TDD_REVIEW_V1.md` (findings F1–F25). This version resolves every Critical and High finding. Resolution details are inline per section, with a full matrix in the companion review-resolution document.

---

## 0. Preamble: Governing Constraints

### 0.1 Relationship to CORE_ACCOUNTING_MODEL.md

Unchanged from v1 — still governed by `docs/CORE_ACCOUNTING_MODEL.md`: `transactions` remains the single-entry ledger surface, double-entry is enforced in application code (`accountingModel.ts`), balances are derived not stored, and the Finance UI layout is untouched.

**v2 amendment (resolves F10, F17):** the "balance always derived, never stored" rule (CORE_ACCOUNTING_MODEL §7/§8) is now applied **without exception** to `trips` money fields. v1 stored `adjusted_sale`/`adjusted_cost`/`margin` directly on `trips` and called this "a read model column" — the reviewer correctly identified this as a stored balance in violation of the very doc this TDD claims to obey. **v2 removes all three from `trips`.** They exist only in the `v_trip_finance` view (§3.12), computed live from `transactions` + `trip_finance_adjustments` + `trip_subcontracts`. `trips` retains only `payment_status` and `settlement_status` as recompute-*validated* denormalized flags (not derived numeric snapshots) — see §3.1 for why these two are the sole exception and how they stay honest.

### 0.2 The confirmed production defects (unchanged, D1–D12)

Unchanged from v1 — see the table below, still grounded in TRP003/TRP001.

| # | Defect |
|---|--------|
| D1 | `payment_status` structurally dead. |
| D2 | Payment capture is two non-transactional writes; nothing writes `payment_status`. |
| D3 | `amount_paid <= client_price` CHECK is blind to adjustments. |
| D4 | `updateTripPayment()` dead direct-write landmine. |
| D5 | `trips.margin` generated column ignores adjustments/subcontracts. |
| D6 | `trip_finance_adjustments` has no recompute hook; `created_by` nullable. |
| D7 | 4 independent trip-creation RPCs. |
| D8 | Driver payout: 4 manual UI paths, no idempotency. |
| D9 | No supplier-payout table; `trip_subcontracts.rate` disconnected. |
| D10 | Two parallel invoicing systems; non-sequential fallback breaks GST. |
| D11 | No persisted settlement state. |
| D12 | Two overlapping vehicle-ledger tables. |

### 0.3 Corrections to v1's claims about the live schema (resolves F1, F2, F4, F5, F19, F20)

The hostile review found that v1 **misdescribed tables it was designing against**. These are corrected here as binding facts for the rest of this document:

1. **`trip_workflow_events` is NOT dormant.** It already has `id, trip_id, org_id (not "org"), actor_id, event_type, payload jsonb, created_at, idempotency_key` (migrations `20260801170000`, `20260801180000`), a partial unique index on `idempotency_key`, an `AFTER INSERT` `pg_notify` trigger, an `AFTER UPDATE ON trips` trigger (`trg_log_trip_completed`) that auto-inserts a `trip.completed` event, and an **existing event vocabulary**: `trip.completed`, `pod.uploaded`, `invoice.generated`, `supplier.paid`, `supplier.payment_recorded`, `client.receipt_sent`, `client.payment_received`. v2 does not add new columns to this table — it **extends the vocabulary** and **reuses the existing idempotency_key** (§3.9, §6.1).
2. **`driver_ledger` has a driver-self-insert RLS policy** (`20250324120000_driver_ledger_driver_settlement_insert.sql`): a row with `type='settlement'` can be inserted directly by the driver's own `auth.uid()` via the `drivers.user_id` link, entirely outside any org-member-gated RPC. v1's design never accounted for this second write principal. v2's driver-settlement design (§4.5, §6.1) explicitly incorporates it.
3. **`trips` currently has 13 live triggers**, not "a couple." Verified inventory: `set_trips_updated_at` (BEFORE UPDATE), `trips_sync_driver_vehicle_display` (BEFORE UPDATE OF driver_id, vehicle_id), `trg_trip_status_to_chat` (AFTER INSERT/UPDATE OF status), `trg_enforce_single_active_trip_per_driver` (BEFORE INSERT/UPDATE), `trg_assign_driver_display_trip_id` (BEFORE INSERT/UPDATE OF driver_id), `trg_log_trip_completed` (AFTER UPDATE), `trg_set_trip_number` (BEFORE INSERT), `trg_set_trip_operational_code` (BEFORE INSERT), `trg_sync_trip_room_on_trip_update` (AFTER UPDATE OF driver_id, client_id, supplier_id, organization_id), `trg_trip_status_audit` (AFTER UPDATE), `trips_set_booking_ref` (BEFORE INSERT), `trg_set_supplier_trip_sequence` (BEFORE INSERT), `trg_fill_driver_commission` (BEFORE UPDATE, WHEN NEW.status='completed'). **None of the 13 currently perform a self-referential `UPDATE trips`.** This TDD's own new trigger (§3.1) is analyzed against this real baseline in §6.7.
4. **`pg_cron` is already active** in this project (multiple migrations schedule jobs against it) — v1's reviewer flagged this as an unconfirmed dependency; it is confirmed available, so `reconcile_trip_finance` (§6.3) can rely on it without a new-extension request.
5. **The existing `SUM(amount_in)` in `syncTripAmountPaidFromLedger` has no `contact_type` filter** — it sums all inflows regardless of counterparty. v1 called adding a `contact_type='client'` filter (INV-T1) a "preservation" of this logic; it is a **semantic change** that restates historical `amount_paid` for any trip with non-client inflows. v2 treats this explicitly as a **data-correction migration requiring finance sign-off**, not a side effect of a bug fix (§7 Phase B, §11 R2).
6. **`is_org_member(org_id uuid)`** is the correct, already-hardened pattern to follow: `SECURITY DEFINER`, `STABLE`, `SET search_path=''`, and internally schema-qualifies every reference (`public.organization_members`). **All new functions in this TDD MUST follow this exact pattern** — `SET search_path=''` (not `search_path=public` as v1 incorrectly specified in §6), with every table reference schema-qualified (`public.trips`, not `trips`).

---

## 1. Executive Summary

### 1.1 Current architecture
Unchanged from v1 (§1.1) — still accurate, no review findings against this section.

### 1.2 Core problems
Unchanged from v1 (§1.2).

### 1.3 Target architecture (v2 revision)

- **`recompute_trip_finance(trip_id)`** is now a **read-only validation/derivation function**, not a writer of stored numeric snapshots. It computes `adjusted_sale`/`adjusted_cost`/`margin` on demand (or the caller reads `v_trip_finance`) and writes **only** `trips.payment_status` and `trips.settlement_status` — two small enum flags, not derived money amounts. This resolves F10/F17 (stored-balance violation) while keeping O(1) reads for the two fields UIs poll most.
- **`post_financial_event(...)`** is now specified with an explicit **locking and isolation strategy** (`SELECT ... FOR UPDATE` on the trip row, `READ COMMITTED` with row-lock serialization — §6.1), a **server-issued idempotency key with defined provenance** (§6.1a), and **mandatory cross-tenant validation** of every party ID against the org (§6.1b). This resolves F3 (cross-tenant injection), F6 (idempotency provenance), F8 (concurrency).
- **Driver settlement now has one authorization model covering both principals**: org-member (dispatcher/finance) via the RPC, and the driver themself via a narrower RPC that wraps the existing RLS-permitted self-insert path with the same idempotency and validation logic (§4.5, §6.1c). This resolves F2 (dual-auth gap).
- **`invoices.trip_ids` array-membership uniqueness is replaced by a junction table** `invoice_trips(invoice_id, trip_id)` with a `UNIQUE(trip_id) WHERE <parent invoice not void>` partial constraint, closing the double-invoice race (F9).
- **The overcollection CHECK constraint is never dropped without a same-migration replacement CHECK** — v2 keeps a hard DB-enforced ceiling at all times (a `CHECK` referencing a maintained `trips.payment_status` is not possible directly in Postgres across tables, so v2 uses a **`BEFORE INSERT` trigger on `transactions` that raises**, not an eventually-consistent recompute-time flag) — see §3.1/§6.1 (resolves F7).
- **Settlement is modeled as four independent leg rows**, not one row with four columns, eliminating single-row contention (F11).
- **`trip_workflow_events` is reused as-is**; new event types are added to the existing vocabulary and the existing `idempotency_key` scheme is extended, not duplicated (F1, F19, F20).

### 1.4 Success criteria (v2 additions)

| Criterion | Measurable outcome |
|-----------|--------------------|
| SC1–SC7 | Unchanged from v1. |
| SC8 *(new)* | Every `post_financial_event` call validates `contact_id ∈ org_id` and `contact` matches the trip's counterparty before any write; a cross-tenant attempt is rejected with a distinct error code and logged. |
| SC9 *(new)* | Driver self-settlement via the app and org-member settlement via Finance UI both go through the same validation/idempotency path; no direct unguarded INSERT into `driver_ledger` remains reachable from the client. |
| SC10 *(new)* | A trip can never appear on two non-void invoices, enforced by a DB constraint, not application logic. |
| SC11 *(new)* | No new trigger recursion is introduced onto `trips`; the new price-change trigger is proven not to re-enter itself against the 13 existing triggers. |

---

## 2. Domain Model (v2 revisions only — all other entities unchanged from v1)

### 2.1 Trip (revised)
- **Invariants (revised):**
  - INV-T1: `amount_paid` is **not stored on `trips`**. It is `v_trip_finance.amount_paid = SUM(transactions.amount_in) WHERE contact_type='client' AND trip_id=t.id`. *(F10 fix — no stored balance.)*
  - INV-T2: `adjusted_sale`/`adjusted_cost` are **view-only** (`v_trip_finance`), never columns on `trips`. *(F10 fix.)*
  - INV-T3: `trips.payment_status` and `trips.settlement_status` ARE stored (they are small enums, not money amounts) but are **write-once-per-transition, validated against a fresh read of `v_trip_finance` inside the same transaction that sets them** — never trusted as a cache that can silently drift, because every write path that could change the underlying numbers (`post_financial_event`, adjustment trigger) re-derives and re-validates them atomically before persisting. This is the one narrow, justified exception to "never store a derived value": these two enums are cheap to keep exactly correct because they're written by exactly one code path (§6.2), never read-modify-write from a stale snapshot.

### 2.6 Driver (revised — resolves F2)
- **Business rules (revised):** Two authorization principals now formally exist and are both routed through validation:
  1. **Org-member path**: dispatcher/finance settles a driver via `post_financial_event('DRIVER_SETTLED', ...)`, gated by `is_org_member(p_org_id)`.
  2. **Driver-self path**: the driver's own app calls a narrower wrapper, `driver_self_settle(p_trip_id, p_amount, p_idempotency_key)`, `SECURITY DEFINER`, which internally re-validates `EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = <trip's driver_id> AND d.user_id = auth.uid())` (the same predicate as the existing RLS policy `20250324120000`) **and then calls the same internal settlement logic as the org-member path** — same idempotency unique index, same expected-commission tolerance check, same workflow event. The old bare RLS INSERT policy on `driver_ledger` for `type='settlement'` is **revoked in the same PR** that ships `driver_self_settle` (§7 Phase C, §12 PR4), so there is exactly one write path per principal and neither can bypass validation. *(Resolves F2 — SC9.)*

### 2.11 Settlement (revised — resolves F11)
- **Purpose (revised):** Persist per-leg terminal state. **v2 uses one row per (trip, leg), not one row per trip with four leg columns.**
- **New table `trip_settlement_legs`:**
  - `id uuid PK`, `trip_id uuid NOT NULL REFERENCES trips(id)`, `leg text NOT NULL CHECK (leg IN ('customer','driver','supplier','invoice'))`, `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','settled','reversed'))`, `updated_at timestamptz`.
  - `UNIQUE(trip_id, leg)` — exactly one row per applicable leg, each independently updatable with its own row lock. Eliminates the single-row contention the reviewer flagged (four concurrent leg updates on one trip no longer serialize against each other unless they touch the same leg).
  - Rows are only created for applicable legs (asset trips never get a `supplier` row; aggregation trips never get a `driver` row) — this directly encodes INV-SET1 structurally instead of via an `IF` in application code.

---

## 3. Database Redesign (v2 revisions)

### 3.1 `trips` **[extend]** — v2 revision (resolves F7, F10, F16, F21)

**v1 stored `adjusted_sale`, `adjusted_cost`, `margin` on `trips`. v2 removes all three.** `trips` gains only:

| Column | Type | Notes |
|--------|------|-------|
| `payment_status` | text | CHECK `IN ('unpaid','partial','paid','overpaid')`. Written only by `recompute_trip_finance` (§6.2), inside the same transaction as the triggering event — never independently stale. |
| `settlement_status` | text NOT NULL DEFAULT `'open'` | CHECK `IN ('open','ready_to_close','closed','cancelled')`. Same write discipline. |

**No `adjusted_sale`/`adjusted_cost`/`margin` columns.** These live only in `v_trip_finance` (§3.12).

**Constraint strategy (resolves F7 — "never drop the CHECK and swap the write path in one phase"):**
v1 proposed dropping the blind `amount_paid <= client_price` CHECK and replacing it with a "trigger-based guard" that could be bypassed by direct writes/backfills. v2 rejects that pattern. Instead:
- **The overcollection guard is a `BEFORE INSERT` trigger *on `transactions`* (`tr_transactions_enforce_receivable_ceiling`), not a deferred recompute check.** Because Postgres CHECK constraints cannot reference other tables, the equivalent hard-enforcement mechanism on this schema is a `BEFORE INSERT` trigger that runs `RAISE EXCEPTION` synchronously in the same statement as the attempted insert — functionally equivalent to a CHECK (it cannot be skipped by any caller including `psql`/backfill scripts unless they explicitly `SET session_replication_role = replica`, which is an audited, privileged operation, not an accidental app-code path).
- The trigger computes `v_trip_finance.adjusted_sale` for the trip **inside the same transaction** and rejects the insert if `existing amount_paid + NEW.amount_in > adjusted_sale`, unless `NEW.source_type = 'justified_overcollection'` (an explicit, distinct source_type — not a boolean flag hidden in jsonb metadata, so it is auditable via a simple `WHERE source_type = 'justified_overcollection'` query).
- The **old blind `CHECK (amount_paid <= client_price)` on `trips` is dropped only after the new trigger is live and has run in production for one full release with zero rejections on a shadow/report-only pass** (§7 Phase B). There is no phase where neither guard is active.

### 3.2 `transactions` **[extend]** — v2 revision (resolves F6)

Same new columns as v1 (`source_type`, `source_id`, `reversal_of`), **plus**:

| Column | Type | Notes |
|--------|------|-------|
| `idempotency_key` | text | **Server-generated**, not client-supplied. See §6.1a for provenance. |

**Idempotency index (revised, resolves F6/F12 — manual-entry gap and partial-null exemption):**
- v1's `UNIQUE(org, flow_type, source_type, source_id) WHERE source_id IS NOT NULL` exempted manual UI entries (`source_id NULL`) — exactly the highest-volume, least-guarded write. v2 replaces this with:
- `UNIQUE (idempotency_key)` — a single global partial-unique index `WHERE idempotency_key IS NOT NULL`.
- **Every system-posted entry (via `post_financial_event`) gets a server-generated key.** Manual UI entries (a bookkeeper typing in a cash receipt with no upstream event) **also get a key**, generated as `md5(org_id || contact_id || trip_id || amount_in || amount_out || date_trunc('minute', now()))` — a coarse per-minute fingerprint that catches the realistic manual-entry failure mode (accidental double-submit of the same form within the same UI session) without being so strict it blocks two genuinely-distinct manual entries of the same amount on the same day. This closes the "manual entries are exempt" gap while not being falsely restrictive. *(Resolves F6, F12.)*

### 3.3 `driver_ledger` **[extend]** — v2 revision (resolves F11 constraint contradiction)

v1's `UNIQUE(org, driver, trip, type) WHERE type='settlement' AND reversal_of IS NULL` **forbade partial settlements**, directly contradicting the settlement state machine (§5.4) which allows `partial`. v2 fixes this:

- **New idempotency model:** `idempotency_key` column (same provenance as `transactions`, §6.1a), `UNIQUE(idempotency_key) WHERE idempotency_key IS NOT NULL`.
- **Partial settlements are multiple rows**, each with its own idempotency key (one per settlement *attempt*, not one per trip). Double-submission of the *same* settlement attempt (e.g., a retried network call) is caught by the idempotency key; a *second, legitimate, additional* partial payment is a new key and is allowed, correctly matching §5.4.
- **Full-vs-partial is derived, not constrained.** Whether a trip's driver leg is `settled` vs `partial` is computed by `trip_settlement_legs` (§2.11) comparing `Σ driver_ledger.amount` to the expected commission — not enforced by a single-row uniqueness constraint that can't distinguish "duplicate" from "second installment."

### 3.4 `trip_finance_adjustments` **[extend]** — unchanged from v1 (`created_by NOT NULL`, `tr_tfa_recompute` trigger). No review findings against this table specifically beyond the general recursion analysis (§6.7).

### 3.5 `invoices` **[keep]** + `invoice_line_items` **[new]** + `invoice_trips` **[new — resolves F9]**

**v1 relied on `invoices.trip_ids uuid[]` plus an application-level "check no trip already invoiced" query with no DB-level uniqueness — a race where two concurrent `issue_invoice_v2` calls could both pass the check and double-invoice the same trip.**

v2 adds a junction table:

```
invoice_trips (
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  trip_id     uuid NOT NULL REFERENCES trips(id),
  PRIMARY KEY (invoice_id, trip_id)
)
```

- **`UNIQUE INDEX invoice_trips_trip_unique ON invoice_trips(trip_id) WHERE invoice_id IN (SELECT id FROM invoices WHERE status <> 'void')`** — a trip can appear in at most one *non-void* invoice, enforced by Postgres, not application logic. A concurrent second `issue_invoice_v2` call attempting to invoice the same trip gets a `23505` unique-violation from the database itself, not a race-losing application check. *(Resolves F9 — SC10.)*
- `invoices.trip_ids uuid[]` is kept **read-only, generated from `invoice_trips` via a trigger**, purely for backward-compatible reads by any code that hasn't migrated off it yet; it is never the write path or the uniqueness source, and is dropped once no readers remain (Phase D).

### 3.6–3.8 `invoice_sequences`, `supplier_bills`, `trip_subcontracts` — unchanged from v1.

### 3.9 `trip_workflow_events` **[reuse existing schema — resolves F1, F19, F20]**

**v1 claimed this table needed new columns (`event_type`, `actor_id`, etc.) and was "dormant." Both claims are false — corrected in §0.3.** v2 makes **no schema change** to this table beyond what already exists. Instead:

- **New event types are added to the existing `event_type text` column's informal vocabulary** (it has no CHECK constraint, so this is additive by convention, documented in a comment update to the migration): `sale.booked`, `payment.collected`, `adjustment.posted`, `driver.settled`, `supplier.settled`, `trip.closed`, `trip.reopened`, `finance.discrepancy_detected` — namespaced with dots to match the existing style (`trip.completed`, `pod.uploaded`), not the v1 SCREAMING_CASE style, for consistency with what's already in production.
- **Idempotency reuses the existing `idempotency_key` column and its existing partial unique index** (`20260801180000`). For single-occurrence events per trip (e.g., `sale.booked`), the key is `{trip_id}:{event_type}`, matching the existing backfilled pattern exactly. For multi-occurrence events (`payment.collected`, since a trip can be paid in installments), `idempotency_key` is left NULL (matching the existing documented convention: "Multi-occurrence events... leave it NULL") and de-duplication for those instead relies on the `transactions.idempotency_key` of the underlying ledger row (§3.2), which the workflow event's `payload` references by ID.
- `amount`, `before_state`/`after_state` are **not new columns** — they are stored inside the existing `payload jsonb` column, exactly as `trg_log_trip_completed` already does (`jsonb_build_object('client_price', ..., 'completed_at', ...)`). This matches the established convention instead of inventing a parallel one. *(Resolves F1, F19, F20.)*

### 3.10 `trip_status_audit` — unchanged.

### 3.11 Vehicle ledger consolidation — v2 revision (resolves the "undercounted blast radius" finding)

v1 said "two overlapping tables, collapse one into the other" and scoped it as a single PR. **Verified**: at least five migrations touch `vehicle_ledger_entries`/`vehicle_operation_ledger_entries` (base tables, an operations posting engine, a manual-adjustment path, and a backfill). v2 re-scopes this as its **own independent project**, explicitly pulled out of this TDD's PR sequence (§12) into a separate design doc — it is not gated on, or blocking, any of the Trip Financial Lifecycle fixes, since neither table is in the direct D1–D12 defect chain. Listed here only so it isn't silently dropped, not as an in-scope deliverable.

### 3.12 Read models / views **[new]** — v2 revision

- **`v_trip_finance`** — now the **sole source** of `adjusted_sale`, `adjusted_cost`, `margin`, `outstanding` (none of these are stored anywhere). One row per trip:
  ```sql
  CREATE VIEW v_trip_finance AS
  SELECT
    t.id AS trip_id,
    t.client_price,
    t.client_price
      + COALESCE(SUM(tfa.amount) FILTER (WHERE tfa.type='revenue' AND tfa.impact='plus'  AND tfa.voided_at IS NULL), 0)
      - COALESCE(SUM(tfa.amount) FILTER (WHERE tfa.type='revenue' AND tfa.impact='minus' AND tfa.voided_at IS NULL), 0)
      AS adjusted_sale,
    COALESCE(sc.rate, t.supplier_rate, 0)
      + COALESCE(SUM(tfa.amount) FILTER (WHERE tfa.type='cost' AND tfa.impact='plus'  AND tfa.voided_at IS NULL), 0)
      - COALESCE(SUM(tfa.amount) FILTER (WHERE tfa.type='cost' AND tfa.impact='minus' AND tfa.voided_at IS NULL), 0)
      AS adjusted_cost,
    (SELECT COALESCE(SUM(amount_in), 0) FROM transactions tx
       WHERE tx.trip_id = t.id AND tx.contact_type = 'client') AS amount_paid,
    t.payment_status,
    t.settlement_status
  FROM trips t
  LEFT JOIN trip_finance_adjustments tfa ON tfa.trip_id = t.id
  LEFT JOIN trip_subcontracts sc ON sc.trip_id = t.id AND sc.status = 'active'
  GROUP BY t.id, t.client_price, sc.rate, t.supplier_rate, t.payment_status, t.settlement_status;
  ```
  `margin`/`outstanding` are computed in a thin wrapper or the app layer from the above columns — kept out of the view body to avoid re-deriving `amount_paid`'s subquery twice.
- **`v_party_balance`** — unchanged from v1.
- **Performance note (resolves the missing-index finding):** the view's correlated subquery and the `tr_transactions_enforce_receivable_ceiling` trigger (§3.1) both need `transactions(trip_id, contact_type)` and `trip_finance_adjustments(trip_id) WHERE voided_at IS NULL` as **new composite indexes**, added in Phase A (§7), sized and benchmarked against the 50ms/300ms SLOs in §10 before Phase C cutover — not assumed free.

---

## 4. Event Flow (v2 revisions only)

### 4.4 Payment Collection (Cash IN) — v2 revision (resolves F3, F6, F8)

```
[UI] TripDetailScreen "Capture payment"
  ▼
[SVC] finance.createLedgerEntry(...) ── refactored ──▶
  ▼
[RPC] post_financial_event('payment.collected', p_org_id, p_trip_id,
        p_contact_id, p_contact_type='client', p_amount,
        p_idempotency_key)                          ── single DB txn ──┐
  ├─ auth: is_org_member(p_org_id)                                     │
  ├─ NEW: contact validation — p_contact_id belongs to p_org_id AND    │  F3 fix
  │        p_contact_id = trips.client_id for p_trip_id                │
  ├─ NEW: SELECT * FROM trips WHERE id = p_trip_id FOR UPDATE          │  F8 fix
  │        (serializes concurrent events on the SAME trip; a          │
  │         concurrent adjustment-insert trigger on a DIFFERENT trip   │
  │         is unaffected — lock scope is per-trip, not global)        │
  ├─[TX] INSERT transactions(amount_in, contact_type='client',          │
  │        source_type='trip_payment', idempotency_key)                │
  │        ← BEFORE INSERT trigger (§3.1) rejects if overcollected      │
  │          and not source_type='justified_overcollection'            │
  ├─[RPC] recompute_trip_finance(p_trip_id)  (reads v_trip_finance,     │
  │        writes ONLY trips.payment_status)  ── inside same lock ──   │
  ├─[TX] INSERT trip_workflow_events(event_type='payment.collected',    │  F1/F19 fix:
  │        payload=jsonb_build_object('amount', p_amount, ...))         │  reuses existing
  │        idempotency_key = NULL (multi-occurrence event, per          │  table/column
  │        existing documented convention)                              │
  └─ COMMIT (releases row lock) ──────────────────────────────────────┘
  ▼
[UI] invalidate trip + ledger + finance
```

### 4.5 Driver Settlement — v2 revision (resolves F2)

```
[UI] EITHER: org-member Finance action           OR: driver-app "Mark as paid"
  ▼                                                  ▼
[RPC] post_financial_event('driver.settled', ...)  [RPC] driver_self_settle(p_trip_id, p_amount, p_idempotency_key)
  gated: is_org_member(p_org_id)                      gated: EXISTS(drivers d WHERE d.id = trip.driver_id
                                                              AND d.user_id = auth.uid())
  └──────────────────┬──────────────────────────────────────────┘
                      ▼
        [internal, shared] _settle_driver_leg(p_trip_id, p_driver_id, p_amount, p_idempotency_key, p_actor_id)
          ├─ SELECT trips FOR UPDATE WHERE id=p_trip_id
          ├─ expected = tripEarningsForDriver()-equivalent SQL; validate |p_amount - expected| within tolerance
          │    OR p_meta.override_reason IS NOT NULL (captured, not silently allowed)
          ├─[TX] INSERT driver_ledger(type='settlement', amount, idempotency_key)
          ├─[TX] INSERT transactions(amount_out, contact_type='driver', idempotency_key)
          ├─[TX] UPSERT trip_settlement_legs(trip_id, leg='driver', status=...)
          └─[TX] INSERT trip_workflow_events(event_type='driver.settled', payload=...)
```
The old bare RLS INSERT policy on `driver_ledger` (`20250324120000`) is **revoked** once `driver_self_settle` ships (§7 Phase C) — the driver app is repointed to call the RPC instead of inserting directly, preserving the product capability (driver can still self-mark-paid) while closing the validation gap.

### 4.3 Invoice — v2 revision (resolves F9)
Identical to v1 except: "validate: no trip already on an issued invoice" is no longer an application-level SELECT-then-INSERT race. It is `INSERT INTO invoice_trips(invoice_id, trip_id) ...` relying on the partial unique index (§3.5) to atomically reject a concurrent double-invoice attempt with a `23505`, which the RPC catches and returns as a clean "already invoiced" error rather than a generic constraint-violation.

All other flows (4.1, 4.2, 4.6, 4.7) are structurally unchanged from v1 but now route their `trips` write through the same `SELECT ... FOR UPDATE` + narrow-write discipline established in 4.4.

---

## 5. State Machines (v2 revisions)

### 5.4 Settlement — v2 revision (resolves F11)
Now explicitly four independent state machines (one per row in `trip_settlement_legs`, §2.11), not one combined row:
```
customer leg:  pending → partial → settled  (+ reversed)
driver leg:    pending → partial → settled  (+ reversed)   [asset trips only]
supplier leg:  pending → partial → settled  (+ reversed)   [aggregation trips only]
invoice leg:   pending → issued → paid                       (+ void)
```
Each transitions independently; `evaluate_trip_settlement` (§6.4) reads all applicable rows for a trip and only then decides `settlement_status`.

### 5.3 Payment — v2 revision (resolves the numeric-equality gap)
```
unpaid  : amount_paid = 0
partial : 0 < amount_paid < adjusted_sale - ε
paid    : |amount_paid - adjusted_sale| ≤ ε        ← tolerance added
overpaid: amount_paid > adjusted_sale + ε
```
`ε` (default ₹1, configurable per org) absorbs paise-level rounding from GST-split payments so a trip doesn't get stuck permanently `partial` over a one-rupee rounding difference. This tolerance is a named constant in `recompute_trip_finance`, not a magic number.

### 5.1 Trip / Invoice reopen-after-invoice — v2 addition (resolves the reopen gap)
`reopen_trip` (§6, §8.6) now explicitly checks: if the trip's invoice leg is `issued` or `paid`, reopening the trip **does not** revoke or regenerate the invoice. The invoice's GST sequence number is permanent regardless of trip state. A reopened trip that needs re-invoicing (e.g., the original amount was wrong) must go through the existing correction path (§5.2: new invoice + void of old, preserving sequence) — reopening a trip is orthogonal to invoice correction, not a trigger for it. This is now stated explicitly rather than left as an unaddressed interaction.

---

## 6. Financial Engine (v2 — substantially revised)

### 6.1 `post_financial_event(...)` — v2 revision

**6.1a — Idempotency key provenance (resolves F6).** The key is **server-generated**, never client-supplied as a raw pass-through:
- For an org-member-initiated event, the RPC itself generates `idempotency_key := encode(digest(p_org_id::text || p_trip_id::text || p_event_type || p_amount::text || COALESCE(p_client_nonce, ''), 'sha256'), 'hex')`, where `p_client_nonce` is an **optional** UUID the client generates once per user action (e.g., once per "Capture Payment" button press) and retries with the *same* nonce on network-error retry. This gives genuine retry-safety (same nonce → same key → `23505` → treated as success) without trusting the client to construct the *whole* key (which was v1's unspecified gap).
- If no nonce is supplied (older client, or a manual entry with no upstream action), the key falls back to the per-minute fingerprint described in §3.2 — coarser, but never absent.

**6.1b — Cross-tenant validation (resolves F3 — Critical).** Before any write:
```sql
-- Inside post_financial_event, after is_org_member(p_org_id):
PERFORM 1 FROM public.trips t
  WHERE t.id = p_trip_id AND t.organization_id = p_org_id;
IF NOT FOUND THEN RAISE EXCEPTION 'trip does not belong to org' USING ERRCODE = '42501'; END IF;

-- NEW: contact-to-trip-counterparty binding, closes the injection gap
IF p_contact_type = 'client' THEN
  PERFORM 1 FROM public.trips t WHERE t.id = p_trip_id AND t.client_id = p_contact_id;
ELSIF p_contact_type = 'driver' THEN
  PERFORM 1 FROM public.trips t WHERE t.id = p_trip_id AND t.driver_id = p_contact_id;
ELSIF p_contact_type = 'supplier' THEN
  PERFORM 1 FROM public.trips t WHERE t.id = p_trip_id AND t.supplier_id = p_contact_id;
END IF;
IF NOT FOUND THEN RAISE EXCEPTION 'contact does not match trip counterparty' USING ERRCODE = '42501'; END IF;
```
This closes the hole where a caller could supply `p_org_id`/`p_trip_id` from their own org but `p_contact_id` belonging to a different org's contact — every party ID is now bound to the specific trip, not just "exists somewhere in the org."

**6.1c — Locking and isolation (resolves F8 — Critical).** `post_financial_event` runs at the database default `READ COMMITTED` (no isolation-level change needed) but explicitly takes `SELECT 1 FROM public.trips WHERE id = p_trip_id FOR UPDATE` as its **first statement after validation**, before the ledger INSERT. This means:
- Two concurrent `post_financial_event` calls on the **same trip** serialize: the second blocks on the row lock until the first commits, then reads a fresh, post-commit state.
- Two concurrent calls on **different trips** never block each other (lock granularity is per-row, not per-table or per-function).
- All functions this RPC calls internally (`recompute_trip_finance`, the settlement-leg upsert) run **inside the same transaction and under the same row lock** — they never re-acquire or re-check state that could have changed, because nothing else can touch this trip's row until commit.

**6.1d — Function security header (resolves the `search_path` correctness finding):**
```sql
CREATE OR REPLACE FUNCTION public.post_financial_event(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''         -- NOT 'public' as v1 incorrectly specified
AS $$ ... $$;
```
Every table reference inside is schema-qualified (`public.trips`, `public.transactions`, `public.trip_workflow_events`), matching the verified `is_org_member` pattern exactly (§0.3.6).

### 6.2 `recompute_trip_finance(p_trip_id)` — v2 revision (resolves F10)

No longer writes `adjusted_sale`/`adjusted_cost`/`margin` (they don't exist as columns). It:
1. Reads `v_trip_finance` for the trip (already locked by the caller, §6.1c).
2. Computes `payment_status` per §5.3's tolerance-aware function.
3. Computes `settlement_status` by reading `trip_settlement_legs` (§2.11) for all applicable legs.
4. `UPDATE trips SET payment_status = ..., settlement_status = ... WHERE id = p_trip_id` — the **only** write, two small enum columns.

This function is genuinely idempotent now in the strict sense (re-running it with no intervening writes produces byte-identical output), because it no longer has to reconcile a stored snapshot against a live computation — there is no stored snapshot to reconcile.

### 6.3 Reconciliation engine — v2 revision
Unchanged in purpose. Confirmed runnable: `pg_cron` is active in this project (§0.3.4), so the nightly job is a real, low-risk addition, not a new-extension request. Discrepancy detection is now simpler too: since `amount_paid`/`adjusted_sale` are never stored, there is no "stored vs. derived" drift to detect for those fields — the only drift class left to detect is `payment_status`/`settlement_status` disagreeing with a fresh `v_trip_finance` read, which the reconcile job flags as `finance.discrepancy_detected` (§3.9 vocabulary) and pages on (§13, new).

### 6.4 Settlement engine — v2 revision
Reads `trip_settlement_legs` rows (§2.11) instead of four columns on one row. `evaluate_trip_settlement` is now a simple `SELECT status FROM trip_settlement_legs WHERE trip_id = p_trip_id` aggregate — no single-row contention.

### 6.5 Invoice engine — v2 revision (resolves F9)
`issue_invoice_v2` now does `INSERT INTO invoice_trips(invoice_id, trip_id)` per trip in the batch, relying on the partial unique index (§3.5) as the concurrency guard, catching `23505` and translating it to a clean "trip already invoiced" application error instead of a bare constraint violation leaking to the UI.

### 6.6 Adjustment engine — unchanged from v1.

### 6.7 Trigger recursion analysis — v2 new section (resolves F8-adjacent recursion concern)

**Verified baseline (§0.3.3): `trips` has 13 live triggers today, none of which perform a self-referential `UPDATE trips`.** This TDD adds exactly one new trigger candidate — `tr_trips_recompute_on_price_change` (v1 §3.1, AFTER UPDATE OF `client_price`, `supplier_rate`). v2 keeps this trigger but constrains it:

- The trigger function checks `pg_trigger_depth() > 1` at entry and **no-ops** (returns immediately) if true — this is the standard Postgres idiom to prevent a trigger from re-entering itself or cascading into another trigger that would loop back.
- More importantly: the trigger calls `post_financial_event('sale.repriced', ...)`, which itself only ever writes to `transactions` and `trips.payment_status`/`settlement_status` (§6.1/6.2) — **it does not write `client_price` or `supplier_rate`**, so there is no cycle: `UPDATE client_price` → trigger fires → `post_financial_event` → `UPDATE payment_status` (different columns, but still `UPDATE trips`) → does **this** re-fire `tr_trips_recompute_on_price_change`? No, because that trigger is scoped `AFTER UPDATE OF client_price, supplier_rate` — Postgres only fires column-scoped triggers when the *listed* columns actually change, and `recompute`'s `UPDATE` never touches `client_price`/`supplier_rate`. **No recursion is possible by construction**, verified against the real trigger definition syntax, not just asserted.
- The 12 other existing triggers are unaffected: none of them are scoped to `payment_status`/`settlement_status`, so this new write does not spuriously fire `trg_fill_driver_commission`, `trg_trip_status_to_chat`, etc.
- **This analysis and the no-op guard are a mandatory unit test** (§10) — a test that updates `client_price` twice in a nested trigger context and asserts `pg_trigger_depth()` never exceeds 2 for this function.

---

## 7. Migration Strategy (v2 revisions)

**Phase A — Schema scaffolding.** Same additive spirit as v1, revised contents:
- Add `trips.payment_status`, `trips.settlement_status` (no `adjusted_sale`/`adjusted_cost`/`margin` — removed per §3.1).
- Add `transactions.source_type/source_id/reversal_of/idempotency_key`; `driver_ledger.source_type/source_id/reversal_of/idempotency_key`.
- Create `invoice_line_items`, `invoice_trips` (§3.5), `trip_settlement_legs` (§2.11).
- Create `v_trip_finance`, `v_party_balance`.
- Add composite indexes `transactions(trip_id, contact_type)`, `trip_finance_adjustments(trip_id) WHERE voided_at IS NULL` — **and benchmark them against real data volume before Phase C**, not assumed free (§3.12).
- `created_by NOT NULL` on `trip_finance_adjustments`: backfill via `UPDATE ... WHERE created_by IS NULL` in batches, then add the constraint as `NOT VALID` first (`ALTER TABLE ... ADD CONSTRAINT ... CHECK (created_by IS NOT NULL) NOT VALID`, which takes no long lock), then `VALIDATE CONSTRAINT` separately (which takes a lock but only `SHARE UPDATE EXCLUSIVE`, not `ACCESS EXCLUSIVE`) — **resolves the "SET NOT NULL takes ACCESS EXCLUSIVE" finding** by using the standard two-step Postgres pattern for zero-downtime NOT NULL rollout instead of a direct `SET NOT NULL`.
- **Rollback A:** unchanged — all additive, safe to drop.

**Phase B — Engine behind the scenes (shadow), revised:**
- Deploy `post_financial_event`, `recompute_trip_finance`, `issue_invoice_v2`, `driver_self_settle`, reconcile engine — not yet routed to UI.
- Run `tr_transactions_enforce_receivable_ceiling` (§3.1) in **report-only mode** first (log-would-have-rejected instead of raising) for one release, to quantify how many existing manual entries would have been blocked, before it goes live and blocks writes.
- Run the reconcile job in report-only mode, specifically to quantify the impact of the `contact_type='client'` SUM filter (§0.3.5) — **this number goes to finance for sign-off before Phase C**, not silently absorbed into a bug-fix backfill.
- **Rollback B:** unchanged.

**Phase C — Cutover, revised (resolves F7 — the CHECK-drop-and-swap-in-one-phase finding):**
- Step C1: flip `tr_transactions_enforce_receivable_ceiling` from report-only to enforcing. **Verify zero unexpected rejections in the following 48h before C2.**
- Step C2 (separate deploy from C1): route `createLedgerEntry` payment path to `post_financial_event`.
- Step C3 (separate deploy from C2): ship `driver_self_settle`, repoint the driver app, **then** revoke the old RLS INSERT policy on `driver_ledger` — never revoke the old policy in the same deploy that ships the new path, so there's a window to verify the new path works before removing the old one's *ability* to be used as a fallback.
- Step C4: only now, after C1–C3 are each independently verified, drop the old blind `CHECK (amount_paid <= client_price)` — because by this point the new trigger-based ceiling (already enforcing since C1) is the sole guard and has a verified track record, not a same-phase swap.
- Delete `updateTripPayment()`. Retire System B invoicing code path (separate deploy after `issue_invoice_v2` is verified for one release).
- **Rollback C:** each step is independently flaggable/revertible; the numbered sub-steps exist specifically so a bad step can be rolled back without unwinding steps that already proved safe.

**Phase D — Cleanup.** Unchanged in spirit; vehicle-ledger consolidation is explicitly **out of scope** for this phase now (§3.11) and moved to its own project.

---

## 8. API Design (v2 revisions)

### 8.2 `post_financial_event` — v2 revision
- **Req (revised):** adds `p_client_nonce uuid DEFAULT NULL` (§6.1a).
- **Validation (revised):** adds contact-to-counterparty binding (§6.1b) as a named, testable failure mode with its own error code (`42501` scoped with a distinct message, not reused generically).
- **Concurrency:** explicitly documented as taking a per-trip row lock (§6.1c) — callers should expect brief blocking under contention on the *same* trip, never across trips.

### 8.2a `driver_self_settle` — v2 new RPC (resolves F2)
- **Req:** `{p_trip_id, p_amount, p_idempotency_key}`.
- **Validation:** driver-ownership predicate (§4.5) + delegates to the same internal `_settle_driver_leg` logic as the org-member path.
- **Perms:** the calling `auth.uid()` must own the driver record linked to the trip — no org-membership required, matching the existing RLS policy's intent (driver settling their own trip), but now with idempotency and expected-amount validation that the old bare INSERT policy never had.

### 8.5 `issue_invoice_v2` — v2 revision
- **Failures (revised):** "any trip already invoiced" is now a caught `23505` on `invoice_trips` (§6.5), not a pre-check race.

All other RPCs unchanged from v1.

---

## 9. Frontend Impact (v2 addition)

One row added to v1's table:

| Screen / file | Current | Required change | Risk |
|---|---|---|---|
| Driver app "Mark as paid" (Wallet) | Direct RLS INSERT into `driver_ledger` | Call `driver_self_settle` RPC instead of direct insert | **High** — must ship before the old RLS policy is revoked (§7 Phase C step C3), or drivers lose the ability to self-settle |

All other rows unchanged from v1.

---

## 10. Testing Strategy (v2 additions)

- **New — Trigger recursion test** (§6.7): update `client_price` on a trip inside a transaction that also fires an adjustment insert; assert `pg_trigger_depth()` never exceeds the expected depth and no infinite loop/statement timeout occurs.
- **New — Cross-tenant injection test** (§6.1b): call `post_financial_event` with a valid `org_id`/`trip_id` from Org A but `contact_id` belonging to a contact in Org B; assert rejection with the specific `42501` + "contact does not match trip counterparty" message, not a generic failure.
- **New — Dual-principal driver settlement test** (§4.5): settle the same trip once via `driver_self_settle` and once via the org-member `post_financial_event` path with the same idempotency key; assert the second is a no-op (idempotent), and with a *different* key, assert it's treated as a legitimate second partial settlement, not a duplicate rejection.
- **New — Double-invoice race test** (§6.5): fire two concurrent `issue_invoice_v2` calls for overlapping trip sets; assert exactly one succeeds per trip and the other gets a clean "already invoiced" error, never a raw constraint-violation leak.
- **New — Rounding-tolerance test** (§5.3): pay a trip to within ₹0.50 of `adjusted_sale`; assert `payment_status='paid'`, not stuck at `partial`.
- **Revised — Migration test:** assert TRP003/TRP001 resolve correctly (unchanged from v1) **plus** assert the finance-sign-off report (§7 Phase B) correctly identifies the count of trips affected by the `contact_type='client'` SUM-filter change, before it's applied.
- All other tests unchanged from v1.

---

## 11. Risk Register (v2 revisions)

New/revised rows (all others unchanged from v1):

| ID | Risk | Prob | Impact | Mitigation | Rollback |
|----|------|------|--------|-----------|----------|
| R10 *(new)* | Cross-tenant contact injection slips through if a future RPC change forgets §6.1b's binding check | Low | Critical | Binding check is a named, tested failure mode (§10); code review checklist item for any new `post_financial_event`-family RPC | Revoke EXECUTE on the offending RPC |
| R11 *(new)* | Driver app cutover to `driver_self_settle` has a bug, drivers can't self-settle | Med | Med | Old RLS policy stays live until C3 is verified for one release (§7); explicit ordering prevents simultaneous cutover+revoke | Re-enable old RLS policy (documented as a one-line migration, kept ready) |
| R12 *(new)* | `tr_transactions_enforce_receivable_ceiling` report-only phase reveals it would reject a large volume of legitimate historical patterns (e.g., advance payments before adjustment posting) | Med | Med | Report-only window (§7 Phase B/C1) exists specifically to catch this before enforcement; `justified_overcollection` source_type is the documented escape valve | Extend report-only window; do not flip to enforcing until false-positive rate is understood |
| R2 *(revised)* | Backfill/SUM-filter change reveals historical discrepancies | High | Med | **Now requires explicit finance sign-off on the report-only numbers (§7 Phase B) before Phase C**, not just "communicated" | Unchanged — backfill is read→derive, re-runnable |
| R9 *(revised)* | RLS/SECURITY DEFINER over-permits cross-org | ~~Low~~ **Med, until R10's mitigation ships** | Critical | Binding check (§6.1b) is the actual fix; this row is now tracked as resolved-pending-test, not merely "re-checks is_org_member" | Revoke EXECUTE |

---

## 12. Implementation Order (v2 revisions)

**PR3 (v2 revision) — `post_financial_event` core + cross-tenant binding + locking, WITHOUT payment cutover yet.**
Split from v1's PR3. Ships the RPC, the `FOR UPDATE` locking, the contact-binding validation, and the idempotency-key scheme — but does **not** yet route `createLedgerEntry` to it. Tests: F3/F8 regression tests (§10). Effort: L. Risk: Med (isolated, not yet live on the write path).

**PR3b (v2 new) — Payment cutover (Phase C step C2 only).**
Routes `createLedgerEntry` to the now-proven `post_financial_event`. Depends on PR3 + the receiver-ceiling trigger having run report-only for one release (Phase C step C1, its own PR). Effort: M. Risk: High (R1) — but now isolated from the RPC-correctness risk, which PR3 already retired.

**PR4 (v2 revision) — Driver settlement, split into three ordered PRs per §7 Phase C step C3:**
- PR4a: ship `driver_self_settle` + `_settle_driver_leg` shared logic, driver app **not yet repointed**.
- PR4b: repoint driver app to call the RPC (old RLS policy still live as fallback).
- PR4c: revoke the old RLS INSERT policy, only after PR4b has run one full release with no regressions.

**PR6 (v2 revision) — Invoicing collapse, now includes `invoice_trips` junction table + partial unique index (§3.5) as a required part of this PR, not deferred.**

**PR8 (v2 revision) — Cleanup, with vehicle-ledger merge REMOVED (§3.11 — now its own separate project, not part of this PR sequence).** Retains only `trips.margin` view-migration and `create_trip_v2` consolidation.

**PR9 (v2 new) — `invoice_trips`/`trip_settlement_legs` follow-through:** drop the now-read-only `invoices.trip_ids` array once confirmed zero readers remain (grep-verified in CI, not just asserted).

All other PRs unchanged from v1 in spirit, renumbered contents as above.

---

*Assumptions carried over from v1, unchanged:* (a) `trip_subcontracts` has one active rate row per subcontracted trip; (b) asset-vs-aggregation determinable from `driver_id` vs `supplier_id`/subcontract presence, hybrid trips treated per CORE_ACCOUNTING_MODEL CASE 1/2 as mutually exclusive default — **this remains an open business-rule gap, not resolved in v2, see companion Open Design Questions document**; (c) `tripEarningsForDriver()` is the authoritative expected-commission basis; (d) overcollection tolerance is org-configurable.

**v2-specific new assumption:** the per-minute manual-entry idempotency fingerprint (§3.2) assumes a bookkeeper double-submitting the same form happens within the same UI session (seconds, not minutes) — if manual double-entry errors are typically caught hours later by a human reviewing the ledger, this fingerprint will not catch them, and that class of error remains a human-review problem, not a system-enforced one. This is called out explicitly rather than implied to be fully solved.
</content>
