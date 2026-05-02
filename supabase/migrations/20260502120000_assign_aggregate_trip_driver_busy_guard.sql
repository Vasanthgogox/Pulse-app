-- Block assign_aggregate_trip_driver when the resolved driver is already on another non-terminal trip.
-- Aligns RPC with trips.service getDriverOngoingTrip / updateTripAssignment (assigned counts as busy).

CREATE OR REPLACE FUNCTION public.assign_aggregate_trip_driver(
  p_trip_id uuid,
  p_driver_org_id uuid,
  p_driver_phone text,
  p_vehicle_display_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip public.trips%ROWTYPE;
  v_driver public.drivers%ROWTYPE;
  v_phone_norm text;
  v_last10 text;
  v_driver_name text;
  v_profile_id uuid;
BEGIN
  v_phone_norm := trim(regexp_replace(coalesce(p_driver_phone, ''), '\s+', '', 'g'));
  if length(v_phone_norm) < 10 then
    return jsonb_build_object('ok', false, 'error', 'Phone required (at least 10 digits)');
  end if;
  v_last10 := regexp_replace(v_phone_norm, '\D', '', 'g');
  if length(v_last10) >= 10 then
    v_last10 := right(v_last10, 10);
  else
    v_last10 := v_phone_norm;
  end if;

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trip not found');
  END IF;

  -- Caller must be trip org (shipper) or supplier for this trip
  IF NOT (
    public.is_org_member(v_trip.organization_id)
    OR EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = v_trip.supplier_id
        AND s.linked_organization_id IS NOT NULL
        AND public.is_org_member(s.linked_organization_id)
    )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized to assign this trip');
  END IF;

  -- Find existing driver in org by phone (exact then last 10 digits)
  SELECT * INTO v_driver
  FROM public.drivers
  WHERE organization_id = p_driver_org_id
    AND (
      phone = v_phone_norm
      OR right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_last10
    )
  ORDER BY case when phone = v_phone_norm then 0 else 1 end
  LIMIT 1;

  IF NOT FOUND THEN
    -- Resolve name from profiles by phone (optional)
    SELECT id, full_name INTO v_profile_id, v_driver_name
    FROM public.profiles
    WHERE length(phone) >= 10
      AND right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_last10
    LIMIT 1;
    v_driver_name := coalesce(trim(v_driver_name), 'Driver');
    IF v_driver_name = '' THEN v_driver_name := 'Driver'; END IF;

    INSERT INTO public.drivers (organization_id, name, phone, user_id, status, tracking_only)
    VALUES (p_driver_org_id, v_driver_name, v_phone_norm, NULL, 'offline', true)
    RETURNING * INTO v_driver;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.driver_id = v_driver.id
      AND t.id <> p_trip_id
      AND lower(trim(coalesce(t.status::text, ''))) NOT IN ('completed', 'cancelled', 'done', 'delivered')
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error',
      'Driver is already assigned to another active trip. Complete or unassign that trip first.'
    );
  END IF;

  UPDATE public.trips
  SET
    driver_id = v_driver.id,
    vehicle_display_number = CASE
      WHEN p_vehicle_display_number IS NOT NULL AND trim(p_vehicle_display_number) <> '' THEN trim(p_vehicle_display_number)
      ELSE vehicle_display_number
    END,
    status = 'assigned',
    updated_at = now()
  WHERE id = p_trip_id;

  PERFORM public.generate_trip_otp(p_trip_id, 15);

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;

  RETURN jsonb_build_object(
    'ok', true,
    'trip', to_jsonb(v_trip),
    'driver_id', v_driver.id
  );
END;
$$;

COMMENT ON FUNCTION public.assign_aggregate_trip_driver(uuid, uuid, text, text) IS
  'Assign driver to aggregate trip by phone; refuses if driver already on another non-terminal trip.';
