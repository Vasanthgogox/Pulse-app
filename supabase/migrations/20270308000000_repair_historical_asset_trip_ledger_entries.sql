-- A8.4.1 Phase 3 — DRAFT, NOT YET APPROVED FOR EXECUTION.
--
-- Historical repair for the bug fixed in this same session:
-- ensureAssetCompletionAutoEntries() (features/trips/services/trips.service.ts)
-- wrote ledger_entity_type 'CLIENT'/'DRIVER' (uppercase) from 2026-05-02
-- until the fix, silently failing transactions_ledger_entity_type_check on
-- every call. Confirmed live: 70 completed asset-mode trips exist; zero
-- transactions rows anywhere have ledger_category IN ('TRIP_REVENUE',
-- 'DRIVER_COMMISSION'); 45 of the 70 have zero transactions rows of any
-- kind; the other 25 have manually-entered rows from the finance UI under
-- different categories (Trip Payment, Trip Commission, Advance Payment,
-- SUPPLIER PAYMENT, TOLL, FUEL, OTHER).
--
-- SCOPE: this repairs ONLY the missing TRIP_REVENUE / DRIVER_COMMISSION
-- automatic entries for completed asset-mode trips. It does not touch
-- Marketplace platform fees (source='market_bid' trips get no repair row
-- here regardless), Reach credits, or relationship/direct-quote (market-
-- mode) trip economics.
--
-- DEDUP RULE (same one ensureAssetCompletionAutoEntries() itself already
-- uses, applied here at repair time): a trip is skipped for the client-
-- revenue repair if it already has ANY transactions row with
-- contact_type='client' AND amount_in>0 -- regardless of that row's
-- ledger_category or exact amount. Same rule for driver-commission,
-- keyed on contact_type='driver' AND amount_out>0. This is deliberately
-- conservative: sync_trip_payment_status() sums ALL contact_type='client'
-- amount_in rows on a trip regardless of category to compute
-- trips.amount_paid/payment_status, so inserting a second client-side row
-- alongside an existing manual one would double-count "amount received."
-- Per this rule, of the 25 trips with existing rows: 5 are missing ONLY
-- the client-revenue side, 5 are missing ONLY the driver-commission side,
-- and 15 already have both sides covered (by manual entries) and get no
-- repair row at all. Combined with the 45 zero-row trips:
--
-- VERIFIED by dry-running this exact SQL inside BEGIN/ROLLBACK (no data
-- changed) before writing this comment -- do not trust the numbers below
-- without re-verifying the same way if this file is edited further:
--   TRIP_REVENUE rows to be inserted:      50, summing to ₹27,30,199
--   DRIVER_COMMISSION rows to be inserted: 42, summing to ₹4,67,880
--
-- Note the DRIVER_COMMISSION count is higher than a first hand-count
-- suggested (33): 9 of the 42 have driver_commission = 0 exactly but a
-- non-zero supplier_rate. ensureAssetCompletionAutoEntries()'s real JS
-- computes driverTargetAmount as `driver_commission || supplier_rate || 0`
-- -- `||` treats an exact 0 as falsy, so it falls back to supplier_rate
-- for these 9, same as this migration's `coalesce(nullif(driver_commission,
-- 0), supplier_rate, 0)` does. A plain coalesce (fails to skip an explicit
-- zero) undercounts these 9 -- confirmed the hard way while drafting this.
--
-- Neither total equals the full ₹32,44,917 / ₹3,24,490 from the A8.4 audit
-- -- those were sums across ALL 70 trips' trip-level client_price/
-- driver_commission columns; the totals here are only the PORTION not
-- already represented by an existing manual transactions row, per the
-- dedup rule above.
--
-- TRIGGER SIDE-EFFECT HANDLING (this is the one judgment call in this
-- migration that needs explicit sign-off, not just the dedup rule above):
--   - trg_sync_trip_payment_status: left ENABLED. Desired -- this is exactly
--     how trips.payment_status/amount_paid get corrected automatically,
--     with no separate repair needed for those columns.
--   - trg_set_transaction_payment_ref: left ENABLED. Harmless metadata
--     population, matches the live pattern for every other transaction row.
--   - trg_sync_driver_ledger_from_transaction: DISABLED during this
--     migration's inserts, then re-enabled. Reasoning: for a DRIVER_COMMISSION
--     row this trigger inserts a new driver_ledger 'adjustment' row
--     ("Sync: FLEET_PAID_PENDING") UNLESS the driver already has a
--     'settlement' row for that trip. These are trips completed 1-10+ weeks
--     ago; it is entirely possible the driver was already paid through some
--     informal/cash process this repair has no visibility into. Silently
--     manufacturing a brand-new "pending payout" line for old trips risks
--     surfacing stale/wrong "owed" amounts, or worse, prompting a duplicate
--     real payout. This is a real driver-ledger-UI-visible consequence, not
--     a pure bookkeeping fix -- disabling it during the backfill treats this
--     repair as a ledger-completeness fix only, not a live payable claim.
--   - trg_transactions_broadcast_ledger_chat: DISABLED during this
--     migration's inserts, then re-enabled. Reasoning: confirmed live that
--     at least 4 of the repair-target trips (TRP017/c2d70eb8, TRP051/
--     b7760b0f -- revenue-only repair target, TRP029/0b87d18d, TRP033/
--     619cc590, TRP037/20250ca3, TRP021/3ef45e40 -- also a revenue-only
--     repair target) have a client with a non-null linked_organization_id.
--     Inserting a TRIP_REVENUE row (contact_type='client') for these would
--     fire this trigger and post a live chat message ("X received ₹Y ·
--     TRIP_REVENUE") to that linked business today, about a trip that
--     completed weeks ago -- a confusing, out-of-context notification, not
--     a desired side effect of a data-integrity repair.
--
-- THIS FILE IS NOT PUSHED. Do not run `supabase db push` with this file
-- present until the repair set and this trigger-handling approach are
-- explicitly approved. Preflight/dry-run against it is fine (read-only).

BEGIN;

ALTER TABLE public.transactions DISABLE TRIGGER trg_sync_driver_ledger_from_transaction;
ALTER TABLE public.transactions DISABLE TRIGGER trg_transactions_broadcast_ledger_chat;

-- TRIP_REVENUE repair (contact_type='client' side missing).
INSERT INTO public.transactions (
  organization_id, trip_id, party_name, description,
  amount_in, amount_out, transaction_date, contact_id,
  contact_type, ledger_entity_type, ledger_flow_type, ledger_category
)
SELECT
  t.organization_id,
  t.id,
  coalesce(nullif(trim(t.client_name), ''), 'Client'),
  'TRIP REVENUE REPAIR | Mode: System (A8.4.1)',
  t.client_price,
  0,
  coalesce(t.completed_at::date, current_date),
  t.client_id,
  'client',
  'client',
  'receivable',
  'TRIP_REVENUE'
FROM public.trips t
WHERE t.status = 'completed'
  AND coalesce(t.trip_payout_mode, CASE WHEN t.supplier_id IS NOT NULL THEN 'market' ELSE 'asset' END) = 'asset'
  AND coalesce(t.client_price, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions tx
    WHERE tx.trip_id = t.id AND tx.contact_type = 'client' AND coalesce(tx.amount_in, 0) > 0
  );

-- DRIVER_COMMISSION repair (contact_type='driver' side missing).
INSERT INTO public.transactions (
  organization_id, trip_id, party_name, description,
  amount_in, amount_out, transaction_date, contact_id,
  contact_type, ledger_entity_type, ledger_flow_type, ledger_category
)
SELECT
  t.organization_id,
  t.id,
  coalesce(nullif(trim(t.driver_display_name), ''), 'Driver'),
  'DRIVER COMMISSION REPAIR | Mode: System (A8.4.1)',
  0,
  coalesce(nullif(t.driver_commission, 0), t.supplier_rate, 0),
  coalesce(t.completed_at::date, current_date),
  t.driver_id,
  'driver',
  'driver',
  'payable',
  'DRIVER_COMMISSION'
FROM public.trips t
WHERE t.status = 'completed'
  AND coalesce(t.trip_payout_mode, CASE WHEN t.supplier_id IS NOT NULL THEN 'market' ELSE 'asset' END) = 'asset'
  AND coalesce(nullif(t.driver_commission, 0), t.supplier_rate, 0) > 0
  AND t.driver_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions tx
    WHERE tx.trip_id = t.id AND tx.contact_type = 'driver' AND coalesce(tx.amount_out, 0) > 0
  );

ALTER TABLE public.transactions ENABLE TRIGGER trg_sync_driver_ledger_from_transaction;
ALTER TABLE public.transactions ENABLE TRIGGER trg_transactions_broadcast_ledger_chat;

COMMIT;
