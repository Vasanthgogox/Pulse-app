-- Client upsert on trip_conversations returns 403 for:
-- 1) Linked supplier org members (only SELECT was granted in 20260515120000).
-- 2) Edge cases where permissive INSERT policies do not match PostgREST upsert.
-- This RPC runs as SECURITY DEFINER and authorizes by fleet membership or linked supplier.

CREATE OR REPLACE FUNCTION public.ensure_driver_trip_conversation(
  p_trip_id    uuid,
  p_driver_id  uuid,
  p_party_name text
)
RETURNS public.trip_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip public.trips%ROWTYPE;
  v_row  public.trip_conversations%ROWTYPE;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  IF v_trip.driver_id IS NULL OR v_trip.driver_id <> p_driver_id THEN
    RAISE EXCEPTION 'Driver does not match this trip';
  END IF;

  -- Authorized: fleet member | linked supplier for trip | assigned driver (driver app)
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = v_trip.organization_id
      AND om.status = 'active'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.trips t
    INNER JOIN public.suppliers s ON s.id = t.supplier_id
    INNER JOIN public.organization_members om
      ON om.organization_id = s.linked_organization_id
     AND om.user_id = auth.uid()
     AND om.status = 'active'
    WHERE t.id = p_trip_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.user_id = auth.uid()
      AND d.id = p_driver_id
      AND EXISTS (
        SELECT 1 FROM public.trips t2
        WHERE t2.id = p_trip_id AND t2.driver_id = d.id AND t2.organization_id = v_trip.organization_id
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage trip chat for this trip' USING ERRCODE = '42501';
  END IF;

  v_name := coalesce(nullif(trim(p_party_name), ''), 'Driver');

  INSERT INTO public.trip_conversations (
    organization_id,
    trip_id,
    party_type,
    party_name,
    driver_id
  )
  VALUES (
    v_trip.organization_id,
    p_trip_id,
    'driver',
    v_name,
    p_driver_id
  )
  ON CONFLICT (trip_id, party_type) DO UPDATE SET
    party_name = coalesce(
      nullif(trim(excluded.party_name), ''),
      trip_conversations.party_name
    ),
    driver_id = coalesce(excluded.driver_id, trip_conversations.driver_id),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_driver_trip_conversation(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_driver_trip_conversation(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.ensure_driver_trip_conversation IS
  'Idempotent driver party row for trip chat; bypasses RLS under validated fleet or linked-supplier access.';
