-- Fix get_trip_assigner_displays_for_driver for trips that are still in "pending OTP claim"
-- (driver row exists with user_id IS NULL and phone matches; trip.driver_id points at that row).
-- The previous guard only allowed d.user_id = auth.uid(), so the RPC returned no rows and the
-- app showed the "Fleet dispatcher" fallback for all OTP-pending trips.
--
-- Also prefer trips.assigned_by_user_id (when present) after audit and before created_by/owner.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS assigned_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.get_trip_assigner_displays_for_driver(p_trip_ids uuid[])
RETURNS TABLE (trip_id uuid, display_name text, assigner_user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_tid uuid;
  v_driver_id uuid;
  v_created_by uuid;
  v_owner uuid;
  v_assigned_by uuid;
  v_uid uuid;
  v_name text;
  v_caller_uid uuid;
  v_phone text;
  v_normalized text;
  v_can_see boolean;
BEGIN
  IF p_trip_ids IS NULL OR cardinality(p_trip_ids) = 0 THEN
    RETURN;
  END IF;

  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(p.phone, u.raw_user_meta_data->>'phone') INTO v_phone
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_caller_uid;

  v_phone := coalesce(v_phone, '');
  v_normalized := right(regexp_replace(v_phone, '\D', '', 'g'), 10);

  FOREACH r_tid IN ARRAY p_trip_ids
  LOOP
    SELECT
      t.driver_id,
      t.created_by_user_id,
      t.owner_user_id,
      t.assigned_by_user_id
    INTO v_driver_id, v_created_by, v_owner, v_assigned_by
    FROM public.trips t
    WHERE t.id = r_tid;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.id = v_driver_id
        AND d.user_id = v_caller_uid
    ) INTO v_can_see;

    IF NOT v_can_see AND length(v_normalized) >= 10 THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.trip_otps o
        JOIN public.trips tt ON tt.id = o.trip_id AND tt.id = r_tid
        JOIN public.drivers d ON d.id = tt.driver_id
        WHERE o.used_at IS NULL
          AND o.expires_at > now()
          AND d.user_id IS NULL
          AND length(right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10)) >= 10
          AND right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) = v_normalized
          AND NOT (tt.source = 'direct_quote' AND tt.driver_id IS NOT NULL AND tt.vehicle_id IS NOT NULL)
      ) INTO v_can_see;
    END IF;

    IF NOT v_can_see THEN
      CONTINUE;
    END IF;

    v_uid := NULL;

    IF to_regclass('public.trip_assignment_audit') IS NOT NULL THEN
      SELECT a.changed_by INTO v_uid
      FROM public.trip_assignment_audit a
      WHERE a.trip_id = r_tid
        AND a.changed_by IS NOT NULL
        AND a.event_type IN ('assignment', 'reassignment')
      ORDER BY a.changed_at DESC
      LIMIT 1;
    END IF;

    IF v_uid IS NULL THEN
      v_uid := v_assigned_by;
    END IF;

    IF v_uid IS NULL THEN
      v_uid := coalesce(v_created_by, v_owner);
    END IF;

    v_name := NULL;
    IF v_uid IS NOT NULL THEN
      SELECT coalesce(
        nullif(trim(p.full_name), ''),
        nullif(split_part(trim(p.email), '@', 1), ''),
        'Dispatcher'
      ) INTO v_name
      FROM public.profiles p
      WHERE p.id = v_uid;

      IF v_name IS NULL OR trim(v_name) = '' THEN
        IF to_regclass('public.users') IS NOT NULL THEN
          SELECT nullif(trim(u.name), '') INTO v_name
          FROM public.users u
          WHERE u.id = v_uid
          LIMIT 1;
        END IF;
      END IF;

      IF v_name IS NULL OR trim(v_name) = '' THEN
        v_name := 'Dispatcher';
      END IF;
    ELSE
      v_name := NULL;
    END IF;

    trip_id := r_tid;
    display_name := v_name;
    assigner_user_id := v_uid;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.get_trip_assigner_displays_for_driver(uuid[]) IS
  'Driver app: for trips visible to this driver (claimed driver row OR pending OTP phone match), return assigner display name (audit → assigned_by_user_id → created_by_user_id → owner_user_id). SECURITY DEFINER.';
