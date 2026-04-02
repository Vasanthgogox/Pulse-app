-- RPCs to fetch driver location for a trip. SECURITY DEFINER so we can read driver_locations
-- after verifying the caller is an org member of the trip's organization (RLS can block direct SELECT
-- e.g. if session or org membership is not as expected). Used by Live Tracking on trip detail.

CREATE OR REPLACE FUNCTION public.get_latest_driver_location_for_trip(p_trip_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_org_id uuid;
  v_driver_id uuid;
  v_row json;
BEGIN
  SELECT organization_id, driver_id INTO v_org_id, v_driver_id
  FROM public.trips WHERE id = p_trip_id LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT public.is_org_member(v_org_id) THEN
    RETURN NULL;
  END IF;

  -- Prefer by trip_id
  SELECT json_build_object(
    'latitude', dl.latitude,
    'longitude', dl.longitude,
    'accuracy', dl.accuracy,
    'recorded_at', dl.recorded_at
  ) INTO v_row
  FROM public.driver_locations dl
  WHERE dl.trip_id = p_trip_id
  ORDER BY dl.recorded_at DESC
  LIMIT 1;

  IF v_row IS NOT NULL THEN
    RETURN v_row;
  END IF;

  -- Fallback: by driver_id and org (when driver_locations.trip_id is null)
  IF v_driver_id IS NOT NULL THEN
    SELECT json_build_object(
      'latitude', dl.latitude,
      'longitude', dl.longitude,
      'accuracy', dl.accuracy,
      'recorded_at', dl.recorded_at
    ) INTO v_row
    FROM public.driver_locations dl
    WHERE dl.driver_id = v_driver_id AND dl.organization_id = v_org_id
    ORDER BY dl.recorded_at DESC
    LIMIT 1;
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.get_latest_driver_location_for_trip(uuid) IS
  'Returns latest driver_locations row for the trip (latitude, longitude, accuracy, recorded_at). Caller must be org member of trip. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.get_latest_driver_location_for_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_driver_location_for_trip(uuid) TO anon;


CREATE OR REPLACE FUNCTION public.get_driver_location_history_for_trip(p_trip_id uuid, p_limit int DEFAULT 100)
RETURNS TABLE(latitude double precision, longitude double precision, recorded_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_org_id uuid;
  v_driver_id uuid;
BEGIN
  SELECT organization_id, driver_id INTO v_org_id, v_driver_id
  FROM public.trips WHERE id = p_trip_id LIMIT 1;
  IF v_org_id IS NULL OR NOT public.is_org_member(v_org_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT dl.latitude::double precision, dl.longitude::double precision, dl.recorded_at
  FROM public.driver_locations dl
  WHERE dl.trip_id = p_trip_id
  ORDER BY dl.recorded_at ASC
  LIMIT p_limit;

  IF v_driver_id IS NOT NULL AND NOT FOUND THEN
    RETURN QUERY
    SELECT dl.latitude, dl.longitude, dl.recorded_at
    FROM public.driver_locations dl
    WHERE dl.driver_id = v_driver_id AND dl.organization_id = v_org_id
    ORDER BY dl.recorded_at ASC
    LIMIT p_limit;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_driver_location_history_for_trip(uuid, int) IS
  'Returns driver_locations history for the trip (ordered by time). Caller must be org member. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.get_driver_location_history_for_trip(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_location_history_for_trip(uuid, int) TO anon;
