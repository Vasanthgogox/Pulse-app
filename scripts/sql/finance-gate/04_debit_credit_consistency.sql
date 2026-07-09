-- Phase 1 — Debit = Credit consistency, where double-entry-style columns exist.
-- Read-only. Zero rows expected.

-- 4a. vehicle_ledger_entries: exactly one of debit/credit should be populated per row,
-- and `amount` should equal whichever of debit/credit is set.
SELECT 'vehicle_ledger_entries: debit/credit/amount mismatch' AS check_name,
       id, organization_id, vehicle_id, entry_type, debit, credit, amount
FROM public.vehicle_ledger_entries
WHERE
  -- both populated, or both null — exactly one side should be set
  (debit IS NOT NULL AND credit IS NOT NULL)
  OR (debit IS NULL AND credit IS NULL)
  -- amount doesn't match whichever side is set
  OR (debit IS NOT NULL AND amount <> debit)
  OR (credit IS NOT NULL AND amount <> credit);

-- 4b. transactions: exactly one of amount_in/amount_out should be positive (DB CHECK already
-- enforces this at insert time — this re-verifies existing rows, defensive against a
-- constraint being dropped/altered since).
SELECT 'transactions: amount_in/amount_out both zero or both positive' AS check_name,
       id, organization_id, trip_id, amount_in, amount_out, transaction_date
FROM public.transactions
WHERE NOT (
  (amount_in > 0 AND amount_out = 0) OR (amount_out > 0 AND amount_in = 0)
);

-- 4c. supplier_bills: net_payable should equal gross_amount - tds_amount.
SELECT 'supplier_bills: net_payable does not equal gross_amount - tds_amount' AS check_name,
       id, org_id, bill_number, gross_amount, tds_amount, net_payable,
       (gross_amount - tds_amount) AS expected_net_payable
FROM public.supplier_bills
WHERE net_payable <> (gross_amount - tds_amount);
