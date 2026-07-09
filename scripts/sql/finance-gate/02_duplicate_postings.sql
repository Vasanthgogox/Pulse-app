-- Phase 1 / Phase 9 — Duplicate posting detection: the same business event
-- recorded more than once in the ledger. Read-only. Zero rows expected.
-- Opening-balance rows and chat-mirror pairs are excluded by design (they are
-- intentionally two rows for one event: mirror-of-source, or backfilled history).

-- 2a. transactions: same org + trip + party + amount + date, posted more than once,
-- excluding opening balances and chat mirrors (both of which legitimately duplicate
-- an amount without duplicating the underlying event).
SELECT 'transactions: duplicate posting' AS check_name,
       organization_id, trip_id, party_name, amount_in, amount_out, transaction_date,
       count(*) AS occurrences, array_agg(id) AS row_ids
FROM public.transactions
WHERE is_opening_balance = false
  AND chat_mirror_of_transaction_id IS NULL
GROUP BY organization_id, trip_id, party_name, amount_in, amount_out, transaction_date
HAVING count(*) > 1;

-- 2b. driver_ledger: same driver + trip + type + amount posted more than once on the same day
SELECT 'driver_ledger: duplicate posting' AS check_name,
       organization_id, driver_id, trip_id, type, amount, created_at::date AS posted_date,
       count(*) AS occurrences, array_agg(id) AS row_ids
FROM public.driver_ledger
GROUP BY organization_id, driver_id, trip_id, type, amount, created_at::date
HAVING count(*) > 1;

-- 2c. vehicle_ledger_entries: same source_type + source_id should post exactly once —
-- a repeat means the same fuel/toll/maintenance record was posted to the ledger twice.
SELECT 'vehicle_ledger_entries: duplicate source posting' AS check_name,
       organization_id, vehicle_id, source_type, source_id,
       count(*) AS occurrences, array_agg(id) AS row_ids
FROM public.vehicle_ledger_entries
GROUP BY organization_id, vehicle_id, source_type, source_id
HAVING count(*) > 1;

-- 2d. chat_mirror_of_transaction_id: the unique index only scopes (organization_id, mirror_id) —
-- confirm no source transaction has been mirrored into the SAME org more than once
-- under a different id (i.e. two mirror rows pointing at one source within one org).
SELECT 'transactions: chat mirror duplicated within org' AS check_name,
       organization_id, chat_mirror_of_transaction_id,
       count(*) AS occurrences, array_agg(id) AS row_ids
FROM public.transactions
WHERE chat_mirror_of_transaction_id IS NOT NULL
GROUP BY organization_id, chat_mirror_of_transaction_id
HAVING count(*) > 1;

-- 2e. invoices: invoice_number must be unique per org per financial year (GST Rule 46) —
-- a duplicate here is a compliance issue, not just a data-quality one.
SELECT 'invoices: duplicate invoice_number in financial year' AS check_name,
       org_id, financial_year, invoice_number,
       count(*) AS occurrences, array_agg(id) AS row_ids
FROM public.invoices
GROUP BY org_id, financial_year, invoice_number
HAVING count(*) > 1;
