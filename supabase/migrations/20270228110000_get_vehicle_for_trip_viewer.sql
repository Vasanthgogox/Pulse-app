-- Let a trip's own org view basic vehicle info + documents for a vendor's
-- vehicle used on that trip (e.g. GOGOVAN viewing Idrees Logistics's truck on
-- a subcontracted job), without granting broader access to that vendor's
-- fleet, trip history, or ledger.
--
-- ROOT CAUSE: the standalone vehicle profile page (app/vehicle/[id].tsx →
-- VehicleDetailScreen) fetches via getVehicleById(orgId, vehicleId), which
-- filters vehicles.organization_id = orgId (the viewer's own org). When a
-- trip's vehicle belongs to a different org (the vendor executing the load),
-- that lookup returns null and the page shows "vehicle not found" — even
-- though get_trip_detail_bundle already proves the viewer has a legitimate
-- reason to see this vehicle (it's on a trip they can read).
--
-- SCOPE (deliberately minimal): only vehicle_number, vehicle_type, capacity,
-- vehicle_brand, vehicle_body_type, status, and documents. Does NOT expose
-- the vendor's other vehicles, trip history, ledger, or driver list — those
-- remain properly org-scoped to the vendor and are out of scope for this fix.
CREATE OR REPLACE FUNCTION public.get_vehicle_for_trip_viewer(
  p_vehicle_id uuid,
  p_trip_id uuid,
  p_viewer_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_can_view boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_viewer_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  -- Legitimacy check: the viewer's org must be able to see a trip that
  -- actually references this vehicle_id (as the direct owner, the trip's
  -- linked supplier, or the trip's linked client) — mirrors the same
  -- visibility rule already enforced by get_trip_detail_bundle.
  SELECT EXISTS (
    SELECT 1
    FROM trips t
    WHERE t.id = p_trip_id
      AND t.vehicle_id = p_vehicle_id
      AND t.deleted_at IS NULL
      AND (
        t.organization_id = p_viewer_org_id
        OR EXISTS (
          SELECT 1 FROM suppliers s
          WHERE s.id = t.supplier_id AND s.linked_organization_id = p_viewer_org_id
        )
        OR EXISTS (
          SELECT 1 FROM clients c
          WHERE c.id = t.client_id AND c.linked_organization_id = p_viewer_org_id
        )
      )
  ) INTO v_can_view;

  IF NOT v_can_view THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id',                v.id,
      'organization_id',   v.organization_id,
      'vehicle_number',    v.vehicle_number,
      'vehicle_type',      v.vehicle_type,
      'capacity',          v.capacity,
      'vehicle_brand',     v.vehicle_brand,
      'vehicle_body_type', v.vehicle_body_type,
      'status',            v.status,
      'documents',         v.documents
    )
    FROM vehicles v
    WHERE v.id = p_vehicle_id
  );
END;
$fn$;

COMMENT ON FUNCTION public.get_vehicle_for_trip_viewer(uuid, uuid, uuid) IS
  'Read-only, minimal vehicle info (basic fields + documents only, no trip '
  'history/ledger/driver list) for a viewer org that has a legitimate trip '
  'referencing this vehicle_id but does not own it directly. Used as a '
  'fallback by the vehicle profile page when getVehicleById finds nothing '
  'in the viewer''s own org.';

-- Match get_trip_detail_bundle's grant convention: authenticated only, no anon.
REVOKE EXECUTE ON FUNCTION public.get_vehicle_for_trip_viewer(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_vehicle_for_trip_viewer(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vehicle_for_trip_viewer(uuid, uuid, uuid) TO authenticated;
