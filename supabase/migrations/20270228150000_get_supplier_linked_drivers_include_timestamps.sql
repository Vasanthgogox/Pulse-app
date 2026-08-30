-- Fix a misleading-data gap found on review: get_supplier_linked_drivers
-- (20270228130000) omitted created_at/updated_at from its result. The
-- client (features/suppliers/services/supplierManagement.service.ts)
-- filled the gap with hardcoded empty strings to satisfy DriverRow's
-- required string fields — but DriverRow.created_at/updated_at are treated
-- as real timestamps elsewhere in the app (e.g. formatRelative()), and an
-- empty string parses as Invalid Date, which would render as "NaN year(s)
-- ago" if any future caller displays these synthetic driver rows the same
-- way as a real drivers-table row. Returning the actual columns removes the
-- landmine at the source instead of relying on every future caller to know
-- not to trust these two fields.
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
        'status',          d.status,
        'created_at',      d.created_at,
        'updated_at',      d.updated_at
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
  'only, including real created_at/updated_at), readable by the aggregator '
  'org that owns the supplier record — bypasses drivers RLS (scoped to the '
  'vendor''s own org members) via an explicit ownership check instead, '
  'mirroring get_supplier_driver_salary_requests.';
