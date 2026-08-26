-- Fixes the regression from 20270226093000_assign_aggregate_trip_driver_execution_type:
-- that migration's CREATE OR REPLACE FUNCTION declared a 7-parameter signature
-- (p_trip_id, p_driver_org_id, p_driver_phone, p_vehicle_display_number,
-- p_vehicle_id, p_driver_name, p_execution_type). Because Postgres identifies
-- a function by its full parameter list, this did NOT replace the existing
-- 6-parameter function — it created a second, distinct overload alongside it.
--
-- Confirmed live: any named-argument call omitting p_execution_type (the
-- normal path — trips.service.ts only includes it when the dispatcher
-- explicitly picked the own-asset toggle) now fails with
-- "function ... is not unique / Could not choose a best candidate function",
-- because both overloads match equally well once p_execution_type is absent.
-- This broke ordinary Aggregate driver assignment.
--
-- Fix: Postgres identifies a function by its exact parameter-type list, so
-- CREATE OR REPLACE FUNCTION can never "extend" an existing signature by
-- appending a new parameter — declaring a 7th parameter always targets a
-- distinct function object from the existing 6-parameter one, no matter what
-- runs beforehand. There is no in-place signature change in Postgres.
--
-- The only correct fix is: drop BOTH existing signatures (the original
-- 6-parameter function and the accidental 7-parameter overload), then create
-- a single function with the final 7-parameter signature. Because
-- p_execution_type has a DEFAULT, every existing call shaped like the
-- original 6-parameter call (with or without naming p_vehicle_display_number/
-- p_vehicle_id/p_driver_name) still matches this one function unambiguously
-- — there is nothing else it could match once the old 6-arg function is gone.
--
-- Function body logic is otherwise unchanged from the 7-arg version: same
-- execution_type validation, same "first explicit choice sticks" UPDATE CASE.
-- No other RPC touched. No trip data modified by this migration.

DROP FUNCTION IF EXISTS public.assign_aggregate_trip_driver(uuid, uuid, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.assign_aggregate_trip_driver(uuid, uuid, text, text, uuid, text, text);

CREATE FUNCTION public.assign_aggregate_trip_driver(
  p_trip_id uuid,
  p_driver_org_id uuid,
  p_driver_phone text,
  p_vehicle_display_number text DEFAULT NULL::text,
  p_vehicle_id uuid DEFAULT NULL::uuid,
  p_driver_name text DEFAULT NULL::text,
  p_execution_type text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trip       public.trips%ROWTYPE;
  v_driver     public.drivers%ROWTYPE;
  v_phone_norm text;
  v_last10     text;
  v_driver_name text;
  v_profile_id uuid;
  v_profile_match_count int;
  v_status     text;
  v_name_arg   text;
  v_execution_type_arg text;
BEGIN
  v_name_arg := nullif(trim(coalesce(p_driver_name, '')), '');

  v_execution_type_arg := nullif(upper(trim(coalesce(p_execution_type, ''))), '');
  IF v_execution_type_arg IS NOT NULL AND v_execution_type_arg NOT IN ('ASSET', 'AGGREGATE') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid execution_type -- must be ASSET or AGGREGATE');
  END IF;

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
    -- Resolve the platform person for this phone. STRICT: only a single
    -- role='driver' profile counts as proof of identity. Zero or multiple
    -- matches leave user_id NULL so the trip OTP claim remains the authority
    -- (a phone alone must never pick between two people).
    SELECT count(*) INTO v_profile_match_count
    FROM public.profiles p
    WHERE coalesce(p.role, '') = 'driver'
      AND p.phone IS NOT NULL
      AND length(regexp_replace(p.phone, '\D', '', 'g')) >= 10
      AND right(regexp_replace(p.phone, '\D', '', 'g'), 10) = v_last10;

    IF v_profile_match_count = 1 THEN
      SELECT p.id, nullif(trim(coalesce(p.full_name, '')), '')
        INTO v_profile_id, v_driver_name
      FROM public.profiles p
      WHERE coalesce(p.role, '') = 'driver'
        AND p.phone IS NOT NULL
        AND length(regexp_replace(p.phone, '\D', '', 'g')) >= 10
        AND right(regexp_replace(p.phone, '\D', '', 'g'), 10) = v_last10;
    ELSE
      v_profile_id := NULL;
      v_driver_name := NULL;
    END IF;

    v_driver_name := coalesce(v_name_arg, nullif(trim(coalesce(v_driver_name, '')), ''), 'Driver');

    INSERT INTO public.drivers (
      organization_id, name, phone, user_id, status, tracking_only,
      relationship_origin, relationship_status
    )
    VALUES (
      p_driver_org_id, v_driver_name, v_phone_norm, v_profile_id, 'offline', true,
      'phone_assignment', 'independent'
    )
    RETURNING * INTO v_driver;
  ELSIF v_name_arg IS NOT NULL
        AND (
          v_driver.tracking_only IS TRUE
          OR coalesce(trim(v_driver.name), '') IN ('', 'Driver', '—')
        )
        AND coalesce(trim(v_driver.name), '') IS DISTINCT FROM v_name_arg THEN
    UPDATE public.drivers
    SET name = v_name_arg, updated_at = now()
    WHERE id = v_driver.id
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
    -- First explicit choice sticks; a later reassign call that omits the param
    -- (v_execution_type_arg IS NULL) never clobbers a value already set.
    execution_type = CASE
      WHEN v_execution_type_arg IS NOT NULL AND execution_type IS NULL THEN v_execution_type_arg
      ELSE execution_type
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
$function$;
