# DB Query Guide — live schema snapshot

Project `nafxpivddesgsrthmosv` (ap-south-1), Postgres 17.6. Snapshot taken 2026-08-01.
178 tables in `public`, all with RLS enabled. 13 views. Row counts below are live-at-snapshot.

Purpose: get to a correct query fast without re-reading the schema.
For domain semantics see `core.md`, `trips.md`, `finance.md`, `marketplace.md`.

---

## 1. Golden rules

1. **Every tenant table is scoped by `organization_id`.** Always filter it. Exceptions
   that use `org_id` instead: `trip_status_audit`, `workspace_audit_log`,
   `verification_audit_logs`, `pulse_credit_wallets`, `pulse_credit_transactions`,
   `reach_campaigns`, `reach_campaign_targets`, `org_feature_flags`.
2. **Soft deletes.** `trips`, `drivers`, `vehicles`, `clients`, `suppliers`, `indents`,
   `client_lane_rates` all have `deleted_at`. Always add `AND deleted_at IS NULL`
   unless you deliberately want tombstones.
3. **Never `SELECT *`** — name columns, add `LIMIT`, or use `count(*)`.
4. **`trips.margin` is `GENERATED ALWAYS`** (`client_price - supplier_rate`). Never write it.
5. `users` is a 3-column app-side stub (`id, name, created_at`). Real identity is
   `auth.users` + `profiles`. Some FKs point at `users`, some at `auth.users` — see §4.

---

## 2. Core entity map

```
organizations (37)
├── organization_members (11)   user↔org, role: owner | member | finance
├── organization_relations (22) org↔org, from_/to_organization_id
├── clients (28)                may link back via linked_organization_id
├── suppliers (28)              may link back via linked_organization_id
├── drivers (72)                user_id → auth.users, assigned_vehicle_id → vehicles
├── vehicles (32)               supplier_id → suppliers
├── indents (91)  ──┐
│                   ├─ direct_quotes (88)  indent_id, bidder_organization_id
│                   └─ trips (134)         indent_id / source_indent_id
└── posts (67) ── bids (19)     bids hang off posts, NOT off indents
```

`trips` is the hub: `client_id`, `supplier_id`, `driver_id`, `vehicle_id`, `indent_id`.

### Two separate bidding paths — don't mix them
| Path | Table | Parent | Used for |
|---|---|---|---|
| Direct circulation | `direct_quotes` (88) | `indents` | Load Hub / Find Work quotes |
| Broadcast feed | `bids` (19) | `posts` | Social/feed posts |

---

## 3. Key table columns

### `trips` (134) — 70+ cols; the ones you actually need
- Identity: `id`, `trip_number`, `display_trip_id`, `trip_code`, `booking_ref`,
  `trip_operational_code`, `driver_display_trip_id`
- Scope: `organization_id`, `owner_user_id`, `created_by_user_id`, `assigned_by_user_id`
- Parties: `client_id`/`client_name`, `supplier_id`, `driver_id`/`driver_display_name`,
  `vehicle_id`/`vehicle_display_number`
- Route: `pickup_area`, `drop_location`, `pickup_lat/lon`, `drop_lat/lon`, `distance`
- Money: `client_price`, `supplier_rate`, `margin` (generated), `platform_fee`,
  `driver_commission`, `advance_paid`, `amount_paid`, `payment_status`
- Lifecycle: `status`, `source`, `pickup_date`, `started_at`, `completed_at`, `deleted_at`
- Distance reconciliation: `start_odometer_km`, `end_odometer_km`, `odometer_distance_km`,
  `gps_distance_km`, `actual_distance_traveled_km`, `distance_discrepancy_km`,
  `distance_source`, `odometer_verification_state`
- POD: `pod_required`, `pod_received_at`

**Live value distributions**

| Column | Values (count) |
|---|---|
| `status` | completed 78, assigned 30, in_transit 12, loading 5, unloading 5, draft 1, at_drop 1, cancelled 1, in_progress 1 |
| `source` | direct_quote 60, manual 57, mover_asset 17 |
| `payment_status` | pending 93, paid 26, partial 15 |

> `in_progress` (1 row) looks like a legacy straggler next to `in_transit` — treat
> `in_transit` as canonical. Unverified; not chased down in this pass.

### `indents` (91)
`indent_number`, `display_indent_id`, `indent_code`, `indent_operational_code`,
`pickup_area`, `drop_location`, `client_name`, `client_price`, `supplier_target`,
`assigned_supplier_id` (→ organizations), `assigned_supplier_rate`, `circulation_target`,
`sales_order_id`, `status`, `deleted_at`.

- `status`: awarded 45, completed 19, quoted 17, broadcast 9, open 1
- `circulation_target`: integrated_supplier 89, both 2

### `organizations` (37)
`operating_model` — HYBRID 35, ASSET_BASED 1, NON_ASSET 1.
`verification_status` (enum) — unverified 27, verified 10.
Verification block: `verification_tier`, `tier_1_unlocked_at`, `tier_2_unlocked_at`,
`transaction_cap_paise`, `penny_drop_status`, `biometric_status`, `frozen_at`,
`submitted_at`, `rejection_reasons`, `platform_status`.
Registry: `gstin`, `business_pan`, `cin`, `msme_number`, `tan_number`, `iec_number`,
`gst_not_applicable`.

### `drivers` (72)
`user_id` → auth.users (null for manually-added drivers), `phone`, `phone_normalised`,
`assigned_vehicle_id`, `status`, `tracking_only`, `payable_amount`, `commission_percent`,
`commission_per_km`, `hired_at`, `left_at`, `deleted_at`, `driver_code`.

---

## 4. Rate tables

### `client_lane_rates` (47) — the rate card
Origin/destination lane pricing per client.

- Keys: `organization_id`, `client_id`, `agreement_id` → `client_contract_agreements`
- Lane: `origin_warehouse_id`/`destination_warehouse_id` → `client_warehouses`,
  `origin_label`, `destination_label`, `warehouse_zone`, `destination_gstin`,
  `destination_address`, `distance_km`
- Pricing: `pricing_model`, `rate`, `rate_type`, `base_rate`, `per_mt_rate`,
  `per_km_rate`, `min_billing`
- Terms: `fuel_clause`, `toll_included`, `detention_included`
- Defaults: `vehicle_type`, `default_load_type`, `default_load_tons`
- Validity: `valid_from`, `valid_to`, `is_spot_rate`, `deleted_at`

> Two pricing generations coexist: the flat `rate`/`rate_type` pair and the newer
> `pricing_model` + `base_rate`/`per_mt_rate`/`per_km_rate` triple. Read `pricing_model`
> first and fall back to `rate`.

### Other "rate"-named tables (different meaning — not pricing)
| Table | Rows | What it is |
|---|---|---|
| `rpc_rate_limits` | 896 | RPC throttle buckets (`user_id`, `scope`, `created_at`) |
| `ops_agent_rate_log` | 0 | Ops-agent throttle (`user_id`, `window_start`, `request_count`); RLS deny-all by design |
| `reward_rules` | 2 | Credit rewards (`key`, `credit_amount`, `is_active`) |

### `ratings` (87) — trip-scoped reputation
`trip_id`, `rater_type`/`rater_id`, `rated_type`/`rated_id`, `score` (smallint), `comment`.

Live pairs: organization→client 30, organization→driver 22, client→driver 9,
supplier→driver 8, organization→supplier 7, client→supplier 6, supplier→client 5.

> The table comment says "Client→Supplier, Supplier→Driver; org rates driver on asset
> trips" but live data has 7 distinct pairs including `supplier→client`. Trust the data,
> not the comment — filter on both `rater_type` and `rated_type` explicitly.

---

## 5. Audit & event tables

| Table | Rows | Scope col | Shape |
|---|---|---|---|
| `chat_audit_log` | 1977 | `organization_id` | `action`, `payload` jsonb, `conversation_id`, `message_id`, `actor_user_id` |
| `trip_status_audit` | 252 | `org_id` | `status_from` → `status_to`, `changed_by`, `changed_at` |
| `trip_assignment_audit` | 31 | via trip | `event_type`, `driver_id_prev/new`, `vehicle_id_prev/new`, `changed_by` → **profiles** |
| `workspace_audit_log` | 24 | `org_id` | `actor_id`, `event_type`, `payload` jsonb |
| `verification_audit_logs` | 12 | `org_id` | `previous_status`→`new_status` (enum), `rejection_reasons` jsonb, `ip_address` |
| `trip_workflow_events` | 86 | — | workflow transitions |
| `trip_operational_timeline_events` | 13 | — | ops timeline |
| `platform_events` | 63 | — | platform-level events |
| `reach_events` | 1607 | — | Boost/Reach funnel events |
| `client_audit_log` | 0 | `organization_id` | field-level diff: `field_name`, `old_value`, `new_value` |
| `document_audit_log` | 0 | `organization_id` | `old_status`→`new_status`, `metadata` jsonb |
| `platform_identity_audit_events` | 0 | `organization_id` | append-only identity trail |
| `pulse_audit_actions` / `pulse_audit_verifications` | 0 / 0 | — | manual QA checklist tables, not runtime audit |

Empty audit tables (`client_audit_log`, `document_audit_log`,
`platform_identity_audit_events`) are wired but never written to yet — don't build
reports on them without confirming a writer exists.

**Event-sourcing scaffolding, all empty:** `event_store`, `event_outbox`,
`event_dead_letter`, `event_schema_registry`, `entity_identity_anchors`,
`activity_stream`, `search_index`. Infrastructure laid, not switched on.

---

## 6. Enums

| Enum | Values |
|---|---|
| `kyc_verification_status` | unverified, pending, verified, rejected |
| `verification_tier_enum` | TIER_0_SANDBOX, TIER_1_PARTIAL, TIER_2_FULL |
| `verification_job_status` | QUEUED, PROCESSING, COMPLETED, PARTIAL_REVIEW, FAILED |
| `verification_document_status` | UPLOADED, OCR_PASSED, OCR_FAILED, MANUAL_REVIEW, REPLACED |
| `verification_document_type` | gst_certificate, pan_card, address_proof_lease, address_proof_utility_bill, address_proof_other, cin_certificate, msme_certificate, incorporation_certificate, partnership_deed, llp_agreement, iec_certificate |
| `registration_type_enum` | proprietorship, llp, pvt_ltd, public_ltd, partnership |
| `pillar_status_type` | NOT_STARTED, QUEUED, PROCESSING, PASSED, MANUAL_REVIEW, FAILED |
| `ocr_job_status` | pending, processing, completed, failed |

Everything else (`trips.status`, `indents.status`, roles, ledger types) is plain `text`
with no CHECK — the DB will not stop a typo. Validate in app code.

---

## 7. Views — prefer these over hand-rolled joins

| View | Use |
|---|---|
| `v_active_trips` | non-terminal trips |
| `v_open_indents` | indents still accepting quotes |
| `v_driver_balances` | driver ledger rollup |
| `v_client_revenue` | revenue per client |
| `v_driver_tracking_health` | GPS freshness per driver |
| `v_long_haul_health` | long-haul trip health |
| `trips_driver_view` / `trips_supplier_view` | role-narrowed trip projections |
| `driver_kyc_status` / `driver_kyc_review_queue` | KYC state + admin queue |
| `workspaces` / `workspace_members` | org/member aliases |
| `trip_messages_archive_candidates` | retention sweep input |

---

## 8. Finance tables

| Table | Rows | Note |
|---|---|---|
| `transactions` | 33 | `amount_in`/`amount_out` (not signed), `booking_ref` → trips, `ledger_entity_type`/`flow_type`/`category` |
| `driver_ledger` | 16 | positive = credit to driver; `balance_after` running total |
| `trip_finance_adjustments` | 7 | `type`, `impact`, `voided_at`; `mission_key` aligns cross-org views |
| `pulse_credit_wallets` | 7 | PK is `org_id`, one row per org; `balance` in bigint paise |
| `pulse_credit_transactions` | 39 | `balance_after` running total |
| `vehicle_ledger_entries` / `vehicle_operation_ledger_entries` | 1 / 5 | per-vehicle costs |
| `invoices`, `supplier_bills`, `cashflow_forecast`, `invoice_sequences` | 0 | built, unused |

`driver_ledger.type` live: adjustment 8, settlement 6, advance 1, reward 1.
The table comment lists advance/settlement/salary/reimbursement — but live data has
`adjustment` and `reward` instead of salary/reimbursement. Don't hardcode from the comment.

Money units are inconsistent across domains: `numeric` rupees in trips/transactions/ledger,
`bigint` paise in credits and reach rewards (`transaction_cap_paise`, `reward_amount`).
Check the column type before doing arithmetic.

---

## 9. Chat

`chat_conversations` (386) + `chat_messages` (1977) are canonical.
`trip_conversations` (242) and `network_messages` (6) are legacy and mirror in via
DB triggers with identical UUIDs — **never join both, you'll double-count.**

`conversation_type` live: trip_lane 242, trip 125, direct_org 19.
Legacy pointers: `legacy_trip_conversation_id`, `legacy_network_conversation_id`.

`chat_messages` has 12-month retention (`archive_chat_messages`), archive lands in
`chat_messages_archive`.

> Known gotcha (carried from prior work): `network_messages` has no org-scope column.
> Scope through `network_conversations.org_a_id`/`org_b_id` instead.

---

## 10. Copy-paste query patterns

```sql
-- Trips for an org, live rows only
SELECT id, display_trip_id, status, client_name, client_price, supplier_rate, margin
FROM trips
WHERE organization_id = $1 AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 50;

-- Trip with all parties resolved
SELECT t.display_trip_id, t.status,
       c.name AS client, s.name AS supplier,
       d.name AS driver, v.vehicle_number
FROM trips t
LEFT JOIN clients   c ON c.id = t.client_id
LEFT JOIN suppliers s ON s.id = t.supplier_id
LEFT JOIN drivers   d ON d.id = t.driver_id
LEFT JOIN vehicles  v ON v.id = t.vehicle_id
WHERE t.organization_id = $1 AND t.deleted_at IS NULL
LIMIT 50;

-- Indent → quotes funnel
SELECT i.display_indent_id, i.status, i.client_price, i.supplier_target,
       count(q.id) AS quotes, min(q.amount) AS best_quote
FROM indents i
LEFT JOIN direct_quotes q ON q.indent_id = i.id
WHERE i.organization_id = $1 AND i.deleted_at IS NULL
GROUP BY 1,2,3,4
ORDER BY i.created_at DESC
LIMIT 50;

-- Active rate card for a client lane
SELECT origin_label, destination_label, vehicle_type,
       pricing_model, rate, base_rate, per_mt_rate, per_km_rate, min_billing
FROM client_lane_rates
WHERE organization_id = $1 AND client_id = $2
  AND deleted_at IS NULL
  AND (valid_from IS NULL OR valid_from <= current_date)
  AND (valid_to   IS NULL OR valid_to   >= current_date)
ORDER BY is_spot_rate, origin_label;

-- Trip status history
SELECT status_from, status_to, changed_at, changed_by
FROM trip_status_audit
WHERE trip_id = $1
ORDER BY changed_at;

-- Driver average rating
SELECT rated_id AS driver_id, round(avg(score),2) AS avg_score, count(*) AS n
FROM ratings
WHERE organization_id = $1 AND rated_type = 'driver'
GROUP BY 1
ORDER BY avg_score DESC
LIMIT 20;

-- Driver running balance (or just use v_driver_balances)
SELECT type, sum(amount) AS total, count(*) AS n
FROM driver_ledger
WHERE organization_id = $1 AND driver_id = $2
GROUP BY 1;
```

---

## 11. Traps

1. `bids` → `posts`, `direct_quotes` → `indents`. Different funnels.
2. `chat_messages` and `trip_messages` share UUIDs (trigger mirror). Pick one side.
3. `trips.margin` is generated — read-only.
4. `transactions` uses two unsigned columns (`amount_in`, `amount_out`), not one signed one.
5. `trip_assignment_audit.changed_by` → `profiles`; `trip_status_audit.changed_by` → `auth.users`.
6. `indents.assigned_supplier_id` → **organizations**, not `suppliers`.
7. `transactions.booking_ref` is an FK to `trips` on a text column, alongside `trip_id`.
8. `users` (74 rows, 3 cols) ≠ `profiles` (74 rows, full identity) ≠ `auth.users`.
9. `drivers.user_id` is null for manually-added drivers — inner joins silently drop them.
10. Multiple display IDs per trip (`trip_number`, `display_trip_id`, `trip_code`,
    `booking_ref`, `trip_operational_code`) — confirm which one the UI shows.

---

## 12. Health snapshot (2026-08-01 advisors)

**Security**
- 398 `authenticated_security_definer_function_executable` + 256 `anon_...` (WARN).
  Every SECURITY DEFINER function is reachable over `/rest/v1/rpc/`, including `anon`.
  This is the single biggest surface — each such function must do its own auth check
  internally, because RLS is bypassed by definition.
- 12 tables RLS-enabled with no policies (deny-all): the four `_monitor_*` tables,
  `driver_trip_counters`, `supplier_trip_counters`, `subcontract_counters`,
  `operational_sequences`, `ops_agent_rate_log`, `platform_metrics`,
  `event_schema_registry`, `trip_location_checkpoints_default`. All internal —
  deny-all is intentional per table comments.
- `pg_net` and `pg_trgm` installed in `public` schema.
- `public.normalize_phone_canon` has a mutable `search_path`.
- Leaked-password protection is disabled in Auth.
- No ERROR-level security findings.

**Performance**
- 268 unused indexes (expected on low-volume data — don't act on this yet).
- 153 multiple-permissive-policies warnings, concentrated in `connection_requests` (18),
  `direct_quotes` (12), `driver_ledger` (12), `driver_salary_requests` (12),
  `trip_conversations` (8). Each duplicate permissive policy re-runs per row.
- 16 unindexed foreign keys, mostly `reach_*`, `driver_kyc_*`, `platform_role_*`.
- 3 duplicate index pairs, all on `trip_location_checkpoints_default`.
- 3 tables without a primary key: `_monitor_stmt_snapshot`, `_monitor_net_fail_snapshot`,
  `booking_ref_backfill_log`.
- **Zero `auth_rls_initplan` findings** — RLS policies already wrap `auth.uid()` in a
  scalar subquery. That's the expensive one, and it's clean.

---

## 13. Refreshing this file

```
mcp__supabase__list_tables(project_id, schemas=['public'], verbose=false)
mcp__supabase__get_advisors(project_id, type='security' | 'performance')
```
Advisor output exceeds the tool's token cap — it spills to a file; aggregate with
`jq '.result.lints | group_by(.name) | ...'` rather than reading it whole.
