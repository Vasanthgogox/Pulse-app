# Client activity feed & one-tap reconciliation (planned)

This document captures the **product/architecture intent** for a layer on top of the existing Gogox Pulse ledger. It does **not** replace current ledger creation, RLS, or trip financial snapshot logic.

## Objective

Let counterparties (e.g. supplier/driver) see entries created by others (client/supplier), then **explicitly**:

1. Add them to their own ledger (if not present)  
2. Match/link to an existing entry (if duplicate)  
3. Raise a dispute (reuse existing dispute module)

**No auto-creation** in another party’s ledger. Every write is user-triggered.

## Data model (future migrations)

### `ledger_entries` (extend)

- `counterparty_id` (UUID, nullable → required)  
- `counterparty_role` (`client` | `supplier` | `driver`)  
- `trip_id` (UUID, nullable)  
- `source` (`manual` | `imported` | `external_feed`), default `manual`  
- `external_ref_id` (UUID, nullable) — points at the other party’s row  
- `is_reconciled` (boolean, default false)  
- `reconciled_at` (timestamptz, nullable)

### New: `entry_visibility`

Controls which rows appear in a counterparty’s feed:

- `id`, `entry_id` → `ledger_entries`, `visible_to_user_id`, `visible_to_role`, `created_at`

### New: `entry_match_links`

After user confirms a match:

- `entry_id_1`, `entry_id_2`, `status` (`matched` | `disputed`), `created_by`, `created_at`

## Backend (future)

1. On create: if `counterparty_id` set, insert visibility for that user.  
2. **GET** `/feed/client-activity` — rows visible to current user, newest first.  
3. **Duplicate check** (for “Add to my books”): same counterparty, amount, `trip_id` (if any), date ±3 days → `possible_duplicate`.  
4. Actions: **ADD** (new row, `source = external_feed`, `external_ref_id`), **MATCH** (link + set reconciled on both), **DISPUTE** (existing flow, both IDs).

## Frontend (future)

- Tab/section **“From clients”** with cards (amount, trip, type, created by).  
- **Add to my books** → duplicate API → create or open Compare.  
- Reuse Compare & Verify with actions: Match & link, Edit & save, Raise dispute.  
- Ledger list badges: “From client”, “Reconciled”.  
- Push/in-app: “Client ABC added a ₹… transaction for you”.

## Constraints

- Backward compatible APIs.  
- Do not silently write to another org’s ledger.  
- Keep existing trip-first ledger UX; this is an additional feed + reconciliation path.

## Ledger UX guardrail (implemented elsewhere)

Trip financial snapshot chips must respect **Cash IN vs OUT** vs **party**: client receive = **IN**; supplier/driver pay = **OUT**. Mismatched actions are shown **muted** with an alert, not applied.
