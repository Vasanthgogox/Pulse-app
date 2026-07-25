# ADR-010 Step 1 — Authorization Model Refactor (RLS Audit)

**Status:** Inventory + draft matrix complete · **Awaiting role-matrix sign-off** · **No policies patched yet**  
**Parent:** ADR-010 (`docs/decisions.md`) · Pilot Entry blocker  
**Date:** 2026-07-26  
**Rule:** Do not widen `chk_org_members_role` or insert driver memberships until Step 2 completes after matrix sign-off.

### Platform state (Step 1)

| Area | Status |
|---|---|
| Authorization model | ✅ Defined (identity ≠ authority ≠ data ownership) |
| Security contract (role matrix) | ✅ Drafted for sign-off |
| Policy inventory | ✅ Complete (87 inline + 95 `is_org_member` surface) |
| Implementation (Step 2+) | ⏳ Not started — correctly gated on matrix sign-off |
| Pilot Entry | ⛔ Blocked pending ADR-010 completion + P1 re-run |

**Architectural outcome of ADR-010:** authorization is a **first-class platform concern**, not an RLS implementation detail. The valuable result is not the helpers alone — it is an explicit contract that future reviews can validate against.

```
User
  │
  ▼
Organization Membership     ← is_org_member()  (belonging / tenancy)
  │
  ▼
Operational Authority       ← is_org_staff()   (act on behalf of org)
  │
  ▼
Resource Access             ← RLS policies

Separately:
Driver → Own-row resources (trips, ledger, salary/reward requests)
```

This separation prevents role expansion (e.g. adding `driver` to `organization_members`) from accidentally widening organisational data access.

**Pilot governance sequence after ADR-010:** complete ADR-010 → re-run P1 with evidence → P2 → P3 → reassess Pilot Entry. Correctness and security take precedence over schedule. ADR-010 is freeze-allowed: it corrects authorization so documented behaviour can exist safely — it does not introduce new product functionality.

---

## Central finding

The key issue is **not** “there are 87 role-blind policies.”

It is that **`is_org_member()` encodes the wrong security boundary.**

It conflates:

| Concept | Question | Correct helper |
|---|---|---|
| **Membership (identity / tenancy)** | Does this person *belong* to the organisation? | `is_org_member()` — includes driver |
| **Staff authority (operations)** | May this person *act on behalf of* the organisation over its data? | `is_org_staff()` *(new)* — excludes driver |

Once that conflation is visible, the work stops being an RLS cleanup exercise and becomes an **authorization model refactor**. The 87 inline policies and the 95 helper-dependent policies are symptoms of one design mistake: treating “any active membership” as “operational access.”

Adding `role='driver'` without fixing that boundary would silently grant fleet drivers staff-level access across finance, banking, master data, and ops tables.

This document is the implementation checklist: inventory → security contract (role matrix) → patch sequence. **No policy edits until Deliverable 2 is signed off** against the criteria below.

---

## Scope discovery (broader than the original 87)

| Surface | Count | Notes |
|---|---|---|
| Policies with inline `organization_members` and **no** `role` filter | **87** | Original ADR-010 count — Deliverable 1 below |
| Policies referencing `is_org_member()` | **95** | Helper is itself role-blind (`status='active'` only) |
| Policies that already filter OM by role / admin helpers | **13** | e.g. `is_org_admin`, `org_admins_*` — already safer patterns |
| Distinct tables in the 87 | **59** | See inventory |

### Helper contract (accepted direction)

| Helper | Purpose | Includes Driver? |
|---|---|---|
| `is_org_member(org_id)` | Identity / tenancy — “belongs to this organisation” | ✅ Yes |
| `is_org_staff(org_id)` **(new)** | Operational authority — “acts on behalf of the organisation” | ❌ No — `role IN ('owner','admin','member','dispatcher','finance')` |
| `is_org_admin` / `is_org_owner` | Unchanged elevated staff | ❌ No |

**Patch pattern:** staff policies use `is_org_staff` (or equivalent positive staff-role predicate).  
**Do not** redefine `is_org_member` to exclude drivers — that breaks legitimate belonging checks (e.g. reading your org).

**Existing driver own-row policies** (verified live) support **Restrict**, not broaden, for OM/staff paths:

| Resource | Dedicated driver policies (keep) |
|---|---|
| Driver ledger | `Drivers can read own ledger`; `Drivers can insert settlement for own ledger` |
| Salary / reward requests | `Drivers can read/insert own driver_salary_requests` |
| Trips | `Drivers can read own trips`; `drivers_update_own_trip_status` |
| Reach referrals | `reach_referrals_select` includes `driver_user_id = auth.uid()` |

That avoids granting organisation-wide visibility where row-scoped access already exists. For the 87 OM staff policies, Action = **Restrict**.

---

## Deliverable 1 — Policy inventory (87 role-blind OM policies)

**Legend — Action**

- **Restrict** — exclude `role='driver'` from this policy’s OM predicate (staff-only). Driver access, if any, stays on dedicated policies.
- **Modify** — change predicate to least-privilege own/assigned (rare for these 87; none required if dedicated policies exist).
- **Review** — human confirm before patch (called out in notes).

All 87 rows below are currently: *active `organization_members` row for `auth.uid()`, no role filter*.

| Object | Operation | Policy | Current condition (summary) | Driver via this policy? | Action |
|---|---|---|---|---|---|
| `activity_stream` | SELECT | org_members_read_feed | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `ai_settings` | SELECT | org_members_read_ai_settings | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `b2b_operations_dismissals` | SELECT | b2b_operations_dismissals_select_member | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `bids` | INSERT | bids_insert | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `bids` | SELECT | bids_select | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `bids` | UPDATE | bids_update_by_bidder | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `branding_settings` | SELECT | org_members_read_branding | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `cashflow_forecast` | SELECT | org_members_read_cashflow | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `client_risk_scores` | SELECT | org_members_read_client_risk | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `connection_requests` | ALL | From-org can manage own connection_requests | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `connection_requests` | INSERT | From-org can insert connection_requests | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `connection_requests` | SELECT | To-org can read connection_requests to them | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `connection_requests` | UPDATE | To-org can update connection_requests to them | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `counterparty_resolutions` | ALL | org_members_manage_resolutions | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `direct_quotes` | INSERT | Bidders can insert own direct quotes | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `direct_quotes` | SELECT | Bidders can select own direct quotes | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `direct_quotes` | SELECT | Indent owners can read quotes on their indents | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `direct_quotes` | UPDATE | Bidders can update own direct quotes | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `direct_quotes` | UPDATE | Indent owners can update quotes on their indents | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `driver_ledger` | ALL | Org members can manage driver_ledger | Active OM membership (no role filter) | Own records via dedicated policies already; OM policy must exclude driver | **Restrict** |
| `driver_presence` | SELECT | Org members read driver presence | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `driver_profiles` | SELECT | drvprofile_org_view | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `driver_salary_requests` | ALL | Org members can manage driver_salary_requests | Active OM membership (no role filter) | Own records via dedicated policies already; OM policy must exclude driver | **Restrict** |
| `driver_tenures` | SELECT | org_members_view_driver_tenures | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `entity_bank_accounts` | DELETE | org_members_delete_bank_accounts | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `entity_bank_accounts` | INSERT | org_members_insert_bank_accounts | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `entity_bank_accounts` | SELECT | org_members_select_bank_accounts | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `entity_bank_accounts` | UPDATE | org_members_update_bank_accounts | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `entity_identity_anchors` | SELECT | org_members_read_anchors | Active OM membership (no role filter) | No — default least privilege | **Restrict** |
| `event_store` | SELECT | org_members_read_events | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `geofence_events` | SELECT | Org read geofence events | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `idempotency_keys` | ALL | org_members_manage_own_idempotency_keys | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `invoice_sequences` | ALL | org_members_manage_invoice_seq | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `invoices` | ALL | org_members_manage_invoices | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `loads` | ALL | loads_access_scoped | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `network_conversations` | ALL | org_members_access_network_conversations | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `network_identities` | SELECT | org_members_read_network_identities | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `network_messages` | ALL | org_members_access_network_messages | Active OM membership (no role filter) | No as fleet driver via OM (marketplace staff/bidder org paths) | **Restrict** |
| `organization_counters` | ALL | organization_counters_org_member_manage | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `organization_members` | INSERT | org_members_insert | Active OM membership (no role filter) | No self-join as driver via staff insert path | **Restrict** |
| `organization_relations` | ALL | From-org members can manage organization_relations | Active OM membership (no role filter) | No | **Restrict** |
| `organization_relations` | SELECT | To-org members can read organization_relations | Active OM membership (no role filter) | No | **Restrict** |
| `posts` | DELETE | posts_delete | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `posts` | INSERT | posts_insert | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `posts` | SELECT | posts_select_authenticated | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `posts` | UPDATE | posts_update | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `product_usage` | SELECT | org_members_view_usage | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `product_waitlist` | ALL | users_manage_own_waitlist | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `pulse_credit_referrals` | SELECT | pcr_visible_to_participants | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `pulse_credit_transactions` | SELECT | org_members_view_ledger | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `pulse_credit_wallets` | SELECT | org_members_view_wallet | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `reach_campaign_daily_metrics` | SELECT | reach_daily_metrics_owner_select | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `reach_campaign_purchases` | SELECT | reach_purchases_owner_select | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `reach_campaign_targets` | SELECT | reach_campaign_targets_select | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `reach_campaigns` | INSERT | reach_campaigns_org_insert | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `reach_campaigns` | SELECT | reach_campaigns_org_select | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `reach_campaigns` | UPDATE | reach_campaigns_org_update | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `reach_events` | INSERT | reach_events_insert_any_member | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `reach_events` | SELECT | reach_events_owner_select | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `reach_referrals` | SELECT | reach_referrals_select | Active OM membership (no role filter) | Own records via dedicated policies already; OM policy must exclude driver | **Restrict** |
| `search_index` | SELECT | org_members_search | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `shared_ledger_connection` | SELECT | org_members_view_shared_ledger_connections | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `story_views` | SELECT | story_views_select | Active OM membership (no role filter) | Persona/channel via RPC or dedicated path; OM = campaign owner staff | **Restrict** |
| `supplier_bills` | ALL | org_members_manage_supplier_bills | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `trip_assignment_audit` | INSERT | Org members can insert trip assignment audit | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_assignment_audit` | SELECT | Org members can read trip assignment audit | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_conversations` | ALL | trip_conversations_org_write | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_conversations` | SELECT | Linked client org reads trip conversations | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_conversations` | SELECT | Linked supplier org reads trip conversations for supplied trips | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_conversations` | SELECT | Linked supplier via indent reads trip conversations | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_documents` | ALL | trip_documents_org_member_manage | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_messages` | DELETE | trip_messages_org_delete | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_messages` | INSERT | trip_messages_org_insert | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_messages` | UPDATE | trip_messages_org_update | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_otps` | SELECT | Org members can read trip_otps for their trips | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_predictions` | SELECT | org_members_read_trip_predictions | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_status_audit` | SELECT | trip_status_audit_org_read | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_tracking_sessions` | SELECT | Org read tracking sessions | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_workflow_events` | INSERT | trip_workflow_org_insert | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trip_workflow_events` | SELECT | trip_workflow_org_read | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trips` | SELECT | Orgs can read trips where they are the client | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trips` | SELECT | Orgs can read trips where they are the supplier | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `trips` | UPDATE | Supplier org can update trips where they are the supplier | Active OM membership (no role filter) | Assigned/own via dedicated policies; OM staff manage | **Restrict** |
| `vehicle_health_scores` | SELECT | org_members_read_vehicle_health | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `verification_audit_logs` | SELECT | owner_reads_own_audit | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `verification_jobs` | SELECT | Allow users to view their own organization's verification jobs | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |
| `workspace_products` | SELECT | org_members_view_products | Active OM membership (no role filter) | No — staff/finance/admin only | **Restrict** |

### Inventory summary

| Action | Count |
|---|---|
| Restrict | 87 |
| Modify | 0 (dedicated driver policies already cover own-ledger / own-trips / own-referrals) |

**Implementation checklist:** treat each row as a required patch item (or covered by switching the policy to `is_org_staff`). Prefer introducing `is_org_staff` and migrating policies/helpers in batches by domain (Finance → Fleet ops → Network → Reach → Misc) to keep reviews reviewable.

### Appendix A — Additional surface via `is_org_member()` (must be patched in same ADR)

These policies do **not** all appear in the 87 (they call the helper instead of inlining `organization_members`). They are still in ADR-010 scope. Representative high-risk groups:

| Domain | Example tables | Driver via helper today after OM insert? | Action |
|---|---|---|---|
| Finance | `transactions`, `trip_finance_adjustments`, `invoices` (via other paths), vehicle ledgers | Yes — **escalation** | → `is_org_staff` |
| Master data | `clients`, `suppliers`, `vehicles`, `drivers` (org manage ALL) | Yes — **escalation** | → `is_org_staff` |
| KYC / contracts | `client_kyc_documents`, `supplier_*`, `organization_kyc_documents` | Yes — **escalation** | → `is_org_staff` |
| Commerce | `sales_orders`, `products`, `commerce_inventory` | Yes — **escalation** | → `is_org_staff` |
| Identity | `organizations` SELECT (“orgs they belong to”) | Yes — **required** | Keep `is_org_member` |
| Roster | `organization_members` read (`user_id = uid OR is_org_member`) | Own row OK; full roster via helper | Staff roster → `is_org_staff`; self-row unchanged |
| Driver ops (staff) | `driver_invites` insert/read, `driver_locations` | Yes — **escalation** | → `is_org_staff` |

Full `is_org_member` policy list: query  
`select tablename, policyname, cmd from pg_policies where schemaname='public' and (qual like '%is_org_member%' or with_check like '%is_org_member%');`  
(95 rows on linked remote as of 2026-07-26.)

---

## Deliverable 2 — Role matrix (security contract)

Intended permissions **after** ADR-010. Every RLS change in Step 2 must be verifiable against this contract — not against ad-hoc interpretation of each policy.

**Legend:** ✅ full · R read · W create/update/delete (or subset noted) · A assigned/own only · ❌ deny · P persona/RPC (not staff OM)

For each resource the matrix must answer:

1. Who can **read** it?  
2. Who can **create / update / delete** it?  
3. Does the **driver** instead have an **own-row / assigned** policy?

| Resource | Read | Create / Update / Delete | Driver own-row / assigned policy? |
|---|---|---|---|
| Organization profile | Owner, Admin, Dispatcher, Finance, Member, Driver (own org) | Owner, Admin | No (belonging via `is_org_member`) |
| Team roster (`organization_members`) | Staff: full roster · Driver: **own row only** | Owner, Admin (invite/role) | Self-row via `user_id = auth.uid()`; staff roster via `is_org_staff` |
| Clients / suppliers / vehicles | Owner, Admin, Dispatcher, Finance (R), Member (R*) | Owner, Admin, Dispatcher (ops) | ❌ No — Restrict OM/staff paths |
| Trips | Staff per role · Driver: **assigned only** | Staff manage · Driver: status update on own | ✅ `Drivers can read own trips`; `drivers_update_own_trip_status` |
| Trip chat / documents | Staff · Driver: **assigned** | Staff · Driver: send in own threads | ✅ Dedicated driver trip conversation/message policies |
| Driver ledger | Owner, Finance ✅ · Admin/Dispatcher R · Driver: **own** | Finance/Owner manage · Driver: settlement insert own | ✅ `Drivers can read own ledger`; settlement insert |
| Salary / reward withdrawal requests | Owner, Finance ✅ · Admin/Dispatcher R · Driver: **own** | Staff approve/pay · Driver: insert/read own | ✅ `Drivers can read/insert own driver_salary_requests` |
| Bank accounts / cashflow / risk | Owner (†), Finance | Owner (†), Finance | ❌ No |
| Invoices / supplier bills / transactions | Owner, Admin, Finance · Dispatcher R | Owner, Admin, Finance | ❌ No |
| Indents / loads (ops) | Staff | Staff | ❌ via OM |
| Reach campaigns (org) | Staff | Staff | ❌ via OM · **P** `get_driver_reach_stories` RPC |
| Reach referrals | Staff (fleet/campaign org) · Driver: **own** | Staff decide/bid path · Driver: recommend via RPC | ✅ `reach_referrals_select` (`driver_user_id`) |
| Pulse credits wallet / ledger | Owner, Admin, Finance · Member R* | Owner, Admin, Finance | ❌ No |
| KYC / verification docs | Owner, Admin · limited R | Owner, Admin | ❌ No |
| Bids / marketplace as org | Staff | Staff | ❌ via OM · **P** independent bidder org if applicable |
| Driver invites (send) | Staff who invite | Owner, Admin, Dispatcher | ❌ No |
| AI / branding / workspace products | Admin/Owner | Admin/Owner | ❌ No |

\* Member may be further limited by `permissions` / domain flags (existing Part 2 RBAC) — out of scope to redesign here; staff helpers must still exclude drivers.  
† Owner/admin bank access per existing product rules — do not expand in ADR-010.

### Compact role × resource view

| Resource | Owner | Admin | Dispatcher | Finance | Member | Driver |
|---|---|---|---|---|---|---|
| Organization profile | ✅ | ✅ | R | R | R | R (own org) |
| Team roster | ✅ | ✅ | R | R | R | Own row only |
| Clients / suppliers / vehicles | ✅ | ✅ | ✅ | R | R* | ❌ |
| Trips | ✅ | ✅ | ✅ | R | R* | **A** |
| Trip chat / documents | ✅ | ✅ | ✅ | R | R* | **A** |
| Driver ledger | ✅ | R | R | ✅ | ❌ | **A** |
| Salary / reward requests | ✅ | R | R | ✅ | ❌ | **A** |
| Bank / cashflow / risk | ✅† | ❌/✅† | ❌ | ✅ | ❌ | ❌ |
| Invoices / bills / transactions | ✅ | ✅ | R | ✅ | ❌ | ❌ |
| Indents / loads | ✅ | ✅ | ✅ | R | R* | ❌ via OM |
| Reach campaigns | ✅ | ✅ | ✅ | R | R* | ❌ OM · **P** |
| Reach referrals | ✅ | ✅ | ✅ | R | R* | **A** · fleet = staff |
| Pulse credits | ✅ | ✅ | R | ✅ | R* | ❌ |
| KYC / verification | ✅ | ✅ | R | R | ❌ | ❌ |
| Bids (as org) | ✅ | ✅ | ✅ | R | R* | ❌ OM · **P** |
| Driver invites (send) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| AI / branding / products | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Boost persona mapping (unchanged product behaviour)

| Persona | `organization_members` | Stories CTA |
|---|---|---|
| Independent | No driver membership (or none at all) | No recommend / no fleet incentive |
| Pending | `role=driver`, `status=pending` | Join fleet |
| Fleet | `role=driver`, `status=active` | Recommend + incentive on conversion |

### Role matrix sign-off criteria (required before Step 2)

The role matrix is the **authorization specification** for the platform. After sign-off, every RLS migration must be **traceable to an approved matrix entry** — not to an implementer’s interpretation.

```
Platform Principle 5
        │
        ▼
ADR-010
        │
        ▼
Approved Role Matrix   ← named sign-off (this checkpoint)
        │
        ▼
Helper Contract  (is_org_member / is_org_staff)
        │
        ▼
RLS Policies
        │
        ▼
Validation (P1–P3) → Pilot Entry
```

If a future reviewer asks “Why does this policy use `is_org_staff()` instead of `is_org_member()`?”, the answer points to the **approved role matrix**.

**RLS traceability — treat as non-conformant until answered or exempted:**

1. Which **matrix row** authorizes this policy?  
2. Which Principle 5 concern is enforced — **identity**, **authority**, or **data ownership**?  
3. Does the helper / predicate (`is_org_member`, `is_org_staff`, or resource own-row logic) **match that intent**?

**Named sign-off must explicitly confirm agreement that:**

1. Every resource’s **read** permissions are correct.  
2. Every resource’s **create / update / delete** permissions are correct.  
3. Every driver-access path is intentionally either **own-row** or **explicit authority** (where applicable) — never accidental staff access.  
4. **No resource** relies on **implicit** access through organisational membership alone.

Once those four items are approved, Step 2 is an **implementation exercise**, not a design exercise. Do not reopen matrix design during migration; if a gap appears, stop the batch and amend the matrix under a dated sign-off revision.

**Enforceability (Principle 5):** Any future ADR or feature that conflates organisational membership, operational authority, and data ownership must either be **redesigned** or **explicitly justify why Principle 5 does not apply** (approved architectural exemption).

**Current state:** Principle 5 invariant ✅ · ADR-010 architecture ✅ · Role matrix normative spec ✅ · Step 2 / P1–P3 / Pilot Entry ⛔ blocked pending named sign-off. **No further architectural decisions until formal matrix approval.** Next work is governance execution only.

**Sign-off:** ☐ Accepted · Name: ________ · Date: ________  
*(Until signed: ADR-010 Step 2, P1–P3, and Pilot Entry remain blocked.)*

### Principle 5 design review checklist (ongoing — every ADR / new table / helper / RLS policy)

Canonical wording: Permanent Platform Principle 5 in `docs/PULSE_GROWTH_PLATFORM.md`.

- [ ] Does this check **identity**? (`is_org_member` / belonging)
- [ ] Does this check **authority**? (`is_org_staff` or explicit authority helper)
- [ ] Does this enforce **least-privilege data ownership**? (resource RLS / own-row)
- [ ] Could adding a new role inadvertently **widen** access?
- [ ] Is the policy intent **obvious from the helper names**?

If a design cannot answer the three independent questions (belong? act? which rows?) separately, it likely violates Principle 5.

### Gate sequence (Pilot Entry)

```
Role Matrix Sign-off
        │
        ▼
ADR-010 Step 2  (is_org_staff + RLS migration)
        │
        ▼
Role CHECK
        │
        ▼
Driver Lifecycle  (onboarding / backfill)
        │
        ▼
P1 Validation
        │
        ▼
P2 → P3 → Pilot Entry
```

Architecture first · Security before functionality · Evidence before pilot · Correctness over schedule.

---

## Deliverable 3 — Patch sequence (do not reorder)

1. **Sign off** the role matrix (criteria above).  
2. **Add `is_org_staff(org_id)`** (and tests) — staff roles only, `status='active'`.  
3. **Migrate policies in controlled batches** (Finance → Fleet ops → Network → Reach → Misc), validating behaviour after each batch — 87 inline OM policies **and** staff policies that call `is_org_member`. Track against Deliverable 1.  
4. **Verify dedicated driver policies** still grant own-ledger / own-trips / own-referrals (regression as driver JWT).  
5. **Only then:** widen `chk_org_members_role` to include `'driver'`.  
6. **Onboarding lifecycle:** invite sent → OM `pending`; accept → `active`; `leave_fleet` → `inactive`.  
7. **Backfill** 38 linked drivers (active stints with `user_id` and `left_at IS NULL`).  
8. **Re-run P1**; proceed to P2 only if P1 passes.

---

## Acceptance criteria for Step 1 (this document)

- [x] Inventory of all 87 role-blind inline OM policies  
- [x] Recognition of `is_org_member` blast radius (95 policies) — **authorization boundary bug, not cleanup count**  
- [x] Explicit role matrix with Read / CUD / driver own-row columns  
- [x] Helper strategy (`is_org_member` vs `is_org_staff`)  
- [ ] **Role matrix sign-off** (criteria above) before Step 2  

**Next milestone:** successful completion of ADR-010 (not a new feature). After that, re-run P1 against the corrected authorization model and resume Pilot Entry.  
**Not next:** CHECK widen, onboarding wire-up, or backfill — those wait until policy migration passes batch validation.

---

## Evidence queries (reproducible)

```sql
-- 87 role-blind inline OM policies
select tablename, policyname, cmd
from pg_policies
where schemaname='public'
  and (coalesce(qual,'') like '%organization_members%' or coalesce(with_check,'') like '%organization_members%')
  and coalesce(qual,'') not like '%role%'
  and coalesce(with_check,'') not like '%role%'
order by 1,3,2;

-- is_org_member blast radius
select count(*) from pg_policies
where schemaname='public'
  and (coalesce(qual,'') like '%is_org_member%' or coalesce(with_check,'') like '%is_org_member%');

-- role CHECK
select pg_get_constraintdef(oid) from pg_constraint where conname='chk_org_members_role';
```
