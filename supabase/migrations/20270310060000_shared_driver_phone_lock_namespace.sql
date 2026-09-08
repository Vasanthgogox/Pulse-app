-- Phase 2 prerequisite: canonical shared advisory-lock helper for every
-- "create/adopt an unlinked drivers row by phone" code path.
--
-- idx_drivers_phone_normalised is a single GLOBAL partial unique index, so
-- the serialization mechanism guarding it must also be global and SHARED
-- across every function that can insert a user_id IS NULL / left_at IS NULL
-- drivers row -- not a separate lock key per function. A function-specific
-- key (as Phase 1's assign_aggregate_trip_driver used) only serializes a
-- function against itself; it does nothing to stop e.g. assign_aggregate_
-- trip_driver and invite_driver from racing each other for the same phone.
--
-- public.lock_driver_phone() is the one place that namespace/hash choice
-- lives, so a future sixth driver-by-phone creation path can't accidentally
-- pick a different lock string and silently reopen the cross-function race.

CREATE OR REPLACE FUNCTION public.lock_driver_phone(p_last10 text)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('drivers_phone_normalised:' || p_last10, 0));
$$;

COMMENT ON FUNCTION public.lock_driver_phone(text) IS
  'Canonical global advisory lock for idx_drivers_phone_normalised collision guards. Every function that may INSERT a drivers row with user_id IS NULL / left_at IS NULL must call this with the normalise_phone()-derived last-10-digit value before deciding to insert, so concurrent creators of the SAME phone across ANY function serialize against each other, not just against themselves.';

-- Phase 1 follow-up: assign_aggregate_trip_driver moves onto the shared lock.
-- Nothing else in this function changes -- same conflict target, same
-- cross-org error, same already-linked branch, same return contract, same
-- normalization. Diffed against the Phase 1 version to confirm.
CREATE OR REPLACE FUNCTION public.assign_aggregate_trip_driver(p_trip_id uuid, p_driver_org_id uuid, p_driver_phone text, p_vehicle_display_number text DEFAULT NULL::text, p_vehicle_id uuid DEFAULT NULL::uuid, p_driver_name text DEFAULT NULL::text, p_execution_type text DEFAULT NULL::text)
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
    -- idx_drivers_phone_normalised has no org scope -- serialize on the
    -- phone number globally, via the SAME lock namespace every other
    -- driver-by-phone creation path uses.
    PERFORM public.lock_driver_phone(v_last10);

    -- Re-check this org after acquiring the lock, in case a concurrent call
    -- for the SAME org just inserted a matching row.
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

      IF v_profile_id IS NULL THEN
        IF EXISTS (
          SELECT 1 FROM public.drivers d
          WHERE d.phone_normalised = v_last10
            AND d.user_id IS NULL
            AND d.left_at IS NULL
        ) THEN
          RETURN jsonb_build_object(
            'ok', false,
            'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before assigning here.'
          );
        END IF;
      END IF;

      INSERT INTO public.drivers (
        organization_id, name, phone, user_id, status, tracking_only,
        relationship_origin, relationship_status
      )
      VALUES (
        p_driver_org_id, v_driver_name, v_phone_norm, v_profile_id, 'offline', true,
        'phone_assignment', 'independent'
      )
      ON CONFLICT (phone_normalised) WHERE (phone_normalised IS NOT NULL AND user_id IS NULL AND left_at IS NULL)
      DO NOTHING
      RETURNING * INTO v_driver;

      IF v_driver.id IS NULL THEN
        SELECT * INTO v_driver
        FROM public.drivers
        WHERE organization_id = p_driver_org_id
          AND (
            phone = v_phone_norm
            OR right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_last10
          )
        LIMIT 1;
        IF NOT FOUND THEN
          RETURN jsonb_build_object(
            'ok', false,
            'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before assigning here.'
          );
        END IF;
      END IF;
    END IF;
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
  IF v_driver.user_id IS NULL THEN
    PERFORM public.generate_trip_otp(p_trip_id, 15);
  END IF;
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  RETURN jsonb_build_object(
    'ok', true,
    'trip', to_jsonb(v_trip),
    'driver_id', v_driver.id,
    'driver_linked', v_driver.user_id IS NOT NULL
  );
END;
$function$;
