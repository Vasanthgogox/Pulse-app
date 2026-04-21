-- Atomic Staff Handshake (Asset): set driver/vehicle on accepted direct quote + create load trip
-- in one transaction. Fixes two-step client flow where quote UPDATE could affect 0 rows (RLS) or
-- create_trip_from_direct_quote read stale driver_id/vehicle_id.

CREATE OR REPLACE FUNCTION public.apply_roster_deploy_from_direct_quote(
  p_quote_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid
)
RETURNS SETOF public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.direct_quotes%ROWTYPE;
  v_bidder uuid;
BEGIN
  SELECT * INTO v_quote FROM public.direct_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Direct quote not found';
  END IF;

  IF (v_quote.status IS NULL OR lower(v_quote.status) <> 'accepted') THEN
    RAISE EXCEPTION 'Quote must be accepted before creating a trip';
  END IF;

  v_bidder := v_quote.bidder_organization_id;

  IF NOT public.is_org_member(v_bidder) THEN
    RAISE EXCEPTION 'Not authorized to deploy this quote';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = p_driver_id AND d.organization_id = v_bidder
  ) THEN
    RAISE EXCEPTION 'Driver must belong to your organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = p_vehicle_id AND v.organization_id = v_bidder
  ) THEN
    RAISE EXCEPTION 'Vehicle must belong to your organization';
  END IF;

  UPDATE public.direct_quotes
  SET
    driver_id = p_driver_id,
    vehicle_id = p_vehicle_id,
    updated_at = now()
  WHERE id = p_quote_id;

  RETURN QUERY
  SELECT *
  FROM public.create_trip_from_direct_quote(p_quote_id, NULL::text);
END;
$$;

COMMENT ON FUNCTION public.apply_roster_deploy_from_direct_quote(uuid, uuid, uuid) IS
  'Staff Handshake (Asset): supplier sets roster driver/vehicle on accepted quote and creates trip atomically. Caller must be member of bidder_organization_id.';

REVOKE ALL ON FUNCTION public.apply_roster_deploy_from_direct_quote(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_roster_deploy_from_direct_quote(uuid, uuid, uuid) TO authenticated;
