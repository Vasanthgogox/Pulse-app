-- Fix: "infinite recursion detected in policy for relation trips" when drivers SELECT trips.
-- Cause: trips SELECT policy "Orgs can read trips where they are the supplier" reads suppliers;
-- suppliers policy "Drivers can read suppliers linked to assigned trips" subqueries trips again.
-- Fix: evaluate trip↔driver linkage in SECURITY DEFINER helpers (owner bypasses RLS on inner reads).

CREATE OR REPLACE FUNCTION public.driver_has_assigned_trip_for_supplier(p_supplier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    INNER JOIN public.drivers d ON d.id = t.driver_id AND d.user_id = auth.uid()
    WHERE t.supplier_id = p_supplier_id
  );
$$;

COMMENT ON FUNCTION public.driver_has_assigned_trip_for_supplier(uuid) IS
  'RLS helper: true if current user is assigned driver on any trip for supplier. Avoids trips↔suppliers policy recursion.';

CREATE OR REPLACE FUNCTION public.driver_has_assigned_trip_for_trip_id(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    INNER JOIN public.drivers d ON d.id = t.driver_id AND d.user_id = auth.uid()
    WHERE t.id = p_trip_id
  );
$$;

COMMENT ON FUNCTION public.driver_has_assigned_trip_for_trip_id(uuid) IS
  'RLS helper: true if current user is assigned driver on trip. Used from transactions policy to avoid recursion.';

REVOKE ALL ON FUNCTION public.driver_has_assigned_trip_for_supplier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_has_assigned_trip_for_supplier(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.driver_has_assigned_trip_for_trip_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_has_assigned_trip_for_trip_id(uuid) TO authenticated;

DROP POLICY IF EXISTS "Drivers can read suppliers linked to assigned trips" ON public.suppliers;
CREATE POLICY "Drivers can read suppliers linked to assigned trips"
  ON public.suppliers
  FOR SELECT
  USING (public.driver_has_assigned_trip_for_supplier(suppliers.id));

DROP POLICY IF EXISTS "Drivers can read supplier transactions for assigned trips" ON public.transactions;
CREATE POLICY "Drivers can read supplier transactions for assigned trips"
  ON public.transactions
  FOR SELECT
  USING (
    transactions.contact_type = 'supplier'
    AND public.driver_has_assigned_trip_for_trip_id(transactions.trip_id)
  );

COMMENT ON POLICY "Drivers can read suppliers linked to assigned trips" ON public.suppliers IS
  'Cross-org aggregate trips: driver JWT is not org_member(trip.organization_id); uses SECURITY DEFINER helper to avoid trips RLS recursion.';

COMMENT ON POLICY "Drivers can read supplier transactions for assigned trips" ON public.transactions IS
  'Same as suppliers policy; helper avoids recursion into trips RLS.';
