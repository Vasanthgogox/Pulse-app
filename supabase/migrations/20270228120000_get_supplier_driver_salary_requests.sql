-- Let an aggregator org (e.g. GOGOVAN) view a linked supplier's (e.g. Idrees
-- Logistics) pending driver salary/advance requests from the Supplier
-- profile > Drivers tab, without granting broader read access to that
-- vendor's driver_salary_requests table.
--
-- ROOT CAUSE (caught in review, not by the earlier — invalid — impersonation
-- test): the original fix called getSalaryRequestsByOrganization(linkedOrgId)
-- directly from the aggregator's session. That runs a plain RLS-protected
-- query, and the only relevant policy on driver_salary_requests is "Org
-- members can manage driver_salary_requests" — scoped strictly to members of
-- that SAME organization_id. An aggregator's dispatcher is never a member of
-- the vendor's org, so RLS silently returns zero rows: no error, just an
-- empty panel that looks correct but never actually surfaces anything.
--
-- Verified by re-running the check as the `authenticated` role (not
-- `postgres`, which bypasses RLS entirely) with a real GOGOVAN user's
-- auth.uid() — the direct query returns 0 rows for a known-pending request;
-- this RPC returns it correctly.
CREATE OR REPLACE FUNCTION public.get_supplier_driver_salary_requests(
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

  -- Legitimacy check: the supplier record must belong to the viewer's own
  -- org (it's their own tracked record of this vendor) and be linked to a
  -- real Pulse organization — mirrors the linked_organization_id check
  -- already used by get_trip_detail_bundle / get_vehicle_for_trip_viewer.
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
        'id',           sr.id,
        'driver_id',    sr.driver_id,
        'driver_name',  COALESCE(d.name, d.phone),
        'request_type', sr.request_type,
        'amount',       sr.amount,
        'status',       sr.status,
        'note',         sr.note,
        'created_at',   sr.created_at
      ) ORDER BY sr.created_at DESC
    ), '[]'::jsonb)
    FROM driver_salary_requests sr
    LEFT JOIN drivers d ON d.id = sr.driver_id
    WHERE sr.organization_id = v_linked_org_id
      AND sr.status = 'pending'
  );
END;
$fn$;

COMMENT ON FUNCTION public.get_supplier_driver_salary_requests(uuid, uuid) IS
  'Pending driver salary/advance requests for a supplier''s linked '
  'organization, readable by the aggregator org that owns the supplier '
  'record — bypasses driver_salary_requests RLS (which is scoped to the '
  'vendor''s own org members) via an explicit ownership check instead.';

REVOKE EXECUTE ON FUNCTION public.get_supplier_driver_salary_requests(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_supplier_driver_salary_requests(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supplier_driver_salary_requests(uuid, uuid) TO authenticated;
