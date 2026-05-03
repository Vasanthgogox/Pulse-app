-- Keep drivers.email aligned when profiles.email is set/changed (avoids stale empty drivers.email).

CREATE OR REPLACE FUNCTION public.sync_driver_email_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new text := NULLIF(BTRIM(COALESCE(NEW.email, '')::text), '');
  v_old text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_new IS NOT NULL THEN
      UPDATE public.drivers d
      SET email = v_new
      WHERE d.user_id = NEW.id
        AND (d.email IS NULL OR BTRIM(COALESCE(d.email, '')) = '');
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.email IS DISTINCT FROM NEW.email) THEN
    v_old := NULLIF(BTRIM(COALESCE(OLD.email, '')::text), '');
    UPDATE public.drivers d
    SET email = v_new
    WHERE d.user_id = NEW.id
      AND (
        d.email IS NULL
        OR BTRIM(COALESCE(d.email, '')) = ''
        OR (v_old IS NOT NULL AND BTRIM(COALESCE(d.email, '')) = v_old)
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_email_sync_drivers_email ON public.profiles;
CREATE TRIGGER profiles_email_sync_drivers_email
  AFTER INSERT OR UPDATE OF email ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_driver_email_from_profile();

COMMENT ON FUNCTION public.sync_driver_email_from_profile() IS
  'When profiles.email is set/updated, backfill drivers.email for rows linked by user_id if driver email was empty or matched previous profile email.';
