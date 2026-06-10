# Shared Ledger by Trip and Transaction — Product Requirements Document

## 1) Executive Summary

The **Shared Ledger by Trip and Transaction** feature provides a unified reconciliation layer across all Pulse pages where money movement is shown: Finance ledger, trip finance, compare/verify, entity detail, and driver passbook/wallet.

It allows users to:
- View **internal vs partner** books at trip level and transaction level.
- Detect status (`MATCHED`, `MISMATCH`, `PENDING`, `OFFLINE`).
- Raise/receive/resolve disputes with evidence.
- Confirm payment updates and sync settlement to their own ledger.
- Keep driver and dispatcher views consistent on the same financial truth.

Business outcome: lower reconciliation delay, fewer payment disputes, clearer ownership of “who paid/received what, for which trip, and when.”

---

## 2) Product Scope

### In Scope
- Shared ledger status and reconciliation data on all finance/trip pages.
- Trip-level compare/verify and transaction-level drill down.
- Dispute lifecycle: raise, receive, accept/decline, resolve.
- Driver-side payment updates when fleet marks payment as done.
- Unified labels and statuses across dispatcher/fleet and driver apps.

### Out of Scope
- Core schema migration authoring in this repo (owned by pulse-unified-base).
- Third-party payout rails (bank API execution).
- Billing/commercial invoicing workflows.

---

## 3) Personas and Jobs-to-be-Done

| Persona | Job to be done | Primary pages |
|---|---|---|
| Fleet Owner / Dispatcher | Reconcile books with clients/suppliers quickly | Finance, Trip Detail, Compare/Verify |
| Finance Admin | Audit transaction variance and resolve disputes | Ledger detail, Shared Ledger views |
| Driver | Verify fleet-marked payments and keep passbook correct | Driver Requests, Driver Passbook, Driver Wallet |
| Ops/Support | Diagnose mismatch causes and stale sync states | Entity detail, dispute states, shared ledger indicators |

---

## 4) Problem Statement

Current cash and trip flows are distributed across pages. Users need a reliable way to answer:
1. Is this amount matched with the partner’s ledger?
2. Is variance caused by sales mismatch, paid mismatch, or sync latency?
3. Has fleet marked payment, and has driver verified it?
4. What is the dispute state and next best action?

Without a shared contract, users see inconsistent statuses, delayed settlement confirmation, and repeated manual follow-up.

---

## 5) Goals and Success Metrics

### Product Goals
- Provide one shared reconciliation model reused across all pages.
- Reduce ambiguity in payment status for trip and transaction rows.
- Enable fast closure: mismatch -> action -> resolved/matched.

### Success Metrics (MVP)
- **Reconciliation Time**: median time from mismatch detection to resolved reduced by 40%.
- **Dispute Closure Rate**: >80% disputes resolved within 72 hours.
- **Driver Confirmation Lag**: median fleet-marked-paid to driver-verified-settlement <24 hours.
- **Status Accuracy**: <2% of rows with inconsistent state across pages.

---

## 6) Canonical Definitions

- **Trip-level shared ledger**: Aggregated sales and paid amounts for one `trip_id` from both sides.
- **Transaction-level shared ledger**: Raw/near-raw entry comparison for audit traceability.
- **Internal book**: Current org’s ledger view.
- **Partner book**: Counterparty org’s reconciled/visible ledger view.
- **Fleet marked paid pending**: Fleet update exists; driver has not verified to settlement.
- **Settlement**: Confirmed receipt/payment that updates driver ledger (`type='settlement'`).

---

## 7) End-to-End User Flows

### Flow A: Dispatcher/Fleet Reconciliation
1. Open Finance/Trip detail row.
2. See shared status chip (`MATCHED`/`MISMATCH`/`PENDING`/`OFFLINE`).
3. Open detail page (full-page, not inline).
4. Review trip ledger comparison and transaction history.
5. If mismatch: raise dispute or update own book.
6. On success, row returns to matched/updated state.

### Flow B: Dispute Resolution
1. Receiver sees “Dispute Received”.
2. Opens details and chooses Accept & auto-update OR Decline.
3. System updates ledger and status (`RESOLVED`) with audit trail.

### Flow C: Driver Payment Update
1. Fleet marks payment (pending verification marker + metadata).
2. Driver sees update in **Requests > Payment Updates** and passbook rows.
3. Driver confirms “Verify & update payment”.
4. System writes driver settlement entry and updates wallet/passbook totals.

---

## 8) Functional Requirements

### FR-1: Shared Status Model
- Every relevant row must expose one canonical status:
  - `MATCHED`, `MISMATCH`, `PENDING`, `OFFLINE`, plus dispute badges (`OPEN`, `RECEIVED`).
- Status semantics must be consistent across Finance, Trip, and Driver views.

### FR-2: Detail View by Route
- Tapping ledger rows opens a dedicated detail route (`/finance-entry/[id]`) with payload.
- Inline extended expansion is disabled for this interaction model.

### FR-3: Trip + Transaction Composition
- Detail page must show:
  - Entry metadata (type/date/amount/sync amount/note).
  - Associated trip block.
  - Trip ledger comparison card.
  - Transaction history timeline for same trip.

### FR-4: Compare and Verify
- Must support internal vs partner `sales` and `paid` at trip level.
- Must show variance with explicit labels.
- Must support action buttons:
  - `Raise Dispute`
  - `Update My Book` (with confirm)
  - `Accept & Auto-Update` for received dispute (with confirm)

### FR-5: Driver Shared-Ledger Integration
- Driver passbook and requests must surface fleet payment updates:
  - Mode (`UPI`, `BANK`, `CASH`) + UTR if present.
  - CTA to verify and update payment.
- Verified action inserts `driver_ledger` settlement and updates totals.

### FR-6: Payment Updates Quick Tab
- Driver Requests includes `All` + `Payment Updates` quick tab.
- Payment Updates aggregates across connected fleets and deduplicates latest update per trip.

### FR-7: Filters
- Trips page supports date quick filters (`Today`, `Yesterday`, `This Week`, `This Month`) and custom range.
- Filters affect trip list while preserving reconciliation statuses.

---

## 9) Page-Level Requirements Matrix

| Page | Required shared-ledger behavior |
|---|---|
| Finance Ledger (table/transaction/kanban) | Tap row -> full detail page; show status cues; no inline expanded detail |
| Finance Entry Detail | Show trip + transaction reconciliation blocks and party status |
| Trip Detail Finance Tab | Show asset/aggregate tags; enforce driver-payment logic; reconciliation cards |
| Compare/Verify | Show mismatch math, dispute actions, and update-book action |
| Driver Requests | Payment Updates quick tab across fleets |
| Driver Passbook | Fleet-marked-paid indicator + verify/update CTA |
| Driver Wallet | Same verification and settlement write behavior |

---

## 10) Data and API Contract (Backend Alignment)

Backend contract is defined in:
- `docs/SHARED_LEDGER_BACKEND_CONTRACT.md`
- `docs/SHARED_LEDGER_MISMATCH_DISPUTE_PLAN.md`

Required capabilities:
- `get_verified_balances(org_id)`
- `get_shared_ledger_connections(org_id)`
- `get_shared_ledger_entries(org_id, partner_key)`
- `get_shared_ledger_trip_summary(org_id, partner_key)`
- `create_dispute(...)`
- `get_disputes(...)`, `get_disputes_received(...)`
- `resolve_dispute(...)`
- `accept_partner_view(...)`

Driver settlement policy dependency:
- `supabase/migrations/20250324120000_driver_ledger_driver_settlement_insert.sql`

---

## 11) State Model and Edge Cases

### Required states
- `MATCHED`: Internal and partner values aligned.
- `MISMATCH`: Values differ; action needed.
- `PENDING`: Partner view unavailable/awaiting sync.
- `OFFLINE`: Counterparty not integrated or no live linkage.
- `DISPUTE_OPEN`/`DISPUTE_RECEIVED`: Dispute lifecycle overlays.

### Edge cases
- Partner disconnected: show offline explanatory copy.
- Partial data (trip exists, no partner entries): show pending with clear helper text.
- Duplicate fleet-paid markers: dedupe by latest `created_at` per trip.
- Already settled trip: hide verify CTA.
- Missing UTR/mode: show fallback labels without blocking action.

---

## 12) UX and Design Requirements

- Keep visual language aligned with current Pulse dark-cinematic finance style.
- Typography should remain compact, high-density, and consistent with existing ledger cards.
- High-priority actions (`Verify & update payment`, `Raise Dispute`) must be clearly visible but confirm-gated.
- Detail page should prioritize:
  1) amount and status,
  2) trip context,
  3) reconciliation comparison,
  4) timeline evidence.

---

## 13) Security, Permissions, and Audit

- Enforce capability-based access from `lib/capabilities.ts`.
- Respect org scoping and RLS on all shared-ledger and dispute operations.
- Every mutating action must be auditable:
  - who acted,
  - action type,
  - before/after snapshots,
  - timestamp.

---

## 14) Analytics and Monitoring

Track events:
- `shared_ledger_detail_opened`
- `shared_ledger_mismatch_seen`
- `shared_ledger_dispute_raised`
- `shared_ledger_dispute_received`
- `shared_ledger_dispute_accepted`
- `shared_ledger_dispute_declined`
- `driver_payment_update_seen`
- `driver_payment_verified`

Operational metrics:
- RPC error rate by endpoint.
- Sync delay from fleet marker to driver verify.
- % rows in pending/offline over time.

---

## 15) Rollout Plan

### Phase 1 (MVP)
- Detail-page-only interaction model for ledger rows.
- Driver payment update visibility and verification.
- Dispute creation and resolution wiring.

### Phase 2
- Advanced filtering and bulk reconciliation actions.
- Richer evidence attachments and dispute timelines.

### Phase 3
- SLA automation (reminders/escalations) and assistant-guided reconciliation.

---

## 16) Acceptance Criteria

1. From every finance ledger row interaction, detail opens as full page route.
2. No remaining inline expanded ledger detail for the new interaction flow.
3. Compare/Verify shows partner mismatch where backend data exists.
4. Dispute flows (raise/receive/accept/decline) complete with status updates.
5. Driver Requests `Payment Updates` tab lists only fleet-marked-paid, not-yet-settled updates.
6. Driver verify action writes settlement and updates passbook/wallet totals.
7. Status labels are consistent across Finance, Trip, and Driver pages.
8. Lint/type checks pass for touched modules.

---

## 17) Dependencies and References

- `docs/SHARED_LEDGER_BACKEND_CONTRACT.md`
- `docs/SHARED_LEDGER_MISMATCH_DISPUTE_PLAN.md`
- `docs/TRIP_TO_FINANCE_FLOW.md`
- `docs/CORE_ACCOUNTING_MODEL.md`
- `docs/LEDGER_TRUCK_EXPENSE_AND_TRIP_DISPLAY.md`
- `services/sharedLedgerService.ts`
- `features/finance/services/finance.service.ts`
- `features/drivers/services/drivers.service.ts`

