-- Allow an org to SELECT trips where they are the supplier (suppliers.linked_organization_id = org).
-- Needed so the supplier (Load Hub / Staff Handshake) can see trips they supply in Trips Control
-- and open trip detail (Mission Control Blueprint). Covers direct_quote and other sources.

DROP POLICY IF EXISTS "Orgs can read trips where they are the supplier" ON public.trips;

CREATE POLICY "Orgs can read trips where they are the supplier"
  ON public.trips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = trips.supplier_id
        AND trips.indent_id IS NOT NULL
        AND s.linked_organization_id IS NOT NULL
        AND s.linked_organization_id IN (
          SELECT om.organization_id FROM public.organization_members om
          WHERE om.user_id = auth.uid() AND om.status = 'active'
        )
    )
  );

COMMENT ON POLICY "Orgs can read trips where they are the supplier" ON public.trips IS
  'Supplier org can see trips where they are the supplier (Load Hub / Trips Control).';

-- RPC to fetch trips where the given org is the supplier (for Trips Control list).
-- SECURITY DEFINER so we can return trip rows; caller must be member of p_org_id.

CREATE OR REPLACE FUNCTION public.get_trips_where_org_is_supplier(p_org_id uuid)
RETURNS SETOF public.trips
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT t.*
  FROM public.trips t
  JOIN public.suppliers s ON s.id = t.supplier_id
  WHERE s.linked_organization_id = p_org_id
    AND t.indent_id IS NOT NULL
    AND public.is_org_member(p_org_id)
  ORDER BY t.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_trips_where_org_is_supplier(uuid) IS
  'Returns load-based trips where the supplier represents p_org_id (linked_organization_id). Caller must be member of p_org_id. Used for Trips Control when org is supplier.';

GRANT EXECUTE ON FUNCTION public.get_trips_where_org_is_supplier(uuid) TO authenticated;
