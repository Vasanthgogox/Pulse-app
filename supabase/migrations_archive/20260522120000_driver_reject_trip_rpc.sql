-- Driver declines assigned trip: PostgREST RPC used by tripsService.driverRejectTrip().
-- Unassigns driver, records trip_assignment_audit (reassignment) for dispatcher Activity Log.

CREATE OR REPLACE FUNCTION public.driver_reject_trip(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id_prev uuid;
  v_vehicle_id_prev uuid;
  v_vehicle_id_new uuid;
BEGIN
  SELECT t.driver_id, t.vehicle_id
  INTO v_driver_id_prev, v_vehicle_id_prev
  FROM public.trips t
  INNER JOIN public.drivers d ON d.id = t.driver_id AND d.user_id = auth.uid()
  WHERE t.id = p_trip_id;

  IF v_driver_id_prev IS NULL THEN
    RAISE EXCEPTION 'Trip not found or you are not the assigned driver';
  END IF;

  UPDATE public.trips
  SET driver_id = null, updated_at = now()
  WHERE id = p_trip_id;

  v_vehicle_id_new := v_vehicle_id_prev;

  BEGIN
    INSERT INTO public.trip_assignment_audit (
      trip_id,
      event_type,
      driver_id_prev,
      driver_id_new,
      vehicle_id_prev,
      vehicle_id_new,
      changed_by
    ) VALUES (
      p_trip_id,
      'reassignment',
      v_driver_id_prev,
      null,
      v_vehicle_id_prev,
      v_vehicle_id_new,
      auth.uid()
    );
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;
END;
$$;

ALTER FUNCTION public.driver_reject_trip(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.driver_reject_trip(uuid) IS
  'Driver unassigns themselves from a trip; records reassignment audit for dispatcher.';

REVOKE ALL ON FUNCTION public.driver_reject_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_reject_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_reject_trip(uuid) TO service_role;
