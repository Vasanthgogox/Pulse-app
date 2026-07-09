-- Phase 1 / Phase 9 — Orphan detection: ledger rows whose foreign references
-- don't resolve, or whose contact_id doesn't match a real client/supplier/driver.
-- Read-only. Every SELECT below should return zero rows on a healthy ledger.

-- 1a. transactions.contact_id set but contact_type row doesn't exist
SELECT 'transactions: contact_id not found' AS check_name, t.id, t.organization_id,
       t.contact_type, t.contact_id, t.amount_in, t.amount_out, t.transaction_date
FROM public.transactions t
WHERE t.contact_id IS NOT NULL
  AND t.contact_type = 'client'
  AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = t.contact_id)
UNION ALL
SELECT 'transactions: contact_id not found', t.id, t.organization_id,
       t.contact_type, t.contact_id, t.amount_in, t.amount_out, t.transaction_date
FROM public.transactions t
WHERE t.contact_id IS NOT NULL
  AND t.contact_type = 'supplier'
  AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = t.contact_id)
UNION ALL
SELECT 'transactions: contact_id not found', t.id, t.organization_id,
       t.contact_type, t.contact_id, t.amount_in, t.amount_out, t.transaction_date
FROM public.transactions t
WHERE t.contact_id IS NOT NULL
  AND t.contact_type = 'driver'
  AND NOT EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = t.contact_id);

-- 1b. driver_ledger rows whose driver no longer exists (should be impossible under FK CASCADE,
-- included as a defensive check in case of manual data surgery)
SELECT 'driver_ledger: driver_id not found' AS check_name, dl.id, dl.organization_id,
       dl.driver_id, dl.type, dl.amount, dl.trip_id
FROM public.driver_ledger dl
WHERE NOT EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = dl.driver_id);

-- 1c. driver_ledger settlement rows without a trip_id — a "settlement" is trip-completion pay,
-- so a null trip_id here means the lineage back to the trip that earned it is missing.
SELECT 'driver_ledger: settlement missing trip_id' AS check_name, dl.id, dl.organization_id,
       dl.driver_id, dl.type, dl.amount, dl.created_at
FROM public.driver_ledger dl
WHERE dl.type = 'settlement' AND dl.trip_id IS NULL;

-- 1d. vehicle_ledger_entries whose vehicle no longer exists
SELECT 'vehicle_ledger_entries: vehicle_id not found' AS check_name, vle.id, vle.organization_id,
       vle.vehicle_id, vle.entry_type, vle.amount
FROM public.vehicle_ledger_entries vle
WHERE NOT EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vle.vehicle_id);

-- 1e. supplier_bills referencing trip_ids that don't exist (array column, no FK enforced)
SELECT 'supplier_bills: trip_id in trip_ids[] not found' AS check_name, sb.id, sb.org_id,
       sb.bill_number, tid AS dangling_trip_id
FROM public.supplier_bills sb
CROSS JOIN LATERAL unnest(sb.trip_ids) AS tid
WHERE NOT EXISTS (SELECT 1 FROM public.trips t WHERE t.id = tid);

-- 1f. invoices referencing a client that no longer exists
SELECT 'invoices: client_id not found' AS check_name, i.id, i.org_id,
       i.invoice_number, i.client_id
FROM public.invoices i
WHERE i.client_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = i.client_id);

-- 1g. trip_finance_adjustments (the CN/DN-equivalent) referencing a trip in a different org
-- than the adjustment's own organization_id — the insert trigger should block this,
-- included as a defensive check for rows written before the trigger existed.
SELECT 'trip_finance_adjustments: org mismatch with trip' AS check_name, a.id, a.organization_id,
       a.trip_id, t.organization_id AS trip_organization_id
FROM public.trip_finance_adjustments a
JOIN public.trips t ON t.id = a.trip_id
WHERE t.organization_id <> a.organization_id;
