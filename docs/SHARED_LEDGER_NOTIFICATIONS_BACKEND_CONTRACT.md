# Shared Ledger Notifications — Backend Contract (pulse-unified-base)

This document defines the backend contract required by pulse to surface
Shared Ledger notifications in the dispatcher notification center and bell badge.

Schema and migrations must be implemented in pulse-unified-base. This mobile repo only
consumes the contract.

## Goals

- Reuse existing salary-request notification UX pattern without breaking it.
- Add shared-ledger notifications as an additive stream.
- Guarantee idempotent event generation and org-scoped read/update.

## Table: `shared_ledger_notifications`

Recommended columns:

- `id` uuid primary key
- `organization_id` uuid not null
- `partner_org_id` uuid null
- `partner_key` text null (`contact_id` in many flows)
- `trip_id` uuid null
- `transaction_id` text null
- `source_dispute_id` uuid null
- `event_type` text not null
- `status` text not null default `open`
- `title` text not null
- `subtitle` text null
- `amount_meta` numeric null
- `payload_json` jsonb not null default '{}'::jsonb
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()
- `read_at` timestamptz null
- `handled_at` timestamptz null
- `handled_by_user_id` uuid null

### Suggested enums/checks

- `event_type` in:
  - `dispute_received`
  - `dispute_status_changed`
  - `pending_partner_followup`
  - `mismatch_detected`
  - `partner_only_ghost`
- `status` in:
  - `open`
  - `read`
  - `handled`
  - `resolved`

### Idempotency

Persist a deterministic `dedupe_key` (text) and unique index on active events.
Suggested dedupe input:

- `organization_id`
- `event_type`
- one of: `source_dispute_id`, `trip_id`, `transaction_id`
- lifecycle bucket (`open` window)

Example strategy:

- unique index on (`organization_id`, `dedupe_key`, `status`) where
  `status in ('open','read')`

This prevents repeated renders/reconciliations from generating duplicate cards.

## RLS Policy Expectations

- Org members can select rows where `organization_id` belongs to their membership.
- Org members can update only read/handled lifecycle columns for their org rows.
- No cross-org visibility.

## RPC Contract

### `get_shared_ledger_notifications(org_id, status_filter default 'all')`

Returns rows sorted by `created_at desc`.

`status_filter` accepted values:

- `all`
- `action_required` (usually `open`)
- `history` (`read|handled|resolved`)

### `get_shared_ledger_notifications_count(org_id)`

Returns actionable count for bell badge.

Result shape:

- `{ actionable_count: number }[]` or scalar-equivalent.

### `mark_shared_ledger_notification_read(id, org_id)`

Sets:

- `status = 'read'` (if currently open)
- `read_at = now()`

### `mark_shared_ledger_notification_handled(id, org_id)`

Sets:

- `status = 'handled'` (if currently open/read)
- `handled_at = now()`
- `handled_by_user_id = auth.uid()`

## Event Sources

Events should be emitted by backend workflows (not by frontend renders):

- `dispute_received`: when another org creates an OPEN dispute against this org.
- `dispute_status_changed`: when dispute raised by this org becomes accepted/declined/resolved.
- `pending_partner_followup`: stale partner pending conditions after threshold.
- `mismatch_detected`: mismatch transition occurs.
- `partner_only_ghost`: partner-only trip/txn appears.

## Client Payload Guidance

`payload_json` should include enough routing context for app CTA navigation:

- `entity_type`: `CLIENT | SUPPLIER`
- `entity_id`: local contact id (when resolvable)
- `partner_name`
- `trip_id` / `transaction_id`
- `route_hint` (optional)
- `cta_kind`: `review_dispute | update_my_book | open_shared_tab | open_trip_ledger`

If these are missing, app degrades to finance root fallback.
