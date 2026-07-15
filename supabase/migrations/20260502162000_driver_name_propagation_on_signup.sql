-- Permanent fix for aggregate/phone-assigned trips showing stale placeholder driver names.
-- Root cause:
-- 1) trips.driver_display_name is a cached column populated only when trips.driver_id changes.
-- 2) Later driver signup links drivers.user_id by phone/email, but existing driver name/trip cache can stay stale.
--
-- This migration makes future behavior self-healing:
-- - when a driver profile is linked by sync_driver_rows_user_id_for_profile, also refresh drivers.name from profiles.full_name
-- - when drivers.name changes, automatically propagate to trips.driver_display_name
-- - when a linked driver profile full_name changes later, update drivers.name (and trips cache via driver trigger)

CREATE OR REPLACE FUNCTION public.sync_driver_rows_user_id_for_profile(p_profile_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_email_norm text;
  v_last10 text;
  v_full_name text;
  v_n int := 0;
BEGIN
  SELECT p.role,
         nullif(lower(trim(coalesce(p.email, ''))), ''),
         public.normalize_phone_last10(p.phone),
         nullif(trim(coalesce(p.full_name, '')), '')
    INTO v_role, v_email_norm, v_last10, v_full_name
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF NOT FOUND OR coalesce(v_role, '') <> 'driver' THEN
    RETURN 0;
  END IF;

  UPDATE public.drivers d
  SET user_id = p_profile_id,
      name = coalesce(v_full_name, d.name),
      updated_at = now()
  WHERE d.user_id IS NULL
    AND d.left_at IS NULL
    AND (
      (v_email_norm IS NOT NULL AND v_email_norm <> ''
        AND nullif(lower(trim(coalesce(d.email, ''))), '') = v_email_norm)
      OR (
        length(coalesce(v_last10, '')) >= 10
        AND d.phone IS NOT NULL
        AND public.normalize_phone_last10(d.phone) = v_last10
      )
    );

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.sync_driver_rows_user_id_for_profile(uuid) IS
  'Sets drivers.user_id to the driver profile id where user_id was null and email/phone(last10) matches; also refreshes drivers.name from profiles.full_name when available.';

CREATE OR REPLACE FUNCTION public.sync_trips_driver_display_name_from_driver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.trips t
    SET driver_display_name = nullif(trim(coalesce(NEW.name, '')), ''),
        updated_at = now()
    WHERE t.driver_id = NEW.id
      AND t.driver_display_name IS DISTINCT FROM nullif(trim(coalesce(NEW.name, '')), '');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_trips_driver_display_name_from_driver() IS
  'After drivers.name update, propagates the value to trips.driver_display_name for rows referencing that driver.';

DROP TRIGGER IF EXISTS trg_sync_trips_driver_display_name_from_driver ON public.drivers;
CREATE TRIGGER trg_sync_trips_driver_display_name_from_driver
  AFTER UPDATE OF name ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_trips_driver_display_name_from_driver();

CREATE OR REPLACE FUNCTION public.trg_profiles_sync_linked_driver_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF coalesce(NEW.role, '') <> 'driver' THEN
    RETURN NEW;
  END IF;

  v_name := nullif(trim(coalesce(NEW.full_name, '')), '');
  IF v_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE public.drivers d
    SET name = v_name,
        updated_at = now()
    WHERE d.user_id = NEW.id
      AND d.left_at IS NULL
      AND d.name IS DISTINCT FROM v_name;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_profiles_sync_linked_driver_name() IS
  'Keeps drivers.name in sync with profiles.full_name for linked driver users (role=driver).';

DROP TRIGGER IF EXISTS trg_profiles_sync_linked_driver_name ON public.profiles;
CREATE TRIGGER trg_profiles_sync_linked_driver_name
  AFTER INSERT OR UPDATE OF role, full_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profiles_sync_linked_driver_name();
