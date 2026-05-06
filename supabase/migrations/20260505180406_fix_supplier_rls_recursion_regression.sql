-- HOTFIX: Restore SECURITY DEFINER helper-based supplier/transaction policies.
-- Root cause: 20260505174740 reverted these policies to direct trips subqueries,
-- re-introducing the trips↔suppliers infinite recursion that 20260511120000 had fixed.
-- The recursion breaks any query that joins trips (including ledger LEDGER_TX_SELECT_WITH_TRIPS).

-- Restore suppliers policy to use SECURITY DEFINER helper (avoids trips RLS recursion)
DROP POLICY IF EXISTS "Drivers can read suppliers linked to assigned trips" ON public.suppliers;

CREATE POLICY "Drivers can read suppliers linked to assigned trips"
  ON public.suppliers
  FOR SELECT
  USING (public.driver_has_assigned_trip_for_supplier(suppliers.id));

COMMENT ON POLICY "Drivers can read suppliers linked to assigned trips" ON public.suppliers IS
  'Cross-org aggregate trips: driver JWT is not org_member(trip.organization_id); uses SECURITY DEFINER helper to avoid trips RLS recursion.';

-- Restore transactions policy to use SECURITY DEFINER helper
DROP POLICY IF EXISTS "Drivers can read supplier transactions for assigned trips" ON public.transactions;

CREATE POLICY "Drivers can read supplier transactions for assigned trips"
  ON public.transactions
  FOR SELECT
  USING (
    transactions.contact_type = 'supplier'
    AND public.driver_has_assigned_trip_for_trip_id(transactions.trip_id)
  );

COMMENT ON POLICY "Drivers can read supplier transactions for assigned trips" ON public.transactions IS
  'Same as suppliers policy; helper avoids recursion into trips RLS.';
