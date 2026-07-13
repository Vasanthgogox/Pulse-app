-- Extend driver location access to trip partner orgs (client + supplier),
-- add get_last_n_locations_for_trip RPC, and a RLS policy for realtime delivery.
--
-- Before this migration only the fleet org (trips.organization_id) could call the
-- location RPCs. Client orgs and supplier orgs that already see the trip via
-- get_trips_where_org_is_client / get_trips_where_org_is_supplier were blocked.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helper: can the current user see location data for a trip?
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_access_trip_location(p_trip_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_org_id    uuid;
  v_client_id uuid;
  v_supplier_id uuid;
  v_uid       uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN RETURN FALSE; END IF;

  SELECT organization_id, client_id, supplier_id
    INTO v_org_id, v_client_id, v_supplier_id
    FROM public.trips
   WHERE id = p_trip_id
   LIMIT 1;

  IF v_org_id IS NULL THEN RETURN FALSE; END IF;

  -- Fleet / owner org member
  IF public.is_org_member(v_org_id) THEN RETURN TRUE; END IF;

  -- Client org: the client entity on this trip links to the caller's org
  IF v_client_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.clients c
      JOIN public.organization_members om
        ON om.organization_id = c.linked_organization_id
       AND om.user_id = v_uid
       AND om.status = 'active'
     WHERE c.id = v_client_id
       AND c.linked_organization_id IS NOT NULL
  ) THEN RETURN TRUE; END IF;

  -- Supplier org: the supplier entity on this trip links to the caller's org
  IF v_supplier_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.suppliers s
      JOIN public.organization_members om
        ON om.organization_id = s.linked_organization_id
       AND om.user_id = v_uid
       AND om.status = 'active'
     WHERE s.id = v_supplier_id
       AND s.linked_organization_id IS NOT NULL
  ) THEN RETURN TRUE; END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.can_access_trip_location(uuid) IS
  'Returns true if auth.uid() may read driver location data for the trip: fleet org member, client org member, or supplier org member. SECURITY DEFINER.';

REVOKE ALL ON FUNCTION public.can_access_trip_location(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_trip_location(uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Update get_latest_driver_location_for_trip to use the new helper
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_latest_driver_location_for_trip(p_trip_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_driver_id uuid;
  v_org_id    uuid;
  v_row       json;
BEGIN
  IF NOT public.can_access_trip_location(p_trip_id) THEN
    RETURN NULL;
  END IF;

  SELECT driver_id, organization_id INTO v_driver_id, v_org_id
    FROM public.trips WHERE id = p_trip_id LIMIT 1;

  -- Prefer by trip_id
  SELECT json_build_object(
    'latitude',    dl.latitude,
    'longitude',   dl.longitude,
    'accuracy',    dl.accuracy,
    'recorded_at', dl.recorded_at
  ) INTO v_row
  FROM public.driver_locations dl
  WHERE dl.trip_id = p_trip_id
  ORDER BY dl.recorded_at DESC
  LIMIT 1;

  IF v_row IS NOT NULL THEN RETURN v_row; END IF;

  -- Fallback: by driver_id + org when driver_locations.trip_id was null on insert
  IF v_driver_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    SELECT json_build_object(
      'latitude',    dl.latitude,
      'longitude',   dl.longitude,
      'accuracy',    dl.accuracy,
      'recorded_at', dl.recorded_at
    ) INTO v_row
    FROM public.driver_locations dl
    WHERE dl.driver_id = v_driver_id
      AND dl.organization_id = v_org_id
    ORDER BY dl.recorded_at DESC
    LIMIT 1;
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.get_latest_driver_location_for_trip(uuid) IS
  'Latest driver location for a trip. Accessible by fleet, client, and supplier org members. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.get_latest_driver_location_for_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_driver_location_for_trip(uuid) TO anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Update get_driver_location_history_for_trip to use the new helper
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_driver_location_history_for_trip(
  p_trip_id uuid,
  p_limit   int DEFAULT 100
)
RETURNS TABLE(latitude double precision, longitude double precision, recorded_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_driver_id uuid;
  v_org_id    uuid;
BEGIN
  IF NOT public.can_access_trip_location(p_trip_id) THEN
    RETURN;
  END IF;

  SELECT driver_id, organization_id INTO v_driver_id, v_org_id
    FROM public.trips WHERE id = p_trip_id LIMIT 1;

  RETURN QUERY
  SELECT dl.latitude::double precision, dl.longitude::double precision, dl.recorded_at
    FROM public.driver_locations dl
   WHERE dl.trip_id = p_trip_id
   ORDER BY dl.recorded_at ASC
   LIMIT p_limit;

  IF v_driver_id IS NOT NULL AND v_org_id IS NOT NULL AND NOT FOUND THEN
    RETURN QUERY
    SELECT dl.latitude::double precision, dl.longitude::double precision, dl.recorded_at
      FROM public.driver_locations dl
     WHERE dl.driver_id = v_driver_id
       AND dl.organization_id = v_org_id
     ORDER BY dl.recorded_at ASC
     LIMIT p_limit;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_driver_location_history_for_trip(uuid, int) IS
  'Location history for a trip ordered by time. Accessible by fleet, client, and supplier org members. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.get_driver_location_history_for_trip(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_location_history_for_trip(uuid, int) TO anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. New RPC: last N location points (newest first) — partner-safe
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_last_n_locations_for_trip(
  p_trip_id uuid,
  p_n       int DEFAULT 3
)
RETURNS TABLE(latitude double precision, longitude double precision, recorded_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_driver_id uuid;
  v_org_id    uuid;
BEGIN
  IF NOT public.can_access_trip_location(p_trip_id) THEN
    RETURN;
  END IF;

  SELECT driver_id, organization_id INTO v_driver_id, v_org_id
    FROM public.trips WHERE id = p_trip_id LIMIT 1;

  -- Return newest-first so callers can take top 3 without extra sorting
  RETURN QUERY
  SELECT dl.latitude::double precision, dl.longitude::double precision, dl.recorded_at
    FROM public.driver_locations dl
   WHERE dl.trip_id = p_trip_id
   ORDER BY dl.recorded_at DESC
   LIMIT p_n;

  IF v_driver_id IS NOT NULL AND v_org_id IS NOT NULL AND NOT FOUND THEN
    RETURN QUERY
    SELECT dl.latitude::double precision, dl.longitude::double precision, dl.recorded_at
      FROM public.driver_locations dl
     WHERE dl.driver_id = v_driver_id
       AND dl.organization_id = v_org_id
     ORDER BY dl.recorded_at DESC
     LIMIT p_n;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_last_n_locations_for_trip(uuid, int) IS
  'Returns the last N driver location pings (newest first) for a trip. Accessible by fleet, client, and supplier org members. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.get_last_n_locations_for_trip(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_n_locations_for_trip(uuid, int) TO anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS policy: trip partners can SELECT rows for realtime delivery
--    Existing "Org members read org driver locations" covers the fleet org.
--    This new policy covers client and supplier orgs via trip linkage.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip partners read driver locations" ON public.driver_locations;

CREATE POLICY "Trip partners read driver locations"
  ON public.driver_locations
  FOR SELECT
  USING (
    trip_id IS NOT NULL
    AND public.can_access_trip_location(trip_id)
  );
