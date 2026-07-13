-- For Trips Control when org is the supplier: show shipper (trip owner) as "Client", not the end customer.
-- This RPC returns trip_id and shipper display name so the app can show "Mukunt" (shipper) instead of "Mukunt's client".

CREATE OR REPLACE FUNCTION public.get_shipper_display_names_for_supplier_trips(p_org_id uuid)
RETURNS TABLE(trip_id uuid, shipper_display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT t.id AS trip_id,
         coalesce(nullif(trim(o.name), ''), 'Client') AS shipper_display_name
  FROM public.trips t
  JOIN public.suppliers s ON s.id = t.supplier_id
  JOIN public.organizations o ON o.id = t.organization_id
  WHERE s.linked_organization_id = p_org_id
    AND public.is_org_member(p_org_id)
  ORDER BY t.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_shipper_display_names_for_supplier_trips(uuid) IS
  'Returns trip_id and shipper (trip owner) display name for trips where p_org_id is the supplier. Used so supplier sees their client (shipper) name in Trips Control, not the end customer.';
GRANT EXECUTE ON FUNCTION public.get_shipper_display_names_for_supplier_trips(uuid) TO authenticated;
