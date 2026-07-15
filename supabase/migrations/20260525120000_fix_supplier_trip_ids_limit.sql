-- ─────────────────────────────────────────────────────────────────────────────
-- Fix get_supplier_trip_ids_for_org: add LIMIT 500 + skip cancelled trips.
-- The previous version in 20260524120000 restored the correct return format
-- ({trip_id, supplier_id} objects) but removed the LIMIT introduced by
-- 20260509130000. Without a LIMIT, large orgs return unbounded row sets on
-- every chat load, causing sequential scans and elevated connection pressure.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_supplier_trip_ids_for_org(p_org_id uuid)
RETURNS json
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(json_agg(
    json_build_object('trip_id', tr.id, 'supplier_id', tr.supplier_id)
  ), '[]'::json)
  FROM (
    SELECT tr.id, tr.supplier_id
    FROM trips tr
    WHERE tr.status NOT IN ('cancelled')
      AND EXISTS (
        SELECT 1 FROM suppliers s
        WHERE s.id = tr.supplier_id
          AND s.linked_organization_id = p_org_id
      )
    ORDER BY tr.created_at DESC
    LIMIT 500
  ) tr;
$$;

GRANT EXECUTE ON FUNCTION get_supplier_trip_ids_for_org(uuid) TO authenticated;
