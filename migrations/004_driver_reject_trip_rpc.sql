-- Driver reject trip: RPC so the driver can unassign themselves.
-- App calls driver_reject_trip(p_trip_id); trip becomes unassigned and audit shows "Driver declined".
-- Run in Supabase Dashboard → SQL Editor (or your migration runner).

CREATE OR REPLACE FUNCTION public.driver_reject_trip(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_driver_id_prev uuid;
  v_vehicle_id_prev uuid;
  v_vehicle_id_new uuid;
BEGIN
  -- Ensure trip exists and current user is the assigned driver
  SELECT t.driver_id, t.vehicle_id
  INTO v_driver_id_prev, v_vehicle_id_prev
  FROM public.trips t
  INNER JOIN public.drivers d ON d.id = t.driver_id AND d.user_id = auth.uid()
  WHERE t.id = p_trip_id;

  IF v_driver_id_prev IS NULL THEN
    RAISE EXCEPTION 'Trip not found or you are not the assigned driver';
  END IF;

  -- Unassign driver
  UPDATE public.trips
  SET driver_id = null, updated_at = now()
  WHERE id = p_trip_id;

  -- Keep vehicle as-is for audit (reassignment = driver removed)
  v_vehicle_id_new := v_vehicle_id_prev;

  -- Record reassignment so dispatcher sees "Driver declined" (skip if table does not exist)
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
      NULL;  -- trip_assignment_audit not present; unassign still succeeded
  END;
END;
$$;

ALTER FUNCTION public.driver_reject_trip(uuid) OWNER TO postgres;
COMMENT ON FUNCTION public.driver_reject_trip(uuid) IS 'Driver unassigns themselves from a trip; records reassignment audit for dispatcher.';

GRANT EXECUTE ON FUNCTION public.driver_reject_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_reject_trip(uuid) TO service_role;
