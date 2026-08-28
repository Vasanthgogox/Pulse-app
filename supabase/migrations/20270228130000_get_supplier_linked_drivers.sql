-- Let an aggregator org (e.g. GOGOVAN) view a linked supplier's (e.g. Idrees
-- Logistics) own driver roster from the Supplier profile > Drivers tab.
--
-- ROOT CAUSE: getDriversByOrganization(linkedOrgId) is a plain RLS-protected
-- query. The only relevant policy on `drivers` ("Org members can manage
-- drivers") is scoped to is_org_member(organization_id) — members of the
-- vendor's OWN org. An aggregator's dispatcher is never a member of the
-- vendor's org, so this silently returns zero rows. Same failure mode as
-- get_supplier_driver_salary_requests, verified the same way (re-run as
-- `authenticated` role with a real GOGOVAN user's auth.uid(), not `postgres`
-- which bypasses RLS).
CREATE OR REPLACE FUNCTION public.get_supplier_linked_drivers(
  p_supplier_id uuid,
  p_viewer_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_linked_org_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_viewer_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT s.linked_organization_id INTO v_linked_org_id
  FROM suppliers s
  WHERE s.id = p_supplier_id
    AND s.organization_id = p_viewer_org_id;

  IF v_linked_org_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',              d.id,
        'name',            d.name,
        'phone',           d.phone,
        'license_number',  d.license_number,
        'status',          d.status
      ) ORDER BY d.created_at DESC
    ), '[]'::jsonb)
    FROM drivers d
    WHERE d.organization_id = v_linked_org_id
      AND d.left_at IS NULL
  );
END;
$fn$;

COMMENT ON FUNCTION public.get_supplier_linked_drivers(uuid, uuid) IS
  'A supplier''s linked organization''s own driver roster (basic fields '
  'only), readable by the aggregator org that owns the supplier record — '
  'bypasses drivers RLS (scoped to the vendor''s own org members) via an '
  'explicit ownership check instead, mirroring '
  'get_supplier_driver_salary_requests.';

REVOKE EXECUTE ON FUNCTION public.get_supplier_linked_drivers(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_supplier_linked_drivers(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supplier_linked_drivers(uuid, uuid) TO authenticated;
