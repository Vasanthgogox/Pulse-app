-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: assign_aggregate_trip_driver authorization for awarded trips
--
-- Problem: when a fleet owner wins a bid on a client's indent, the trip has
--   organization_id = client org
--   supplier_id     = supplier record in client org
--
-- The existing auth check requires the supplier record to have
-- linked_organization_id set.  If the connection is "non-integrated" (supplier
-- row lacks linked_organization_id), the fleet owner gets:
--   "Not authorized to assign this trip"
-- even though they legitimately won the award.
--
-- Fix: add a third auth path — if the caller is a member of the org they are
-- assigning the driver FROM (p_driver_org_id), they are the fleet owner making
-- the assignment and should be authorized.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_aggregate_trip_driver(
  p_trip_id              uuid,
  p_driver_org_id        uuid,
  p_driver_phone         text,
  p_vehicle_display_number text DEFAULT NULL,
  p_vehicle_id           uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip       public.trips%ROWTYPE;
  v_driver     public.drivers%ROWTYPE;
  v_phone_norm text;
  v_last10     text;
  v_driver_name text;
  v_profile_id uuid;
  v_status     text;
BEGIN
  v_phone_norm := trim(regexp_replace(coalesce(p_driver_phone, ''), '\s+', '', 'g'));
  IF length(v_phone_norm) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Phone required (at least 10 digits)');
  END IF;
  v_last10 := regexp_replace(v_phone_norm, '\D', '', 'g');
  IF length(v_last10) >= 10 THEN
    v_last10 := right(v_last10, 10);
  ELSE
    v_last10 := v_phone_norm;
  END IF;

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trip not found');
  END IF;

  IF lower(trim(coalesce(v_trip.status::text, ''))) IN ('completed', 'delivered', 'done')
     OR v_trip.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Cannot change driver or vehicle after the trip is completed.'
    );
  END IF;

  -- Authorization: caller must be one of:
  --   1. A member of the trip-owner org (dispatcher editing their own trip)
  --   2. A member of the linked supplier org (integrated supplier)
  --   3. A member of the driver-assignment org (fleet owner assigning their driver/vehicle)
  --      This covers awarded/non-integrated fleet owners who won a bid but whose
  --      supplier record lacks linked_organization_id.
  IF NOT (
    public.is_org_member(v_trip.organization_id)
    OR EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = v_trip.supplier_id
        AND s.linked_organization_id IS NOT NULL
        AND public.is_org_member(s.linked_organization_id)
    )
    OR public.is_org_member(p_driver_org_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized to assign this trip');
  END IF;

  IF p_vehicle_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.vehicle_id = p_vehicle_id
        AND t.id <> p_trip_id
        AND lower(trim(coalesce(t.status::text, ''))) NOT IN (
          'completed', 'cancelled', 'done', 'delivered'
        )
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error',
        'Vehicle is already assigned to another active trip. Complete or unassign that trip first.'
      );
    END IF;
  END IF;

  SELECT * INTO v_driver
  FROM public.drivers
  WHERE organization_id = p_driver_org_id
    AND (
      phone = v_phone_norm
      OR right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_last10
    )
  ORDER BY CASE WHEN phone = v_phone_norm THEN 0 ELSE 1 END
  LIMIT 1;

  IF NOT FOUND THEN
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

  v_status := lower(trim(coalesce(v_trip.status::text, '')));

  UPDATE public.trips
  SET
    driver_id = v_driver.id,
    vehicle_id = CASE
      WHEN p_vehicle_id IS NOT NULL THEN p_vehicle_id
      ELSE vehicle_id
    END,
    vehicle_display_number = CASE
      WHEN p_vehicle_id IS NOT NULL THEN NULL
      WHEN p_vehicle_display_number IS NOT NULL AND trim(p_vehicle_display_number) <> '' THEN trim(p_vehicle_display_number)
      ELSE vehicle_display_number
    END,
    status = CASE
      WHEN v_trip.started_at IS NOT NULL THEN v_trip.status
      WHEN v_trip.completed_at IS NOT NULL THEN v_trip.status
      WHEN v_status IN (
        'in_transit', 'in_progress', 'intransit', 'transit', 'picked_up', 'pickup',
        'at_pickup', 'at_drop', 'loading', 'unloading', 'dispatched', 'on_route',
        'going_to_pickup', 'moving', 'started', 's_in', 's_out', 'd_in', 'd_out',
        'pod_pending', 'arrived', 'at_destination'
      ) THEN v_trip.status
      WHEN v_status IN ('pending', 'assigned', 'draft', 'confirmed') OR v_status = '' THEN 'assigned'
      ELSE v_trip.status
    END,
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

COMMENT ON FUNCTION public.assign_aggregate_trip_driver(uuid, uuid, text, text, uuid) IS
  'Assign aggregate trip driver by phone; optional fleet vehicle_id in same transaction.
   Auth: trip owner, linked supplier org, OR fleet owner assigning their own driver (p_driver_org_id).';

GRANT EXECUTE ON FUNCTION public.assign_aggregate_trip_driver(uuid, uuid, text, text, uuid) TO authenticated;
