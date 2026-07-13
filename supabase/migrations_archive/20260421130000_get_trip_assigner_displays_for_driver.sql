-- Driver app: resolve "Assigned by" name for trips assigned to this user.
-- Drivers cannot SELECT other users' profiles (RLS) and may not read trip_assignment_audit
-- (org-member policy). This RPC verifies the caller is the trip's driver and reads
-- assigner identity + display name with SECURITY DEFINER.
--
-- Depends on trips.created_by_user_id / owner_user_id (see 20260420120000_sequential_id_generation.sql).
--
-- Note: Avoid trips%ROWTYPE fields inside SQL subqueries (e.g. WHERE d.id = rec_trip.driver_id):
-- the SQL parser treats unknown identifiers as relations → ERROR 42P01.

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
  v_uid uuid;
  v_name text;
BEGIN
  IF p_trip_ids IS NULL OR cardinality(p_trip_ids) = 0 THEN
    RETURN;
  END IF;

  FOREACH r_tid IN ARRAY p_trip_ids
  LOOP
    SELECT
      t.driver_id,
      t.created_by_user_id,
      t.owner_user_id
    INTO v_driver_id, v_created_by, v_owner
    FROM public.trips t
    WHERE t.id = r_tid;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.id = v_driver_id
        AND d.user_id = auth.uid()
    ) THEN
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
      v_uid := COALESCE(v_created_by, v_owner);
    END IF;

    v_name := NULL;
    IF v_uid IS NOT NULL THEN
      SELECT COALESCE(
        NULLIF(trim(p.full_name), ''),
        NULLIF(split_part(trim(p.email), '@', 1), ''),
        'Dispatcher'
      ) INTO v_name
      FROM public.profiles p
      WHERE p.id = v_uid;

      IF v_name IS NULL OR trim(v_name) = '' THEN
        IF to_regclass('public.users') IS NOT NULL THEN
          SELECT NULLIF(trim(u.name), '') INTO v_name
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
  'Driver app: for trips assigned to the caller''s driver row, return assigner display name (audit → created_by_user_id → owner_user_id). SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.get_trip_assigner_displays_for_driver(uuid[]) TO authenticated;
