-- Phase 1 — Negative balance detection. Read-only. Zero rows expected unless
-- a negative balance is explicitly allowed (e.g. driver_ledger running balance
-- can legitimately dip negative for an outstanding advance — flagged, not failed).

-- 3a. driver_ledger.balance_after negative — could be a legitimate outstanding advance,
-- surfaced here for manual review rather than treated as an automatic failure.
SELECT 'driver_ledger: negative balance_after' AS check_name,
       id, organization_id, driver_id, type, amount, balance_after, created_at
FROM public.driver_ledger
WHERE balance_after IS NOT NULL AND balance_after < 0
ORDER BY balance_after ASC;

-- 3b. supplier_bills.balance_payable negative — advance_paid exceeding net_payable
-- (overpaid supplier bill).
SELECT 'supplier_bills: negative balance_payable (overpaid)' AS check_name,
       id, org_id, supplier_id, bill_number, net_payable, advance_paid, balance_payable
FROM public.supplier_bills
WHERE balance_payable < 0
ORDER BY balance_payable ASC;

-- 3c. trips: amount_paid exceeding client_price (client-side "received > sales" —
-- the exact shape of the bug found and fixed in ClientDetailScreen.tsx; this check
-- verifies the underlying trips.amount_paid data itself, independent of any UI layer).
SELECT 'trips: amount_paid exceeds client_price' AS check_name,
       id, organization_id, display_trip_id, client_price, amount_paid,
       (amount_paid - client_price) AS overage
FROM public.trips
WHERE client_price IS NOT NULL
  AND amount_paid IS NOT NULL
  AND amount_paid > client_price
ORDER BY overage DESC;

-- 3d. trips: amount_paid negative (should never happen — sync trigger uses GREATEST(...,0))
SELECT 'trips: negative amount_paid' AS check_name,
       id, organization_id, display_trip_id, amount_paid
FROM public.trips
WHERE amount_paid < 0;

-- 3e. vehicle_ledger_entries: amount negative (CHECK constraint should prevent this;
-- included as a defensive check against constraint drift).
SELECT 'vehicle_ledger_entries: negative amount' AS check_name,
       id, organization_id, vehicle_id, entry_type, amount, debit, credit
FROM public.vehicle_ledger_entries
WHERE amount < 0;
