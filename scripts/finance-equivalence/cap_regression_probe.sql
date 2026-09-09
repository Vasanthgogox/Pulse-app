-- C3 cap-removal regression: proves getTransactionsByOrganization's real
-- `.limit(500)` (finance.service.ts) silently truncates a supplier's paid
-- total once an org crosses 500 transactions, while get_supplier_ledger_aggregation
-- (unbounded) computes the true complete-dataset total. Read/write inside a
-- single transaction that is always rolled back -- nothing here persists.
-- No real org on the linked project has 500+ transactions today, so this
-- scenario cannot be exercised on real data alone (see feedback memory on
-- not fabricating test data outside an explicitly-approved, non-persisting
-- context). Run with: supabase db query --linked -f scripts/finance-equivalence/cap_regression_probe.sql
--
-- Expected result shape (values will vary slightly if run against different
-- org data, but the relationship must hold):
--   old_js_capped_paid  < true_full_paid
--   new_sql_paid        = true_full_paid   (not old_js_capped_paid)

BEGIN;

DO $$
DECLARE
  v_org uuid := '89427247-b09c-444b-ac85-17c1bf9fdf20'; -- nihas logs
  v_supplier uuid := '04e6f214-810a-4894-8b68-c25118bed200';
  i int;
BEGIN
  FOR i IN 1..600 LOOP
    INSERT INTO transactions (organization_id, contact_type, contact_id, amount_out, transaction_date, created_at, description, party_name)
    VALUES (v_org, 'supplier', v_supplier, 100, '2020-01-01'::date, '2020-01-01'::timestamptz + (i || ' seconds')::interval, 'cap-regression-synthetic', 'Cap Regression Supplier');
  END LOOP;
END $$;

-- Fake an authenticated session for a real member of the org, so is_org_member() passes.
SET request.jwt.claims = '{"sub":"c999f201-eb29-4727-ac9a-3794501468ed","role":"authenticated"}';
SET LOCAL role authenticated;

WITH capped AS (
  -- Mirrors getTransactionsByOrganization's real unpaginated query exactly:
  -- .order("transaction_date", {ascending:false}).order("created_at", {ascending:false}).limit(500)
  SELECT * FROM transactions WHERE organization_id = '89427247-b09c-444b-ac85-17c1bf9fdf20'
  ORDER BY transaction_date DESC, created_at DESC LIMIT 500
)
SELECT
  (SELECT count(*) FROM transactions WHERE organization_id = '89427247-b09c-444b-ac85-17c1bf9fdf20') AS total_org_tx_count,
  (SELECT count(*) FROM transactions WHERE organization_id = '89427247-b09c-444b-ac85-17c1bf9fdf20' AND description = 'cap-regression-synthetic') AS synthetic_count,
  (SELECT coalesce(sum(amount_out), 0) FROM capped WHERE contact_id = '04e6f214-810a-4894-8b68-c25118bed200') AS old_js_capped_paid,
  (SELECT coalesce(sum(amount_out), 0) FROM transactions WHERE organization_id = '89427247-b09c-444b-ac85-17c1bf9fdf20' AND contact_id = '04e6f214-810a-4894-8b68-c25118bed200' AND contact_type = 'supplier') AS true_full_paid,
  (SELECT paid FROM get_supplier_ledger_aggregation('89427247-b09c-444b-ac85-17c1bf9fdf20'::uuid, true) WHERE supplier_id = '04e6f214-810a-4894-8b68-c25118bed200') AS new_sql_paid;

ROLLBACK;
