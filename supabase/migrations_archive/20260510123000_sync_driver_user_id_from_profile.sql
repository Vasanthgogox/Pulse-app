-- Link fleet / manual driver rows (user_id IS NULL) to the correct auth user when
-- public.profiles (role=driver) email or phone last-10 matches. Fixes driver app
-- getLinkedDriversForCurrentUser returning no rows despite trips.driver_id being set.
-- Complements driver_signup_matches (owner-invite flow) with immediate self-heal on profile upsert + login RPC.

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
  v_n int := 0;
BEGIN
  SELECT p.role,
         nullif(lower(trim(coalesce(p.email, ''))), ''),
         public.normalize_phone_last10(p.phone)
    INTO v_role, v_email_norm, v_last10
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF NOT FOUND OR coalesce(v_role, '') <> 'driver' THEN
    RETURN 0;
  END IF;

  UPDATE public.drivers d
  SET user_id = p_profile_id,
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
  'Sets drivers.user_id to the driver profile id where user_id was null and email (case-insensitive) or phone last-10 matches. Idempotent.';

REVOKE ALL ON FUNCTION public.sync_driver_rows_user_id_for_profile(uuid) FROM PUBLIC;

-- Callable by authenticated user after sign-in / OAuth (self only).
CREATE OR REPLACE FUNCTION public.sync_my_driver_rows_user_id()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;
  RETURN public.sync_driver_rows_user_id_for_profile(v_uid);
END;
$$;

COMMENT ON FUNCTION public.sync_my_driver_rows_user_id() IS
  'Links unlinked driver roster rows to the current auth user by profile email/phone. Call after login.';

GRANT EXECUTE ON FUNCTION public.sync_my_driver_rows_user_id() TO authenticated;
REVOKE ALL ON FUNCTION public.sync_my_driver_rows_user_id() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_profiles_sync_driver_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.role, '') = 'driver' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.sync_driver_rows_user_id_for_profile(NEW.id);
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.role IS DISTINCT FROM OLD.role
         OR NEW.email IS DISTINCT FROM OLD.email
         OR NEW.phone IS DISTINCT FROM OLD.phone
      THEN
        PERFORM public.sync_driver_rows_user_id_for_profile(NEW.id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_driver_user_id ON public.profiles;
CREATE TRIGGER trg_profiles_sync_driver_user_id
  AFTER INSERT OR UPDATE OF role, email, phone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profiles_sync_driver_user_id();
