# Shared Ledger — Backend contract (Q-unified-base)

This document describes the API and table contract that q-mobile expects from the backend (Q-unified-base). Schema and migrations live in Q-unified-base; q-mobile only consumes Supabase RPC/Edge and tables.

## Tables

### shared_ledger_connection

- `org_a_id` (uuid), `org_b_id` (uuid), `status` ('PENDING' | 'ACTIVE')
- Used to know which partners are "integrated" for Shared Ledger (handshake).

### shared_ledger_entries (or equivalent)

- Partner’s view of ledger entries; used for verified balances (server-side aggregation) and for dispute audit (transaction-level).
- Must support lookup by org and partner (e.g. `partner_key` = contact_id or agreed id).

### dispute

- `id` (uuid)
- `transaction_id` (internal transaction id)
- `raised_by_org_id`, `partner_org_id`
- `status`: 'OPEN' | 'RESOLVED' | 'WITHDRAWN'
- `internal_snapshot`, `partner_snapshot` (numbers)
- `evidence_url` or `evidence_hash` (optional)
- Optional: `reason_code`, `proposed_amount`
- One active (OPEN) dispute per (transaction_id, org pair) to avoid concurrent disputes.

## RPC / Edge APIs

### get_verified_balances(org_id)

- Returns: `{ partner_key: string, balance: number }[]`
- `partner_key` = contact_id or agreed id; `balance` = partner’s view in base currency (e.g. INR).
- Server-side aggregation only (O(n) on server).

### get_shared_ledger_connections(org_id)

- Returns list of active connections for the org, e.g. `{ partner_org_id: string, contact_id?: string }[]`, so the app can build `integratedPartnerKeys`.

### get_shared_ledger_entries(org_id, partner_key)

- Returns transaction-level entries for dispute audit: `{ id: string, amount: number, transaction_date: string, reference_id?: string }[]`.
- `reference_id` = trip_id for aggregation. **Bilateral only:** only rows where partner org’s `contact_id` = counterparty (the caller’s contact in the partner’s book). Excludes trip-linked expense/driver/vehicle entries so the client view does not show supplier internal costs.

### get_shared_ledger_trip_summary(org_id, partner_key)

- Returns per-trip partner view for Compare & Verify: `{ trip_id: uuid, partner_sales: numeric, partner_paid: numeric }[]`.
- `partner_sales` = partner’s trip charge (from partner’s `trips.client_price`). `partner_paid` = sum of bilateral `amount_in` only (what the client has paid). Used so reconciliation shows agreed charge vs paid, without supplier expenses in the client view. App prefers this over aggregating entries when available.

### create_dispute(payload)

- Payload: `transaction_id`, `raised_by_org_id`, `partner_org_id`, `internal_snapshot`, `partner_snapshot`, optional `reason_code`, `evidence_url`, `proposed_amount`.
- Returns: `{ dispute_id }` or error (e.g. conflict if already OPEN for same transaction).

### get_disputes(org_id, partner_key_or_org_id?)

- Returns disputes for the org, optionally filtered by partner; used to show "Dispute active" per row.

### get_disputes_received(org_id)

- Returns disputes where `partner_org_id = org_id` and `status = 'OPEN'` (i.e. the other party raised against this org). Used so the receiver (client/supplier) sees "Dispute Received" and can Accept or Decline.

### resolve_dispute(dispute_id, action, resolved_by_org_id)

- `action`: 'ACCEPT' | 'DECLINE'.
- **ACCEPT:** Backend updates the *receiver’s* ledger (partner_org_id’s book) to match the raiser’s view (e.g. using `internal_snapshot` / proposed amounts). Sets dispute `status = 'RESOLVED'` (and e.g. `resolution_type = 'ACCEPTED_BY_PARTNER'`). Resolving variance in O(n) on server.
- **DECLINE:** Sets dispute to RESOLVED with outcome declined (or a dedicated DECLINED status). Raiser can see "Declined by partner".

### accept_partner_view(org_id, trip_id, partner_sales, partner_paid)

- Self-correction: the org (raiser side) accepts the partner’s numbers and updates *their own* ledger for that trip to match `partner_sales` / `partner_paid`. No dispute is created. Used for "Update My Book" so the row can become MATCHED without raising a dispute.
- **Required for mobile:** If this RPC is not deployed, the app shows "Update failed" and asks the user to contact their administrator. Create the function in Q-unified-base migrations and deploy for "Update my book" to work.
